/**
 * Property-based tests for Worker Instance Data Separation Schema
 * 
 * **Feature: worker-instance-data-separation, Property 7: Schema Field Presence**
 * **Validates: Requirements 7.1, 7.2, 7.3**
 * 
 * For any newly created log, campaign email, monitoring rule, or ratio monitor,
 * the worker_name or worker_scope field should be present and non-null.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Arbitraries for generating valid test data
const workerNameArb = fc.oneof(
  fc.constant('global'),
  fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && !s.includes("'"))
);

const logCategoryArb = fc.constantFrom('email_forward', 'email_drop', 'admin_action', 'system');
const logLevelArb = fc.constantFrom('info', 'warn', 'error');
const messageArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0 && !s.includes("'"));

const merchantArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && !s.includes("'"));
const nameArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0 && !s.includes("'"));
const subjectPatternArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0 && !s.includes("'"));
const intervalArb = fc.integer({ min: 1, max: 10080 });
const thresholdArb = fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true });

/**
 * Check if a column exists in a table
 */
function columnExists(db: SqlJsDatabase, tableName: string, columnName: string): boolean {
  const result = db.exec(`PRAGMA table_info(${tableName})`);
  if (result.length === 0) return false;
  return result[0].values.some(row => row[1] === columnName);
}

/**
 * Apply the worker instance migration to the database
 * Only adds columns if they don't already exist (schema may already include them)
 */
function applyWorkerInstanceMigration(db: SqlJsDatabase): void {
  // Migration 1: Add worker_name to system_logs
  if (!columnExists(db, 'system_logs', 'worker_name')) {
    db.run("ALTER TABLE system_logs ADD COLUMN worker_name TEXT DEFAULT 'global'");
    db.run('CREATE INDEX IF NOT EXISTS idx_logs_worker_name ON system_logs(worker_name)');
  }

  // Migration 2: Add worker_name to campaign_emails (may already exist in schema)
  if (!columnExists(db, 'campaign_emails', 'worker_name')) {
    db.run("ALTER TABLE campaign_emails ADD COLUMN worker_name TEXT DEFAULT 'global'");
    db.run('CREATE INDEX IF NOT EXISTS idx_campaign_emails_worker ON campaign_emails(worker_name)');
  }

  // Migration 3: Add worker_scope to monitoring_rules (may already exist in schema)
  if (!columnExists(db, 'monitoring_rules', 'worker_scope')) {
    db.run("ALTER TABLE monitoring_rules ADD COLUMN worker_scope TEXT DEFAULT 'global'");
  }

  // Migration 4: Add worker_scope to ratio_monitors (may already exist in schema)
  if (!columnExists(db, 'ratio_monitors', 'worker_scope')) {
    db.run("ALTER TABLE ratio_monitors ADD COLUMN worker_scope TEXT DEFAULT 'global'");
  }
}

describe('Worker Instance Schema Migration - Property 7: Schema Field Presence', () => {
  let SQL: any;
  let db: SqlJsDatabase;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load consolidated schema (includes all monitoring tables)
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // Apply worker instance migration
    applyWorkerInstanceMigration(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: worker-instance-data-separation, Property 7: Schema Field Presence**
   * **Validates: Requirements 7.1**
   * 
   * For any newly created system log, the worker_name field should be present and non-null.
   */
  describe('system_logs table - worker_name field', () => {
    it('should have worker_name field present and defaulting to global for new logs', () => {
      fc.assert(
        fc.property(
          logCategoryArb,
          logLevelArb,
          messageArb,
          (category, level, message) => {
            const now = new Date().toISOString();
            
            // Insert a log without specifying worker_name (should use default)
            db.run(
              `INSERT INTO system_logs (category, level, message, created_at) VALUES (?, ?, ?, ?)`,
              [category, level, message, now]
            );

            // Query the inserted log
            const result = db.exec('SELECT worker_name FROM system_logs ORDER BY id DESC LIMIT 1');
            
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].values.length).toBeGreaterThan(0);
            
            const workerName = result[0].values[0][0];
            expect(workerName).not.toBeNull();
            expect(workerName).toBe('global');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve explicit worker_name when specified', () => {
      fc.assert(
        fc.property(
          logCategoryArb,
          logLevelArb,
          messageArb,
          workerNameArb,
          (category, level, message, workerName) => {
            const now = new Date().toISOString();
            
            // Insert a log with explicit worker_name
            db.run(
              `INSERT INTO system_logs (category, level, message, worker_name, created_at) VALUES (?, ?, ?, ?, ?)`,
              [category, level, message, workerName, now]
            );

            // Query the inserted log
            const result = db.exec('SELECT worker_name FROM system_logs ORDER BY id DESC LIMIT 1');
            
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].values.length).toBeGreaterThan(0);
            
            const retrievedWorkerName = result[0].values[0][0];
            expect(retrievedWorkerName).not.toBeNull();
            expect(retrievedWorkerName).toBe(workerName);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: worker-instance-data-separation, Property 7: Schema Field Presence**
   * **Validates: Requirements 7.2**
   * 
   * For any newly created campaign email, the worker_name field should be present and non-null.
   */
  describe('campaign_emails table - worker_name field', () => {
    it('should have worker_name field present and defaulting to global for new campaign emails', () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          (recipient) => {
            const now = new Date().toISOString();
            
            // First create a merchant and campaign (required for foreign key)
            // Use unique IDs for domain to avoid UNIQUE constraint violations
            const merchantId = uuidv4();
            const campaignId = uuidv4();
            const uniqueDomain = `test-${merchantId}.com`;
            
            db.run(
              `INSERT INTO merchants (id, domain, created_at, updated_at) VALUES (?, ?, ?, ?)`,
              [merchantId, uniqueDomain, now, now]
            );
            
            db.run(
              `INSERT INTO campaigns (id, merchant_id, subject, subject_hash, first_seen_at, last_seen_at, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [campaignId, merchantId, 'Test Subject', `hash-${campaignId}`, now, now, now, now]
            );
            
            // Insert a campaign email without specifying worker_name
            db.run(
              `INSERT INTO campaign_emails (campaign_id, recipient, received_at) VALUES (?, ?, ?)`,
              [campaignId, recipient, now]
            );

            // Query the inserted campaign email
            const result = db.exec('SELECT worker_name FROM campaign_emails ORDER BY id DESC LIMIT 1');
            
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].values.length).toBeGreaterThan(0);
            
            const workerName = result[0].values[0][0];
            expect(workerName).not.toBeNull();
            expect(workerName).toBe('global');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should preserve explicit worker_name when specified for campaign emails', () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          workerNameArb,
          (recipient, workerName) => {
            const now = new Date().toISOString();
            
            // First create a merchant and campaign
            // Use unique IDs for domain to avoid UNIQUE constraint violations
            const merchantId = uuidv4();
            const campaignId = uuidv4();
            const uniqueDomain = `test2-${merchantId}.com`;
            
            db.run(
              `INSERT INTO merchants (id, domain, created_at, updated_at) VALUES (?, ?, ?, ?)`,
              [merchantId, uniqueDomain, now, now]
            );
            
            db.run(
              `INSERT INTO campaigns (id, merchant_id, subject, subject_hash, first_seen_at, last_seen_at, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [campaignId, merchantId, 'Test Subject 2', `hash2-${campaignId}`, now, now, now, now]
            );
            
            // Insert a campaign email with explicit worker_name
            db.run(
              `INSERT INTO campaign_emails (campaign_id, recipient, worker_name, received_at) VALUES (?, ?, ?, ?)`,
              [campaignId, recipient, workerName, now]
            );

            // Query the inserted campaign email
            const result = db.exec('SELECT worker_name FROM campaign_emails ORDER BY id DESC LIMIT 1');
            
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].values.length).toBeGreaterThan(0);
            
            const retrievedWorkerName = result[0].values[0][0];
            expect(retrievedWorkerName).not.toBeNull();
            expect(retrievedWorkerName).toBe(workerName);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Feature: worker-instance-data-separation, Property 7: Schema Field Presence**
   * **Validates: Requirements 7.3**
   * 
   * For any newly created monitoring rule, the worker_scope field should be present and non-null.
   */
  describe('monitoring_rules table - worker_scope field', () => {
    it('should have worker_scope field present and defaulting to global for new monitoring rules', () => {
      fc.assert(
        fc.property(
          merchantArb,
          nameArb,
          subjectPatternArb,
          intervalArb,
          intervalArb,
          (merchant, name, subjectPattern, expectedInterval, deadAfter) => {
            const id = uuidv4();
            const now = new Date().toISOString();
            
            // Insert a monitoring rule without specifying worker_scope
            db.run(
              `INSERT INTO monitoring_rules (id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [id, merchant, name, subjectPattern, expectedInterval, deadAfter, now, now]
            );

            // Query the inserted monitoring rule
            const result = db.exec('SELECT worker_scope FROM monitoring_rules WHERE id = ?', [id]);
            
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].values.length).toBeGreaterThan(0);
            
            const workerScope = result[0].values[0][0];
            expect(workerScope).not.toBeNull();
            expect(workerScope).toBe('global');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve explicit worker_scope when specified for monitoring rules', () => {
      fc.assert(
        fc.property(
          merchantArb,
          nameArb,
          subjectPatternArb,
          intervalArb,
          intervalArb,
          workerNameArb,
          (merchant, name, subjectPattern, expectedInterval, deadAfter, workerScope) => {
            const id = uuidv4();
            const now = new Date().toISOString();
            
            // Insert a monitoring rule with explicit worker_scope
            db.run(
              `INSERT INTO monitoring_rules (id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, worker_scope, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [id, merchant, name, subjectPattern, expectedInterval, deadAfter, workerScope, now, now]
            );

            // Query the inserted monitoring rule
            const result = db.exec('SELECT worker_scope FROM monitoring_rules WHERE id = ?', [id]);
            
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].values.length).toBeGreaterThan(0);
            
            const retrievedWorkerScope = result[0].values[0][0];
            expect(retrievedWorkerScope).not.toBeNull();
            expect(retrievedWorkerScope).toBe(workerScope);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: worker-instance-data-separation, Property 7: Schema Field Presence**
   * **Validates: Requirements 7.3**
   * 
   * For any newly created ratio monitor, the worker_scope field should be present and non-null.
   */
  describe('ratio_monitors table - worker_scope field', () => {
    it('should have worker_scope field present and defaulting to global for new ratio monitors', () => {
      fc.assert(
        fc.property(
          nameArb,
          merchantArb, // using as tag
          thresholdArb,
          (name, tag, threshold) => {
            const id = uuidv4();
            const now = new Date().toISOString();
            
            // First create two monitoring rules for the ratio monitor
            const firstRuleId = uuidv4();
            const secondRuleId = uuidv4();
            
            db.run(
              `INSERT INTO monitoring_rules (id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [firstRuleId, 'merchant1', 'Rule 1', 'pattern1', 60, 120, now, now]
            );
            
            db.run(
              `INSERT INTO monitoring_rules (id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [secondRuleId, 'merchant2', 'Rule 2', 'pattern2', 60, 120, now, now]
            );
            
            // Insert a ratio monitor without specifying worker_scope
            db.run(
              `INSERT INTO ratio_monitors (id, name, tag, first_rule_id, second_rule_id, threshold_percent, time_window, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [id, name, tag, firstRuleId, secondRuleId, threshold, '24h', now, now]
            );

            // Query the inserted ratio monitor
            const result = db.exec('SELECT worker_scope FROM ratio_monitors WHERE id = ?', [id]);
            
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].values.length).toBeGreaterThan(0);
            
            const workerScope = result[0].values[0][0];
            expect(workerScope).not.toBeNull();
            expect(workerScope).toBe('global');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should preserve explicit worker_scope when specified for ratio monitors', () => {
      fc.assert(
        fc.property(
          nameArb,
          merchantArb, // using as tag
          thresholdArb,
          workerNameArb,
          (name, tag, threshold, workerScope) => {
            const id = uuidv4();
            const now = new Date().toISOString();
            
            // First create two monitoring rules for the ratio monitor
            const firstRuleId = uuidv4();
            const secondRuleId = uuidv4();
            
            db.run(
              `INSERT INTO monitoring_rules (id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [firstRuleId, 'merchant3', 'Rule 3', 'pattern3', 60, 120, now, now]
            );
            
            db.run(
              `INSERT INTO monitoring_rules (id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [secondRuleId, 'merchant4', 'Rule 4', 'pattern4', 60, 120, now, now]
            );
            
            // Insert a ratio monitor with explicit worker_scope
            db.run(
              `INSERT INTO ratio_monitors (id, name, tag, first_rule_id, second_rule_id, threshold_percent, time_window, worker_scope, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [id, name, tag, firstRuleId, secondRuleId, threshold, '24h', workerScope, now, now]
            );

            // Query the inserted ratio monitor
            const result = db.exec('SELECT worker_scope FROM ratio_monitors WHERE id = ?', [id]);
            
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].values.length).toBeGreaterThan(0);
            
            const retrievedWorkerScope = result[0].values[0][0];
            expect(retrievedWorkerScope).not.toBeNull();
            expect(retrievedWorkerScope).toBe(workerScope);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
