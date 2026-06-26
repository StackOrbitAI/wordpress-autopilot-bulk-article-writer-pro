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
