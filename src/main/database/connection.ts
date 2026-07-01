import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { SCHEMA_TABLES, SCHEMA_INDEXES, SEED_DATA } from './schema';

let db: sqlite3.Database | null = null;

// Get database path securely based on app state
export function getDatabasePath(): string {
  let userDataPath: string;
  try {
    userDataPath = app.getPath('userData');
  } catch (error) {
    // Fallback for development/testing outside Electron package context
    userDataPath = path.resolve(__dirname, '../../');
  }

  const dbDir = path.join(userDataPath, 'database');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return path.join(dbDir, 'stackorbit_writer.db');
}

// Initialize database connection and run schema migrations
export function initDatabase(): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const dbPath = getDatabasePath();
    
    // Attempt automatic database migration from old folders if it exists and new database doesn't
    if (!fs.existsSync(dbPath)) {
      try {
        let userDataPath: string;
        try {
          userDataPath = app.getPath('userData');
        } catch (e) {
          userDataPath = path.resolve(__dirname, '../../');
        }
        
        const parentDir = path.dirname(userDataPath);
        
        // Define candidates in order of priority (most recent first)
        const legacyFolders = [
          'wordpress-autopilot-bulk-article-writer-pro',
          'stackorbitai-bulk-writer-pro'
        ];
        
        let migrated = false;
        
        for (const folder of legacyFolders) {
          const oldDbPath = path.join(parentDir, folder, 'database', 'stackorbit_writer.db');
          const oldKeyPath = path.join(parentDir, folder, '.security.key');
          const newKeyPath = path.join(userDataPath, '.security.key');
          
          if (fs.existsSync(oldDbPath)) {
            console.log(`[Database] Found legacy data in: ${folder}. Starting migration...`);
            
            // Migrate security key first (needed for database decryption)
            if (fs.existsSync(oldKeyPath)) {
              console.log(`[Security] Migrating legacy security key from: ${oldKeyPath} to: ${newKeyPath}`);
              fs.copyFileSync(oldKeyPath, newKeyPath);
              console.log('[Security] Legacy security key migrated successfully!');
            }
            
            console.log(`[Database] Migrating legacy database from: ${oldDbPath} to: ${dbPath}`);
            const newDbDir = path.dirname(dbPath);
            if (!fs.existsSync(newDbDir)) {
              fs.mkdirSync(newDbDir, { recursive: true });
            }
            fs.copyFileSync(oldDbPath, dbPath);
            console.log('[Database] Legacy database migration completed successfully!');
            migrated = true;
            break;
          }
        }
        
        if (!migrated) {
          console.log('[Database] No legacy database found for migration. Starting fresh.');
        }
      } catch (migrateErr: any) {
        console.error('[Database] Automatic legacy database migration failed:', migrateErr.message);
      }
    }

    console.log(`[Database] Initializing SQLite database at: ${dbPath}`);

    // Set verbose mode to help with debugging
    const sqlite = sqlite3.verbose();

    db = new sqlite.Database(dbPath, async (err) => {
      if (err) {
        console.error('[Database] Failed to connect to database:', err);
        return reject(err);
      }

      try {
        await runMigrations();
        console.log('[Database] Migrations and seed data verified successfully');
        resolve(db!);
      } catch (migrationErr) {
        console.error('[Database] Migration failure:', migrationErr);
        reject(migrationErr);
      }
    });
  });
}

// Helper to execute migration steps sequentially
async function runMigrations(): Promise<void> {
  // Create tables
  for (const tableSql of SCHEMA_TABLES) {
    await dbRun(tableSql);
  }

  // Create indexes
  for (const indexSql of SCHEMA_INDEXES) {
    await dbRun(indexSql);
  }

  // Insert seed data
  for (const seedSql of SEED_DATA) {
    await dbRun(seedSql);
  }

  // Custom migration for retries column
  try {
    await dbRun(`ALTER TABLE jobs ADD COLUMN retries INTEGER DEFAULT 0`);
    console.log('[Database] Migration: Added retries column to jobs table successfully.');
  } catch (err: any) {
    // SQLite returns "duplicate column name: retries" if it already exists
    if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
      console.warn('[Database] Migration warning (adding retries column):', err.message);
    }
  }

  // Custom migration for image_model column in tasks table
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN image_model TEXT DEFAULT 'gpt-image-2'`);
    console.log('[Database] Migration: Added image_model column to tasks table successfully.');
  } catch (err: any) {
    if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
      console.warn('[Database] Migration warning (adding image_model column):', err.message);
    }
  }

  // Custom migration for publish_target column in tasks table
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN publish_target TEXT DEFAULT 'wordpress'`);
    console.log('[Database] Migration: Added publish_target column to tasks table successfully.');
  } catch (err: any) {
    if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
      console.warn('[Database] Migration warning (adding publish_target column):', err.message);
    }
  }

  // Custom migration for google_doc_url column in jobs table
  try {
    await dbRun(`ALTER TABLE jobs ADD COLUMN google_doc_url TEXT`);
    console.log('[Database] Migration: Added google_doc_url column to jobs table successfully.');
  } catch (err: any) {
    if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
      console.warn('[Database] Migration warning (adding google_doc_url column):', err.message);
    }
  }

  // Custom migration for google_sheet_url column in tasks table
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN google_sheet_url TEXT`);
    console.log('[Database] Migration: Added google_sheet_url column to tasks table successfully.');
  } catch (err: any) {
    if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
      console.warn('[Database] Migration warning (adding google_sheet_url column):', err.message);
    }
  }

  // Custom migration for google_folder_id column in tasks table
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN google_folder_id TEXT`);
    console.log('[Database] Migration: Added google_folder_id column to tasks table successfully.');
  } catch (err: any) {
    if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
      console.warn('[Database] Migration warning (adding google_folder_id column):', err.message);
    }
  }

  // Custom migration for insert_inline_images column in tasks table
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN insert_inline_images INTEGER DEFAULT 0`);
    console.log('[Database] Migration: Added insert_inline_images column to tasks table successfully.');
  } catch (err: any) {
    if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
      console.warn('[Database] Migration warning (adding insert_inline_images column):', err.message);
    }
  }

  // Custom migration for google_sharing_permissions column in tasks table
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN google_sharing_permissions TEXT DEFAULT 'private'`);
    console.log('[Database] Migration: Added google_sharing_permissions column to tasks table successfully.');
  } catch (err: any) {
    if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
      console.warn('[Database] Migration warning (adding google_sharing_permissions column):', err.message);
    }
  }
}

// Close database connection
export function closeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    db.close((err) => {
      if (err) return reject(err);
      db = null;
      resolve();
    });
  });
}

// Database helper: execution
export function dbRun(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// Database helper: fetch single row
export function dbGet<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row as T | undefined);
    });
  });
}

// Database helper: fetch multiple rows
export function dbAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows as T[]);
    });
  });
}

// Database helper: execute script block
export function dbExec(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.exec(sql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}
