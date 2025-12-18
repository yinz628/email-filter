/**
 * Migration: Add worker_scope to monitoring tables
 * 
 * This migration adds worker_scope column to:
 * - monitoring_rules table
 * - alerts table
 * - ratio_monitors table
 * 
 * Requirements: 5.1, 5.5, 6.1
 */

import type { Database } from 'better-sqlite3';

/**
 * Check if a column exists in a table
 */
function columnExists(db: Database, tableName: string, columnName: string): boolean {
  const result = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return result.some(col => col.name === columnName);
}

/**
 * Run the migration to add worker_scope columns
 */
export function migrateMonitoringWorkerScope(db: Database): void {
  console.log('Running monitoring worker_scope migration...');

  // Add worker_scope to monitoring_rules
  if (!columnExists(db, 'monitoring_rules', 'worker_scope')) {
    console.log('Adding worker_scope column to monitoring_rules...');
    db.exec(`ALTER TABLE monitoring_rules ADD COLUMN worker_scope TEXT NOT NULL DEFAULT 'global'`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_monitoring_rules_worker_scope ON monitoring_rules(worker_scope)`);
    console.log('Added worker_scope to monitoring_rules');
  } else {
    console.log('worker_scope column already exists in monitoring_rules');
  }

  // Add worker_scope to alerts
  if (!columnExists(db, 'alerts', 'worker_scope')) {
    console.log('Adding worker_scope column to alerts...');
    db.exec(`ALTER TABLE alerts ADD COLUMN worker_scope TEXT NOT NULL DEFAULT 'global'`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_worker_scope ON alerts(worker_scope)`);
    console.log('Added worker_scope to alerts');
  } else {
    console.log('worker_scope column already exists in alerts');
  }

  // Add worker_scope to ratio_monitors
  if (!columnExists(db, 'ratio_monitors', 'worker_scope')) {
    console.log('Adding worker_scope column to ratio_monitors...');
    db.exec(`ALTER TABLE ratio_monitors ADD COLUMN worker_scope TEXT NOT NULL DEFAULT 'global'`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ratio_monitors_worker_scope ON ratio_monitors(worker_scope)`);
    console.log('Added worker_scope to ratio_monitors');
  } else {
    console.log('worker_scope column already exists in ratio_monitors');
  }

  console.log('Monitoring worker_scope migration completed');
}
