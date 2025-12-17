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

console.log('Campaign analytics migration completed!');
db.close();
