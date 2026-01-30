/**
 * Database Migration Runner
 * 
 * This module provides functions to run database migrations.
 * Can be called during application startup to ensure schema is up to date.
 * 
 * All migrations are idempotent - they can be run multiple times safely.
 */

import type Database from 'better-sqlite3';

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

type MigrationFn = (db: Database.Database) => MigrationResult;

// ============================================
// Migration Functions
// ============================================

function migrateWorkerUrl(db: Database.Database): MigrationResult {
  const name = 'worker_instances.worker_url';
  if (!tableExists(db, 'worker_instances')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'worker_instances', 'worker_url')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec('ALTER TABLE worker_instances ADD COLUMN worker_url TEXT');
  return { name, status: 'applied', message: 'Column added successfully' };
}

function migrateFilterRulesTags(db: Database.Database): MigrationResult {
  const name = 'filter_rules.tags';
  if (!tableExists(db, 'filter_rules')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'filter_rules', 'tags')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec("ALTER TABLE filter_rules ADD COLUMN tags TEXT DEFAULT '[]'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

function migrateCampaignEmailsWorkerName(db: Database.Database): MigrationResult {
  const name = 'campaign_emails.worker_name';
  if (!tableExists(db, 'campaign_emails')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'campaign_emails', 'worker_name')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec("ALTER TABLE campaign_emails ADD COLUMN worker_name TEXT NOT NULL DEFAULT 'default'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

function migrateSystemLogsWorkerName(db: Database.Database): MigrationResult {
  const name = 'system_logs.worker_name';
  if (!tableExists(db, 'system_logs')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'system_logs', 'worker_name')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec("ALTER TABLE system_logs ADD COLUMN worker_name TEXT DEFAULT 'default'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

function migrateMonitoringRulesTags(db: Database.Database): MigrationResult {
  const name = 'monitoring_rules.tags';
  if (!tableExists(db, 'monitoring_rules')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'monitoring_rules', 'tags')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec("ALTER TABLE monitoring_rules ADD COLUMN tags TEXT DEFAULT '[]'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

function migrateMonitoringRulesWorkerScope(db: Database.Database): MigrationResult {
  const name = 'monitoring_rules.worker_scope';
  if (!tableExists(db, 'monitoring_rules')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'monitoring_rules', 'worker_scope')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec("ALTER TABLE monitoring_rules ADD COLUMN worker_scope TEXT DEFAULT 'all'");
  db.exec("ALTER TABLE monitoring_rules ADD COLUMN worker_names TEXT DEFAULT '[]'");
  return { name, status: 'applied', message: 'Columns added successfully' };
}

function migrateMonitoringRulesMatchMode(db: Database.Database): MigrationResult {
  const name = 'monitoring_rules.match_mode';
  if (!tableExists(db, 'monitoring_rules')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'monitoring_rules', 'match_mode')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec("ALTER TABLE monitoring_rules ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'contains'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

function migrateAlertsWorkerScope(db: Database.Database): MigrationResult {
  const name = 'alerts.worker_name';
  if (!tableExists(db, 'alerts')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'alerts', 'worker_name')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec("ALTER TABLE alerts ADD COLUMN worker_name TEXT DEFAULT 'all'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

function migrateRatioMonitorsWorkerScope(db: Database.Database): MigrationResult {
  const name = 'ratio_monitors.worker_scope';
  if (!tableExists(db, 'ratio_monitors')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'ratio_monitors', 'worker_scope')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec("ALTER TABLE ratio_monitors ADD COLUMN worker_scope TEXT DEFAULT 'all'");
  db.exec("ALTER TABLE ratio_monitors ADD COLUMN worker_names TEXT DEFAULT '[]'");
  return { name, status: 'applied', message: 'Columns added successfully' };
}

function migrateRatioMonitorsSteps(db: Database.Database): MigrationResult {
  const name = 'ratio_monitors.steps';
  if (!tableExists(db, 'ratio_monitors')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'ratio_monitors', 'steps')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec("ALTER TABLE ratio_monitors ADD COLUMN steps TEXT NOT NULL DEFAULT '[]'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

function migrateRatioStatesStepsData(db: Database.Database): MigrationResult {
  const name = 'ratio_states.steps_data';
  if (!tableExists(db, 'ratio_states')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'ratio_states', 'steps_data')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec("ALTER TABLE ratio_states ADD COLUMN steps_data TEXT NOT NULL DEFAULT '[]'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

function migrateCampaignsTag(db: Database.Database): MigrationResult {
  const name = 'campaigns.tag';
  if (!tableExists(db, 'campaigns')) {
    return { name, status: 'skipped', message: 'Table campaigns does not exist' };
  }
  if (columnExists(db, 'campaigns', 'tag')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec('ALTER TABLE campaigns ADD COLUMN tag INTEGER DEFAULT 0');
  db.exec('ALTER TABLE campaigns ADD COLUMN tag_note TEXT');
  db.exec('UPDATE campaigns SET tag = 1 WHERE is_valuable = 1');
  return { name, status: 'applied', message: 'Columns added and data migrated' };
}

function migrateCampaignsRootColumns(db: Database.Database): MigrationResult {
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

function migrateRecipientPathsNewUser(db: Database.Database): MigrationResult {
  const name = 'recipient_paths.is_new_user';
  if (!tableExists(db, 'recipient_paths')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'recipient_paths', 'is_new_user')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec('ALTER TABLE recipient_paths ADD COLUMN is_new_user INTEGER DEFAULT 0');
  return { name, status: 'applied', message: 'Column added successfully' };
}

function migrateMerchantsAnalysisStatus(db: Database.Database): MigrationResult {
  const name = 'merchants.analysis_status';
  if (!tableExists(db, 'merchants')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'merchants', 'analysis_status')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec("ALTER TABLE merchants ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'pending'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

function migrateMerchantWorkerStatusDisplayName(db: Database.Database): MigrationResult {
  const name = 'merchant_worker_status';
  if (tableExists(db, 'merchant_worker_status')) {
    return { name, status: 'skipped', message: 'Table already exists' };
  }
  db.exec(`
    CREATE TABLE merchant_worker_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      worker_name TEXT NOT NULL,
      analysis_status TEXT NOT NULL DEFAULT 'pending',
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(merchant_id, worker_name),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_merchant_worker_status_merchant ON merchant_worker_status(merchant_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_merchant_worker_status_worker ON merchant_worker_status(worker_name)');
  return { name, status: 'applied', message: 'Table created successfully' };
}

function migrateAnalysisProjectsWorkerNames(db: Database.Database): MigrationResult {
  const name = 'analysis_projects.worker_names';
  if (!tableExists(db, 'analysis_projects')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'analysis_projects', 'worker_names')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec("ALTER TABLE analysis_projects ADD COLUMN worker_names TEXT DEFAULT '[]'");
  return { name, status: 'applied', message: 'Column added successfully' };
}

function migrateAnalysisProjectsLastAnalysisTime(db: Database.Database): MigrationResult {
  const name = 'analysis_projects.last_analysis_time';
  if (!tableExists(db, 'analysis_projects')) {
    return { name, status: 'skipped', message: 'Table does not exist' };
  }
  if (columnExists(db, 'analysis_projects', 'last_analysis_time')) {
    return { name, status: 'skipped', message: 'Column already exists' };
  }
  db.exec('ALTER TABLE analysis_projects ADD COLUMN last_analysis_time TEXT');
  return { name, status: 'applied', message: 'Column added successfully' };
}

function migrateCreateRatioAlerts(db: Database.Database): MigrationResult {
  const name = 'ratio_alerts';
  if (tableExists(db, 'ratio_alerts')) {
    return { name, status: 'skipped', message: 'Table already exists' };
  }
  db.exec(`
    CREATE TABLE ratio_alerts (
      id TEXT PRIMARY KEY,
      monitor_id TEXT NOT NULL,
      monitor_name TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      current_ratio REAL NOT NULL,
      threshold REAL NOT NULL,
      direction TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      acknowledged INTEGER NOT NULL DEFAULT 0,
      acknowledged_at TEXT,
      FOREIGN KEY (monitor_id) REFERENCES ratio_monitors(id) ON DELETE CASCADE
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_ratio_alerts_monitor ON ratio_alerts(monitor_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ratio_alerts_created ON ratio_alerts(created_at)');
  return { name, status: 'applied', message: 'Table created successfully' };
}

/**
 * Migration 20: Create users table for JWT authentication
 */
function migrateCreateUsersTable(db: Database.Database): MigrationResult {
  const name = 'users';
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
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  return { name, status: 'applied', message: 'Table created successfully' };
}

/**
 * Migration 21: Create user_settings table
 */
function migrateCreateUserSettingsTable(db: Database.Database): MigrationResult {
  const name = 'user_settings';
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
  db.exec('CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id)');
  return { name, status: 'applied', message: 'Table created successfully' };
}

/**
 * Migration 22: Create subject_stats table for email subject display
 */
function migrateCreateSubjectStatsTable(db: Database.Database): MigrationResult {
  const name = 'subject_stats';
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
  db.exec('CREATE INDEX IF NOT EXISTS idx_subject_stats_hash ON subject_stats(subject_hash)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_subject_stats_merchant ON subject_stats(merchant_domain)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_subject_stats_worker ON subject_stats(worker_name)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_subject_stats_focused ON subject_stats(is_focused)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_subject_stats_count ON subject_stats(email_count)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_subject_stats_last_seen ON subject_stats(last_seen_at)');
  return { name, status: 'applied', message: 'Table and indexes created successfully' };
}

/**
 * Migration 23: Add is_ignored column to subject_stats table
 */
function migrateSubjectStatsAddIgnored(db: Database.Database): MigrationResult {
  const name = 'subject_stats_add_ignored';
  
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info(subject_stats)").all() as Array<{ name: string }>;
  const hasIgnoredColumn = tableInfo.some(col => col.name === 'is_ignored');
  
  if (hasIgnoredColumn) {
    return { name, status: 'skipped', message: 'Column is_ignored already exists' };
  }
  
  // Add is_ignored column with default value 0
  db.exec('ALTER TABLE subject_stats ADD COLUMN is_ignored INTEGER DEFAULT 0');
  
  // Create index for is_ignored column
  db.exec('CREATE INDEX IF NOT EXISTS idx_subject_stats_ignored ON subject_stats(is_ignored)');
  
  return { name, status: 'applied', message: 'Column is_ignored added successfully' };
}

// ============================================
// Migration Runner
// ============================================

const migrations: MigrationFn[] = [
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
  migrateCreateUsersTable,
  migrateCreateUserSettingsTable,
  migrateCreateSubjectStatsTable,
  migrateSubjectStatsAddIgnored,
];

/**
 * Run all database migrations
 * This function is idempotent and can be called multiple times safely.
 * 
 * @param db - Database instance
 * @param silent - If true, suppress console output
 * @returns Migration summary
 */
export function runMigrations(db: Database.Database, silent = false): { applied: number; skipped: number; errors: number } {
  if (!silent) {
    console.log(`[Migrations] Running ${migrations.length} migrations...`);
  }

  let applied = 0;
  let skipped = 0;
  let errors = 0;

  for (const migration of migrations) {
    try {
      const result = migration(db);
      
      if (!silent && result.status === 'applied') {
        console.log(`[Migrations] ✓ ${result.name}: ${result.message}`);
      }
      
      if (result.status === 'applied') applied++;
      else if (result.status === 'skipped') skipped++;
      else errors++;
    } catch (error) {
      if (!silent) {
        console.error(`[Migrations] ✗ Migration failed:`, error);
      }
      errors++;
    }
  }

  if (!silent) {
    if (applied > 0) {
      console.log(`[Migrations] Applied ${applied} migrations, skipped ${skipped}`);
    } else {
      console.log(`[Migrations] Database schema is up to date`);
    }
  }

  return { applied, skipped, errors };
}
