import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { initDatabase, closeDatabase, dbAll, dbRun, dbGet } from './database/connection';
import { encrypt, decrypt } from './services/security';
import { testWordPressConnection, getWordPressCategories } from './services/wordpress';
import { queueManager } from './services/queue';
import { scheduler } from './services/scheduler';
import { setupAutoUpdater } from './services/updater';
import { startExpressServer, stopExpressServer } from './server';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'StackOrbitAI Bulk Writer Pro',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    backgroundColor: '#09090b' // Match slate-950 background
  });

  // Open DevTools in dev mode
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Setup auto updater
  setupAutoUpdater(mainWindow);
}

// 1. Electron Lifecycle
app.whenReady().then(async () => {
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
  await startExpressServer(4890, (siteData) => {
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

// 2. Register IPC Handlers
// App Utilities
ipcMain.handle('app:openExternal', async (_event, url: string) => {
  await shell.openExternal(url);
  return { success: true };
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
    await dbRun(`UPDATE api_keys SET is_default = 0 WHERE provider = ?`, [provider]);
  }

  await dbRun(
    `INSERT INTO api_keys (provider, name, api_key, base_url, organization, models, is_default) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [provider, name, encryptedKey, baseUrl || null, organization || null, JSON.stringify(models || []), isDefault ? 1 : 0]
  );
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
    seoSettings, scheduleSettings, isScheduled
  } = taskData;

  const status = isScheduled ? 'scheduled' : 'draft';

  const result = await dbRun(
    `INSERT INTO tasks (
      name, website_id, language, country, category, keywords,
      prompt_template, provider_id, model, image_generation,
      image_style, image_size, article_length, publishing_mode,
      seo_settings, schedule_settings, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name, websiteId, language || 'en', country || 'us', category || 'General',
      JSON.stringify(keywords), promptTemplate, providerId, model, imageGeneration ? 1 : 0,
      imageStyle || 'photorealistic', imageSize || '1200x630', articleLength || 'medium',
      publishingMode || 'draft', JSON.stringify(seoSettings || {}),
      JSON.stringify(scheduleSettings || {}), status
    ]
  );

  const taskId = result.lastID;

  // Insert jobs for each keyword
  for (const kw of keywords) {
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
  const result = await dbRun(
    `INSERT INTO tasks (
      name, website_id, language, country, category, keywords,
      prompt_template, provider_id, model, image_generation,
      image_style, image_size, article_length, publishing_mode,
      seo_settings, schedule_settings, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
    [
      newName, original.website_id, original.language, original.country, original.category,
      original.keywords, original.prompt_template, original.provider_id, original.model,
      original.image_generation, original.image_style, original.image_size, original.article_length,
      original.publishing_mode, original.seo_settings, original.schedule_settings
    ]
  );

  const newTaskId = result.lastID;
  const keywords = JSON.parse(original.keywords || '[]');
  
  for (const kw of keywords) {
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
    seoSettings, scheduleSettings, isScheduled, status
  } = taskData;

  await dbRun(
    `UPDATE tasks SET 
      name = ?, website_id = ?, language = ?, country = ?, category = ?, 
      keywords = ?, prompt_template = ?, provider_id = ?, model = ?, 
      image_generation = ?, image_style = ?, image_size = ?, article_length = ?, 
      publishing_mode = ?, seo_settings = ?, schedule_settings = ?, status = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      name, websiteId, language, country, category, 
      JSON.stringify(keywords), promptTemplate, providerId, model, 
      imageGeneration ? 1 : 0, imageStyle, imageSize, articleLength, 
      publishingMode, JSON.stringify(seoSettings || {}), 
      JSON.stringify(scheduleSettings || {}), status, id
    ]
  );

  // Sync keyword jobs
  const currentJobs = await dbAll(`SELECT id, keyword, status FROM jobs WHERE task_id = ?`, [id]);
  const currentKeywords = currentJobs.map(j => j.keyword);
  const newKeywordsSet = new Set(keywords);

  // Delete jobs that are no longer present and are waiting/skipped/failed
  for (const job of currentJobs) {
    if (!newKeywordsSet.has(job.keyword) && (job.status === 'waiting' || job.status === 'skipped' || job.status === 'failed')) {
      await dbRun(`DELETE FROM jobs WHERE id = ?`, [job.id]);
    }
  }

  // Insert new jobs
  const currentKeywordsSet = new Set(currentKeywords);
  for (const kw of keywords) {
    if (!currentKeywordsSet.has(kw)) {
      await dbRun(
        `INSERT INTO jobs (task_id, keyword, status) VALUES (?, ?, 'waiting')`,
        [id, kw]
      );
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
    chartData: chartData.reverse(),
    recentActivity: recentLogs
  };
});
