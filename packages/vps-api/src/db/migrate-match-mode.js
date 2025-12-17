/**
 * Migration script to add match_mode column to monitoring_rules table
 * Run: DATABASE_PATH=/var/lib/email-filter/filter.db node packages/vps-api/dist/db/migrate-match-mode.js
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/filter.db');

console.log('Opening database:', dbPath);
const db = new Database(dbPath);

try {
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info(monitoring_rules)").all();
  const hasMatchMode = tableInfo.some(col => col.name === 'match_mode');
  
  if (hasMatchMode) {
    console.log('Column match_mode already exists, skipping migration');
  } else {
    console.log('Adding match_mode column to monitoring_rules table...');
    
    // Add the column with default value 'contains'
    db.exec(`
      ALTER TABLE monitoring_rules ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'contains';
    `);
    
    console.log('Migration completed successfully!');
    
    // Verify
    const count = db.prepare("SELECT COUNT(*) as count FROM monitoring_rules").get();
    console.log(`Updated ${count.count} existing rules to use 'contains' match mode`);
  }
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}
