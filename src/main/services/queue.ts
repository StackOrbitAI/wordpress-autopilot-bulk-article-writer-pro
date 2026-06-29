import { BrowserWindow } from 'electron';
import fs from 'fs';
import { dbRun, dbGet, dbAll } from '../database/connection';
import { generateArticle, generateFeaturedImage, AIProviderConfig } from './ai';
import { createWordPressPost, uploadWordPressMedia, WordPressSiteConfig, PostPayload } from './wordpress';
import { decrypt } from './security';
import { getStockImage } from './stockImage';
import { googleDocsService } from './googleDocs';

export interface QueueStatus {
  taskId: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalJobs: number;
  status: string;
}

class QueueManager {
  private activeWorkers = 0;
  private isProcessing = false;
  private runningTaskIds = new Set<number>();

  // Helper to notify React UI of any state change
  private notifyUI(channel: string, data: any) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  }

  // Log to database and emit to UI
  private async log(taskId: number, jobId: number | null, level: 'info' | 'warn' | 'error', message: string) {
    const timestamp = new Date().toISOString();
    try {
      await dbRun(
        `INSERT INTO logs (task_id, job_id, level, message, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [taskId, jobId, level, message, timestamp]
      );
      this.notifyUI('new-log', { taskId, jobId, level, message, timestamp });
    } catch (err) {
      console.error('[QueueManager] Log database insert error:', err);
    }
  }

  /**
   * Starts or resumes a task queue execution
   */
  public async startTask(taskId: number): Promise<void> {
    const task = await dbGet(`SELECT status FROM tasks WHERE id = ?`, [taskId]);
    if (!task) throw new Error('Task not found');

    // Count waiting jobs for this task
    const stats = await dbGet(
      `SELECT COUNT(*) as total,
              SUM(case when status = 'waiting' then 1 else 0 end) as waiting
       FROM jobs WHERE task_id = ?`,
      [taskId]
    );

    await dbRun(`UPDATE tasks SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [taskId]);
    
    if (stats && stats.waiting === 0) {
      // If there are no waiting jobs at all, restart all jobs back to waiting from scratch
      await dbRun(
        `UPDATE jobs 
         SET status = 'waiting', 
             post_id = NULL, 
             post_url = NULL, 
             generated_title = NULL, 
             generated_content = NULL, 
             image_url = NULL, 
             error_message = NULL, 
             token_usage = 0, 
             estimated_cost = 0.0,
             retries = 0,
             started_at = NULL, 
             completed_at = NULL 
         WHERE task_id = ?`,
        [taskId]
      );
      await this.log(taskId, null, 'info', `No waiting jobs found. Resetting all task jobs to waiting.`);
    } else {
      // Reset failed/skipped jobs to waiting (fixing operator precedence bug)
      await dbRun(`UPDATE jobs SET status = 'waiting' WHERE task_id = ? AND (status = 'failed' OR status = 'skipped')`, [taskId]);
    }
    
    this.runningTaskIds.add(taskId);
    await this.log(taskId, null, 'info', `Task execution started.`);
    this.notifyUI('task-status-changed', { taskId, status: 'running' });

    // Trigger process loop
    this.triggerQueue();
  }

  /**
   * Pauses a running task
   */
  public async pauseTask(taskId: number): Promise<void> {
    await dbRun(`UPDATE tasks SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [taskId]);
    this.runningTaskIds.delete(taskId);
    this.log(taskId, null, 'warn', `Task execution paused. Running articles will finish.`);
    this.notifyUI('task-status-changed', { taskId, status: 'paused' });
  }

  /**
   * Cancels a task and marks all outstanding waiting jobs as skipped
   */
  public async cancelTask(taskId: number): Promise<void> {
    await dbRun(`UPDATE tasks SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [taskId]);
    await dbRun(`UPDATE jobs SET status = 'skipped' WHERE task_id = ? AND status = 'waiting'`, [taskId]);
    this.runningTaskIds.delete(taskId);
    this.log(taskId, null, 'warn', `Task cancelled by user.`);
    this.notifyUI('task-status-changed', { taskId, status: 'cancelled' });
  }

  /**
   * Retries only failed jobs of a task
   */
  public async retryTask(taskId: number): Promise<void> {
    await dbRun(`UPDATE tasks SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [taskId]);
    await dbRun(`UPDATE jobs SET status = 'waiting' WHERE task_id = ? AND status = 'failed'`, [taskId]);
    this.runningTaskIds.add(taskId);
    this.log(taskId, null, 'info', `Retrying failed jobs for task.`);
    this.notifyUI('task-status-changed', { taskId, status: 'running' });
    
    this.triggerQueue();
  }

  /**
   * Restarts a completed/failed/cancelled task from scratch
   */
  public async restartTask(taskId: number): Promise<void> {
    await dbRun(`UPDATE tasks SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [taskId]);
    await dbRun(
      `UPDATE jobs 
       SET status = 'waiting', 
           post_id = NULL, 
           post_url = NULL, 
           generated_title = NULL, 
           generated_content = NULL, 
           image_url = NULL, 
           error_message = NULL, 
           token_usage = 0, 
           estimated_cost = 0.0,
           retries = 0,
           started_at = NULL, 
           completed_at = NULL 
       WHERE task_id = ?`,
      [taskId]
    );
    this.runningTaskIds.add(taskId);
    this.log(taskId, null, 'info', `Task restarted from scratch.`);
    this.notifyUI('task-status-changed', { taskId, status: 'running' });
    
    this.triggerQueue();
  }

  /**
   * Triggers the worker loop asynchronously
   */
  private triggerQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    // Kick off worker loop in background
    this.processQueueLoop().finally(() => {
      this.isProcessing = false;
    });
  }

  /**
   * Active processing loop of the queue manager
   */
  private async processQueueLoop(): Promise<void> {
    // 1. Fetch concurrency limits
    const limitSetting = await dbGet(`SELECT value FROM settings WHERE key = 'concurrency'`);
    const maxConcurrency = parseInt(limitSetting?.value || '2', 10);

    while (this.activeWorkers < maxConcurrency) {
      // 2. Fetch the next waiting job from any active task
      // Ordering by task priority can be done, here we order by task_id and job_id
      const activeTaskIds = Array.from(this.runningTaskIds);
      if (activeTaskIds.length === 0) break;

      const placeHolders = activeTaskIds.map(() => '?').join(',');
      const job = await dbGet(
        `SELECT j.*, t.provider_id, t.model, t.website_id, t.language, t.country, t.category, 
                t.prompt_template, t.image_generation, t.image_style, t.image_size, t.image_model, 
                t.insert_inline_images, t.article_length, t.publishing_mode, t.seo_settings, 
                t.publish_target, t.google_sheet_url, t.name AS task_name
         FROM jobs j
         JOIN tasks t ON j.task_id = t.id
         WHERE j.status = 'waiting' AND t.status = 'running' AND t.id IN (${placeHolders})
         ORDER BY t.id ASC, j.id ASC
         LIMIT 1`,
        activeTaskIds
      );

      if (!job) {
        // No waiting jobs for the currently running tasks.
        // Let's check if the running tasks are actually complete.
        await this.checkCompletedTasks(activeTaskIds);
        break;
      }

      // Start processing this job
      this.activeWorkers++;
      this.runJob(job).finally(() => {
        this.activeWorkers--;
        this.triggerQueue(); // Fetch next
      });
    }
  }

  /**
   * Checks if active tasks have completed all their jobs, updating task status
   */
  private async checkCompletedTasks(taskIds: number[]): Promise<void> {
    for (const taskId of taskIds) {
      const stats = await dbGet(
        `SELECT 
           COUNT(*) as total,
           SUM(case when status = 'completed' then 1 else 0 end) as completed,
           SUM(case when status = 'failed' then 1 else 0 end) as failed,
           SUM(case when status = 'waiting' then 1 else 0 end) as waiting
         FROM jobs WHERE task_id = ?`,
        [taskId]
      );

      if (stats && stats.waiting === 0) {
        // Task is finished
        const finalStatus = stats.failed > 0 && stats.completed === 0 ? 'failed' : 'completed';
        await dbRun(`UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [finalStatus, taskId]);
        this.runningTaskIds.delete(taskId);
        this.log(taskId, null, 'info', `Task finished. Completed: ${stats.completed || 0}, Failed: ${stats.failed || 0}`);
        this.notifyUI('task-status-changed', { taskId, status: finalStatus });
      }
    }
  }

  private async acquireImageWithFallback(
    taskId: number,
    jobId: number,
    keyword: string,
    initialMode: number,
    imageStyle: string,
    imageSize: string,
    imageModel: string,
    aiConfig: AIProviderConfig,
    provider: any,
    decryptedApiKey: string,
    parsedTitle: string
  ): Promise<string> {
    const errors: string[] = [];
    
    let parsedStyle = 'photorealistic';
    let parsedModel = imageModel || 'gpt-image-2';
    if (imageStyle && imageStyle.startsWith('{')) {
      try {
        const parsed = JSON.parse(imageStyle);
        parsedStyle = parsed.style || 'photorealistic';
        parsedModel = parsed.model || 'gpt-image-2';
      } catch (e) {
        // ignore
      }
    } else if (imageStyle) {
      parsedStyle = imageStyle;
    }

    interface AttemptMode {
      mode: number;
      isAI: boolean;
      model?: string;
      style?: string;
    }

    let modesToTry: AttemptMode[] = [];

    if (initialMode === 1) { // DALL-E
      modesToTry.push({ mode: 1, isAI: true, model: parsedModel, style: parsedStyle });
      modesToTry.push({ mode: 100, isAI: true, model: 'runware:100', style: parsedStyle });
      modesToTry.push({ mode: 101, isAI: true, model: 'imagen-3.0-generate-002', style: parsedStyle });
      modesToTry.push({ mode: 3, isAI: false }); // Unsplash
      modesToTry.push({ mode: 2, isAI: false }); // Pexels
      modesToTry.push({ mode: 4, isAI: false }); // Pixabay
    } else if (initialMode === 100) { // Runware
      modesToTry.push({ mode: 100, isAI: true, model: parsedModel, style: parsedStyle });
      modesToTry.push({ mode: 1, isAI: true, model: 'gpt-image-2', style: parsedStyle });
      modesToTry.push({ mode: 101, isAI: true, model: 'imagen-3.0-generate-002', style: parsedStyle });
      modesToTry.push({ mode: 2, isAI: false }); // Pexels
      modesToTry.push({ mode: 3, isAI: false }); // Unsplash
      modesToTry.push({ mode: 4, isAI: false }); // Pixabay
    } else if (initialMode === 101) { // Gemini Imagen
      modesToTry.push({ mode: 101, isAI: true, model: parsedModel, style: parsedStyle });
      modesToTry.push({ mode: 100, isAI: true, model: 'runware:100', style: parsedStyle });
      modesToTry.push({ mode: 1, isAI: true, model: 'gpt-image-2', style: parsedStyle });
      modesToTry.push({ mode: 4, isAI: false }); // Pixabay
      modesToTry.push({ mode: 3, isAI: false }); // Unsplash
      modesToTry.push({ mode: 2, isAI: false }); // Pexels
    } else {
      modesToTry.push({ mode: initialMode, isAI: false });
      modesToTry.push({ mode: 3, isAI: false });
      modesToTry.push({ mode: 2, isAI: false });
      modesToTry.push({ mode: 4, isAI: false });
    }

    for (const attempt of modesToTry) {
      try {
        if (attempt.isAI) {
          let imgKeyConfig = aiConfig;
          const targetModel = attempt.model || 'gpt-image-2';
          
          if (targetModel.startsWith('runware') || targetModel.startsWith('civitai')) {
            const rwKeySetting = await dbGet(`SELECT value FROM settings WHERE key = 'runware_api_key'`);
            const rwKey = rwKeySetting?.value || '';
            if (!rwKey) continue;
            imgKeyConfig = { provider: 'custom', apiKey: rwKey };
          } else if (targetModel.startsWith('imagen-')) {
            let geminiKey = '';
            if (provider.provider === 'gemini') {
              geminiKey = decryptedApiKey;
            } else {
              const dbKey = await dbGet(`SELECT api_key FROM api_keys WHERE provider = 'gemini' ORDER BY is_default DESC LIMIT 1`);
              if (dbKey?.api_key) geminiKey = decrypt(dbKey.api_key);
            }
            if (!geminiKey) continue;
            imgKeyConfig = { provider: 'gemini', apiKey: geminiKey };
          } else {
            if (provider.provider !== 'openai') {
              const oaiKey = await dbGet(`SELECT * FROM api_keys WHERE provider = 'openai' LIMIT 1`);
              if (!oaiKey) continue;
              imgKeyConfig = {
                provider: 'openai',
                apiKey: decrypt(oaiKey.api_key)
              };
            }
          }

          await this.log(taskId, jobId, 'info', `Attempting AI image generation using model: ${targetModel}...`);
          const path = await generateFeaturedImage(imgKeyConfig, keyword, imageSize, attempt.style || 'photorealistic', targetModel);
          if (path) return path;
        } else {
          await this.log(taskId, jobId, 'info', `Attempting stock image search using provider ID: ${attempt.mode}...`);
          const path = await getStockImage(parsedTitle || keyword, attempt.mode, aiConfig);
          if (path) return path;
        }
      } catch (err: any) {
        console.warn(`[Featured Image Fallback Attempt] Mode ${attempt.mode} failed: ${err.message}`);
        errors.push(`Mode ${attempt.mode}: ${err.message}`);
      }
    }
    throw new Error(`All image attempts in fallback chain failed. Details: ${errors.join('; ')}`);
  }

  private async embedInlineImages(
    htmlContent: string,
    job: any,
    aiConfig: any,
    wpConfig: any,
    isWpTarget: boolean,
    taskId: number,
    jobId: number,
    parsedTitle: string,
    keyword: string
  ): Promise<string> {
    let maxInlineImages = 3;
    let paragraphInterval = 3;
    if (job.image_style && job.image_style.startsWith('{')) {
      try {
        const parsed = JSON.parse(job.image_style);
        if (parsed.inlineCount !== undefined) maxInlineImages = parseInt(parsed.inlineCount, 10) || 3;
        if (parsed.inlineInterval !== undefined) paragraphInterval = parseInt(parsed.inlineInterval, 10) || 3;
      } catch (e) {
        // ignore
      }
    }

    const paragraphParts = htmlContent.split('</p>');
    if (paragraphParts.length <= 1) {
      return htmlContent;
    }

    let updatedContent = '';
    let imagesInserted = 0;

    for (let i = 0; i < paragraphParts.length; i++) {
      let part = paragraphParts[i];
      if (i < paragraphParts.length - 1) {
        part += '</p>';
      }
      
      updatedContent += part;

      if (
        i > 0 &&
        i < paragraphParts.length - 1 &&
        (i + 1) % paragraphInterval === 0 &&
        imagesInserted < maxInlineImages
      ) {
        try {
          const textContext = part.replace(/<[^>]*>/g, ' ').trim();
          const words = textContext.split(/\s+/).filter(w => w.length > 3).slice(0, 5);
          const searchKeyword = words.length > 0 ? words.join(' ') : keyword;

          await this.log(taskId, jobId, 'info', `Acquiring inline image after paragraph ${i + 1} matching context: "${searchKeyword}"`);
          
          const initialMode = job.image_generation > 0 ? job.image_generation : 3;
          const localPath = await getStockImage(searchKeyword, initialMode, aiConfig);
          
          let imageUrl = '';
          if (isWpTarget) {
            const media = await uploadWordPressMedia(wpConfig, localPath, searchKeyword);
            imageUrl = media.url;
          } else {
            const imageBuffer = fs.readFileSync(localPath);
            const base64Image = imageBuffer.toString('base64');
            imageUrl = `data:image/png;base64,${base64Image}`;
          }

          if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
          }

          if (imageUrl) {
            const imageBlock = `
<figure class="wp-block-image aligncenter size-large">
  <img src="${imageUrl}" alt="${searchKeyword}" class="rounded-xl shadow-md border border-zinc-800/40 my-6" style="width: 100%; max-width: 800px; height: auto;" />
  <figcaption class="text-center text-xs text-zinc-500 italic mt-2">${searchKeyword}</figcaption>
</figure>
`;
            updatedContent += '\n' + imageBlock + '\n';
            imagesInserted++;
          }
        } catch (err: any) {
          await this.log(taskId, jobId, 'warn', `Failed to acquire inline image after paragraph ${i + 1}: ${err.message}`);
        }
      }
    }

    return updatedContent;
  }

  /**
   * Run an individual article generation job
   */
  private async runJob(job: any): Promise<void> {
    const { id: jobId, task_id: taskId, keyword } = job;
    
    // 1. Mark job as running
    await dbRun(`UPDATE jobs SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?`, [jobId]);
    this.notifyUI('job-status-changed', { jobId, taskId, status: 'running' });
    await this.log(taskId, jobId, 'info', `Starting content pipeline for keyword: "${keyword}"`);

    try {
      // 2. Fetch provider & website credentials
      const provider = await dbGet(`SELECT * FROM api_keys WHERE id = ?`, [job.provider_id]);
      const website = await dbGet(`SELECT * FROM websites WHERE id = ?`, [job.website_id]);

      if (!provider) throw new Error('AI Provider credentials not configured');

      const isWpTarget = !job.publish_target || job.publish_target.includes('wordpress');
      const isGoogleTarget = job.publish_target && job.publish_target.includes('googledocs');

      if (isWpTarget && !website) {
        throw new Error('WordPress website connection not configured');
      }

      const decryptedApiKey = decrypt(provider.api_key);
      const decryptedWpPassword = website ? decrypt(website.password) : '';

      const aiConfig: AIProviderConfig = {
        provider: provider.provider,
        apiKey: decryptedApiKey,
        baseUrl: provider.base_url || undefined,
        organization: provider.organization || undefined
      };

      const wpConfig: WordPressSiteConfig = {
        url: website?.url || '',
        username: website?.username || '',
        password: decryptedWpPassword
      };

      let googleConfig: any = null;
      if (isGoogleTarget) {
        const settingsList = await dbAll(`SELECT key, value FROM settings WHERE key LIKE 'google_%'`);
        const googleSettings: any = {};
        for (const s of settingsList) {
          googleSettings[s.key] = s.value;
        }

        if (!googleSettings.google_auth_type) {
          throw new Error('Google integration not configured. Please set credentials in Settings.');
        }

        googleConfig = {
          authType: googleSettings.google_auth_type,
          clientId: googleSettings.google_client_id,
          clientSecret: googleSettings.google_client_secret,
          refreshToken: googleSettings.google_refresh_token,
          serviceAccountJson: googleSettings.google_service_account_json,
          folderId: googleSettings.google_target_folder_id,
          sharingMode: googleSettings.google_sharing_permissions || 'private'
        };
      }

      let googleSheetId: string | null = null;
      if (isGoogleTarget) {
        // Query the latest database state for the task's google_sheet_url to prevent race conditions
        const latestTask = await dbGet(`SELECT google_sheet_url, name FROM tasks WHERE id = ?`, [taskId]);
        let sheetUrl = latestTask?.google_sheet_url;
        
        if (!sheetUrl) {
          await this.log(taskId, jobId, 'info', `Initializing Google Sheets tracker...`);
          try {
            const tracker = await googleDocsService.createTrackerSheet(googleConfig, latestTask?.name || 'Task');
            sheetUrl = tracker.url;
            googleSheetId = tracker.id;
            
            // Save the tracker URL to the database
            await dbRun(`UPDATE tasks SET google_sheet_url = ? WHERE id = ?`, [sheetUrl, taskId]);
            await this.log(taskId, jobId, 'info', `Created Google Sheets tracker! Link: ${sheetUrl}`);
          } catch (sheetErr: any) {
            await this.log(taskId, jobId, 'error', `Failed to create Google Sheets tracker: ${sheetErr.message}`);
          }
        }
        
        // Extract spreadsheet ID from the URL if we didn't just create it
        if (sheetUrl && !googleSheetId) {
          const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
          if (match) {
            googleSheetId = match[1];
          }
        }
      }

      const promptTemplate = job.prompt_template || 
        `Write an in-depth, captivating, and well-researched blog post of 2,000–3,000 words on {keyword}. The content should be written in a natural, human tone, engaging the reader through storytelling, personal anecdotes, and clear examples.

Ensure the post is rich in value, covering every aspect of the topic from different perspectives, offering expert insights, analysis, and actionable advice. While writing, naturally incorporate strong E-E-A-T principles by demonstrating real-life experience, expert-backed insights, credible research support, and trustworthy guidance that aligns with Google's quality standards. The writing should flow seamlessly, with easy-to-follow subheadings, bullet points, and unique markdown formatting to enhance readability, without Separator in paragraph.

Incorporate outbound links to authoritative websites and resources within each paragraph and heading to support key points and improve SEO. Avoid jargon and keep the language conversational and relatable, making the content both informative and entertaining. Ensure the content reflects high levels of experience, expertise, authoritativeness, and trustworthiness in every section to build credibility and create a strong E-E-A-T foundation.

For outbound links, include 8 to 10 high-quality references from authoritative sources within the content. Do not list these links separately; instead, naturally integrate them within different paragraphs by hyperlinking relevant keywords or phrases. Avoid using direct URLs. The links should add value and credibility without overwhelming the content.

Include a comparison table (with an attractive heading) to illustrate key points, as well as a detailed FAQ section to address common questions. End with a long, well-rounded conclusion that ties the content together and offers next steps or reflections for the reader.
Make sure the article is plagiarism-free and SEO-optimized.
I also want my blogs to be written specifically for getting AdSense approval, so there should not be any issues like policy violations or low-value content. Please make sure the blogs are high-value and completely free from any kind of policy violation, and ensure the writing follows strong E-E-A-T standards to maximize trustworthiness and AdSense compatibility.

Important Instruction:

The final blog content must ONLY discuss the topic itself.
Do NOT mention, reference, explain, or hint at this prompt, instructions, writing guidelines, SEO rules, E-E-A-T terms, AdSense approval, or any meta/process-related information anywhere in the blog content.

➕ ADDITIONAL BUYER REQUIREMENTS

Add the following conditions while writing the blog:

The content must not feel AI-generated and should read like it is written by a knowledgeable human subject-matter expert

Do NOT use first-person storytelling or personal anecdotes such as “I’ll never forget…”, “I once saw…”, “my neighbor”, or similar narrative-style experiences

Do NOT include fictional characters, names, or repeated story examples (for example, recurring names like “Sarah” or invented scenarios)

All examples must be neutral, factual, topic-focused, and informational, written in an objective third-person tone
Avoid emotional storytelling meant to simulate human experience; instead, rely on real-world context, practical explanations, observed patterns, and credible references

Keep examples varied, realistic, and directly relevant to the topic, without templated storytelling formats`;
      
      const customPrompt = promptTemplate
        .replace(/{keyword}/g, keyword)
        .replace(/{category}/g, job.category || 'General')
        .replace(/{length}/g, job.article_length || 'medium');

      // 4. Generate content
      await this.log(taskId, jobId, 'info', `Generating article content...`);
      const genResult = await generateArticle(aiConfig, job.model, customPrompt);
      
      await this.log(
        taskId, jobId, 'info', 
        `Generation complete. Tokens: ${genResult.promptTokens} input / ${genResult.completionTokens} output.`
      );

      // Extract SEO elements from generated content if possible, or build basic fallback
      let parsedTitle = keyword.charAt(0).toUpperCase() + keyword.slice(1);
      let cleanContent = genResult.text;
      let seoTitle = parsedTitle;
      let seoDescription = `Learn all about ${keyword} in our detailed guide.`;

      // Simple extraction of Title from H1 or markdown title
      const titleMatch = genResult.text.match(/^#\s+(.+)$/m) || genResult.text.match(/^Title:\s*(.+)$/im);
      if (titleMatch) {
        parsedTitle = titleMatch[1].trim();
        seoTitle = parsedTitle;
        // Strip out the first H1 if it's there
        cleanContent = genResult.text.replace(/^#\s+.+$/m, '').trim();
      }

      // Generate SEO-ready slug from the final parsed title (fallback to keyword)
      const slugText = parsedTitle || keyword;
      let slug = slugText
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .substring(0, 200);

      // Convert generated markdown to clean HTML (standard simple converter)
      const htmlContent = markdownToHtml(cleanContent);

      let finalHtmlContent = htmlContent;
      if (job.insert_inline_images === 1) {
        await this.log(taskId, jobId, 'info', `Inserting inline images into article body...`);
        finalHtmlContent = await this.embedInlineImages(
          htmlContent,
          job,
          aiConfig,
          wpConfig,
          isWpTarget,
          taskId,
          jobId,
          parsedTitle,
          keyword
        );
      }

      // 5. Generate Featured Image if enabled
      let featuredImageId: number | undefined = undefined;
      let localImagePath = '';
      let uploadedImageUrl = '';

      if (job.image_generation > 0) {
        await this.log(taskId, jobId, 'info', `Acquiring featured image...`);
        try {
          localImagePath = await this.acquireImageWithFallback(
            taskId,
            jobId,
            keyword,
            job.image_generation,
            job.image_style || '',
            job.image_size || '1200x628',
            job.image_model || 'gpt-image-2',
            aiConfig,
            provider,
            decryptedApiKey,
            parsedTitle
          );

          await this.log(taskId, jobId, 'info', `Featured image acquired successfully. Uploading to WordPress...`);

          const media = await uploadWordPressMedia(wpConfig, localImagePath, keyword);
          featuredImageId = media.id;
          uploadedImageUrl = media.url;
          await this.log(taskId, jobId, 'info', `Image uploaded. Media ID: ${media.id}`);
        } catch (imgErr: any) {
          await this.log(taskId, jobId, 'error', `Image acquisition/upload failed: ${imgErr.message}`);
          throw new Error(`Featured image processing failed: ${imgErr.message}`);
        } finally {
          // Clean up local temp image file
          if (localImagePath && fs.existsSync(localImagePath)) {
            try {
              fs.unlinkSync(localImagePath);
            } catch (cleanupErr) {
              // ignore
            }
          }
        }
      }

      // 6. Map SEO Mappings
      const seoSettingsParsed = job.seo_settings ? JSON.parse(job.seo_settings) : {};
      const seoPayload = {
        focusKeyword: keyword,
        metaTitle: seoTitle,
        metaDescription: seoDescription,
        plugin: seoSettingsParsed.plugin || 'none'
      };

      // 7. Publish to Targets
      let wpPost: any = null;
      let googleDocUrl: string | undefined = undefined;

      if (isWpTarget) {
        await this.log(taskId, jobId, 'info', `Creating WordPress post...`);
        const postPayload: PostPayload = {
          title: parsedTitle,
          content: finalHtmlContent,
          status: job.publishing_mode || 'draft',
          categoryName: job.category || undefined,
          tags: [keyword, ...(job.category ? [job.category] : [])],
          featuredImageId,
          slug,
          excerpt: seoDescription,
          seoSettings: seoPayload
        };

        wpPost = await createWordPressPost(wpConfig, postPayload);
        await this.log(taskId, jobId, 'info', `Published successfully to WordPress! Post ID: ${wpPost.id}. Link: ${wpPost.url}`);
      }

      if (isGoogleTarget) {
        await this.log(taskId, jobId, 'info', `Creating Google Doc...`);
        try {
          const docResult = await googleDocsService.createGoogleDoc(
            googleConfig,
            parsedTitle,
            finalHtmlContent
          );
          googleDocUrl = docResult.url;
          await this.log(taskId, jobId, 'info', `Published successfully to Google Docs! Link: ${docResult.url}`);

          if (googleSheetId) {
            await this.log(taskId, jobId, 'info', `Appending entry to Google Sheets tracker...`);
            try {
              const wordCount = finalHtmlContent.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
              await googleDocsService.appendJobToTracker(
                googleConfig,
                googleSheetId,
                {
                  keyword,
                  title: parsedTitle,
                  wordCount,
                  postUrl: wpPost ? wpPost.url : '',
                  googleDocUrl: googleDocUrl || '',
                  estimatedCost: genResult.estimatedCost || 0
                }
              );
              await this.log(taskId, jobId, 'info', `Google Sheets tracker row appended successfully.`);
            } catch (sheetErr: any) {
              await this.log(taskId, jobId, 'error', `Failed to append row to Google Sheets tracker: ${sheetErr.message}`);
            }
          }
        } catch (googleErr: any) {
          throw new Error(`Google Docs upload failed: ${googleErr.message}`);
        }
      }

      // 8. Mark job as complete
      await dbRun(
        `UPDATE jobs 
         SET status = 'completed', 
             post_id = ?, 
             post_url = ?, 
             google_doc_url = ?,
             generated_title = ?, 
             generated_content = ?, 
             image_url = ?,
             token_usage = ?, 
             estimated_cost = ?,
             completed_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [
          wpPost ? wpPost.id : null, 
          wpPost ? wpPost.url : null, 
          googleDocUrl || null,
          parsedTitle, 
          finalHtmlContent, 
          uploadedImageUrl || null,
          genResult.promptTokens + genResult.completionTokens, 
          genResult.estimatedCost, 
          jobId
        ]
      );
      this.notifyUI('job-status-changed', { 
        jobId, 
        taskId, 
        status: 'completed', 
        postUrl: wpPost ? wpPost.url : null,
        googleDocUrl: googleDocUrl || null
      });

    } catch (error: any) {
      console.error('[QueueManager] Job failed:', error);
      const errMsg = error.message || 'Unknown content generation error';
      await this.log(taskId, jobId, 'error', `Job failed: ${errMsg}`);

      // Check if we should auto-retry
      const retryLimitSetting = await dbGet(`SELECT value FROM settings WHERE key = 'retry_count'`);
      const retryLimit = parseInt(retryLimitSetting?.value || '3', 10);
      const currentRetries = job.retries || 0;

      if (currentRetries < retryLimit) {
        const nextRetry = currentRetries + 1;
        await dbRun(
          `UPDATE jobs SET status = 'waiting', retries = ?, error_message = ? WHERE id = ?`,
          [nextRetry, errMsg, jobId]
        );
        await this.log(taskId, jobId, 'warn', `Auto-retrying job (attempt ${nextRetry} of ${retryLimit})...`);
        this.notifyUI('job-status-changed', { jobId, taskId, status: 'waiting' });
      } else {
        await dbRun(
          `UPDATE jobs 
           SET status = 'failed', 
               error_message = ?, 
               completed_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [errMsg, jobId]
        );
        this.notifyUI('job-status-changed', { jobId, taskId, status: 'failed' });
      }
    }
  }
}

function parseMarkdownTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];
  let tableAlignments: ('left' | 'center' | 'right' | null)[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // A line is a table line if it contains '|' and isn't just an empty line
    const isPipeLine = line.startsWith('|') || (line.includes('|') && line.split('|').length > 1);

    if (isPipeLine) {
      // Split by pipe
      let cells = line.split('|').map(c => c.trim());
      // If it starts with '|', the first element is empty
      if (line.startsWith('|')) cells.shift();
      // If it ends with '|', the last element is empty
      if (line.endsWith('|') && cells.length > 0) cells.pop();

      if (!inTable) {
        // Peek at the next line to see if it is a separator row.
        const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
        const isSeparator = nextLine.includes('|') && /^[|:\-\s]+$/.test(nextLine) && nextLine.includes('-');
        
        if (isSeparator) {
          inTable = true;
          tableHeaders = cells;
          
          let sepCells = nextLine.split('|').map(c => c.trim());
          if (nextLine.startsWith('|')) sepCells.shift();
          if (nextLine.endsWith('|') && sepCells.length > 0) sepCells.pop();
          
          tableAlignments = sepCells.map(cell => {
            const left = cell.startsWith(':');
            const right = cell.endsWith(':');
            if (left && right) return 'center';
            if (right) return 'right';
            if (left) return 'left';
            return null;
          });
          // Skip the separator line
          i++;
          continue;
        }
      } else {
        // We are inside a table
        if (/^[|:\-\s]+$/.test(line) && line.includes('-')) {
          continue;
        }
        tableRows.push(cells);
        continue;
      }
    }

    // If we were in a table and current line is not a table line
    if (inTable && !isPipeLine) {
      const htmlTable = buildHtmlTable(tableHeaders, tableRows, tableAlignments);
      result.push(htmlTable);
      inTable = false;
      tableHeaders = [];
      tableRows = [];
      tableAlignments = [];
    }

    if (!inTable) {
      result.push(lines[i]);
    }
  }

  if (inTable) {
    const htmlTable = buildHtmlTable(tableHeaders, tableRows, tableAlignments);
    result.push(htmlTable);
  }

  return result.join('\n');
}

function buildHtmlTable(headers: string[], rows: string[][], alignments: ('left' | 'center' | 'right' | null)[]): string {
  let html = '<table class="wp-block-table"><thead><tr>';
  headers.forEach((h, index) => {
    const align = alignments[index];
    const alignStyle = align ? ` style="text-align: ${align};"` : '';
    html += `<th${alignStyle}>${h}</th>`;
  });
  html += '</tr></thead><tbody>';
  
  rows.forEach(row => {
    html += '<tr>';
    for (let index = 0; index < headers.length; index++) {
      const cell = row[index] !== undefined ? row[index] : '';
      const align = alignments[index];
      const alignStyle = align ? ` style="text-align: ${align};"` : '';
      html += `<td${alignStyle}>${cell}</td>`;
    }
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  return html;
}

// Simple Markdown to HTML converter to format content for WordPress REST API
function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  // Normalize Windows/macOS line endings
  let html = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
  
  // Inline code
  html = html.replace(/`([^`\n]+?)`/g, '<code>$1</code>');

  // Headings H6 down to H1 (using non-greedy line parsing)
  html = html.replace(/^[ \t]*######[ \t]+([^\n]+?)[ \t]*$/gm, '<h6>$1</h6>');
  html = html.replace(/^[ \t]*#####[ \t]+([^\n]+?)[ \t]*$/gm, '<h5>$1</h5>');
  html = html.replace(/^[ \t]*####[ \t]+([^\n]+?)[ \t]*$/gm, '<h4>$1</h4>');
  html = html.replace(/^[ \t]*###[ \t]+([^\n]+?)[ \t]*$/gm, '<h3>$1</h3>');
  html = html.replace(/^[ \t]*##[ \t]+([^\n]+?)[ \t]*$/gm, '<h2>$1</h2>');
  html = html.replace(/^[ \t]*#[ \t]+([^\n]+?)[ \t]*$/gm, '<h1>$1</h1>');

  // Bold (**bold** and __bold__)
  html = html.replace(/\*\*([^\n*]+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^\n_]+?)__/g, '<strong>$1</strong>');
  
  // Italic (*italic* and _italic_)
  html = html.replace(/\*([^\n*]+?)\*/g, '<em>$1</em>');
  html = html.replace(/_([^\n_]+?)_/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\n\]]+?)\]\(([^\n)]+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Blockquotes
  html = html.replace(/^[ \t]*>[ \t]+([^\n]+)$/gm, '<blockquote>$1</blockquote>');

  // Tables
  html = parseMarkdownTables(html);

  // Lists (bullet points & numbered lists)
  const lines = html.split('\n');
  let currentListType: 'ul' | 'ol' | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isUnordered = line.startsWith('- ') || line.startsWith('* ') || line.startsWith('+ ');
    const isOrdered = /^\d+\.\s+/.test(line);
    
    if (isUnordered) {
      const itemContent = line.slice(2).trim();
      if (currentListType === null) {
        lines[i] = '<ul>\n<li>' + itemContent + '</li>';
        currentListType = 'ul';
      } else if (currentListType === 'ol') {
        lines[i] = '</ol>\n<ul>\n<li>' + itemContent + '</li>';
        currentListType = 'ul';
      } else {
        lines[i] = '<li>' + itemContent + '</li>';
      }
    } else if (isOrdered) {
      const match = line.match(/^\d+\.\s+(.+)$/);
      const itemContent = match ? match[1].trim() : line.replace(/^\d+\.\s+/, '').trim();
      if (currentListType === null) {
        lines[i] = '<ol>\n<li>' + itemContent + '</li>';
        currentListType = 'ol';
      } else if (currentListType === 'ul') {
        lines[i] = '</ul>\n<ol>\n<li>' + itemContent + '</li>';
        currentListType = 'ol';
      } else {
        lines[i] = '<li>' + itemContent + '</li>';
      }
    } else {
      if (currentListType !== null) {
        lines[i] = `</${currentListType}>\n` + lines[i];
        currentListType = null;
      }
    }
  }
  if (currentListType !== null) {
    lines.push(`</${currentListType}>`);
  }
  html = lines.join('\n');

  // Simple paragraph wrapper (ignoring existing HTML tags)
  const blocks = html.split(/\n\s*\n/);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;
    if (
      !block.startsWith('<h') && 
      !block.startsWith('<ul') && 
      !block.startsWith('<ol') && 
      !block.startsWith('<li') && 
      !block.startsWith('<pre') && 
      !block.startsWith('<table') &&
      !block.startsWith('<blockquote') &&
      !block.startsWith('</ul') &&
      !block.startsWith('</ol')
    ) {
      blocks[i] = `<p>${block}</p>`;
    }
  }
  html = blocks.join('\n');

  return html;
}

export const queueManager = new QueueManager();
export default queueManager;
