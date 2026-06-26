import { BrowserWindow } from 'electron';
import fs from 'fs';
import { dbRun, dbGet, dbAll } from '../database/connection';
import { generateArticle, generateFeaturedImage, AIProviderConfig } from './ai';
import { createWordPressPost, uploadWordPressMedia, WordPressSiteConfig, PostPayload } from './wordpress';
import { decrypt } from './security';

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
                t.prompt_template, t.image_generation, t.image_style, t.image_size, t.article_length, 
                t.publishing_mode, t.seo_settings
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
      if (!website) throw new Error('WordPress website connection not configured');

      const decryptedApiKey = decrypt(provider.api_key);
      const decryptedWpPassword = decrypt(website.password);

      const aiConfig: AIProviderConfig = {
        provider: provider.provider,
        apiKey: decryptedApiKey,
        baseUrl: provider.base_url || undefined,
        organization: provider.organization || undefined
      };

      const wpConfig: WordPressSiteConfig = {
        url: website.url,
        username: website.username,
        password: decryptedWpPassword
      };

      // 3. Setup prompt
      const promptTemplate = job.prompt_template || 
        "Write an exhaustive, SEO optimized blog post about: {keyword}. Include H2/H3 subheadings, lists, and a table if helpful. Target length is {length}.";
      
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

      // 5. Generate Featured Image if enabled
      let featuredImageId: number | undefined = undefined;
      let localImagePath = '';
      let uploadedImageUrl = '';

      if (job.image_generation === 1) {
        await this.log(taskId, jobId, 'info', `Generating featured image...`);
        try {
          // Find OpenAI key for DALL-E (fallback if main provider is Gemini/Claude)
          let imgKeyConfig = aiConfig;
          if (provider.provider !== 'openai') {
            const oaiKey = await dbGet(`SELECT * FROM api_keys WHERE provider = 'openai' LIMIT 1`);
            if (oaiKey) {
              imgKeyConfig = {
                provider: 'openai',
                apiKey: decrypt(oaiKey.api_key)
              };
            } else {
              throw new Error('Image generation enabled but no OpenAI API key found');
            }
          }

          // Read image_model from global settings (default: gpt-image-2)
          const imageModelSetting = await dbGet(`SELECT value FROM settings WHERE key = 'image_model'`);
          const imageModel = imageModelSetting?.value || 'gpt-image-2';

          localImagePath = await generateFeaturedImage(imgKeyConfig, keyword, job.image_size, job.image_style, imageModel);
          await this.log(taskId, jobId, 'info', `Featured image generated successfully. Uploading to WordPress...`);

          const media = await uploadWordPressMedia(wpConfig, localImagePath, keyword);
          featuredImageId = media.id;
          uploadedImageUrl = media.url;
          await this.log(taskId, jobId, 'info', `Image uploaded. Media ID: ${media.id}`);
        } catch (imgErr: any) {
          await this.log(taskId, jobId, 'warn', `Image generation/upload failed: ${imgErr.message}. Proceeding without image.`);
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

      // 7. Publish to WordPress
      await this.log(taskId, jobId, 'info', `Creating WordPress post...`);
      
      const postPayload: PostPayload = {
        title: parsedTitle,
        content: htmlContent,
        status: job.publishing_mode || 'draft',
        categoryName: job.category || undefined,
        tags: [keyword, ...(job.category ? [job.category] : [])],
        featuredImageId,
        slug,
        excerpt: seoDescription,
        seoSettings: seoPayload
      };

      const wpPost = await createWordPressPost(wpConfig, postPayload);
      await this.log(taskId, jobId, 'info', `Published successfully! Post ID: ${wpPost.id}. Link: ${wpPost.url}`);

      // 8. Mark job as complete
      await dbRun(
        `UPDATE jobs 
         SET status = 'completed', 
             post_id = ?, 
             post_url = ?, 
             generated_title = ?, 
             generated_content = ?, 
             image_url = ?,
             token_usage = ?, 
             estimated_cost = ?,
             completed_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [
          wpPost.id, 
          wpPost.url, 
          parsedTitle, 
          htmlContent, 
          uploadedImageUrl || null,
          genResult.promptTokens + genResult.completionTokens, 
          genResult.estimatedCost, 
          jobId
        ]
      );
      this.notifyUI('job-status-changed', { jobId, taskId, status: 'completed', postUrl: wpPost.url });

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
  let html = markdown;

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings H3
  html = html.replace(/^[ \t]*###[ \t]+([^\r\n]+)$/gm, '<h3>$1</h3>');
  
  // Headings H2
  html = html.replace(/^[ \t]*##[ \t]+([^\r\n]+)$/gm, '<h2>$1</h2>');

  // Headings H1 (if any remaining)
  html = html.replace(/^[ \t]*#[ \t]+([^\r\n]+)$/gm, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Blockquotes
  html = html.replace(/^[ \t]*>[ \t]+([^\r\n]+)$/gm, '<blockquote>$1</blockquote>');

  // Tables
  html = parseMarkdownTables(html);

  // Lists (bullet points & numbered lists)
  const lines = html.split('\n');
  let currentListType: 'ul' | 'ol' | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isUnordered = line.startsWith('- ') || line.startsWith('* ');
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
