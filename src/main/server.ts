import express from 'express';
import cors from 'cors';
import { dbGet, dbAll, dbRun } from './database/connection';
import { queueManager } from './services/queue';
import { encrypt } from './services/security';

const app = express();
app.use(cors());
app.use(express.json());

let serverInstance: any = null;

// Expose health status
app.get('/health', async (req, res) => {
  try {
    const stats = await dbGet(`SELECT COUNT(*) as count FROM tasks`);
    res.json({
      status: 'ok',
      version: '1.0.0',
      totalTasks: stats?.count || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get all tasks status
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await dbAll(`SELECT id, name, status, created_at FROM tasks ORDER BY id DESC`);
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Remotely queue a task by ID
app.post('/api/tasks/:id/start', async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  try {
    await queueManager.startTask(taskId);
    res.json({ success: true, message: `Task ${taskId} queued for execution` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trigger a new task creation via POST API
app.post('/api/tasks', async (req, res) => {
  const { name, websiteId, keywords, providerId, model, category } = req.body;
  if (!name || !websiteId || !keywords || !providerId || !model) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // 1. Create task
    const keywordArray = Array.isArray(keywords) ? keywords : [keywords];
    const result = await dbRun(
      `INSERT INTO tasks (name, website_id, provider_id, model, category, keywords, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
      [name, websiteId, providerId, model, category || 'General', JSON.stringify(keywordArray)]
    );

    const taskId = result.lastID;

    // 2. Generate jobs
    for (const kw of keywordArray) {
      await dbRun(
        `INSERT INTO jobs (task_id, keyword, status) VALUES (?, ?, 'waiting')`,
        [taskId, kw]
      );
    }

    res.json({ success: true, taskId, message: 'Task and jobs created successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

let wpCallback: ((data: any) => void) | null = null;

// WordPress Application Password Callback Handler
app.get('/api/wordpress/callback', async (req, res) => {
  console.log("[Express Server] Callback received query:", req.query);
  const { site_url, siteurl, user_login, password, site_name } = req.query;
  const finalSiteUrl = (site_url || siteurl) as string;

  if (!finalSiteUrl || !user_login || !password) {
    return res.status(400).send(`
      <html>
        <head>
          <title>Authentication Failed</title>
          <style>
            body {
              background: #09090b;
              color: #f4f4f5;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              background: #18181b;
              border: 1px solid #27272a;
              padding: 2.5rem;
              border-radius: 16px;
              text-align: center;
              max-width: 400px;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.7);
            }
            h1 { color: #ef4444; margin-top: 0; font-size: 1.5rem; font-weight: 700; }
            p { color: #a1a1aa; font-size: 0.875rem; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Authentication Failed</h1>
            <p>Missing required parameters from WordPress redirect. Please try again from the StackOrbitAI Bulk Writer Pro application.</p>
          </div>
        </body>
      </html>
    `);
  }

  try {
    const rawUrl = finalSiteUrl;
    const rawUser = user_login as string;
    const rawPassword = password as string;
    
    // Clean URL
    let cleanedUrl = rawUrl.trim();
    if (!cleanedUrl.startsWith('http://') && !cleanedUrl.startsWith('https://')) {
      cleanedUrl = 'https://' + cleanedUrl;
    }
    if (cleanedUrl.endsWith('/')) {
      cleanedUrl = cleanedUrl.slice(0, -1);
    }

    // Determine label
    let rawName = (site_name as string) || '';
    if (!rawName) {
      try {
        rawName = new URL(cleanedUrl).hostname;
      } catch {
        rawName = 'WordPress Site';
      }
    }

    // Encrypt password
    const encryptedPassword = encrypt(rawPassword);

    // Save/Update in SQLite database
    const existing = await dbGet(`SELECT id FROM websites WHERE url = ?`, [cleanedUrl]);
    let siteId: number;
    if (existing) {
      await dbRun(
        `UPDATE websites SET name = ?, username = ?, password = ?, status = 'active' WHERE id = ?`,
        [rawName, rawUser, encryptedPassword, existing.id]
      );
      siteId = existing.id;
    } else {
      const result = await dbRun(
        `INSERT INTO websites (name, url, username, password, status) VALUES (?, ?, ?, ?, 'active')`,
        [rawName, cleanedUrl, rawUser, encryptedPassword]
      );
      siteId = result.lastID;
    }

    // Trigger the callback if present
    if (wpCallback) {
      wpCallback({ success: true, id: siteId, name: rawName, url: cleanedUrl, username: rawUser });
    }

    // Return HTML success page
    res.send(`
      <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body {
              background: #09090b;
              color: #f4f4f5;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              background: rgba(24, 24, 27, 0.8);
              border: 1px solid rgba(39, 39, 42, 0.8);
              padding: 2.5rem;
              border-radius: 16px;
              text-align: center;
              max-width: 450px;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 10px 10px -5px rgba(0, 0, 0, 0.5);
              backdrop-filter: blur(12px);
            }
            .icon-wrapper {
              width: 56px;
              height: 56px;
              background: rgba(99, 102, 241, 0.1);
              border: 1px solid rgba(99, 102, 241, 0.2);
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 1.5rem auto;
            }
            .icon {
              color: #6366f1;
              font-size: 24px;
              font-weight: bold;
              line-height: 1;
            }
            h1 {
              color: #ffffff;
              margin-top: 0;
              font-size: 1.5rem;
              font-weight: 700;
              letter-spacing: -0.025em;
            }
            p {
              color: #a1a1aa;
              font-size: 0.875rem;
              line-height: 1.6;
              margin-bottom: 2rem;
            }
            .badge {
              display: inline-block;
              padding: 0.25rem 0.75rem;
              background: rgba(16, 185, 129, 0.1);
              border: 1px solid rgba(16, 185, 129, 0.2);
              color: #10b981;
              border-radius: 9999px;
              font-size: 0.75rem;
              font-weight: 600;
              margin-bottom: 1.5rem;
            }
            .footer-text {
              font-size: 0.75rem;
              color: #71717a;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon-wrapper">
              <span class="icon">✓</span>
            </div>
            <div class="badge">Connected Successfully</div>
            <h1>WordPress Site Connected</h1>
            <p>Your site <strong>${rawName}</strong> has been successfully authorized and integrated with StackOrbitAI Bulk Writer Pro.</p>
            <div class="footer-text">You can now close this tab and return to the application window.</div>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    res.status(500).send(`
      <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { background: #09090b; color: #f4f4f5; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #18181b; border: 1px solid #27272a; padding: 2rem; border-radius: 12px; text-align: center; max-width: 400px; }
            h1 { color: #ef4444; margin-top: 0; }
            p { color: #a1a1aa; font-size: 0.875rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Internal Error</h1>
            <p>${error.message}</p>
          </div>
        </body>
      </html>
    `);
  }
});

export function startExpressServer(initialPort: number = 4890, onWordPressCallback?: (siteData: any) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    wpCallback = onWordPressCallback || null;
    if (serverInstance) {
      const address = serverInstance.address();
      if (typeof address === 'object' && address !== null) {
        return resolve(address.port);
      }
      return resolve(initialPort);
    }

    let port = initialPort;
    const tryListen = () => {
      const server = app.listen(port, '127.0.0.1', () => {
        console.log(`[Express Server] Local API server listening on http://127.0.0.1:${port}`);
        serverInstance = server;
        resolve(port);
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[Express Server] Port ${port} is busy, trying ${port + 1}...`);
          port++;
          if (port > 4950) {
            console.error('[Express Server] No available ports found.');
            reject(new Error('No available ports found for Express server.'));
          } else {
            tryListen();
          }
        } else {
          console.error('[Express Server] Server error:', err.message);
          reject(err);
        }
      });
    };

    tryListen();
  });
}

export function stopExpressServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!serverInstance) return resolve();
    serverInstance.close(() => {
      serverInstance = null;
      console.log('[Express Server] Local API server stopped.');
      resolve();
    });
  });
}
