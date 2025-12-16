/**
 * Database migration script
 * Run with: npx tsx src/db/migrate.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/email-filter.db');

console.log('Database path:', dbPath);

const db = new Database(dbPath);

// Check if worker_url column exists
const tableInfo = db.prepare("PRAGMA table_info(worker_instances)").all() as any[];
const hasWorkerUrl = tableInfo.some((col: any) => col.name === 'worker_url');

if (!hasWorkerUrl) {
  console.log('Adding worker_url column to worker_instances table...');
  db.exec('ALTER TABLE worker_instances ADD COLUMN worker_url TEXT');
  console.log('Migration completed successfully!');
} else {
  console.log('worker_url column already exists, skipping migration.');
}

db.close();
