/**
 * Database migration script
 * Run with: npx tsx src/db/migrate.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Try multiple possible database paths
const possiblePaths = [
  process.env.DB_PATH,
  '/var/lib/email-filter/filter.db',
  path.join(__dirname, '../data/filter.db'),
  path.join(__dirname, '../../data/filter.db'),
].filter(Boolean) as string[];

let dbPath: string | null = null;
for (const p of possiblePaths) {
  if (existsSync(p)) {
    dbPath = p;
    break;
  }
}

if (!dbPath) {
  console.error('Database file not found. Tried paths:', possiblePaths);
  process.exit(1);
}

console.log('Database path:', dbPath);

const db = new Database(dbPath);

// Helper function to check if a table exists
function tableExists(tableName: string): boolean {
  const result = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName);
  return !!result;
}

// Helper function to check if a column exists in a table
function columnExists(tableName: string, columnName: string): boolean {
  if (!tableExists(tableName)) return false;
  const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
  return tableInfo.some((col: any) => col.name === columnName);
}

// Migration 1: Add worker_url column to worker_instances
if (tableExists('worker_instances')) {
  if (!columnExists('worker_instances', 'worker_url')) {
    console.log('Adding worker_url column to worker_instances table...');
    db.exec('ALTER TABLE worker_instances ADD COLUMN worker_url TEXT');
    console.log('worker_url column added.');
  } else {
    console.log('worker_url column already exists.');
  }
} else {
  console.log('worker_instances table does not exist, skipping migration 1.');
}

// Migration 2: Add tags column to filter_rules
if (tableExists('filter_rules')) {
  if (!columnExists('filter_rules', 'tags')) {
    console.log('Adding tags column to filter_rules table...');
    db.exec('ALTER TABLE filter_rules ADD COLUMN tags TEXT');
    console.log('tags column added.');
  } else {
    console.log('tags column already exists.');
  }
} else {
  console.log('filter_rules table does not exist, skipping migration 2.');
}

// Migration 3: Add worker_name column to campaign_emails
if (tableExists('campaign_emails')) {
  if (!columnExists('campaign_emails', 'worker_name')) {
    console.log('Adding worker_name column to campaign_emails table...');
    db.exec("ALTER TABLE campaign_emails ADD COLUMN worker_name TEXT DEFAULT 'global'");
    db.exec('CREATE INDEX IF NOT EXISTS idx_campaign_emails_worker ON campaign_emails(worker_name)');
    console.log('worker_name column added to campaign_emails.');
  } else {
    console.log('worker_name column already exists in campaign_emails.');
  }
} else {
  console.log('campaign_emails table does not exist, skipping migration 3.');
}

console.log('All migrations completed!');
db.close();
