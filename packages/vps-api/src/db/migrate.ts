/**
 * Database migration script
 * Run with: npx tsx src/db/migrate.ts
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

// Check if worker_url column exists
const tableInfo = db.prepare('PRAGMA table_info(worker_instances)').all() as any[];
const hasWorkerUrl = tableInfo.some((col: any) => col.name === 'worker_url');

if (!hasWorkerUrl) {
  console.log('Adding worker_url column to worker_instances table...');
  db.exec('ALTER TABLE worker_instances ADD COLUMN worker_url TEXT');
  console.log('Migration completed successfully!');
} else {
  console.log('worker_url column already exists, skipping migration.');
}

db.close();
