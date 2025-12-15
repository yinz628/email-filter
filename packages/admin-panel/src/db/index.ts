/**
 * Database module for Admin Panel
 * Provides D1 database initialization and utilities
 */

/**
 * Initialize the database schema
 * Creates all required tables if they don't exist
 */
export async function initializeDatabase(db: D1Database): Promise<void> {
  const statements = [
    // Worker instances table
    `CREATE TABLE IF NOT EXISTS worker_instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      api_url TEXT NOT NULL,
      api_key TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Admin configuration table
    `CREATE TABLE IF NOT EXISTS admin_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_worker_instances_status ON worker_instances(status)`,
    `CREATE INDEX IF NOT EXISTS idx_worker_instances_name ON worker_instances(name)`,
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

export * from './instance-repository.js';
