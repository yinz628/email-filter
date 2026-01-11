/**
 * Prepared Statement Manager for VPS API
 * Manages pre-compiled SQL statements for better performance
 * 
 * Requirements: 3.1 - Use prepared statements that are reused across requests
 */

import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

/**
 * Pre-defined SQL statements for common operations
 * These are compiled once and reused across requests
 */
export const SQL_STATEMENTS = {
  // Dynamic rule tracking statements
  INSERT_SUBJECT_TRACKER: `
    INSERT INTO email_subject_tracker (subject_hash, subject, received_at)
    VALUES (?, ?, ?)
  `,
  COUNT_SUBJECTS: `
    SELECT COUNT(*) as count FROM email_subject_tracker
    WHERE subject_hash = ? AND received_at >= ?
  `,
  GET_TIMESTAMPS: `
    SELECT received_at FROM email_subject_tracker
    WHERE subject_hash = ? AND received_at >= ?
    ORDER BY received_at ASC
    LIMIT ?
  `,
  CLEANUP_SUBJECT_TRACKER: `
    DELETE FROM email_subject_tracker
    WHERE subject_hash = ? AND received_at < ?
  `,
  
  // Dynamic rule lookup statements
  FIND_DYNAMIC_RULE_EXACT: `
    SELECT * FROM filter_rules 
    WHERE category = 'dynamic' AND match_type = 'subject' AND pattern = ?
    LIMIT 1
  `,
  FIND_ALL_DYNAMIC_RULES: `
    SELECT * FROM filter_rules 
    WHERE category = 'dynamic' AND match_type = 'subject' AND match_mode = 'contains'
  `,
  
  // Dynamic config statements
  GET_DYNAMIC_CONFIG: `SELECT key, value FROM dynamic_config`,
  UPSERT_DYNAMIC_CONFIG: `
    INSERT INTO dynamic_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `,
} as const;

/**
 * Statement key type for type safety
 */
export type StatementKey = keyof typeof SQL_STATEMENTS;

/**
 * Prepared Statement Manager class
 * Caches and reuses compiled SQL statements
 */
export class PreparedStatementManager {
  private statements: Map<string, Statement> = new Map();
  private db: Database.Database | null = null;

  /**
   * Initialize the manager with a database connection
   * @param db - The database connection
   */
  initialize(db: Database.Database): void {
    this.db = db;
    this.statements.clear();
  }

  /**
   * Get or create a prepared statement
   * @param key - Unique key for the statement
   * @param sql - SQL string (used only if statement doesn't exist)
   * @returns The prepared statement
   */
  getStatement(key: string, sql: string): Statement {
    if (!this.db) {
      throw new Error('PreparedStatementManager not initialized. Call initialize() first.');
    }

    let stmt = this.statements.get(key);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.statements.set(key, stmt);
    }
    return stmt;
  }

  /**
   * Get a pre-defined statement by key
   * @param key - The statement key from SQL_STATEMENTS
   * @returns The prepared statement
   */
  get(key: StatementKey): Statement {
    return this.getStatement(key, SQL_STATEMENTS[key]);
  }

  /**
   * Pre-compile all common statements
   * Call this during initialization for better startup performance
   */
  prepareCommonStatements(): void {
    if (!this.db) {
      throw new Error('PreparedStatementManager not initialized. Call initialize() first.');
    }

    for (const [key, sql] of Object.entries(SQL_STATEMENTS)) {
      if (!this.statements.has(key)) {
        this.statements.set(key, this.db.prepare(sql));
      }
    }
  }

  /**
   * Check if a statement is cached
   * @param key - The statement key
   * @returns true if the statement is cached
   */
  has(key: string): boolean {
    return this.statements.has(key);
  }

  /**
   * Get the number of cached statements
   */
  get size(): number {
    return this.statements.size;
  }

  /**
   * Clear all cached statements
   * Call this when the database connection changes
   */
  cleanup(): void {
    this.statements.clear();
    this.db = null;
  }

  /**
   * Check if the manager is initialized
   */
  isInitialized(): boolean {
    return this.db !== null;
  }
}

// Global singleton instance
let instance: PreparedStatementManager | null = null;

/**
 * Get the global PreparedStatementManager instance
 */
export function getPreparedStatementManager(): PreparedStatementManager {
  if (!instance) {
    instance = new PreparedStatementManager();
  }
  return instance;
}

/**
 * Reset the global instance (for testing)
 */
export function resetPreparedStatementManager(): void {
  if (instance) {
    instance.cleanup();
  }
  instance = null;
}
