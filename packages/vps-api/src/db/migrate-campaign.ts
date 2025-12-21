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

// Migration: Create analysis_projects table for project-based analysis
const analysisProjectsTableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='analysis_projects'
`).get();

if (!analysisProjectsTableExists) {
  console.log('Creating analysis_projects table...');
  db.exec(`
    CREATE TABLE analysis_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      worker_name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );
    CREATE INDEX idx_analysis_projects_merchant ON analysis_projects(merchant_id);
    CREATE INDEX idx_analysis_projects_worker ON analysis_projects(worker_name);
    CREATE INDEX idx_analysis_projects_status ON analysis_projects(status);
  `);
  console.log('analysis_projects table created.');
} else {
  console.log('analysis_projects table already exists.');
}

// Migration: Add worker_names column to analysis_projects table for multi-worker support
try {
  const columns = db.prepare("PRAGMA table_info(analysis_projects)").all() as Array<{ name: string }>;
  const hasWorkerNamesColumn = columns.some(col => col.name === 'worker_names');
  
  if (!hasWorkerNamesColumn) {
    console.log('Adding worker_names column to analysis_projects table...');
    db.exec(`
      ALTER TABLE analysis_projects ADD COLUMN worker_names TEXT;
    `);
    console.log('worker_names column added to analysis_projects.');
  } else {
    console.log('worker_names column already exists in analysis_projects.');
  }
} catch (e) {
  console.log('worker_names column migration skipped (may already exist).');
}

// Migration: Add last_analysis_time column to analysis_projects table
try {
  const columns = db.prepare("PRAGMA table_info(analysis_projects)").all() as Array<{ name: string }>;
  const hasLastAnalysisTimeColumn = columns.some(col => col.name === 'last_analysis_time');
  
  if (!hasLastAnalysisTimeColumn) {
    console.log('Adding last_analysis_time column to analysis_projects table...');
    db.exec(`
      ALTER TABLE analysis_projects ADD COLUMN last_analysis_time TEXT;
    `);
    console.log('last_analysis_time column added to analysis_projects.');
  } else {
    console.log('last_analysis_time column already exists in analysis_projects.');
  }
} catch (e) {
  console.log('last_analysis_time column migration skipped (may already exist).');
}

// Migration: Create project_root_campaigns table for project-level Root campaign settings
const projectRootCampaignsTableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='project_root_campaigns'
`).get();

if (!projectRootCampaignsTableExists) {
  console.log('Creating project_root_campaigns table...');
  db.exec(`
    CREATE TABLE project_root_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      is_confirmed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      UNIQUE(project_id, campaign_id)
    );
    CREATE INDEX idx_project_root_campaigns_project ON project_root_campaigns(project_id);
  `);
  console.log('project_root_campaigns table created.');
} else {
  console.log('project_root_campaigns table already exists.');
}

// Migration: Create project_new_users table for project-level new user tracking
const projectNewUsersTableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='project_new_users'
`).get();

if (!projectNewUsersTableExists) {
  console.log('Creating project_new_users table...');
  db.exec(`
    CREATE TABLE project_new_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      recipient TEXT NOT NULL,
      first_root_campaign_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
      FOREIGN KEY (first_root_campaign_id) REFERENCES campaigns(id),
      UNIQUE(project_id, recipient)
    );
    CREATE INDEX idx_project_new_users_project ON project_new_users(project_id);
    CREATE INDEX idx_project_new_users_recipient ON project_new_users(recipient);
  `);
  console.log('project_new_users table created.');
} else {
  console.log('project_new_users table already exists.');
}

// Migration: Create project_user_events table for project-level user event stream
const projectUserEventsTableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='project_user_events'
`).get();

if (!projectUserEventsTableExists) {
  console.log('Creating project_user_events table...');
  db.exec(`
    CREATE TABLE project_user_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      recipient TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      received_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      UNIQUE(project_id, recipient, campaign_id)
    );
    CREATE INDEX idx_project_user_events_project ON project_user_events(project_id);
    CREATE INDEX idx_project_user_events_recipient ON project_user_events(project_id, recipient);
    CREATE INDEX idx_project_user_events_seq ON project_user_events(project_id, recipient, seq);
  `);
  console.log('project_user_events table created.');
} else {
  console.log('project_user_events table already exists.');
}

// Migration: Create project_path_edges table for project-level path edge tracking
const projectPathEdgesTableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='project_path_edges'
`).get();

if (!projectPathEdgesTableExists) {
  console.log('Creating project_path_edges table...');
  db.exec(`
    CREATE TABLE project_path_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      from_campaign_id TEXT NOT NULL,
      to_campaign_id TEXT NOT NULL,
      user_count INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
      FOREIGN KEY (from_campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (to_campaign_id) REFERENCES campaigns(id),
      UNIQUE(project_id, from_campaign_id, to_campaign_id)
    );
    CREATE INDEX idx_project_path_edges_project ON project_path_edges(project_id);
    CREATE INDEX idx_project_path_edges_from ON project_path_edges(project_id, from_campaign_id);
  `);
  console.log('project_path_edges table created.');
} else {
  console.log('project_path_edges table already exists.');
}

// Migration: Create users table for user authentication
const usersTableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='users'
`).get();

if (!usersTableExists) {
  console.log('Creating users table...');
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX idx_users_username ON users(username);
  `);
  console.log('users table created.');
} else {
  console.log('users table already exists.');
}

// Migration: Create user_settings table for storing user preferences
const userSettingsTableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='user_settings'
`).get();

if (!userSettingsTableExists) {
  console.log('Creating user_settings table...');
  db.exec(`
    CREATE TABLE user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, key)
    );
    CREATE INDEX idx_user_settings_user ON user_settings(user_id);
  `);
  console.log('user_settings table created.');
} else {
  console.log('user_settings table already exists.');
}

// Migration: Create token_blacklist table for invalidated JWT tokens
const tokenBlacklistTableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='token_blacklist'
`).get();

if (!tokenBlacklistTableExists) {
  console.log('Creating token_blacklist table...');
  db.exec(`
    CREATE TABLE token_blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_token_blacklist_hash ON token_blacklist(token_hash);
    CREATE INDEX idx_token_blacklist_expires ON token_blacklist(expires_at);
  `);
  console.log('token_blacklist table created.');
} else {
  console.log('token_blacklist table already exists.');
}

console.log('Campaign analytics migration completed!');
db.close();
