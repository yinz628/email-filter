/**
 * Database module for Worker API
 * Provides D1 database initialization and utilities
 */

/**
 * Initialize the database schema
 * Creates all required tables if they don't exist
 */
export async function initializeDatabase(db: D1Database): Promise<void> {
  const statements = [
    // Filter rules table
    `CREATE TABLE IF NOT EXISTS filter_rules (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL CHECK (category IN ('whitelist', 'blacklist', 'dynamic')),
      match_type TEXT NOT NULL CHECK (match_type IN ('sender_name', 'subject', 'sender_email')),
      match_mode TEXT NOT NULL CHECK (match_mode IN ('regex', 'contains')),
      pattern TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_hit_at DATETIME
    )`,

    // Process logs table
    `CREATE TABLE IF NOT EXISTS process_logs (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      sender TEXT NOT NULL,
      sender_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL CHECK (action IN ('passed', 'deleted', 'error')),
      matched_rule_id TEXT,
      matched_rule_category TEXT,
      error_message TEXT
    )`,

    // Rule statistics table
    `CREATE TABLE IF NOT EXISTS rule_stats (
      rule_id TEXT PRIMARY KEY,
      total_processed INTEGER DEFAULT 0,
      deleted_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,


    // Watch items table
    `CREATE TABLE IF NOT EXISTS watch_items (
      id TEXT PRIMARY KEY,
      subject_pattern TEXT NOT NULL,
      match_mode TEXT NOT NULL CHECK (match_mode IN ('regex', 'contains')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Watch hits table
    `CREATE TABLE IF NOT EXISTS watch_hits (
      id TEXT PRIMARY KEY,
      watch_id TEXT NOT NULL,
      recipient TEXT NOT NULL,
      hit_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Dynamic configuration table
    `CREATE TABLE IF NOT EXISTS dynamic_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,

    // Email subject tracker table
    `CREATE TABLE IF NOT EXISTS email_subject_tracker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_hash TEXT NOT NULL,
      subject TEXT NOT NULL,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Forward rules table
    `CREATE TABLE IF NOT EXISTS forward_rules (
      id TEXT PRIMARY KEY,
      recipient_pattern TEXT NOT NULL,
      match_mode TEXT NOT NULL CHECK (match_mode IN ('exact', 'contains', 'regex')),
      forward_to TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_filter_rules_category ON filter_rules(category)`,
    `CREATE INDEX IF NOT EXISTS idx_filter_rules_enabled ON filter_rules(enabled)`,
    `CREATE INDEX IF NOT EXISTS idx_process_logs_processed_at ON process_logs(processed_at)`,
    `CREATE INDEX IF NOT EXISTS idx_process_logs_action ON process_logs(action)`,
    `CREATE INDEX IF NOT EXISTS idx_process_logs_matched_rule_id ON process_logs(matched_rule_id)`,
    `CREATE INDEX IF NOT EXISTS idx_watch_hits_watch_id ON watch_hits(watch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_watch_hits_hit_at ON watch_hits(hit_at)`,
    `CREATE INDEX IF NOT EXISTS idx_subject_tracker_hash ON email_subject_tracker(subject_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_subject_tracker_time ON email_subject_tracker(received_at)`,
    `CREATE INDEX IF NOT EXISTS idx_forward_rules_enabled ON forward_rules(enabled)`,
  ];

  for (const sql of statements) {
    await db.prepare(sql).run();
  }
}

/**
 * Generate a unique ID for database records
 */
export function generateId(): string {
  return crypto.randomUUID();
}

export * from './rule-repository.js';
export * from './process-log-repository.js';
export * from './stats-repository.js';
export * from './watch-repository.js';
export * from './forward-repository.js';
