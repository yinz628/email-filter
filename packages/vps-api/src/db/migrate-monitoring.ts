/**
 * Monitoring module database migration script
 * Run with: npx tsx src/db/migrate-monitoring.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
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

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Read and execute monitoring schema
const schemaPath = path.join(__dirname, 'monitoring-schema.sql');
if (!existsSync(schemaPath)) {
  console.error('Monitoring schema file not found:', schemaPath);
  process.exit(1);
}

console.log('Applying monitoring schema...');
const schema = readFileSync(schemaPath, 'utf-8');
db.exec(schema);

console.log('Monitoring schema applied successfully!');
db.close();
