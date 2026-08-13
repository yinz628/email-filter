/**
 * Standalone Database Migration Script (CLI entry point).
 *
 * This script resolves the database path and delegates ALL migration logic to
 * run-migrations.ts — the single source of truth shared with the app's startup
 * path (db/index.ts → runMigrations). Keeping one migration list prevents the
 * two paths from drifting out of sync (which previously caused missing columns
 * in production when only one list was updated).
 *
 * Run with:  npx tsx src/db/migrate.ts
 *         or: node dist/db/migrate.js  (inside Docker)
 *
 * All migrations are idempotent — safe to run multiple times.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { runMigrations, type MigrationResult } from './run-migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// Database Connection — resolve the DB path
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

// ============================================
// Run migrations (delegated to run-migrations.ts)
// ============================================

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const { applied, skipped, errors, results } = runMigrations(db, true);

for (const result of results) {
  const statusIcon = result.status === 'applied' ? '✓' : result.status === 'skipped' ? '○' : '✗';
  console.log(`[${statusIcon}] ${result.name}: ${result.message}`);
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
  db.close();
  process.exit(1);
} else {
  console.log('✓ All migrations completed successfully!');
}

db.close();
