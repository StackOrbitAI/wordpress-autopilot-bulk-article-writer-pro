import { app, BrowserWindow, ipcMain, shell, Menu, MenuItem } from 'electron';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { initDatabase, closeDatabase, dbAll, dbRun, dbGet } from './database/connection';
import { encrypt, decrypt } from './services/security';
import { 
  testWordPressConnection, 
  getWordPressCategories, 
  getWordPressArticles, 
  updateWordPressArticle, 
  createWordPressPage, 
  updateWordPressCategory,
  getWordPressPages,
  updateWordPressPage
} from './services/wordpress';
import { generateArticle } from './services/ai';
import { queueManager } from './services/queue';
import { scheduler } from './services/scheduler';
import { setupAutoUpdater } from './services/updater';
import { googleDocsService } from './services/googleDocs';
import { startExpressServer, stopExpressServer } from './server';

let mainWindow: BrowserWindow | null = null;
let expressPort = 4890;

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development';
  const iconPath = isDev 
    ? path.join(__dirname, '../../build/icon.png')
    : path.join(process.resourcesPath, 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'WordPress Autopilot Bulk Article SEO Writer Pro (with AI Agents)',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    backgroundColor: '#09090b' // Match slate-950 background
  });


  // Open DevTools in dev mode
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Enable right-click context menu (Cut, Copy, Paste, Select All) in input fields
  mainWindow.webContents.on('context-menu', (_e, params) => {
    const contextMenu = new Menu();
    if (params.isEditable) {
      contextMenu.append(new MenuItem({ label: 'Cut', role: 'cut' }));
      contextMenu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
      contextMenu.append(new MenuItem({ label: 'Paste', role: 'paste' }));
      contextMenu.append(new MenuItem({ label: 'Select All', role: 'selectAll' }));
      contextMenu.popup({ window: mainWindow! });
    } else if (params.selectionText && params.selectionText.trim() !== '') {
      contextMenu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
      contextMenu.popup({ window: mainWindow! });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Setup auto updater
  setupAutoUpdater(mainWindow);
}

// 1. Electron Single Instance Lock & Lifecycle
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.warn('[Electron] Another instance is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Setup standard application menu to enable keyboard copy/paste/undo/redo shortcuts
    const template: any[] = [
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'pasteandmatchstyle' },
          { role: 'delete' },
          { role: 'selectall' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forcereload' },
          { role: 'toggledevtools' },
          { type: 'separator' },
          { role: 'resetzoom' },
          { role: 'zoomin' },
          { role: 'zoomout' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          ...(process.platform === 'darwin' ? [
            { type: 'separator' },
            { role: 'front' },
            { type: 'separator' },
            { role: 'window' }
          ] : [
            { role: 'close' }
          ])
        ]
      }
    ];

    const appMenu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(appMenu);

    // Initialize Database
    await initDatabase();

    // Resume running tasks on startup
    try {
      const runningTasks = await dbAll(`SELECT id FROM tasks WHERE status = 'running'`);
      for (const t of runningTasks) {
        console.log(`[Startup] Resuming task ID ${t.id}...`);
        // Start processing but do not block app init
        queueManager.startTask(t.id).catch(err => {
          console.error(`[Startup] Error resuming task ${t.id}:`, err);
        });
      }
    } catch (err: any) {
      console.error('[Startup] Failed to auto-resume running tasks:', err.message);
    }

    // Start Express API Server
    expressPort = await startExpressServer(4890, (siteData) => {
      if (mainWindow) {
        mainWindow.webContents.send('wordpress:auth-success', siteData);
      }
    });

    // Start Task Scheduler
    scheduler.start();

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', async () => {
    // Stop scheduler and local Express server
    scheduler.stop();
    await stopExpressServer();
    await closeDatabase();

    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

// 2. Register IPC Handlers
// App Utilities
// App Utilities
ipcMain.handle('app:openExternal', async (_event, url: string) => {
  await shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('app:getExpressPort', async () => {
  return expressPort;
});

ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

// Settings
ipcMain.handle('db:getSettings', async () => {
  const rows = await dbAll(`SELECT key, value FROM settings`);
  const settings: Record<string, string> = {};
  rows.forEach((r) => {
    settings[r.key] = r.value;
  });
  return settings;
});

ipcMain.handle('db:updateSetting', async (_event, key: string, value: string) => {
  await dbRun(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
  return { success: true };
});

// WordPress Websites
ipcMain.handle('db:getWebsites', async () => {
  return await dbAll(`SELECT id, name, url, username, status, created_at FROM websites`);
});

ipcMain.handle('db:addWebsite', async (_event, site: any) => {
  const { name, url, username, password } = site;
  const encryptedPassword = encrypt(password);
  await dbRun(
    `INSERT INTO websites (name, url, username, password, status) VALUES (?, ?, ?, ?, 'active')`,
    [name, url, username, encryptedPassword]
  );
  return { success: true };
});

ipcMain.handle('db:deleteWebsite', async (_event, id: number) => {
  await dbRun(`DELETE FROM websites WHERE id = ?`, [id]);
  return { success: true };
});

ipcMain.handle('db:testWebsite', async (_event, id: number) => {
  const site = await dbGet(`SELECT url, username, password FROM websites WHERE id = ?`, [id]);
  if (!site) throw new Error('Website connection config not found');

  const decryptedPassword = decrypt(site.password);
  try {
    const active = await testWordPressConnection({
      url: site.url,
      username: site.username,
      password: decryptedPassword
    });
    
    if (active) {
      await dbRun(`UPDATE websites SET status = 'active' WHERE id = ?`, [id]);
      return { success: true };
    }
    throw new Error('Connection failed');
  } catch (error: any) {
    await dbRun(`UPDATE websites SET status = 'failed' WHERE id = ?`, [id]);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:testWebsiteConfig', async (_event, site: any) => {
  try {
    const success = await testWordPressConnection({
      url: site.url,
      username: site.username,
      password: site.password
    });
    return { success };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// AI Keys
ipcMain.handle('db:getApiKeys', async () => {
  return await dbAll(`SELECT id, provider, name, base_url, organization, models, is_default FROM api_keys`);
});

ipcMain.handle('db:addApiKey', async (_event, keyData: any) => {
  const { provider, name, apiKey, baseUrl, organization, models, isDefault } = keyData;
  const encryptedKey = encrypt(apiKey);

  if (isDefault) {
    await dbRun(`UPDATE api_keys SET is_default = 0`);
  }

  await dbRun(
    `INSERT INTO api_keys (provider, name, api_key, base_url, organization, models, is_default) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [provider, name, encryptedKey, baseUrl || null, organization || null, JSON.stringify(models || []), isDefault ? 1 : 0]
  );
  return { success: true };
});

ipcMain.handle('db:setDefaultApiKey', async (_event, id: number) => {
  await dbRun(`UPDATE api_keys SET is_default = 0`);
  await dbRun(`UPDATE api_keys SET is_default = 1 WHERE id = ?`, [id]);
  return { success: true };
});

ipcMain.handle('db:setApiKeyDefault', async (_event, id: number) => {
  await dbRun(`UPDATE api_keys SET is_default = 0`);
  await dbRun(`UPDATE api_keys SET is_default = 1 WHERE id = ?`, [id]);
  return { success: true };
});

ipcMain.handle('db:deleteApiKey', async (_event, id: number) => {
  await dbRun(`DELETE FROM api_keys WHERE id = ?`, [id]);
  return { success: true };
});

// Tasks
ipcMain.handle('db:getTasks', async () => {
  return await dbAll(
    `SELECT t.*, w.name as website_name, a.name as provider_name 
     FROM tasks t 
     LEFT JOIN websites w ON t.website_id = w.id 
     LEFT JOIN api_keys a ON t.provider_id = a.id 
     ORDER BY t.id DESC`
  );
});

ipcMain.handle('db:getTaskById', async (_event, id: number) => {
  return await dbGet(`SELECT * FROM tasks WHERE id = ?`, [id]);
});

ipcMain.handle('db:createTask', async (_event, taskData: any) => {
  const {
    name, websiteId, language, country, category, keywords,
    promptTemplate, providerId, model, imageGeneration,
    imageStyle, imageSize, articleLength, publishingMode,
    seoSettings, scheduleSettings, isScheduled, imageModel, publishTarget, insertInlineImages
  } = taskData;

  const status = isScheduled ? 'scheduled' : 'draft';

  // Deduplicate keywords case-insensitively and trim
  const seen = new Set<string>();
  const uniqueKws: string[] = [];
  if (Array.isArray(keywords)) {
    for (const kw of keywords) {
      if (typeof kw === 'string') {
        const trimmed = kw.trim();
        if (trimmed && !seen.has(trimmed.toLowerCase())) {
          seen.add(trimmed.toLowerCase());
          uniqueKws.push(trimmed);
        }
      }
    }
  }

  const result = await dbRun(
    `INSERT INTO tasks (
      name, website_id, language, country, category, keywords,
      prompt_template, provider_id, model, image_generation,
      image_style, image_size, article_length, publishing_mode,
      seo_settings, schedule_settings, status, image_model, publish_target, insert_inline_images
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name, websiteId, language || 'en', country || 'us', category || 'General',
      JSON.stringify(uniqueKws), promptTemplate, providerId, model, imageGeneration !== undefined ? imageGeneration : 0,
      imageStyle || 'photorealistic', imageSize || '1200x628', articleLength || 'medium',
      publishingMode || 'draft', JSON.stringify(seoSettings || {}),
      JSON.stringify(scheduleSettings || {}), status, imageModel || 'gpt-image-2', publishTarget || 'wordpress',
      insertInlineImages ? 1 : 0
    ]
  );

  const taskId = result.lastID;

  // Insert jobs for each keyword
  for (const kw of uniqueKws) {
    await dbRun(
      `INSERT INTO jobs (task_id, keyword, status) VALUES (?, ?, 'waiting')`,
      [taskId, kw]
    );
  }

  return { success: true, taskId };
});

ipcMain.handle('db:deleteTask', async (_event, id: number) => {
  await dbRun(`DELETE FROM tasks WHERE id = ?`, [id]);
  await dbRun(`DELETE FROM jobs WHERE task_id = ?`, [id]);
  await dbRun(`DELETE FROM logs WHERE task_id = ?`, [id]);
  return { success: true };
});

ipcMain.handle('db:duplicateTask', async (_event, id: number) => {
  const original = await dbGet(`SELECT * FROM tasks WHERE id = ?`, [id]);
  if (!original) throw new Error('Task to duplicate not found');

  const newName = `${original.name} (Copy)`;

  // Deduplicate keywords case-insensitively
  const origKeywords = JSON.parse(original.keywords || '[]');
  const seen = new Set<string>();
  const uniqueKws: string[] = [];
  if (Array.isArray(origKeywords)) {
    for (const kw of origKeywords) {
      if (typeof kw === 'string') {
        const trimmed = kw.trim();
        if (trimmed && !seen.has(trimmed.toLowerCase())) {
          seen.add(trimmed.toLowerCase());
          uniqueKws.push(trimmed);
        }
      }
    }
  }

  const result = await dbRun(
    `INSERT INTO tasks (
      name, website_id, language, country, category, keywords,
      prompt_template, provider_id, model, image_generation,
      image_style, image_size, article_length, publishing_mode,
      seo_settings, schedule_settings, status, image_model, publish_target, insert_inline_images
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    [
      newName, original.website_id, original.language, original.country, original.category,
      JSON.stringify(uniqueKws), original.prompt_template, original.provider_id, original.model,
      original.image_generation, original.image_style, original.image_size, original.article_length,
      original.publishing_mode, original.seo_settings, original.schedule_settings, 
      original.image_model || 'gpt-image-2', original.publish_target || 'wordpress',
      original.insert_inline_images !== undefined ? original.insert_inline_images : 0
    ]
  );

  const newTaskId = result.lastID;
  
  for (const kw of uniqueKws) {
    await dbRun(
      `INSERT INTO jobs (task_id, keyword, status) VALUES (?, ?, 'waiting')`,
      [newTaskId, kw]
    );
  }

  return { success: true, newTaskId };
});

// Queue Operations Route
ipcMain.handle('queue:start', async (_event, id: number) => {
  await queueManager.startTask(id);
  return { success: true };
});

ipcMain.handle('queue:pause', async (_event, id: number) => {
  await queueManager.pauseTask(id);
  return { success: true };
});

ipcMain.handle('queue:cancel', async (_event, id: number) => {
  await queueManager.cancelTask(id);
  return { success: true };
});

ipcMain.handle('queue:retry', async (_event, id: number) => {
  await queueManager.retryTask(id);
  return { success: true };
});

ipcMain.handle('queue:stop', async (_event, id: number) => {
  await queueManager.cancelTask(id);
  return { success: true };
});

ipcMain.handle('queue:restart', async (_event, id: number) => {
  await queueManager.restartTask(id);
  return { success: true };
});

ipcMain.handle('wp:getCategories', async (_event, websiteId: number) => {
  const site = await dbGet(`SELECT url, username, password FROM websites WHERE id = ?`, [websiteId]);
  if (!site) throw new Error('Website not found');

  const decryptedPassword = decrypt(site.password);
  const categories = await getWordPressCategories({
    url: site.url,
    username: site.username,
    password: decryptedPassword
  });
  return categories;
});

ipcMain.handle('db:updateTask', async (_event, id: number, taskData: any) => {
  const {
    name, websiteId, language, country, category, keywords,
    promptTemplate, providerId, model, imageGeneration,
    imageStyle, imageSize, articleLength, publishingMode,
    seoSettings, scheduleSettings, isScheduled, status, imageModel, publishTarget, insertInlineImages
  } = taskData;

  // Deduplicate keywords case-insensitively and trim
  const seen = new Set<string>();
  const uniqueKws: string[] = [];
  if (Array.isArray(keywords)) {
    for (const kw of keywords) {
      if (typeof kw === 'string') {
        const trimmed = kw.trim();
        if (trimmed && !seen.has(trimmed.toLowerCase())) {
          seen.add(trimmed.toLowerCase());
          uniqueKws.push(trimmed);
        }
      }
    }
  }

  await dbRun(
    `UPDATE tasks SET 
      name = ?, website_id = ?, language = ?, country = ?, category = ?, 
      keywords = ?, prompt_template = ?, provider_id = ?, model = ?, 
      image_generation = ?, image_style = ?, image_size = ?, article_length = ?, 
      publishing_mode = ?, seo_settings = ?, schedule_settings = ?, status = ?,
      image_model = ?, publish_target = ?, insert_inline_images = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      name, websiteId, language, country, category, 
      JSON.stringify(uniqueKws), promptTemplate, providerId, model, 
      imageGeneration !== undefined ? imageGeneration : 0, imageStyle, imageSize, articleLength, 
      publishingMode, JSON.stringify(seoSettings || {}), 
      JSON.stringify(scheduleSettings || {}), status, imageModel || 'gpt-image-2', publishTarget || 'wordpress',
      insertInlineImages ? 1 : 0, id
    ]
  );

  // Sync keyword jobs
  const currentJobs = await dbAll(`SELECT id, keyword, status FROM jobs WHERE task_id = ?`, [id]);
  
  // Delete jobs that are no longer present (case-insensitively) and are waiting/skipped/failed
  const uniqueNewKwsSet = new Set(uniqueKws.map(k => k.toLowerCase()));
  for (const job of currentJobs) {
    if (!uniqueNewKwsSet.has(job.keyword.toLowerCase()) && (job.status === 'waiting' || job.status === 'skipped' || job.status === 'failed')) {
      await dbRun(`DELETE FROM jobs WHERE id = ?`, [job.id]);
    }
  }

  // Insert new jobs
  const currentJobsKwsSet = new Set(currentJobs.map(j => j.keyword.toLowerCase()));
  for (const kw of uniqueKws) {
    if (!currentJobsKwsSet.has(kw.toLowerCase())) {
      await dbRun(
        `INSERT INTO jobs (task_id, keyword, status) VALUES (?, ?, 'waiting')`,
        [id, kw]
      );
      currentJobsKwsSet.add(kw.toLowerCase());
    }
  }

  return { success: true };
});

ipcMain.handle('db:getJobs', async (_event, taskId: number) => {
  return await dbAll(`SELECT * FROM jobs WHERE task_id = ? ORDER BY id ASC`, [taskId]);
});

ipcMain.handle('db:getLogs', async (_event, taskId: number, limit: number = 100) => {
  return await dbAll(`SELECT * FROM logs WHERE task_id = ? ORDER BY id DESC LIMIT ?`, [taskId, limit]);
});

// Dashboard aggregates
ipcMain.handle('db:getDashboardStats', async () => {
  const taskCounts = await dbGet(
    `SELECT 
       COUNT(*) as total,
       SUM(case when status = 'running' then 1 else 0 end) as running,
       SUM(case when status = 'completed' then 1 else 0 end) as completed,
       SUM(case when status = 'failed' then 1 else 0 end) as failed,
       SUM(case when status = 'scheduled' then 1 else 0 end) as scheduled
     FROM tasks`
  );

  const jobCounts = await dbGet(
    `SELECT 
       COUNT(*) as total,
       SUM(case when post_id IS NOT NULL then 1 else 0 end) as published,
       SUM(case when status = 'waiting' then 1 else 0 end) as waiting
     FROM jobs`
  );

  // Fetch active running task details if one exists
  const runningTask = await dbGet(`SELECT id, name FROM tasks WHERE status = 'running' LIMIT 1`);
  let activePipeline = null;
  if (runningTask) {
    const jobsStats = await dbGet(
      `SELECT 
         COUNT(*) as total,
         SUM(case when status = 'completed' then 1 else 0 end) as completed,
         SUM(case when status = 'failed' then 1 else 0 end) as failed,
         SUM(case when status = 'running' then 1 else 0 end) as running,
         SUM(case when status = 'waiting' then 1 else 0 end) as waiting
       FROM jobs WHERE task_id = ?`,
      [runningTask.id]
    );
    
    const nextJob = await dbGet(
      `SELECT keyword FROM jobs WHERE task_id = ? AND status = 'waiting' ORDER BY id ASC LIMIT 1`,
      [runningTask.id]
    );
    
    const lastJob = await dbGet(
      `SELECT keyword, post_url FROM jobs WHERE task_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`,
      [runningTask.id]
    );

    const total = jobsStats?.total || 0;
    const completed = jobsStats?.completed || 0;
    const failed = jobsStats?.failed || 0;
    const running = jobsStats?.running || 0;
    const waiting = jobsStats?.waiting || 0;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    const etrMinutes = Math.ceil(((waiting + running) * 25) / 60);

    activePipeline = {
      taskId: runningTask.id,
      name: runningTask.name,
      total,
      completed,
      failed,
      progress,
      etrMinutes,
      nextKeyword: nextJob?.keyword || null,
      lastPublishedKeyword: lastJob?.keyword || null,
      lastPublishedUrl: lastJob?.post_url || null
    };
  }

  // Generate charts data: last 7 days of posting activity
  const chartData = await dbAll(
    `SELECT DATE(completed_at) as date, COUNT(*) as count 
     FROM jobs 
     WHERE status = 'completed' AND completed_at IS NOT NULL
     GROUP BY DATE(completed_at) 
     ORDER BY DATE(completed_at) DESC 
     LIMIT 7`
  );

  // Recent activity list
  const recentLogs = await dbAll(
    `SELECT l.*, t.name as task_name 
     FROM logs l 
     LEFT JOIN tasks t ON l.task_id = t.id 
     ORDER BY l.id DESC 
     LIMIT 10`
  );

  return {
    tasks: {
      total: taskCounts?.total || 0,
      running: taskCounts?.running || 0,
      completed: taskCounts?.completed || 0,
      failed: taskCounts?.failed || 0,
      scheduled: taskCounts?.scheduled || 0
    },
    posts: {
      published: jobCounts?.published || 0,
      waiting: jobCounts?.waiting || 0
    },
    activePipeline,
    chartData: chartData.reverse(),
    recentActivity: recentLogs
  };
});

// Update API Key/Provider details
ipcMain.handle('db:updateApiKey', async (_event, id: number, keyData: any) => {
  const { provider, name, apiKey, baseUrl, organization, models, isDefault } = keyData;

  if (isDefault) {
    await dbRun(`UPDATE api_keys SET is_default = 0`);
  }

  let query = '';
  let params: any[] = [];

  // If password input is not modified (masked with bullet points) keep existing key
  if (apiKey && apiKey !== '••••••••' && apiKey !== '********') {
    const encryptedKey = encrypt(apiKey);
    query = `UPDATE api_keys SET provider = ?, name = ?, api_key = ?, base_url = ?, organization = ?, models = ?, is_default = ? WHERE id = ?`;
    params = [provider, name, encryptedKey, baseUrl || null, organization || null, JSON.stringify(models || []), isDefault ? 1 : 0, id];
  } else {
    query = `UPDATE api_keys SET provider = ?, name = ?, base_url = ?, organization = ?, models = ?, is_default = ? WHERE id = ?`;
    params = [provider, name, baseUrl || null, organization || null, JSON.stringify(models || []), isDefault ? 1 : 0, id];
  }

  await dbRun(query, params);
  return { success: true };
});

// Google Integration IPC handlers
let activeAuthFlow: any = null;

ipcMain.handle('google:startAuth', async (_event, { clientId, clientSecret }) => {
  try {
    googleDocsService.stopOAuthListener();
    activeAuthFlow = await googleDocsService.startOAuthFlow(clientId, clientSecret);
    return { success: true, authUrl: activeAuthFlow.authUrl };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('google:completeAuth', async (_event) => {
  try {
    if (!activeAuthFlow || !activeAuthFlow.getTokens) {
      throw new Error('OAuth authorization flow was not initialized');
    }
    const refreshToken = await activeAuthFlow.getTokens();
    activeAuthFlow = null;
    return { success: true, refreshToken };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('google:cancelAuth', async (_event) => {
  googleDocsService.stopOAuthListener();
  activeAuthFlow = null;
  return { success: true };
});

ipcMain.handle('google:testConnection', async (_event, config: any) => {
  try {
    const result = await googleDocsService.testConnection(config);
    return { success: true, email: result.email };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('google:listFolders', async (_event, config: any) => {
  try {
    const folders = await googleDocsService.listFolders(config);
    return { success: true, folders };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// AI Agents Hub Optimization handlers
ipcMain.handle('wp:getArticles', async (_event, siteId: number, params: any) => {
  const site = await dbGet(`SELECT url, username, password FROM websites WHERE id = ?`, [siteId]);
  if (!site) throw new Error('WordPress site configuration not found');
  const decryptedPassword = decrypt(site.password);
  return await getWordPressArticles({
    url: site.url,
    username: site.username,
    password: decryptedPassword
  }, params);
});

ipcMain.handle('wp:optimizeArticle', async (_event, siteId: number, postId: number, strategy: any) => {
  try {
    const site = await dbGet(`SELECT url, username, password FROM websites WHERE id = ?`, [siteId]);
    if (!site) throw new Error('WordPress site configuration not found');
    const decryptedPassword = decrypt(site.password);
    const wpConfig = {
      url: site.url,
      username: site.username,
      password: decryptedPassword
    };

    const activeApiKey = (await dbGet(`SELECT provider, key_value, base_url, models FROM api_keys WHERE is_default = 1`))
      || (await dbGet(`SELECT provider, key_value, base_url, models FROM api_keys ORDER BY id ASC LIMIT 1`));
    if (!activeApiKey) throw new Error('No AI provider API keys configured. Please add one first.');

    const decryptedKey = decrypt(activeApiKey.key_value);
    const aiConfig = {
      provider: activeApiKey.provider,
      apiKey: decryptedKey,
      baseUrl: activeApiKey.base_url || undefined
    };
    const models = JSON.parse(activeApiKey.models || '[]');
    const model = models[0] || 'gpt-4o';

    // Fetch the original article from WP
    const response = await axios.get(`${site.url.replace(/\/$/, '')}/wp-json/wp/v2/posts/${postId}`, {
      params: { context: 'edit' },
      headers: {
        'Authorization': `Basic ${Buffer.from(`${site.username}:${decryptedPassword}`).toString('base64')}`
      }
    });

    const originalTitle = response.data?.title?.raw || response.data?.title?.rendered || '';
    const originalContent = response.data?.content?.raw || response.data?.content?.rendered || '';

    // Build the AI optimization request
    const prompt = `
Optimize the following WordPress article:
Title: "${originalTitle}"
Content:
${originalContent}

Optimization Strategies to apply:
- Paragraphs improvement: ${strategy.improveParagraphs ? 'Yes (rewrite sentences for clarity, flow, readability)' : 'No'}
- Headings alignment: ${strategy.improveHeadings ? 'Yes (optimize subheadings to match high-relevance intents)' : 'No'}
- SEO Enhancement: ${strategy.autoSeo ? 'Yes (align with Yoast/RankMath keyword focus)' : 'No'}

Return ONLY the optimized HTML body content. Do NOT include markdown code block wrappers (like \`\`\`html) or explanations. Preserve the original post tags, lists, and tables.
`;

    const genResult = await generateArticle(aiConfig as any, model, prompt);
    let optimizedContent = genResult.text.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();

    // Push the update back to WordPress
    await updateWordPressArticle(wpConfig, postId, {
      content: optimizedContent
    });

    return { success: true };
  } catch (err: any) {
    console.error('[AI Agent] Optimization handler failed:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('wp:getPages', async (_event, siteId: number, params: any) => {
  try {
    const site = await dbGet(`SELECT url, username, password FROM websites WHERE id = ?`, [siteId]);
    if (!site) throw new Error('WordPress site configuration not found');
    const decryptedPassword = decrypt(site.password);
    return await getWordPressPages({
      url: site.url,
      username: site.username,
      password: decryptedPassword
    }, params);
  } catch (err: any) {
    console.error('[WordPress] Failed to fetch pages:', err.message);
    throw err;
  }
});

ipcMain.handle('wp:optimizePage', async (_event, siteId: number, pageId: number, strategy: any) => {
  try {
    const site = await dbGet(`SELECT url, username, password FROM websites WHERE id = ?`, [siteId]);
    if (!site) throw new Error('WordPress site configuration not found');
    const decryptedPassword = decrypt(site.password);
    const wpConfig = {
      url: site.url,
      username: site.username,
      password: decryptedPassword
    };

    const activeApiKey = (await dbGet(`SELECT provider, key_value, base_url, models FROM api_keys WHERE is_default = 1`))
      || (await dbGet(`SELECT provider, key_value, base_url, models FROM api_keys ORDER BY id ASC LIMIT 1`));
    if (!activeApiKey) throw new Error('No AI provider API keys configured. Please add one first.');

    const decryptedKey = decrypt(activeApiKey.key_value);
    const aiConfig = {
      provider: activeApiKey.provider,
      apiKey: decryptedKey,
      baseUrl: activeApiKey.base_url || undefined
    };
    const models = JSON.parse(activeApiKey.models || '[]');
    const model = models[0] || 'gpt-4o';

    // Fetch the original page from WP
    const response = await axios.get(`${site.url.replace(/\/$/, '')}/wp-json/wp/v2/pages/${pageId}`, {
      params: { context: 'edit' },
      headers: {
        'Authorization': `Basic ${Buffer.from(`${site.username}:${decryptedPassword}`).toString('base64')}`
      }
    });

    const originalTitle = response.data?.title?.raw || response.data?.title?.rendered || '';
    const originalContent = response.data?.content?.raw || response.data?.content?.rendered || '';

    // Build the AI optimization request
    const prompt = `
Optimize the following WordPress page:
Title: "${originalTitle}"
Content:
${originalContent}

Optimization Strategies to apply:
- Paragraphs improvement: ${strategy.improveParagraphs ? 'Yes (rewrite sentences for clarity, flow, readability)' : 'No'}
- Headings alignment: ${strategy.improveHeadings ? 'Yes (optimize subheadings to match high-relevance intents)' : 'No'}
- SEO Enhancement: ${strategy.autoSeo ? 'Yes (align with Yoast/RankMath keyword focus)' : 'No'}

Return ONLY the optimized HTML body content. Do NOT include markdown code block wrappers (like \`\`\`html) or explanations. Preserve the original page tags, lists, and tables.
`;

    const genResult = await generateArticle(aiConfig as any, model, prompt);
    let optimizedContent = genResult.text.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();

    // Push the update back to WordPress
    await updateWordPressPage(wpConfig, pageId, {
      content: optimizedContent
    });

    return { success: true };
  } catch (err: any) {
    console.error('[AI Agent] Page optimization handler failed:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('wp:createPage', async (_event, siteId: number, payload: any) => {
  try {
    const site = await dbGet(`SELECT url, username, password FROM websites WHERE id = ?`, [siteId]);
    if (!site) throw new Error('WordPress site configuration not found');
    const decryptedPassword = decrypt(site.password);
    const wpConfig = {
      url: site.url,
      username: site.username,
      password: decryptedPassword
    };

    const activeApiKey = (await dbGet(`SELECT provider, key_value, base_url, models FROM api_keys WHERE is_default = 1`))
      || (await dbGet(`SELECT provider, key_value, base_url, models FROM api_keys ORDER BY id ASC LIMIT 1`));
    if (!activeApiKey) throw new Error('No AI provider API keys configured.');

    const decryptedKey = decrypt(activeApiKey.key_value);
    const aiConfig = {
      provider: activeApiKey.provider,
      apiKey: decryptedKey,
      baseUrl: activeApiKey.base_url || undefined
    };
    const models = JSON.parse(activeApiKey.models || '[]');
    const model = models[0] || 'gpt-4o';

    const prompt = `
Create a high-quality professional WordPress static page with:
Title: "${payload.title}"
Template/Target: "${payload.template}"
Design Style: "${payload.layout}"

Ensure the copy contains standard page layouts, headers, and section structure using clean HTML elements. Return ONLY the HTML content. Do NOT wrap in \`\`\`html or include explanations.
`;

    const genResult = await generateArticle(aiConfig as any, model, prompt);
    let pageContent = genResult.text.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();

    const result = await createWordPressPage(wpConfig, {
      title: payload.title,
      content: pageContent,
      status: 'draft'
    });

    return { success: true, url: result.url };
  } catch (err: any) {
    console.error('[AI Agent] Page creation handler failed:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('wp:optimizeCategories', async (_event, siteId: number, categoryIds: number[]) => {
  try {
    const site = await dbGet(`SELECT url, username, password FROM websites WHERE id = ?`, [siteId]);
    if (!site) throw new Error('WordPress site configuration not found');
    const decryptedPassword = decrypt(site.password);
    const wpConfig = {
      url: site.url,
      username: site.username,
      password: decryptedPassword
    };

    const activeApiKey = (await dbGet(`SELECT provider, key_value, base_url, models FROM api_keys WHERE is_default = 1`))
      || (await dbGet(`SELECT provider, key_value, base_url, models FROM api_keys ORDER BY id ASC LIMIT 1`));
    if (!activeApiKey) throw new Error('No AI provider API keys configured.');

    const decryptedKey = decrypt(activeApiKey.key_value);
    const aiConfig = {
      provider: activeApiKey.provider,
      apiKey: decryptedKey,
      baseUrl: activeApiKey.base_url || undefined
    };
    const models = JSON.parse(activeApiKey.models || '[]');
    const model = models[0] || 'gpt-4o';

    for (const catId of categoryIds) {
      const res = await axios.get(`${site.url.replace(/\/$/, '')}/wp-json/wp/v2/categories/${catId}`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${site.username}:${decryptedPassword}`).toString('base64')}`
        }
      });
      const originalName = res.data?.name || '';

      const prompt = `
Generate a professional, high-converting SEO description of 50-80 words for the WordPress category named: "${originalName}". Make it engaging and rich in semantic search terms. Return ONLY the description text itself. Do not include quotes or markdown.
`;

      const genResult = await generateArticle(aiConfig as any, model, prompt);
      const generatedDescription = genResult.text.trim();

      await updateWordPressCategory(wpConfig, catId, {
        description: generatedDescription
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('[AI Agent] Category optimization failed:', err.message);
    return { success: false, error: err.message };
  }
});

