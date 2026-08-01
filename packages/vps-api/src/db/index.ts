import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { runMigrations } from './run-migrations.js';
import { applyOptimizations, verifyIndexes } from './optimizer.js';
import { getDynamicPatternCache } from '../services/dynamic-pattern-cache.instance.js';
import { getPreparedStatementManager } from './prepared-statements.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: Database.Database | null = null;

/**
 * Initialize the SQLite database
 * Creates the database file and tables if they don't exist
 * Automatically runs migrations to ensure schema is up to date
 * Applies performance optimizations (WAL mode, pragmas, indexes)
 */
export function initializeDatabase(dbPath?: string): Database.Database {
  const path = dbPath || config.dbPath;
  
  // Ensure the directory exists
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  // Create or open the database
  db = new Database(path);
  
  // Apply performance optimizations (WAL mode, pragmas)
  // Requirements: 1.1, 1.2, 1.3
  applyOptimizations(db);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run migrations BEFORE schema.sql. Migrations use ADD COLUMN / IF NOT EXISTS
  // and are idempotent, so running them first is safe. This ordering is required
  // because schema.sql defines indexes that reference columns added by migrations
  // (e.g. CREATE INDEX ... COALESCE(forward_to, '')). On a legacy database that
  // lacks those columns, executing schema.sql first would throw
  // "no such column" before the migration that adds the column runs.
  // CREATE TABLE IF NOT EXISTS in schema.sql is a no-op for existing tables, so
  // there is no conflict with tables left untouched by migrations.
  runMigrations(db);

  // Read and execute schema (creates tables/indexes/constraints for any that
  // migrations did not add; safe because all statements are IF NOT EXISTS).
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  
  // Verify and create missing indexes
  // Requirements: 6.1, 6.2, 6.3
  verifyIndexes(db);
  
  // Load dynamic rule patterns into memory cache
  // Requirements: 4.1 - Load all dynamic rule patterns at startup
  const patternCache = getDynamicPatternCache();
  patternCache.loadFromDatabase(db);
  
  // Initialize prepared statement manager
  // Requirements: 3.1 - Use prepared statements that are reused across requests
  const stmtManager = getPreparedStatementManager();
  stmtManager.initialize(db);
  stmtManager.prepareCommonStatements();
  
  return db;
}

/**
 * Get the database instance
 * Throws if database is not initialized
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export { Database };
