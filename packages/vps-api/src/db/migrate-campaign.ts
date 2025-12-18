/**
 * Campaign Analytics Migration Script
 * Run with: npx tsx src/db/migrate-campaign.ts
 * 
 * This migration adds the campaign analytics tables:
 * - merchants: Store merchant information based on sender domain
 * - campaigns: Store campaign information based on subject
 * - campaign_emails: Store individual email records
 * - recipient_paths: Track recipient journey through campaigns
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

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Check if merchants table exists
const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name IN ('merchants', 'campaigns', 'campaign_emails', 'recipient_paths')
`).all() as { name: string }[];

const existingTables = new Set(tables.map(t => t.name));

// Migration: Create merchants table
if (!existingTables.has('merchants')) {
  console.log('Creating merchants table...');
  db.exec(`
    CREATE TABLE merchants (
      id TEXT PRIMARY KEY,
      domain TEXT UNIQUE NOT NULL,
      display_name TEXT,
      note TEXT,
      total_campaigns INTEGER DEFAULT 0,
      total_emails INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_merchants_domain ON merchants(domain);
  `);
  console.log('merchants table created.');
} else {
  console.log('merchants table already exists.');
}

// Migration: Create campaigns table
if (!existingTables.has('campaigns')) {
  console.log('Creating campaigns table...');
  db.exec(`
    CREATE TABLE campaigns (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      subject_hash TEXT NOT NULL,
      is_valuable INTEGER DEFAULT 0,
      valuable_note TEXT,
      total_emails INTEGER DEFAULT 0,
      unique_recipients INTEGER DEFAULT 0,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      UNIQUE(merchant_id, subject_hash)
    );
    CREATE INDEX idx_campaigns_merchant ON campaigns(merchant_id);
    CREATE INDEX idx_campaigns_subject_hash ON campaigns(subject_hash);
  `);
  console.log('campaigns table created.');
} else {
  console.log('campaigns table already exists.');
}

// Migration: Create campaign_emails table
if (!existingTables.has('campaign_emails')) {
  console.log('Creating campaign_emails table...');
  db.exec(`
    CREATE TABLE campaign_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      recipient TEXT NOT NULL,
      received_at TEXT NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
    CREATE INDEX idx_campaign_emails_campaign ON campaign_emails(campaign_id);
    CREATE INDEX idx_campaign_emails_recipient ON campaign_emails(recipient);
  `);
  console.log('campaign_emails table created.');
} else {
  console.log('campaign_emails table already exists.');
}

// Migration: Create recipient_paths table
if (!existingTables.has('recipient_paths')) {
  console.log('Creating recipient_paths table...');
  db.exec(`
    CREATE TABLE recipient_paths (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      recipient TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      sequence_order INTEGER NOT NULL,
      first_received_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      UNIQUE(merchant_id, recipient, campaign_id)
    );
    CREATE INDEX idx_recipient_paths_merchant_recipient ON recipient_paths(merchant_id, recipient);
    CREATE INDEX idx_recipient_paths_campaign ON recipient_paths(campaign_id);
  `);
  console.log('recipient_paths table created.');
} else {
  console.log('recipient_paths table already exists.');
}

// Migration: Add tag column to campaigns table
try {
  const columns = db.prepare("PRAGMA table_info(campaigns)").all() as Array<{ name: string }>;
  const hasTagColumn = columns.some(col => col.name === 'tag');
  
  if (!hasTagColumn) {
    console.log('Adding tag column to campaigns table...');
    db.exec(`
      ALTER TABLE campaigns ADD COLUMN tag INTEGER DEFAULT 0;
      ALTER TABLE campaigns ADD COLUMN tag_note TEXT;
    `);
    
    // Migrate existing is_valuable data to tag
    // is_valuable = 1 -> tag = 1 (high value)
    db.exec(`
      UPDATE campaigns SET tag = 1 WHERE is_valuable = 1;
    `);
    
    console.log('tag column added and data migrated.');
  } else {
    console.log('tag column already exists.');
  }
} catch (e) {
  console.log('tag column migration skipped (may already exist).');
}

// Migration: Add root campaign columns to campaigns table
try {
  const columns = db.prepare("PRAGMA table_info(campaigns)").all() as Array<{ name: string }>;
  const hasIsRootColumn = columns.some(col => col.name === 'is_root');
  
  if (!hasIsRootColumn) {
    console.log('Adding root campaign columns to campaigns table...');
    db.exec(`
      ALTER TABLE campaigns ADD COLUMN is_root INTEGER DEFAULT 0;
      ALTER TABLE campaigns ADD COLUMN is_root_candidate INTEGER DEFAULT 0;
      ALTER TABLE campaigns ADD COLUMN root_candidate_reason TEXT;
    `);
    console.log('Root campaign columns added.');
  } else {
    console.log('Root campaign columns already exist.');
  }
} catch (e) {
  console.log('Root campaign columns migration skipped (may already exist).');
}

// Migration: Add new user tracking columns to recipient_paths table
try {
  const columns = db.prepare("PRAGMA table_info(recipient_paths)").all() as Array<{ name: string }>;
  const hasIsNewUserColumn = columns.some(col => col.name === 'is_new_user');
  
  if (!hasIsNewUserColumn) {
    console.log('Adding new user tracking columns to recipient_paths table...');
    db.exec(`
      ALTER TABLE recipient_paths ADD COLUMN is_new_user INTEGER DEFAULT 0;
      ALTER TABLE recipient_paths ADD COLUMN first_root_campaign_id TEXT;
    `);
    console.log('New user tracking columns added.');
  } else {
    console.log('New user tracking columns already exist.');
  }
} catch (e) {
  console.log('New user tracking columns migration skipped (may already exist).');
}

// Migration: Add analysis_status column to merchants table
try {
  const columns = db.prepare("PRAGMA table_info(merchants)").all() as Array<{ name: string }>;
  const hasAnalysisStatusColumn = columns.some(col => col.name === 'analysis_status');
  
  if (!hasAnalysisStatusColumn) {
    console.log('Adding analysis_status column to merchants table...');
    db.exec(`
      ALTER TABLE merchants ADD COLUMN analysis_status TEXT DEFAULT 'pending';
    `);
    console.log('analysis_status column added.');
  } else {
    console.log('analysis_status column already exists.');
  }
} catch (e) {
  console.log('analysis_status column migration skipped (may already exist).');
}

// Migration: Create merchant_worker_status table for per-instance merchant status
// Re-check if table exists (in case it was created in a previous partial run)
const workerStatusTableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_worker_status'
`).get();

if (!workerStatusTableExists) {
  console.log('Creating merchant_worker_status table...');
  db.exec(`
    CREATE TABLE merchant_worker_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      worker_name TEXT NOT NULL,
      analysis_status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      UNIQUE(merchant_id, worker_name)
    );
    CREATE INDEX idx_merchant_worker_status_merchant ON merchant_worker_status(merchant_id);
    CREATE INDEX idx_merchant_worker_status_worker ON merchant_worker_status(worker_name);
  `);
  console.log('merchant_worker_status table created.');
} else {
  console.log('merchant_worker_status table already exists.');
}

// Migration: Add display_name column to merchant_worker_status table
try {
  const columns = db.prepare("PRAGMA table_info(merchant_worker_status)").all() as Array<{ name: string }>;
  const hasDisplayNameColumn = columns.some(col => col.name === 'display_name');
  
  if (!hasDisplayNameColumn) {
    console.log('Adding display_name column to merchant_worker_status table...');
    db.exec(`
      ALTER TABLE merchant_worker_status ADD COLUMN display_name TEXT;
    `);
    console.log('display_name column added to merchant_worker_status.');
  } else {
    console.log('display_name column already exists in merchant_worker_status.');
  }
} catch (e) {
  console.log('display_name column migration skipped (may already exist).');
}

console.log('Campaign analytics migration completed!');
db.close();
