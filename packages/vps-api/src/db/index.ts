import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { runMigrations } from './run-migrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: Database.Database | null = null;

/**
 * Initialize the SQLite database
 * Creates the database file and tables if they don't exist
 * Automatically runs migrations to ensure schema is up to date
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
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Read and execute schema
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  
  // Run migrations to ensure schema is up to date
  runMigrations(db);
  
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
