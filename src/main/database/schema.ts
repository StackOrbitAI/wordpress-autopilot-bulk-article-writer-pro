export const SCHEMA_TABLES = [
  // Settings table
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`,

  // WordPress websites
  `CREATE TABLE IF NOT EXISTS websites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // AI Providers keys
  `CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL,
    base_url TEXT,
    organization TEXT,
    models TEXT, -- JSON array of models
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // Bulk writing tasks
  `CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    website_id INTEGER NOT NULL,
    language TEXT DEFAULT 'en',
    country TEXT DEFAULT 'us',
    category TEXT,
    keywords TEXT, -- JSON array
    prompt_template TEXT,
    provider_id INTEGER NOT NULL,
    model TEXT NOT NULL,
    image_generation INTEGER DEFAULT 0,
    image_style TEXT DEFAULT 'photorealistic',
    image_size TEXT DEFAULT '1200x628',
    article_length TEXT DEFAULT 'medium',
    publishing_mode TEXT DEFAULT 'draft', -- draft, pending, publish, schedule
    seo_settings TEXT, -- JSON structure
    schedule_settings TEXT, -- JSON structure
    status TEXT DEFAULT 'draft', -- draft, queued, running, paused, completed, failed
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(website_id) REFERENCES websites(id),
    FOREIGN KEY(provider_id) REFERENCES api_keys(id)
  )`,

  // Individual keyword jobs
  `CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    status TEXT DEFAULT 'waiting', -- waiting, running, completed, failed, skipped
    post_id INTEGER,
    post_url TEXT,
    generated_title TEXT,
    generated_content TEXT,
    image_url TEXT,
    error_message TEXT,
    token_usage INTEGER DEFAULT 0,
    estimated_cost REAL DEFAULT 0.0,
    retries INTEGER DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`,

  // Task logs
  `CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    job_id INTEGER,
    level TEXT DEFAULT 'info', -- info, warn, error
    message TEXT NOT NULL,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
  )`
];

export const SCHEMA_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_jobs_task_id ON jobs(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_job_id ON logs(job_id)`
];

export const SEED_DATA = [
  // Default Settings
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'dark')`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('concurrency', '2')`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('api_timeout', '60000')`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('retry_count', '3')`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('language', 'en')`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('license_status', 'unactivated')`
];
