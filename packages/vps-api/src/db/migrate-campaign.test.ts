/**
 * Property-based tests for Campaign Analytics Schema Migration
 * 
 * **Feature: path-analysis-project-isolation, Property 8: Schema Migration Backward Compatibility**
 * **Validates: Requirements 10.6**
 * 
 * For any schema migration, existing data in campaigns, campaign_emails, and recipient_paths 
 * tables should remain unchanged.
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
// Use UUID in domain to ensure uniqueness across test runs
const domainArb = fc.uuid().map(uuid => `test-${uuid}.com`);

const subjectArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0 && !s.includes("'") && !s.includes('"'));

const emailArb = fc.emailAddress();

const sequenceOrderArb = fc.integer({ min: 1, max: 1000 });

/**
 * Check if a column exists in a table
 */
function columnExists(db: SqlJsDatabase, tableName: string, columnName: string): boolean {
  const result = db.exec(`PRAGMA table_info(${tableName})`);
  if (result.length === 0) return false;
  return result[0].values.some(row => row[1] === columnName);
}

/**
 * Check if a table exists
 */
function tableExists(db: SqlJsDatabase, tableName: string): boolean {
  const result = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
  return result.length > 0 && result[0].values.length > 0;
}

/**
 * Apply the project isolation migration to the database
 * This simulates what migrate-campaign.ts does for the new project-level tables
 */
function applyProjectIsolationMigration(db: SqlJsDatabase): void {
  // Migration: Add last_analysis_time column to analysis_projects table
  if (tableExists(db, 'analysis_projects') && !columnExists(db, 'analysis_projects', 'last_analysis_time')) {
    db.run("ALTER TABLE analysis_projects ADD COLUMN last_analysis_time TEXT");
  }

  // Migration: Create project_root_campaigns table
  if (!tableExists(db, 'project_root_campaigns')) {
    db.run(`
      CREATE TABLE project_root_campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        is_confirmed INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
        UNIQUE(project_id, campaign_id)
      )
    `);
    db.run('CREATE INDEX idx_project_root_campaigns_project ON project_root_campaigns(project_id)');
  }

  // Migration: Create project_new_users table
  if (!tableExists(db, 'project_new_users')) {
    db.run(`
      CREATE TABLE project_new_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        recipient TEXT NOT NULL,
        first_root_campaign_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (first_root_campaign_id) REFERENCES campaigns(id),
        UNIQUE(project_id, recipient)
      )
    `);
    db.run('CREATE INDEX idx_project_new_users_project ON project_new_users(project_id)');
    db.run('CREATE INDEX idx_project_new_users_recipient ON project_new_users(recipient)');
  }

  // Migration: Create project_user_events table
  if (!tableExists(db, 'project_user_events')) {
    db.run(`
      CREATE TABLE project_user_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        recipient TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        received_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
        UNIQUE(project_id, recipient, campaign_id)
      )
    `);
    db.run('CREATE INDEX idx_project_user_events_project ON project_user_events(project_id)');
    db.run('CREATE INDEX idx_project_user_events_recipient ON project_user_events(project_id, recipient)');
    db.run('CREATE INDEX idx_project_user_events_seq ON project_user_events(project_id, recipient, seq)');
  }

  // Migration: Create project_path_edges table
  if (!tableExists(db, 'project_path_edges')) {
    db.run(`
      CREATE TABLE project_path_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        from_campaign_id TEXT NOT NULL,
        to_campaign_id TEXT NOT NULL,
        user_count INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (from_campaign_id) REFERENCES campaigns(id),
        FOREIGN KEY (to_campaign_id) REFERENCES campaigns(id),
        UNIQUE(project_id, from_campaign_id, to_campaign_id)
      )
    `);
    db.run('CREATE INDEX idx_project_path_edges_project ON project_path_edges(project_id)');
    db.run('CREATE INDEX idx_project_path_edges_from ON project_path_edges(project_id, from_campaign_id)');
  }
}

/**
 * Create analysis_projects table if it doesn't exist (needed for foreign keys)
 */
function createAnalysisProjectsTable(db: SqlJsDatabase): void {
  if (!tableExists(db, 'analysis_projects')) {
    db.run(`
      CREATE TABLE analysis_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        merchant_id TEXT NOT NULL,
        worker_name TEXT NOT NULL,
        worker_names TEXT,
        status TEXT DEFAULT 'active',
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id)
      )
    `);
    db.run('CREATE INDEX idx_analysis_projects_merchant ON analysis_projects(merchant_id)');
    db.run('CREATE INDEX idx_analysis_projects_worker ON analysis_projects(worker_name)');
    db.run('CREATE INDEX idx_analysis_projects_status ON analysis_projects(status)');
  }
}

describe('Campaign Schema Migration - Property 8: Schema Migration Backward Compatibility', () => {
  let SQL: any;
  let db: SqlJsDatabase;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load and execute main schema (includes campaign tables)
    const mainSchemaPath = join(__dirname, 'schema.sql');
    const mainSchema = readFileSync(mainSchemaPath, 'utf-8');
    db.run(mainSchema);

    // Create analysis_projects table (needed for foreign keys in new tables)
    createAnalysisProjectsTable(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: path-analysis-project-isolation, Property 8: Schema Migration Backward Compatibility**
   * **Validates: Requirements 10.6**
   * 
   * For any existing campaign data, the migration should not modify the data.
   */
  describe('campaigns table - data preservation', () => {
    it('should preserve all campaign data after migration', () => {
      fc.assert(
        fc.property(
          domainArb,
          subjectArb,
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 500 }),
          (domain, subject, totalEmails, uniqueRecipients) => {
            const now = new Date().toISOString();
            const merchantId = uuidv4();
            const campaignId = uuidv4();
            const subjectHash = `hash-${campaignId}`;

            // Insert merchant
            db.run(
              `INSERT INTO merchants (id, domain, created_at, updated_at) VALUES (?, ?, ?, ?)`,
              [merchantId, domain, now, now]
            );

            // Insert campaign with all fields
            db.run(
              `INSERT INTO campaigns (id, merchant_id, subject, subject_hash, is_valuable, valuable_note, total_emails, unique_recipients, first_seen_at, last_seen_at, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [campaignId, merchantId, subject, subjectHash, 1, 'Test note', totalEmails, uniqueRecipients, now, now, now, now]
            );

            // Record original data
            const originalResult = db.exec(`SELECT * FROM campaigns WHERE id = ?`, [campaignId]);
            const originalData = originalResult[0].values[0];

            // Apply migration
            applyProjectIsolationMigration(db);

            // Verify data is unchanged
            const afterResult = db.exec(`SELECT * FROM campaigns WHERE id = ?`, [campaignId]);
            const afterData = afterResult[0].values[0];

            // Compare all original columns (new columns may be added, but original data should be same)
            expect(afterData.slice(0, originalData.length)).toEqual(originalData);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: path-analysis-project-isolation, Property 8: Schema Migration Backward Compatibility**
   * **Validates: Requirements 10.6**
   * 
   * For any existing campaign_emails data, the migration should not modify the data.
   */
  describe('campaign_emails table - data preservation', () => {
    it('should preserve all campaign_emails data after migration', () => {
      fc.assert(
        fc.property(
          domainArb,
          subjectArb,
          emailArb,
          (domain, subject, recipient) => {
            const now = new Date().toISOString();
            const merchantId = uuidv4();
            const campaignId = uuidv4();
            const subjectHash = `hash-${campaignId}`;

            // Insert merchant
            db.run(
              `INSERT INTO merchants (id, domain, created_at, updated_at) VALUES (?, ?, ?, ?)`,
              [merchantId, domain, now, now]
            );

            // Insert campaign
            db.run(
              `INSERT INTO campaigns (id, merchant_id, subject, subject_hash, first_seen_at, last_seen_at, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [campaignId, merchantId, subject, subjectHash, now, now, now, now]
            );

            // Insert campaign email
            db.run(
              `INSERT INTO campaign_emails (campaign_id, recipient, received_at) VALUES (?, ?, ?)`,
              [campaignId, recipient, now]
            );

            // Record original data
            const originalResult = db.exec(`SELECT campaign_id, recipient, received_at FROM campaign_emails WHERE campaign_id = ?`, [campaignId]);
            const originalData = originalResult[0].values[0];

            // Apply migration
            applyProjectIsolationMigration(db);

            // Verify data is unchanged
            const afterResult = db.exec(`SELECT campaign_id, recipient, received_at FROM campaign_emails WHERE campaign_id = ?`, [campaignId]);
            const afterData = afterResult[0].values[0];

            expect(afterData).toEqual(originalData);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: path-analysis-project-isolation, Property 8: Schema Migration Backward Compatibility**
   * **Validates: Requirements 10.6**
   * 
   * For any existing recipient_paths data, the migration should not modify the data.
   */
  describe('recipient_paths table - data preservation', () => {
    it('should preserve all recipient_paths data after migration', () => {
      fc.assert(
        fc.property(
          domainArb,
          subjectArb,
          emailArb,
          sequenceOrderArb,
          (domain, subject, recipient, sequenceOrder) => {
            const now = new Date().toISOString();
            const merchantId = uuidv4();
            const campaignId = uuidv4();
            const subjectHash = `hash-${campaignId}`;

            // Insert merchant
            db.run(
              `INSERT INTO merchants (id, domain, created_at, updated_at) VALUES (?, ?, ?, ?)`,
              [merchantId, domain, now, now]
            );

            // Insert campaign
            db.run(
              `INSERT INTO campaigns (id, merchant_id, subject, subject_hash, first_seen_at, last_seen_at, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [campaignId, merchantId, subject, subjectHash, now, now, now, now]
            );

            // Insert recipient path
            db.run(
              `INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, first_received_at) 
               VALUES (?, ?, ?, ?, ?)`,
              [merchantId, recipient, campaignId, sequenceOrder, now]
            );

            // Record original data
            const originalResult = db.exec(
              `SELECT merchant_id, recipient, campaign_id, sequence_order, first_received_at 
               FROM recipient_paths WHERE merchant_id = ? AND recipient = ? AND campaign_id = ?`,
              [merchantId, recipient, campaignId]
            );
            const originalData = originalResult[0].values[0];

            // Apply migration
            applyProjectIsolationMigration(db);

            // Verify data is unchanged
            const afterResult = db.exec(
              `SELECT merchant_id, recipient, campaign_id, sequence_order, first_received_at 
               FROM recipient_paths WHERE merchant_id = ? AND recipient = ? AND campaign_id = ?`,
              [merchantId, recipient, campaignId]
            );
            const afterData = afterResult[0].values[0];

            expect(afterData).toEqual(originalData);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: path-analysis-project-isolation, Property 8: Schema Migration Backward Compatibility**
   * **Validates: Requirements 10.6**
   * 
   * For any existing merchants data, the migration should not modify the data.
   */
  describe('merchants table - data preservation', () => {
    it('should preserve all merchants data after migration', () => {
      fc.assert(
        fc.property(
          domainArb,
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && !s.includes("'") && !s.includes('"')),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 1000 }),
          (domain, displayName, totalCampaigns, totalEmails) => {
            const now = new Date().toISOString();
            const merchantId = uuidv4();

            // Insert merchant with all fields
            db.run(
              `INSERT INTO merchants (id, domain, display_name, note, total_campaigns, total_emails, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [merchantId, domain, displayName, 'Test note', totalCampaigns, totalEmails, now, now]
            );

            // Record original data
            const originalResult = db.exec(`SELECT * FROM merchants WHERE id = ?`, [merchantId]);
            const originalData = originalResult[0].values[0];

            // Apply migration
            applyProjectIsolationMigration(db);

            // Verify data is unchanged
            const afterResult = db.exec(`SELECT * FROM merchants WHERE id = ?`, [merchantId]);
            const afterData = afterResult[0].values[0];

            expect(afterData).toEqual(originalData);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Verify that new tables are created correctly after migration
   */
  describe('new tables creation', () => {
    it('should create all new project-level tables', () => {
      // Apply migration
      applyProjectIsolationMigration(db);

      // Verify all new tables exist
      expect(tableExists(db, 'project_root_campaigns')).toBe(true);
      expect(tableExists(db, 'project_new_users')).toBe(true);
      expect(tableExists(db, 'project_user_events')).toBe(true);
      expect(tableExists(db, 'project_path_edges')).toBe(true);
    });

    it('should add last_analysis_time column to analysis_projects', () => {
      // Apply migration
      applyProjectIsolationMigration(db);

      // Verify column exists
      expect(columnExists(db, 'analysis_projects', 'last_analysis_time')).toBe(true);
    });
  });
});
