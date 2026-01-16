/**
 * Unified Database Migration Script
 * 
 * This script consolidates all database migrations into a single file.
 * All migrations are idempotent - they can be run multiple times safely.
 * 
 * Run with: npx tsx src/db/migrate.ts
 * 
 * Requirements: 3.1, 3.2, 3.4, 6.3
 */

import Database from 'better-sqlite3';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// Database Connection
// ============================================

const possiblePaths = [
  process.env.DB_PATH,
  process.env.DATABASE_PATH,
  '/var/lib/email-filter/filter.db',
  path.join(__dirname, '../data/filter.db'),
  path.join(__dirname, '../../data/filter.db'),
  path.join(process.cwd(), 'data', 'filter.db'),
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

console.log('='.repeat(60));
console.log('Database Migration Script');
console.log('='.repeat(60));
console.log(`Database path: ${dbPath}`);
console.log('');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// ============================================
// Helper Functions
// ============================================

/**
 * Check if a table exists in the database
 */
export function tableExists(db: Database.Database, tableName: string): boolean {
  const result = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName);
  return !!result;
}

/**
 * Check if a column exists in a table
 */
export function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  if (!tableExists(db, tableName)) return false;
  const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  return tableInfo.some((col) => col.name === columnName);
}

/**
 * Check if an index exists
 */
export function indexExists(db: Database.Database, indexName: string): boolean {
  const result = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name=?"
  ).get(indexName);
  return !!result;
}

// ============================================
// Migration Interface
// ============================================

interface MigrationResult {
  name: string;
  status: 'applied' | 'skipped' | 'error';
  message: string;
}

// ============================================
// Migration Functions
// ============================================

/**
 * Migration 1: Add worker_url column to worker_instances
 */
function migrateWorkerUrl(): MigrationResult {
  const name = 'worker_instances.worker_url';
  
  if (!tableExists(db, 'worker_instances')) {
    return { name, status: 'skipped', message: 'Table worker_instances does not exist' };
  }
  
  if (columnExists(db, 'worker_instances', 'worker_url')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec('ALTER TABLE worker_instances ADD COLUMN worker_url TEXT');
  return { name, status: 'applied', message: 'Column added successfully' };
}

/**
 * Migration 2: Add tags column to filter_rules
 */
function migrateFilterRulesTags(): MigrationResult {
  const name = 'filter_rules.tags';
  
  if (!tableExists(db, 'filter_rules')) {
    return { name, status: 'skipped', message: 'Table filter_rules does not exist' };
  }
  
  if (columnExists(db, 'filter_rules', 'tags')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec('ALTER TABLE filter_rules ADD COLUMN tags TEXT');
  return { name, status: 'applied', message: 'Column added successfully' };
}

/**
 * Migration 3: Add worker_name column to campaign_emails
 */
function migrateCampaignEmailsWorkerName(): MigrationResult {
  const name = 'campaign_emails.worker_name';
  
  if (!tableExists(db, 'campaign_emails')) {
    return { name, status: 'skipped', message: 'Table campaign_emails does not exist' };
  }
  
  if (columnExists(db, 'campaign_emails', 'worker_name')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec("ALTER TABLE campaign_emails ADD COLUMN worker_name TEXT DEFAULT 'global'");
  if (!indexExists(db, 'idx_campaign_emails_worker')) {
    db.exec('CREATE INDEX idx_campaign_emails_worker ON campaign_emails(worker_name)');
  }
  return { name, status: 'applied', message: 'Column and index added successfully' };
}

/**
 * Migration 4: Add worker_name column to system_logs
 */
function migrateSystemLogsWorkerName(): MigrationResult {
  const name = 'system_logs.worker_name';
  
  if (!tableExists(db, 'system_logs')) {
    return { name, status: 'skipped', message: 'Table system_logs does not exist' };
  }
  
  if (columnExists(db, 'system_logs', 'worker_name')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec("ALTER TABLE system_logs ADD COLUMN worker_name TEXT DEFAULT 'global'");
  if (!indexExists(db, 'idx_logs_worker_name')) {
    db.exec('CREATE INDEX idx_logs_worker_name ON system_logs(worker_name)');
  }
  return { name, status: 'applied', message: 'Column and index added successfully' };
}

/**
 * Migration 5: Add tags column to monitoring_rules
 */
function migrateMonitoringRulesTags(): MigrationResult {
  const name = 'monitoring_rules.tags';
  
  if (!tableExists(db, 'monitoring_rules')) {
    return { name, status: 'skipped', message: 'Table monitoring_rules does not exist' };
  }
  
  if (columnExists(db, 'monitoring_rules', 'tags')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec("ALTER TABLE monitoring_rules ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

/**
 * Migration 6: Add worker_scope column to monitoring_rules
 */
function migrateMonitoringRulesWorkerScope(): MigrationResult {
  const name = 'monitoring_rules.worker_scope';
  
  if (!tableExists(db, 'monitoring_rules')) {
    return { name, status: 'skipped', message: 'Table monitoring_rules does not exist' };
  }
  
  if (columnExists(db, 'monitoring_rules', 'worker_scope')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec("ALTER TABLE monitoring_rules ADD COLUMN worker_scope TEXT NOT NULL DEFAULT 'global'");
  if (!indexExists(db, 'idx_monitoring_rules_worker_scope')) {
    db.exec('CREATE INDEX idx_monitoring_rules_worker_scope ON monitoring_rules(worker_scope)');
  }
  return { name, status: 'applied', message: 'Column and index added successfully' };
}

/**
 * Migration 7: Add match_mode column to monitoring_rules
 */
function migrateMonitoringRulesMatchMode(): MigrationResult {
  const name = 'monitoring_rules.match_mode';
  
  if (!tableExists(db, 'monitoring_rules')) {
    return { name, status: 'skipped', message: 'Table monitoring_rules does not exist' };
  }
  
  if (columnExists(db, 'monitoring_rules', 'match_mode')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec("ALTER TABLE monitoring_rules ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'contains'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

/**
 * Migration 8: Add worker_scope column to alerts
 */
function migrateAlertsWorkerScope(): MigrationResult {
  const name = 'alerts.worker_scope';
  
  if (!tableExists(db, 'alerts')) {
    return { name, status: 'skipped', message: 'Table alerts does not exist' };
  }
  
  if (columnExists(db, 'alerts', 'worker_scope')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec("ALTER TABLE alerts ADD COLUMN worker_scope TEXT NOT NULL DEFAULT 'global'");
  if (!indexExists(db, 'idx_alerts_worker_scope')) {
    db.exec('CREATE INDEX idx_alerts_worker_scope ON alerts(worker_scope)');
  }
  return { name, status: 'applied', message: 'Column and index added successfully' };
}

/**
 * Migration 9: Add worker_scope column to ratio_monitors
 */
function migrateRatioMonitorsWorkerScope(): MigrationResult {
  const name = 'ratio_monitors.worker_scope';
  
  if (!tableExists(db, 'ratio_monitors')) {
    return { name, status: 'skipped', message: 'Table ratio_monitors does not exist' };
  }
  
  if (columnExists(db, 'ratio_monitors', 'worker_scope')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec("ALTER TABLE ratio_monitors ADD COLUMN worker_scope TEXT NOT NULL DEFAULT 'global'");
  if (!indexExists(db, 'idx_ratio_monitors_worker_scope')) {
    db.exec('CREATE INDEX idx_ratio_monitors_worker_scope ON ratio_monitors(worker_scope)');
  }
  return { name, status: 'applied', message: 'Column and index added successfully' };
}

/**
 * Migration 10: Add steps column to ratio_monitors
 */
function migrateRatioMonitorsSteps(): MigrationResult {
  const name = 'ratio_monitors.steps';
  
  if (!tableExists(db, 'ratio_monitors')) {
    return { name, status: 'skipped', message: 'Table ratio_monitors does not exist' };
  }
  
  if (columnExists(db, 'ratio_monitors', 'steps')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec("ALTER TABLE ratio_monitors ADD COLUMN steps TEXT NOT NULL DEFAULT '[]'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

/**
 * Migration 11: Add steps_data column to ratio_states
 */
function migrateRatioStatesStepsData(): MigrationResult {
  const name = 'ratio_states.steps_data';
  
  if (!tableExists(db, 'ratio_states')) {
    return { name, status: 'skipped', message: 'Table ratio_states does not exist' };
  }
  
  if (columnExists(db, 'ratio_states', 'steps_data')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec("ALTER TABLE ratio_states ADD COLUMN steps_data TEXT NOT NULL DEFAULT '[]'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

/**
 * Migration 12: Add tag columns to campaigns table
 */
function migrateCampaignsTag(): MigrationResult {
  const name = 'campaigns.tag';
  
  if (!tableExists(db, 'campaigns')) {
    return { name, status: 'skipped', message: 'Table campaigns does not exist' };
  }
  
  if (columnExists(db, 'campaigns', 'tag')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec('ALTER TABLE campaigns ADD COLUMN tag INTEGER DEFAULT 0');
  db.exec('ALTER TABLE campaigns ADD COLUMN tag_note TEXT');
  // Migrate existing is_valuable data to tag
  db.exec('UPDATE campaigns SET tag = 1 WHERE is_valuable = 1');
  return { name, status: 'applied', message: 'Columns added and data migrated' };
}

/**
 * Migration 13: Add root campaign columns to campaigns table
 */
function migrateCampaignsRootColumns(): MigrationResult {
  const name = 'campaigns.is_root';
  
  if (!tableExists(db, 'campaigns')) {
    return { name, status: 'skipped', message: 'Table campaigns does not exist' };
  }
  
  if (columnExists(db, 'campaigns', 'is_root')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec('ALTER TABLE campaigns ADD COLUMN is_root INTEGER DEFAULT 0');
  db.exec('ALTER TABLE campaigns ADD COLUMN is_root_candidate INTEGER DEFAULT 0');
  db.exec('ALTER TABLE campaigns ADD COLUMN root_candidate_reason TEXT');
  return { name, status: 'applied', message: 'Root campaign columns added' };
}

/**
 * Migration 14: Add new user tracking columns to recipient_paths
 */
function migrateRecipientPathsNewUser(): MigrationResult {
  const name = 'recipient_paths.is_new_user';
  
  if (!tableExists(db, 'recipient_paths')) {
    return { name, status: 'skipped', message: 'Table recipient_paths does not exist' };
  }
  
  if (columnExists(db, 'recipient_paths', 'is_new_user')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec('ALTER TABLE recipient_paths ADD COLUMN is_new_user INTEGER DEFAULT 0');
  db.exec('ALTER TABLE recipient_paths ADD COLUMN first_root_campaign_id TEXT');
  return { name, status: 'applied', message: 'New user tracking columns added' };
}

/**
 * Migration 15: Add analysis_status column to merchants
 */
function migrateMerchantsAnalysisStatus(): MigrationResult {
  const name = 'merchants.analysis_status';
  
  if (!tableExists(db, 'merchants')) {
    return { name, status: 'skipped', message: 'Table merchants does not exist' };
  }
  
  if (columnExists(db, 'merchants', 'analysis_status')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec("ALTER TABLE merchants ADD COLUMN analysis_status TEXT DEFAULT 'pending'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

/**
 * Migration 16: Add display_name column to merchant_worker_status
 */
function migrateMerchantWorkerStatusDisplayName(): MigrationResult {
  const name = 'merchant_worker_status.display_name';
  
  if (!tableExists(db, 'merchant_worker_status')) {
    return { name, status: 'skipped', message: 'Table merchant_worker_status does not exist' };
  }
  
  if (columnExists(db, 'merchant_worker_status', 'display_name')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec('ALTER TABLE merchant_worker_status ADD COLUMN display_name TEXT');
  return { name, status: 'applied', message: 'Column added successfully' };
}

/**
 * Migration 17: Add worker_names column to analysis_projects
 */
function migrateAnalysisProjectsWorkerNames(): MigrationResult {
  const name = 'analysis_projects.worker_names';
  
  if (!tableExists(db, 'analysis_projects')) {
    return { name, status: 'skipped', message: 'Table analysis_projects does not exist' };
  }
  
  if (columnExists(db, 'analysis_projects', 'worker_names')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec('ALTER TABLE analysis_projects ADD COLUMN worker_names TEXT');
  return { name, status: 'applied', message: 'Column added successfully' };
}

/**
 * Migration 18: Add last_analysis_time column to analysis_projects
 */
function migrateAnalysisProjectsLastAnalysisTime(): MigrationResult {
  const name = 'analysis_projects.last_analysis_time';
  
  if (!tableExists(db, 'analysis_projects')) {
    return { name, status: 'skipped', message: 'Table analysis_projects does not exist' };
  }
  
  if (columnExists(db, 'analysis_projects', 'last_analysis_time')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  
  db.exec('ALTER TABLE analysis_projects ADD COLUMN last_analysis_time TEXT');
  return { name, status: 'applied', message: 'Column added successfully' };
}

/**
 * Migration 19: Create ratio_alerts table
 */
function migrateCreateRatioAlerts(): MigrationResult {
  const name = 'ratio_alerts table';
  
  if (tableExists(db, 'ratio_alerts')) {
    return { name, status: 'skipped', message: 'Table already exists' };
  }
  
  db.exec(`
    CREATE TABLE ratio_alerts (
      id TEXT PRIMARY KEY,
      monitor_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      previous_state TEXT NOT NULL,
      current_state TEXT NOT NULL,
      first_count INTEGER NOT NULL,
      second_count INTEGER NOT NULL,
      current_ratio REAL NOT NULL,
      message TEXT NOT NULL,
      sent_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (monitor_id) REFERENCES ratio_monitors(id) ON DELETE CASCADE
    )
  `);
  db.exec('CREATE INDEX idx_ratio_alerts_monitor_id ON ratio_alerts(monitor_id)');
  db.exec('CREATE INDEX idx_ratio_alerts_created_at ON ratio_alerts(created_at)');
  return { name, status: 'applied', message: 'Table created successfully' };
}

/**
 * Migration 20: Add time index to project_user_events for seq calculation optimization
 * 
 * This index optimizes queries that calculate seq numbers based on received_at time,
 * such as: COUNT(*) WHERE project_id = ? AND recipient = ? AND received_at <= ?
 * 
 * Requirements: 1.1 - Event sequence numbers should be calculated based on received_at time
 */
function migrateProjectUserEventsTimeIndex(): MigrationResult {
  const name = 'idx_project_user_events_time';
  
  if (!tableExists(db, 'project_user_events')) {
    return { name, status: 'skipped', message: 'Table project_user_events does not exist' };
  }
  
  if (indexExists(db, 'idx_project_user_events_time')) {
    return { name, status: 'skipped', message: 'Index already exists' };
  }
  
  db.exec('CREATE INDEX idx_project_user_events_time ON project_user_events(project_id, recipient, received_at)');
  return { name, status: 'applied', message: 'Time index added for seq calculation optimization' };
}

/**
 * Migration 21: Create users table for JWT authentication
 * 
 * This migration creates the users table if it doesn't exist.
 * Required for JWT-based authentication system.
 * 
 * Requirements: user-auth-and-settings 1.1-1.5
 */
function migrateCreateUsersTable(): MigrationResult {
  const name = 'users table';
  
  if (tableExists(db, 'users')) {
    return { name, status: 'skipped', message: 'Table already exists' };
  }
  
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec('CREATE UNIQUE INDEX idx_users_username ON users(username)');
  return { name, status: 'applied', message: 'Table created successfully' };
}

/**
 * Migration 22: Create user_settings table
 * 
 * This migration creates the user_settings table if it doesn't exist.
 * Required for storing user-specific settings.
 * 
 * Requirements: user-auth-and-settings 2.1-2.5
 */
function migrateCreateUserSettingsTable(): MigrationResult {
  const name = 'user_settings table';
  
  if (tableExists(db, 'user_settings')) {
    return { name, status: 'skipped', message: 'Table already exists' };
  }
  
  db.exec(`
    CREATE TABLE user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, key)
    )
  `);
  db.exec('CREATE INDEX idx_user_settings_user ON user_settings(user_id)');
  return { name, status: 'applied', message: 'Table created successfully' };
}

/**
 * Migration 23: Create subject_stats table for email subject display
 * 
 * This migration creates the subject_stats table if it doesn't exist.
 * Required for tracking and displaying email subject statistics.
 * 
 * Requirements: email-subject-display 1.1-1.4
 */
function migrateCreateSubjectStatsTable(): MigrationResult {
  const name = 'subject_stats table';
  
  if (tableExists(db, 'subject_stats')) {
    return { name, status: 'skipped', message: 'Table already exists' };
  }
  
  db.exec(`
    CREATE TABLE subject_stats (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      subject_hash TEXT NOT NULL,
      merchant_domain TEXT NOT NULL,
      worker_name TEXT NOT NULL,
      email_count INTEGER DEFAULT 1,
      is_focused INTEGER DEFAULT 0,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(subject_hash, merchant_domain, worker_name)
    )
  `);
  db.exec('CREATE INDEX idx_subject_stats_hash ON subject_stats(subject_hash)');
  db.exec('CREATE INDEX idx_subject_stats_merchant ON subject_stats(merchant_domain)');
  db.exec('CREATE INDEX idx_subject_stats_worker ON subject_stats(worker_name)');
  db.exec('CREATE INDEX idx_subject_stats_focused ON subject_stats(is_focused)');
  db.exec('CREATE INDEX idx_subject_stats_count ON subject_stats(email_count)');
  db.exec('CREATE INDEX idx_subject_stats_last_seen ON subject_stats(last_seen_at)');
  return { name, status: 'applied', message: 'Table and indexes created successfully' };
}

// ============================================
// Run All Migrations
// ============================================

const migrations = [
  migrateWorkerUrl,
  migrateFilterRulesTags,
  migrateCampaignEmailsWorkerName,
  migrateSystemLogsWorkerName,
  migrateMonitoringRulesTags,
  migrateMonitoringRulesWorkerScope,
  migrateMonitoringRulesMatchMode,
  migrateAlertsWorkerScope,
  migrateRatioMonitorsWorkerScope,
  migrateRatioMonitorsSteps,
  migrateRatioStatesStepsData,
  migrateCampaignsTag,
  migrateCampaignsRootColumns,
  migrateRecipientPathsNewUser,
  migrateMerchantsAnalysisStatus,
  migrateMerchantWorkerStatusDisplayName,
  migrateAnalysisProjectsWorkerNames,
  migrateAnalysisProjectsLastAnalysisTime,
  migrateCreateRatioAlerts,
  migrateProjectUserEventsTimeIndex,
  migrateCreateUsersTable,
  migrateCreateUserSettingsTable,
  migrateCreateSubjectStatsTable,
];

console.log(`Running ${migrations.length} migrations...\n`);

let applied = 0;
let skipped = 0;
let errors = 0;

for (const migration of migrations) {
  try {
    const result = migration();
    const statusIcon = result.status === 'applied' ? '✓' : result.status === 'skipped' ? '○' : '✗';
    console.log(`[${statusIcon}] ${result.name}: ${result.message}`);
    
    if (result.status === 'applied') applied++;
    else if (result.status === 'skipped') skipped++;
    else errors++;
  } catch (error) {
    console.error(`[✗] Migration failed:`, error);
    errors++;
  }
}

console.log('');
console.log('='.repeat(60));
console.log('Migration Summary');
console.log('='.repeat(60));
console.log(`Applied: ${applied}`);
console.log(`Skipped: ${skipped}`);
console.log(`Errors:  ${errors}`);
console.log('');

if (errors > 0) {
  console.log('⚠️  Some migrations failed. Please check the errors above.');
  process.exit(1);
} else {
  console.log('✓ All migrations completed successfully!');
}

db.close();
