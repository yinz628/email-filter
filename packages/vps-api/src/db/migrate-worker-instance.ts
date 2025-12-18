/**
 * Worker Instance Data Separation Migration Script
 * Adds worker_name and worker_scope fields to support per-instance data filtering
 * 
 * Run with: npx tsx src/db/migrate-worker-instance.ts
 * 
 * Requirements: 7.1, 7.2, 7.3
 */

import Database from 'better-sqlite3';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Try multiple possible database paths
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

console.log('Database path:', dbPath);

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

try {
  // Migration 1: Add worker_name column to system_logs table (Requirements: 7.1)
  console.log('\n=== Migration 1: system_logs table ===');
  const logsTableInfo = db.prepare('PRAGMA table_info(system_logs)').all() as { name: string }[];
  const logsHasWorkerName = logsTableInfo.some(col => col.name === 'worker_name');

  if (logsHasWorkerName) {
    console.log('worker_name column already exists in system_logs table');
  } else {
    console.log('Adding worker_name column to system_logs table...');
    db.exec("ALTER TABLE system_logs ADD COLUMN worker_name TEXT DEFAULT 'global'");
    console.log('worker_name column added to system_logs');
    
    console.log('Creating index on worker_name...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_logs_worker_name ON system_logs(worker_name)');
    console.log('Index created on system_logs.worker_name');
  }

  // Migration 2: Add worker_name column to campaign_emails table (Requirements: 7.2)
  console.log('\n=== Migration 2: campaign_emails table ===');
  const campaignEmailsTableInfo = db.prepare('PRAGMA table_info(campaign_emails)').all() as { name: string }[];
  const campaignEmailsHasWorkerName = campaignEmailsTableInfo.some(col => col.name === 'worker_name');

  if (campaignEmailsHasWorkerName) {
    console.log('worker_name column already exists in campaign_emails table');
  } else {
    console.log('Adding worker_name column to campaign_emails table...');
    db.exec("ALTER TABLE campaign_emails ADD COLUMN worker_name TEXT DEFAULT 'global'");
    console.log('worker_name column added to campaign_emails');
    
    console.log('Creating index on worker_name...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_campaign_emails_worker ON campaign_emails(worker_name)');
    console.log('Index created on campaign_emails.worker_name');
  }

  // Migration 3: Add worker_scope column to monitoring_rules table (Requirements: 7.3)
  console.log('\n=== Migration 3: monitoring_rules table ===');
  const monitoringRulesTableInfo = db.prepare('PRAGMA table_info(monitoring_rules)').all() as { name: string }[];
  const monitoringRulesHasWorkerScope = monitoringRulesTableInfo.some(col => col.name === 'worker_scope');

  if (monitoringRulesHasWorkerScope) {
    console.log('worker_scope column already exists in monitoring_rules table');
  } else {
    console.log('Adding worker_scope column to monitoring_rules table...');
    db.exec("ALTER TABLE monitoring_rules ADD COLUMN worker_scope TEXT DEFAULT 'global'");
    console.log('worker_scope column added to monitoring_rules');
  }

  // Migration 4: Add worker_scope column to ratio_monitors table (Requirements: 7.3)
  console.log('\n=== Migration 4: ratio_monitors table ===');
  const ratioMonitorsTableInfo = db.prepare('PRAGMA table_info(ratio_monitors)').all() as { name: string }[];
  const ratioMonitorsHasWorkerScope = ratioMonitorsTableInfo.some(col => col.name === 'worker_scope');

  if (ratioMonitorsHasWorkerScope) {
    console.log('worker_scope column already exists in ratio_monitors table');
  } else {
    console.log('Adding worker_scope column to ratio_monitors table...');
    db.exec("ALTER TABLE ratio_monitors ADD COLUMN worker_scope TEXT DEFAULT 'global'");
    console.log('worker_scope column added to ratio_monitors');
  }

  console.log('\n=== All worker instance migrations completed successfully! ===');

} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}
