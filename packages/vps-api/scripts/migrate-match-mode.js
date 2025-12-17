#!/usr/bin/env node
/**
 * Migration script to add match_mode column to monitoring_rules table
 * Run: node packages/vps-api/scripts/migrate-match-mode.js
 */

import Database from 'better-sqlite3';

// Database path - adjust if needed
const dbPath = process.env.DB_PATH || '/var/lib/email-filter/filter.db';

console.log(`Opening database: ${dbPath}`);

try {
  const db = new Database(dbPath);
  
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info(monitoring_rules)").all();
  const hasMatchMode = tableInfo.some(col => col.name === 'match_mode');
  
  if (hasMatchMode) {
    console.log('Column match_mode already exists. No migration needed.');
  } else {
    console.log('Adding match_mode column...');
    db.exec("ALTER TABLE monitoring_rules ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'contains'");
    console.log('Migration completed successfully!');
  }
  
  // Verify
  const updated = db.prepare("PRAGMA table_info(monitoring_rules)").all();
  console.log('\nCurrent monitoring_rules columns:');
  updated.forEach(col => console.log(`  - ${col.name}: ${col.type}`));
  
  db.close();
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
}
