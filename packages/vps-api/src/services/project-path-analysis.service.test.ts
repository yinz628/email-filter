/**
 * Project Path Analysis Service Tests
 * 
 * Property-based tests for project-level path analysis with data isolation
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

// ============================================
// Test Repository for sql.js (in-memory testing)
// ============================================

/**
 * Test-specific ProjectPathAnalysisService that works with sql.js
 */
class TestProjectPathAnalysisService {
  constructor(private db: SqlJsDatabase) {}

  // ========== Root Campaign Management ==========

  setProjectRootCampaign(
    projectId: string,
    campaignId: string,
    isConfirmed: boolean = false
  ): void {
    const now = new Date().toISOString();
    
    // Check if exists
    const existing = this.db.exec(
      `SELECT id FROM project_root_campaigns WHERE project_id = ? AND campaign_id = ?`,
      [projectId, campaignId]
    );
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      // Update
      this.db.run(
        `UPDATE project_root_campaigns SET is_confirmed = ? WHERE project_id = ? AND campaign_id = ?`,
        [isConfirmed ? 1 : 0, projectId, campaignId]
      );
    } else {
      // Insert
      this.db.run(
        `INSERT INTO project_root_campaigns (project_id, campaign_id, is_confirmed, created_at)
         VALUES (?, ?, ?, ?)`,
        [projectId, campaignId, isConfirmed ? 1 : 0, now]
      );
    }
  }

  getProjectRootCampaigns(projectId: string): Array<{
    campaignId: string;
    subject: string;
    isConfirmed: boolean;
    createdAt: Date;
  }> {
    const result = this.db.exec(
      `SELECT 
        prc.campaign_id,
        prc.is_confirmed,
        prc.created_at,
        c.subject
      FROM project_root_campaigns prc
      LEFT JOIN campaigns c ON prc.campaign_id = c.id
      WHERE prc.project_id = ?
      ORDER BY prc.created_at DESC`,
      [projectId]
    );
    
    if (result.length === 0) return [];
    
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return {
        campaignId: obj.campaign_id as string,
        subject: (obj.subject as string) || '',
        isConfirmed: obj.is_confirmed === 1,
        createdAt: new Date(obj.created_at as string),
      };
    });
  }

  removeProjectRootCampaign(projectId: string, campaignId: string): void {
    this.db.run(
      `DELETE FROM project_root_campaigns WHERE project_id = ? AND campaign_id = ?`,
      [projectId, campaignId]
    );
  }

  // ========== New User Management ==========

  addProjectNewUser(
    projectId: string,
    recipient: string,
    firstRootCampaignId: string
  ): void {
    const now = new Date().toISOString();
    
    // Check if exists
    const existing = this.db.exec(
      `SELECT id FROM project_new_users WHERE project_id = ? AND recipient = ?`,
      [projectId, recipient]
    );
    
    if (existing.length === 0 || existing[0].values.length === 0) {
      this.db.run(
        `INSERT INTO project_new_users (project_id, recipient, first_root_campaign_id, created_at)
         VALUES (?, ?, ?, ?)`,
        [projectId, recipient, firstRootCampaignId, now]
      );
    }
  }

  getProjectNewUsers(projectId: string): Array<{
    recipient: string;
    firstRootCampaignId: string;
    createdAt: Date;
  }> {
    const result = this.db.exec(
      `SELECT recipient, first_root_campaign_id, created_at
       FROM project_new_users
       WHERE project_id = ?
       ORDER BY created_at ASC`,
      [projectId]
    );
    
    if (result.length === 0) return [];
    
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return {
        recipient: obj.recipient as string,
        firstRootCampaignId: obj.first_root_campaign_id as string,
        createdAt: new Date(obj.created_at as string),
      };
    });
  }

  getProjectUserStats(projectId: string): { totalNewUsers: number; totalEvents: number } {
    const userResult = this.db.exec(
      `SELECT COUNT(*) as count FROM project_new_users WHERE project_id = ?`,
      [projectId]
    );
    const eventResult = this.db.exec(
      `SELECT COUNT(*) as count FROM project_user_events WHERE project_id = ?`,
      [projectId]
    );
    
    return {
      totalNewUsers: userResult.length > 0 ? (userResult[0].values[0][0] as number) : 0,
      totalEvents: eventResult.length > 0 ? (eventResult[0].values[0][0] as number) : 0,
    };
  }

  // ========== User Event Management ==========

  addUserEvent(
    projectId: string,
    recipient: string,
    campaignId: string,
    receivedAt: Date
  ): number {
    // Check if exists
    const existing = this.db.exec(
      `SELECT seq FROM project_user_events WHERE project_id = ? AND recipient = ? AND campaign_id = ?`,
      [projectId, recipient, campaignId]
    );
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      return existing[0].values[0][0] as number;
    }
    
    const maxSeq = this.getMaxSeq(projectId, recipient);
    const newSeq = maxSeq + 1;
    
    this.db.run(
      `INSERT INTO project_user_events (project_id, recipient, campaign_id, seq, received_at)
       VALUES (?, ?, ?, ?, ?)`,
      [projectId, recipient, campaignId, newSeq, receivedAt.toISOString()]
    );
    
    return newSeq;
  }

  getUserEvents(projectId: string, recipient: string): Array<{
    recipient: string;
    campaignId: string;
    seq: number;
    receivedAt: Date;
  }> {
    const result = this.db.exec(
      `SELECT recipient, campaign_id, seq, received_at
       FROM project_user_events
       WHERE project_id = ? AND recipient = ?
       ORDER BY seq ASC`,
      [projectId, recipient]
    );
    
    if (result.length === 0) return [];
    
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return {
        recipient: obj.recipient as string,
        campaignId: obj.campaign_id as string,
        seq: obj.seq as number,
        receivedAt: new Date(obj.received_at as string),
      };
    });
  }

  getMaxSeq(projectId: string, recipient: string): number {
    const result = this.db.exec(
      `SELECT MAX(seq) as max_seq FROM project_user_events WHERE project_id = ? AND recipient = ?`,
      [projectId, recipient]
    );
    
    if (result.length === 0 || result[0].values.length === 0) return 0;
    return (result[0].values[0][0] as number) ?? 0;
  }

  getAllProjectEvents(projectId: string): Array<{
    recipient: string;
    campaignId: string;
    seq: number;
    receivedAt: Date;
  }> {
    const result = this.db.exec(
      `SELECT recipient, campaign_id, seq, received_at
       FROM project_user_events
       WHERE project_id = ?
       ORDER BY recipient, seq ASC`,
      [projectId]
    );
    
    if (result.length === 0) return [];
    
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return {
        recipient: obj.recipient as string,
        campaignId: obj.campaign_id as string,
        seq: obj.seq as number,
        receivedAt: new Date(obj.received_at as string),
      };
    });
  }

  // ========== Path Edge Management ==========

  updatePathEdge(
    projectId: string,
    fromCampaignId: string,
    toCampaignId: string,
    userCount: number
  ): void {
    const now = new Date().toISOString();
    
    const existing = this.db.exec(
      `SELECT id FROM project_path_edges WHERE project_id = ? AND from_campaign_id = ? AND to_campaign_id = ?`,
      [projectId, fromCampaignId, toCampaignId]
    );
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      this.db.run(
        `UPDATE project_path_edges SET user_count = ?, updated_at = ?
         WHERE project_id = ? AND from_campaign_id = ? AND to_campaign_id = ?`,
        [userCount, now, projectId, fromCampaignId, toCampaignId]
      );
    } else {
      this.db.run(
        `INSERT INTO project_path_edges (project_id, from_campaign_id, to_campaign_id, user_count, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, fromCampaignId, toCampaignId, userCount, now]
      );
    }
  }

  getProjectPathEdges(projectId: string): Array<{
    fromCampaignId: string;
    fromSubject: string;
    toCampaignId: string;
    toSubject: string;
    userCount: number;
  }> {
    const result = this.db.exec(
      `SELECT 
        ppe.from_campaign_id,
        ppe.to_campaign_id,
        ppe.user_count,
        c1.subject as from_subject,
        c2.subject as to_subject
      FROM project_path_edges ppe
      LEFT JOIN campaigns c1 ON ppe.from_campaign_id = c1.id
      LEFT JOIN campaigns c2 ON ppe.to_campaign_id = c2.id
      WHERE ppe.project_id = ?
      ORDER BY ppe.user_count DESC`,
      [projectId]
    );
    
    if (result.length === 0) return [];
    
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return {
        fromCampaignId: obj.from_campaign_id as string,
        fromSubject: (obj.from_subject as string) || '',
        toCampaignId: obj.to_campaign_id as string,
        toSubject: (obj.to_subject as string) || '',
        userCount: obj.user_count as number,
      };
    });
  }

  buildPathEdgesFromEvents(projectId: string): void {
    const events = this.getAllProjectEvents(projectId);
    
    // Group by recipient
    const eventsByRecipient = new Map<string, Array<{ campaignId: string; seq: number }>>();
    for (const event of events) {
      if (!eventsByRecipient.has(event.recipient)) {
        eventsByRecipient.set(event.recipient, []);
      }
      eventsByRecipient.get(event.recipient)!.push({
        campaignId: event.campaignId,
        seq: event.seq,
      });
    }
    
    // Count transitions
    const transitionCounts = new Map<string, number>();
    for (const [, userEvents] of eventsByRecipient) {
      for (let i = 0; i < userEvents.length - 1; i++) {
        const fromEvent = userEvents[i];
        const toEvent = userEvents[i + 1];
        if (toEvent.seq === fromEvent.seq + 1) {
          const key = `${fromEvent.campaignId}:${toEvent.campaignId}`;
          transitionCounts.set(key, (transitionCounts.get(key) || 0) + 1);
        }
      }
    }
    
    // Clear and rebuild
    this.db.run(`DELETE FROM project_path_edges WHERE project_id = ?`, [projectId]);
    
    for (const [key, count] of transitionCounts) {
      const [fromCampaignId, toCampaignId] = key.split(':');
      this.updatePathEdge(projectId, fromCampaignId, toCampaignId, count);
    }
  }
}

// ============================================
// Test Helpers
// ============================================

async function createTestDb(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  
  // Enable foreign keys for cascade delete support
  db.run('PRAGMA foreign_keys = ON');
  
  const schemaPath = join(__dirname, '../db/schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.run(schema);
  
  return db;
}

function createTestMerchant(db: SqlJsDatabase, domain: string): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO merchants (id, domain, total_campaigns, total_emails, created_at, updated_at)
     VALUES (?, ?, 0, 0, ?, ?)`,
    [id, domain, now, now]
  );
  return id;
}

function createTestCampaign(db: SqlJsDatabase, merchantId: string, subject: string): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO campaigns (id, merchant_id, subject, subject_hash, total_emails, unique_recipients, first_seen_at, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
    [id, merchantId, subject, id, now, now, now, now]
  );
  return id;
}

function createTestProject(db: SqlJsDatabase, merchantId: string, name: string): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO analysis_projects (id, name, merchant_id, worker_name, status, created_at, updated_at)
     VALUES (?, ?, ?, 'test-worker', 'active', ?, ?)`,
    [id, name, merchantId, now, now]
  );
  return id;
}

/**
 * Delete a project from the database
 * With foreign keys enabled, this should cascade delete all project-level data
 */
function deleteTestProject(db: SqlJsDatabase, projectId: string): void {
  db.run(`DELETE FROM analysis_projects WHERE id = ?`, [projectId]);
}

/**
 * Count records in a project-level table for a specific project
 */
function countProjectRecords(db: SqlJsDatabase, tableName: string, projectId: string): number {
  const result = db.exec(
    `SELECT COUNT(*) as count FROM ${tableName} WHERE project_id = ?`,
    [projectId]
  );
  if (result.length === 0 || result[0].values.length === 0) return 0;
  return result[0].values[0][0] as number;
}

// ============================================
// Arbitraries
// ============================================

const emailArb = fc.emailAddress();
const subjectArb = fc.string({ minLength: 1, maxLength: 100 });

// ============================================
// Property Tests
// ============================================

describe('ProjectPathAnalysisService', () => {
  /**
   * **Feature: path-analysis-project-isolation, Property 1: Project Data Isolation**
   * **Validates: Requirements 1.2, 1.3, 1.5, 2.2, 2.4**
   * 
   * For any two projects A and B (even for the same merchant), modifying Root campaigns,
   * new users, events, or path edges in project A should NOT affect any data in project B.
   */
  describe('Property 1: Project Data Isolation', () => {
    it('should isolate Root campaigns between projects', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          subjectArb,
          subjectArb,
          async (subject1, subject2) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            // Create shared merchant and campaigns
            const merchantId = createTestMerchant(db, 'test.com');
            const campaign1 = createTestCampaign(db, merchantId, subject1);
            const campaign2 = createTestCampaign(db, merchantId, subject2);
            
            // Create two projects for the same merchant
            const projectA = createTestProject(db, merchantId, 'Project A');
            const projectB = createTestProject(db, merchantId, 'Project B');
            
            // Set Root campaign in Project A
            service.setProjectRootCampaign(projectA, campaign1, true);
            
            // Verify Project A has the Root
            const rootsA = service.getProjectRootCampaigns(projectA);
            expect(rootsA.length).toBe(1);
            expect(rootsA[0].campaignId).toBe(campaign1);
            
            // Verify Project B is NOT affected
            const rootsB = service.getProjectRootCampaigns(projectB);
            expect(rootsB.length).toBe(0);
            
            // Set different Root in Project B
            service.setProjectRootCampaign(projectB, campaign2, true);
            
            // Verify both projects have their own Roots
            const rootsA2 = service.getProjectRootCampaigns(projectA);
            const rootsB2 = service.getProjectRootCampaigns(projectB);
            
            expect(rootsA2.length).toBe(1);
            expect(rootsA2[0].campaignId).toBe(campaign1);
            expect(rootsB2.length).toBe(1);
            expect(rootsB2[0].campaignId).toBe(campaign2);
            
            // Remove Root from Project A
            service.removeProjectRootCampaign(projectA, campaign1);
            
            // Verify Project A is empty but Project B still has its Root
            const rootsA3 = service.getProjectRootCampaigns(projectA);
            const rootsB3 = service.getProjectRootCampaigns(projectB);
            
            expect(rootsA3.length).toBe(0);
            expect(rootsB3.length).toBe(1);
            expect(rootsB3[0].campaignId).toBe(campaign2);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should isolate new users between projects', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          emailArb,
          async (email1, email2) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const campaign = createTestCampaign(db, merchantId, 'Welcome');
            const projectA = createTestProject(db, merchantId, 'Project A');
            const projectB = createTestProject(db, merchantId, 'Project B');
            
            // Add user to Project A
            service.addProjectNewUser(projectA, email1, campaign);
            
            // Verify Project A has the user
            const usersA = service.getProjectNewUsers(projectA);
            expect(usersA.length).toBe(1);
            expect(usersA[0].recipient).toBe(email1);
            
            // Verify Project B is NOT affected
            const usersB = service.getProjectNewUsers(projectB);
            expect(usersB.length).toBe(0);
            
            // Add different user to Project B
            service.addProjectNewUser(projectB, email2, campaign);
            
            // Verify isolation
            const usersA2 = service.getProjectNewUsers(projectA);
            const usersB2 = service.getProjectNewUsers(projectB);
            
            expect(usersA2.length).toBe(1);
            expect(usersA2[0].recipient).toBe(email1);
            expect(usersB2.length).toBe(1);
            expect(usersB2[0].recipient).toBe(email2);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should isolate user events between projects', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          async (email) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const campaign1 = createTestCampaign(db, merchantId, 'Campaign 1');
            const campaign2 = createTestCampaign(db, merchantId, 'Campaign 2');
            const projectA = createTestProject(db, merchantId, 'Project A');
            const projectB = createTestProject(db, merchantId, 'Project B');
            
            const now = new Date();
            
            // Add events to Project A
            service.addUserEvent(projectA, email, campaign1, now);
            service.addUserEvent(projectA, email, campaign2, now);
            
            // Verify Project A has events
            const eventsA = service.getUserEvents(projectA, email);
            expect(eventsA.length).toBe(2);
            
            // Verify Project B is NOT affected
            const eventsB = service.getUserEvents(projectB, email);
            expect(eventsB.length).toBe(0);
            
            // Verify stats isolation
            const statsA = service.getProjectUserStats(projectA);
            const statsB = service.getProjectUserStats(projectB);
            
            expect(statsA.totalEvents).toBe(2);
            expect(statsB.totalEvents).toBe(0);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should isolate path edges between projects', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (userCount) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const campaign1 = createTestCampaign(db, merchantId, 'Campaign 1');
            const campaign2 = createTestCampaign(db, merchantId, 'Campaign 2');
            const projectA = createTestProject(db, merchantId, 'Project A');
            const projectB = createTestProject(db, merchantId, 'Project B');
            
            // Add edge to Project A
            service.updatePathEdge(projectA, campaign1, campaign2, userCount);
            
            // Verify Project A has the edge
            const edgesA = service.getProjectPathEdges(projectA);
            expect(edgesA.length).toBe(1);
            expect(edgesA[0].userCount).toBe(userCount);
            
            // Verify Project B is NOT affected
            const edgesB = service.getProjectPathEdges(projectB);
            expect(edgesB.length).toBe(0);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: path-analysis-project-isolation, Property 2: Sequence Number Consistency**
   * **Validates: Requirements 4.1, 4.2, 6.5, 7.3**
   * 
   * For any project and any user in that project, the sequence numbers in project_user_events
   * should be consecutive integers starting from 1, with no gaps or duplicates.
   */
  describe('Property 2: Sequence Number Consistency', () => {
    it('should assign consecutive sequence numbers starting from 1', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          fc.integer({ min: 1, max: 10 }), // Number of campaigns to add
          async (email, numCampaigns) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns
            const campaigns: string[] = [];
            for (let i = 0; i < numCampaigns; i++) {
              campaigns.push(createTestCampaign(db, merchantId, `Campaign ${i}`));
            }
            
            const now = new Date();
            
            // Add events one by one
            for (let i = 0; i < numCampaigns; i++) {
              const seq = service.addUserEvent(projectId, email, campaigns[i], now);
              // Each new event should get seq = i + 1
              expect(seq).toBe(i + 1);
            }
            
            // Verify all events have consecutive seq numbers
            const events = service.getUserEvents(projectId, email);
            expect(events.length).toBe(numCampaigns);
            
            for (let i = 0; i < events.length; i++) {
              expect(events[i].seq).toBe(i + 1);
            }
            
            // Verify no gaps: max seq should equal count
            const maxSeq = service.getMaxSeq(projectId, email);
            expect(maxSeq).toBe(numCampaigns);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not create duplicate seq for same campaign', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          async (email) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            const campaign = createTestCampaign(db, merchantId, 'Campaign');
            
            const now = new Date();
            
            // Add same campaign multiple times
            const seq1 = service.addUserEvent(projectId, email, campaign, now);
            const seq2 = service.addUserEvent(projectId, email, campaign, now);
            const seq3 = service.addUserEvent(projectId, email, campaign, now);
            
            // All should return the same seq (no duplicates)
            expect(seq1).toBe(1);
            expect(seq2).toBe(1);
            expect(seq3).toBe(1);
            
            // Only one event should exist
            const events = service.getUserEvents(projectId, email);
            expect(events.length).toBe(1);
            expect(events[0].seq).toBe(1);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain seq consistency across multiple users', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 2, maxLength: 5 }),
          fc.integer({ min: 1, max: 5 }),
          async (emails, numCampaigns) => {
            // Ensure unique emails
            const uniqueEmails = [...new Set(emails)];
            if (uniqueEmails.length < 2) return; // Skip if not enough unique emails
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns
            const campaigns: string[] = [];
            for (let i = 0; i < numCampaigns; i++) {
              campaigns.push(createTestCampaign(db, merchantId, `Campaign ${i}`));
            }
            
            const now = new Date();
            
            // Add events for each user
            for (const email of uniqueEmails) {
              for (let i = 0; i < numCampaigns; i++) {
                service.addUserEvent(projectId, email, campaigns[i], now);
              }
            }
            
            // Verify each user has their own independent seq sequence
            for (const email of uniqueEmails) {
              const events = service.getUserEvents(projectId, email);
              expect(events.length).toBe(numCampaigns);
              
              // Each user's seq should start from 1 and be consecutive
              for (let i = 0; i < events.length; i++) {
                expect(events[i].seq).toBe(i + 1);
              }
            }
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: path-analysis-project-isolation, Property 4: Path Edge Count Accuracy**
   * **Validates: Requirements 5.1, 5.4, 6.6**
   * 
   * For any path edge in project_path_edges, the user_count should equal the number of
   * distinct users who have consecutive events (seq=n, seq=n+1) with matching campaign IDs.
   */
  describe('Property 4: Path Edge Count Accuracy', () => {
    it('should accurately count users who transition between campaigns', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 1, maxLength: 10 }),
          async (emails) => {
            // Ensure unique emails
            const uniqueEmails = [...new Set(emails)];
            if (uniqueEmails.length === 0) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create 3 campaigns: A -> B -> C
            const campaignA = createTestCampaign(db, merchantId, 'Campaign A');
            const campaignB = createTestCampaign(db, merchantId, 'Campaign B');
            const campaignC = createTestCampaign(db, merchantId, 'Campaign C');
            
            const now = new Date();
            
            // All users go through A -> B -> C
            for (const email of uniqueEmails) {
              service.addUserEvent(projectId, email, campaignA, now);
              service.addUserEvent(projectId, email, campaignB, now);
              service.addUserEvent(projectId, email, campaignC, now);
            }
            
            // Build path edges
            service.buildPathEdgesFromEvents(projectId);
            
            // Get edges
            const edges = service.getProjectPathEdges(projectId);
            
            // Should have 2 edges: A->B and B->C
            expect(edges.length).toBe(2);
            
            // Find A->B edge
            const abEdge = edges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignB);
            expect(abEdge).toBeDefined();
            expect(abEdge!.userCount).toBe(uniqueEmails.length);
            
            // Find B->C edge
            const bcEdge = edges.find(e => e.fromCampaignId === campaignB && e.toCampaignId === campaignC);
            expect(bcEdge).toBeDefined();
            expect(bcEdge!.userCount).toBe(uniqueEmails.length);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should count only consecutive seq transitions', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          async (email) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns
            const campaignA = createTestCampaign(db, merchantId, 'Campaign A');
            const campaignB = createTestCampaign(db, merchantId, 'Campaign B');
            const campaignC = createTestCampaign(db, merchantId, 'Campaign C');
            
            const now = new Date();
            
            // Add events: A (seq=1), B (seq=2), C (seq=3)
            service.addUserEvent(projectId, email, campaignA, now);
            service.addUserEvent(projectId, email, campaignB, now);
            service.addUserEvent(projectId, email, campaignC, now);
            
            // Build path edges
            service.buildPathEdgesFromEvents(projectId);
            
            // Get edges
            const edges = service.getProjectPathEdges(projectId);
            
            // Should have edges for consecutive transitions only
            // A->B (seq 1->2) and B->C (seq 2->3)
            expect(edges.length).toBe(2);
            
            // Should NOT have A->C edge (not consecutive)
            const acEdge = edges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignC);
            expect(acEdge).toBeUndefined();
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle partial paths correctly', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 3, maxLength: 6 }),
          async (emails) => {
            // Ensure unique emails
            const uniqueEmails = [...new Set(emails)];
            if (uniqueEmails.length < 3) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            const campaignA = createTestCampaign(db, merchantId, 'Campaign A');
            const campaignB = createTestCampaign(db, merchantId, 'Campaign B');
            const campaignC = createTestCampaign(db, merchantId, 'Campaign C');
            
            const now = new Date();
            
            // User 0: A -> B -> C (full path)
            service.addUserEvent(projectId, uniqueEmails[0], campaignA, now);
            service.addUserEvent(projectId, uniqueEmails[0], campaignB, now);
            service.addUserEvent(projectId, uniqueEmails[0], campaignC, now);
            
            // User 1: A -> B only (partial path)
            service.addUserEvent(projectId, uniqueEmails[1], campaignA, now);
            service.addUserEvent(projectId, uniqueEmails[1], campaignB, now);
            
            // User 2: A only (single event, no transitions)
            service.addUserEvent(projectId, uniqueEmails[2], campaignA, now);
            
            // Build path edges
            service.buildPathEdgesFromEvents(projectId);
            
            // Get edges
            const edges = service.getProjectPathEdges(projectId);
            
            // A->B should have 2 users (user 0 and user 1)
            const abEdge = edges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignB);
            expect(abEdge).toBeDefined();
            expect(abEdge!.userCount).toBe(2);
            
            // B->C should have 1 user (only user 0)
            const bcEdge = edges.find(e => e.fromCampaignId === campaignB && e.toCampaignId === campaignC);
            expect(bcEdge).toBeDefined();
            expect(bcEdge!.userCount).toBe(1);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle branching paths correctly', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 2, maxLength: 4 }),
          async (emails) => {
            // Ensure unique emails
            const uniqueEmails = [...new Set(emails)];
            if (uniqueEmails.length < 2) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            const campaignA = createTestCampaign(db, merchantId, 'Campaign A');
            const campaignB = createTestCampaign(db, merchantId, 'Campaign B');
            const campaignC = createTestCampaign(db, merchantId, 'Campaign C');
            
            const now = new Date();
            
            // User 0: A -> B (branch 1)
            service.addUserEvent(projectId, uniqueEmails[0], campaignA, now);
            service.addUserEvent(projectId, uniqueEmails[0], campaignB, now);
            
            // User 1: A -> C (branch 2)
            service.addUserEvent(projectId, uniqueEmails[1], campaignA, now);
            service.addUserEvent(projectId, uniqueEmails[1], campaignC, now);
            
            // Build path edges
            service.buildPathEdgesFromEvents(projectId);
            
            // Get edges
            const edges = service.getProjectPathEdges(projectId);
            
            // Should have 2 edges: A->B and A->C
            expect(edges.length).toBe(2);
            
            // A->B should have 1 user
            const abEdge = edges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignB);
            expect(abEdge).toBeDefined();
            expect(abEdge!.userCount).toBe(1);
            
            // A->C should have 1 user
            const acEdge = edges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignC);
            expect(acEdge).toBeDefined();
            expect(acEdge!.userCount).toBe(1);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


/**
 * Additional Property Tests for Path Analysis
 */

describe('ProjectPathAnalysisService - Analysis Properties', () => {
  /**
   * **Feature: path-analysis-project-isolation, Property 3: New User First Root Consistency**
   * **Validates: Requirements 3.1, 3.4, 6.4, 7.4**
   * 
   * For any new user in project_new_users, their first_root_campaign_id should match
   * the campaign_id of their seq=1 event in project_user_events.
   */
  describe('Property 3: New User First Root Consistency', () => {
    it('should ensure first_root_campaign_id matches seq=1 event campaign_id', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 1, maxLength: 10 }),
          fc.array(subjectArb, { minLength: 2, maxLength: 5 }),
          async (emails, subjects) => {
            // Ensure unique emails and subjects
            const uniqueEmails = [...new Set(emails)];
            const uniqueSubjects = [...new Set(subjects)];
            if (uniqueEmails.length === 0 || uniqueSubjects.length < 2) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns (first one will be Root)
            const campaigns: string[] = [];
            for (const subject of uniqueSubjects) {
              campaigns.push(createTestCampaign(db, merchantId, subject));
            }
            
            const rootCampaignId = campaigns[0];
            const now = new Date();
            
            // Simulate analysis: add new users with their first Root campaign
            for (const email of uniqueEmails) {
              // Add new user with first Root campaign
              service.addProjectNewUser(projectId, email, rootCampaignId);
              
              // Add seq=1 event for the Root campaign
              service.addUserEvent(projectId, email, rootCampaignId, now);
              
              // Add subsequent events for other campaigns
              for (let i = 1; i < campaigns.length; i++) {
                service.addUserEvent(projectId, email, campaigns[i], new Date(now.getTime() + i * 1000));
              }
            }
            
            // Verify Property 3: first_root_campaign_id matches seq=1 event
            const newUsers = service.getProjectNewUsers(projectId);
            
            for (const user of newUsers) {
              const events = service.getUserEvents(projectId, user.recipient);
              
              // Find seq=1 event
              const seq1Event = events.find(e => e.seq === 1);
              
              // Property assertion: first_root_campaign_id should match seq=1 event's campaign_id
              expect(seq1Event).toBeDefined();
              expect(user.firstRootCampaignId).toBe(seq1Event!.campaignId);
            }
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain consistency when users receive multiple Root campaigns', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          fc.array(subjectArb, { minLength: 2, maxLength: 4 }),
          async (email, subjects) => {
            const uniqueSubjects = [...new Set(subjects)];
            if (uniqueSubjects.length < 2) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create multiple Root campaigns
            const rootCampaigns: string[] = [];
            for (const subject of uniqueSubjects) {
              rootCampaigns.push(createTestCampaign(db, merchantId, `Root: ${subject}`));
            }
            
            // First Root campaign is the one that makes this user a "new user"
            const firstRootCampaignId = rootCampaigns[0];
            const now = new Date();
            
            // Add new user with first Root campaign
            service.addProjectNewUser(projectId, email, firstRootCampaignId);
            
            // Add seq=1 event for first Root
            service.addUserEvent(projectId, email, firstRootCampaignId, now);
            
            // Add events for other Root campaigns (user receives multiple Root emails)
            for (let i = 1; i < rootCampaigns.length; i++) {
              service.addUserEvent(projectId, email, rootCampaigns[i], new Date(now.getTime() + i * 1000));
            }
            
            // Verify consistency
            const newUsers = service.getProjectNewUsers(projectId);
            expect(newUsers.length).toBe(1);
            
            const user = newUsers[0];
            const events = service.getUserEvents(projectId, email);
            const seq1Event = events.find(e => e.seq === 1);
            
            // Property: first_root_campaign_id should still match seq=1 event
            expect(seq1Event).toBeDefined();
            expect(user.firstRootCampaignId).toBe(seq1Event!.campaignId);
            expect(user.firstRootCampaignId).toBe(firstRootCampaignId);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle different users with different first Root campaigns', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 2, maxLength: 5 }),
          fc.array(subjectArb, { minLength: 2, maxLength: 3 }),
          async (emails, subjects) => {
            const uniqueEmails = [...new Set(emails)];
            const uniqueSubjects = [...new Set(subjects)];
            if (uniqueEmails.length < 2 || uniqueSubjects.length < 2) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create Root campaigns
            const rootCampaigns: string[] = [];
            for (const subject of uniqueSubjects) {
              rootCampaigns.push(createTestCampaign(db, merchantId, subject));
            }
            
            const now = new Date();
            
            // Each user gets a different first Root campaign (cycling through available campaigns)
            for (let i = 0; i < uniqueEmails.length; i++) {
              const email = uniqueEmails[i];
              const firstRootCampaignId = rootCampaigns[i % rootCampaigns.length];
              
              // Add new user
              service.addProjectNewUser(projectId, email, firstRootCampaignId);
              
              // Add seq=1 event
              service.addUserEvent(projectId, email, firstRootCampaignId, now);
            }
            
            // Verify each user's first_root_campaign_id matches their seq=1 event
            const newUsers = service.getProjectNewUsers(projectId);
            
            for (const user of newUsers) {
              const events = service.getUserEvents(projectId, user.recipient);
              const seq1Event = events.find(e => e.seq === 1);
              
              expect(seq1Event).toBeDefined();
              expect(user.firstRootCampaignId).toBe(seq1Event!.campaignId);
            }
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ============================================
// Extended Test Service for Analysis Testing
// ============================================

/**
 * Extended test service that includes analysis methods for testing
 */
class TestProjectPathAnalysisServiceWithAnalysis extends TestProjectPathAnalysisService {
  constructor(db: SqlJsDatabase) {
    super(db);
  }

  /**
   * Get project info
   */
  getProjectInfo(projectId: string): { merchantId: string; workerNames: string[] } | null {
    const result = this.db.exec(
      `SELECT merchant_id, worker_name, worker_names FROM analysis_projects WHERE id = ?`,
      [projectId]
    );
    
    if (result.length === 0 || result[0].values.length === 0) return null;
    
    const row = result[0].values[0];
    let workerNames: string[] = [row[1] as string];
    if (row[2]) {
      try {
        workerNames = JSON.parse(row[2] as string);
      } catch {
        // Fallback
      }
    }
    
    return {
      merchantId: row[0] as string,
      workerNames,
    };
  }

  /**
   * Get last analysis time
   */
  getLastAnalysisTime(projectId: string): Date | null {
    const result = this.db.exec(
      `SELECT last_analysis_time FROM analysis_projects WHERE id = ?`,
      [projectId]
    );
    
    if (result.length === 0 || result[0].values.length === 0) return null;
    const time = result[0].values[0][0] as string | null;
    return time ? new Date(time) : null;
  }

  /**
   * Update last analysis time
   */
  updateLastAnalysisTime(projectId: string, time: Date): void {
    this.db.run(
      `UPDATE analysis_projects SET last_analysis_time = ? WHERE id = ?`,
      [time.toISOString(), projectId]
    );
  }

  /**
   * Get Root campaign emails
   */
  getRootCampaignEmails(
    merchantId: string,
    rootCampaignIds: string[],
    workerNames: string[]
  ): Array<{ campaign_id: string; recipient: string; received_at: string }> {
    if (rootCampaignIds.length === 0) return [];
    
    const result = this.db.exec(
      `SELECT ce.campaign_id, ce.recipient, ce.received_at
       FROM campaign_emails ce
       JOIN campaigns c ON ce.campaign_id = c.id
       WHERE c.merchant_id = '${merchantId}'
         AND ce.campaign_id IN (${rootCampaignIds.map(id => `'${id}'`).join(',')})
         AND ce.worker_name IN (${workerNames.map(w => `'${w}'`).join(',')})
       ORDER BY ce.received_at ASC`
    );
    
    if (result.length === 0) return [];
    
    return result[0].values.map(row => ({
      campaign_id: row[0] as string,
      recipient: row[1] as string,
      received_at: row[2] as string,
    }));
  }

  /**
   * Get all campaign emails
   */
  getAllCampaignEmails(
    merchantId: string,
    workerNames: string[]
  ): Array<{ campaign_id: string; recipient: string; received_at: string }> {
    const result = this.db.exec(
      `SELECT ce.campaign_id, ce.recipient, ce.received_at
       FROM campaign_emails ce
       JOIN campaigns c ON ce.campaign_id = c.id
       WHERE c.merchant_id = '${merchantId}'
         AND ce.worker_name IN (${workerNames.map(w => `'${w}'`).join(',')})
       ORDER BY ce.received_at ASC`
    );
    
    if (result.length === 0) return [];
    
    return result[0].values.map(row => ({
      campaign_id: row[0] as string,
      recipient: row[1] as string,
      received_at: row[2] as string,
    }));
  }

  /**
   * Get campaign emails since a time
   */
  getCampaignEmailsSince(
    merchantId: string,
    workerNames: string[],
    since: Date
  ): Array<{ campaign_id: string; recipient: string; received_at: string }> {
    const result = this.db.exec(
      `SELECT ce.campaign_id, ce.recipient, ce.received_at
       FROM campaign_emails ce
       JOIN campaigns c ON ce.campaign_id = c.id
       WHERE c.merchant_id = '${merchantId}'
         AND ce.worker_name IN (${workerNames.map(w => `'${w}'`).join(',')})
         AND ce.received_at > '${since.toISOString()}'
       ORDER BY ce.received_at ASC`
    );
    
    if (result.length === 0) return [];
    
    return result[0].values.map(row => ({
      campaign_id: row[0] as string,
      recipient: row[1] as string,
      received_at: row[2] as string,
    }));
  }

  /**
   * Clear project analysis data
   */
  clearProjectAnalysisData(projectId: string): void {
    this.db.run(`DELETE FROM project_path_edges WHERE project_id = ?`, [projectId]);
    this.db.run(`DELETE FROM project_user_events WHERE project_id = ?`, [projectId]);
    this.db.run(`DELETE FROM project_new_users WHERE project_id = ?`, [projectId]);
  }

  /**
   * Run full analysis (simplified for testing)
   */
  runFullAnalysis(projectId: string): { newUsersAdded: number; eventsCreated: number; edgesUpdated: number } {
    let newUsersAdded = 0;
    let eventsCreated = 0;

    const projectInfo = this.getProjectInfo(projectId);
    if (!projectInfo) throw new Error('Project not found');

    const rootCampaigns = this.getProjectRootCampaigns(projectId).filter(rc => rc.isConfirmed);
    if (rootCampaigns.length === 0) {
      this.updateLastAnalysisTime(projectId, new Date());
      return { newUsersAdded: 0, eventsCreated: 0, edgesUpdated: 0 };
    }

    const rootCampaignIds = rootCampaigns.map(rc => rc.campaignId);
    
    // Clear existing data
    this.clearProjectAnalysisData(projectId);

    // Get Root emails
    const rootEmails = this.getRootCampaignEmails(projectInfo.merchantId, rootCampaignIds, projectInfo.workerNames);
    
    // Find first Root for each recipient
    const recipientFirstRoot = new Map<string, { campaignId: string; receivedAt: Date }>();
    for (const email of rootEmails) {
      const existing = recipientFirstRoot.get(email.recipient);
      const receivedAt = new Date(email.received_at);
      if (!existing || receivedAt < existing.receivedAt) {
        recipientFirstRoot.set(email.recipient, { campaignId: email.campaign_id, receivedAt });
      }
    }

    // Add new users and seq=1 events
    for (const [recipient, firstRoot] of recipientFirstRoot) {
      this.addProjectNewUser(projectId, recipient, firstRoot.campaignId);
      newUsersAdded++;
      this.addUserEvent(projectId, recipient, firstRoot.campaignId, firstRoot.receivedAt);
      eventsCreated++;
    }

    // Get all emails and add events
    const newUserRecipients = new Set(recipientFirstRoot.keys());
    const allEmails = this.getAllCampaignEmails(projectInfo.merchantId, projectInfo.workerNames);
    
    const newUserEmails = allEmails
      .filter(email => newUserRecipients.has(email.recipient))
      .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());

    for (const email of newUserEmails) {
      if (rootCampaignIds.includes(email.campaign_id)) continue;
      const seq = this.addUserEvent(projectId, email.recipient, email.campaign_id, new Date(email.received_at));
      if (seq > 1) eventsCreated++;
    }

    // Build path edges
    this.buildPathEdgesFromEvents(projectId);
    const edges = this.getProjectPathEdges(projectId);

    this.updateLastAnalysisTime(projectId, new Date());

    return { newUsersAdded, eventsCreated, edgesUpdated: edges.length };
  }

  /**
   * Run incremental analysis (simplified for testing)
   */
  runIncrementalAnalysis(projectId: string, lastAnalysisTime: Date): { newUsersAdded: number; eventsCreated: number; edgesUpdated: number } {
    let newUsersAdded = 0;
    let eventsCreated = 0;

    const projectInfo = this.getProjectInfo(projectId);
    if (!projectInfo) throw new Error('Project not found');

    const rootCampaigns = this.getProjectRootCampaigns(projectId).filter(rc => rc.isConfirmed);
    if (rootCampaigns.length === 0) {
      this.updateLastAnalysisTime(projectId, new Date());
      return { newUsersAdded: 0, eventsCreated: 0, edgesUpdated: 0 };
    }

    const rootCampaignIds = rootCampaigns.map(rc => rc.campaignId);
    const existingNewUsers = this.getProjectNewUsers(projectId);
    const existingRecipients = new Set(existingNewUsers.map(u => u.recipient));

    // Get new Root emails since last analysis
    const newRootEmails = this.getRootCampaignEmails(projectInfo.merchantId, rootCampaignIds, projectInfo.workerNames)
      .filter(e => new Date(e.received_at) > lastAnalysisTime);

    // Find new users
    const newRecipientFirstRoot = new Map<string, { campaignId: string; receivedAt: Date }>();
    for (const email of newRootEmails) {
      if (existingRecipients.has(email.recipient)) continue;
      const existing = newRecipientFirstRoot.get(email.recipient);
      const receivedAt = new Date(email.received_at);
      if (!existing || receivedAt < existing.receivedAt) {
        newRecipientFirstRoot.set(email.recipient, { campaignId: email.campaign_id, receivedAt });
      }
    }

    // Add new users
    for (const [recipient, firstRoot] of newRecipientFirstRoot) {
      this.addProjectNewUser(projectId, recipient, firstRoot.campaignId);
      newUsersAdded++;
      this.addUserEvent(projectId, recipient, firstRoot.campaignId, firstRoot.receivedAt);
      eventsCreated++;
      existingRecipients.add(recipient);
    }

    // Get new emails since last analysis
    const newEmails = this.getCampaignEmailsSince(projectInfo.merchantId, projectInfo.workerNames, lastAnalysisTime);
    const newUserEmails = newEmails
      .filter(email => existingRecipients.has(email.recipient))
      .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());

    for (const email of newUserEmails) {
      const isNewlyAddedUser = newRecipientFirstRoot.has(email.recipient);
      if (isNewlyAddedUser && rootCampaignIds.includes(email.campaign_id)) continue;
      
      const existingEvents = this.getUserEvents(projectId, email.recipient);
      const alreadyExists = existingEvents.some(e => e.campaignId === email.campaign_id);
      if (!alreadyExists) {
        this.addUserEvent(projectId, email.recipient, email.campaign_id, new Date(email.received_at));
        eventsCreated++;
      }
    }

    // Rebuild path edges
    this.buildPathEdgesFromEvents(projectId);
    const edges = this.getProjectPathEdges(projectId);

    this.updateLastAnalysisTime(projectId, new Date());

    return { newUsersAdded, eventsCreated, edgesUpdated: edges.length };
  }
}

// Helper to create campaign email
function createTestCampaignEmail(
  db: SqlJsDatabase,
  campaignId: string,
  recipient: string,
  receivedAt: Date,
  workerName: string = 'test-worker'
): void {
  db.run(
    `INSERT INTO campaign_emails (campaign_id, recipient, received_at, worker_name)
     VALUES (?, ?, ?, ?)`,
    [campaignId, recipient, receivedAt.toISOString(), workerName]
  );
}

describe('ProjectPathAnalysisService - Incremental Analysis Properties', () => {
  /**
   * **Feature: path-analysis-project-isolation, Property 5: Incremental Analysis Correctness**
   * **Validates: Requirements 7.2, 7.3, 7.4, 7.5**
   * 
   * For any incremental analysis, the resulting data should be identical to what
   * a full analysis would produce given the same input data.
   */
  describe('Property 5: Incremental Analysis Correctness', () => {
    it('should produce same results as full analysis for new users', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 2, maxLength: 5 }),
          async (emails) => {
            const uniqueEmails = [...new Set(emails)];
            if (uniqueEmails.length < 2) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const campaign2 = createTestCampaign(db, merchantId, 'Campaign 2');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            // Phase 1: Initial data (first half of users)
            const phase1Users = uniqueEmails.slice(0, Math.ceil(uniqueEmails.length / 2));
            const baseTime = new Date('2025-01-01T00:00:00Z');
            
            for (let i = 0; i < phase1Users.length; i++) {
              const email = phase1Users[i];
              createTestCampaignEmail(db, rootCampaign, email, new Date(baseTime.getTime() + i * 1000));
              createTestCampaignEmail(db, campaign2, email, new Date(baseTime.getTime() + i * 1000 + 500));
            }
            
            // Run full analysis on phase 1 data
            service.runFullAnalysis(projectId);
            const lastAnalysisTime = service.getLastAnalysisTime(projectId)!;
            
            // Phase 2: Add more data (second half of users)
            const phase2Users = uniqueEmails.slice(Math.ceil(uniqueEmails.length / 2));
            const phase2Time = new Date(lastAnalysisTime.getTime() + 1000);
            
            for (let i = 0; i < phase2Users.length; i++) {
              const email = phase2Users[i];
              createTestCampaignEmail(db, rootCampaign, email, new Date(phase2Time.getTime() + i * 1000));
              createTestCampaignEmail(db, campaign2, email, new Date(phase2Time.getTime() + i * 1000 + 500));
            }
            
            // Run incremental analysis
            service.runIncrementalAnalysis(projectId, lastAnalysisTime);
            
            // Capture incremental results
            const incrementalNewUsers = service.getProjectNewUsers(projectId);
            const incrementalEvents = service.getAllProjectEvents(projectId);
            const incrementalEdges = service.getProjectPathEdges(projectId);
            
            // Now run fresh full analysis on all data
            service.clearProjectAnalysisData(projectId);
            service.runFullAnalysis(projectId);
            
            // Capture full analysis results
            const fullNewUsers = service.getProjectNewUsers(projectId);
            const fullEvents = service.getAllProjectEvents(projectId);
            const fullEdges = service.getProjectPathEdges(projectId);
            
            // Compare results
            expect(incrementalNewUsers.length).toBe(fullNewUsers.length);
            expect(incrementalEvents.length).toBe(fullEvents.length);
            expect(incrementalEdges.length).toBe(fullEdges.length);
            
            // Verify same users
            const incrementalUserSet = new Set(incrementalNewUsers.map(u => u.recipient));
            const fullUserSet = new Set(fullNewUsers.map(u => u.recipient));
            expect(incrementalUserSet).toEqual(fullUserSet);
            
            db.close();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should correctly add events for existing users in incremental analysis', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          fc.array(subjectArb, { minLength: 3, maxLength: 5 }),
          async (email, subjects) => {
            const uniqueSubjects = [...new Set(subjects)];
            if (uniqueSubjects.length < 3) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns
            const campaigns: string[] = [];
            for (const subject of uniqueSubjects) {
              campaigns.push(createTestCampaign(db, merchantId, subject));
            }
            
            const rootCampaign = campaigns[0];
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            // Phase 1: User receives Root and first campaign
            const baseTime = new Date('2025-01-01T00:00:00Z');
            createTestCampaignEmail(db, rootCampaign, email, baseTime);
            createTestCampaignEmail(db, campaigns[1], email, new Date(baseTime.getTime() + 1000));
            
            // Run full analysis
            service.runFullAnalysis(projectId);
            const lastAnalysisTime = service.getLastAnalysisTime(projectId)!;
            
            // Phase 2: User receives more campaigns
            const phase2Time = new Date(lastAnalysisTime.getTime() + 1000);
            for (let i = 2; i < campaigns.length; i++) {
              createTestCampaignEmail(db, campaigns[i], email, new Date(phase2Time.getTime() + i * 1000));
            }
            
            // Run incremental analysis
            service.runIncrementalAnalysis(projectId, lastAnalysisTime);
            
            // Verify events
            const events = service.getUserEvents(projectId, email);
            
            // Should have events for all campaigns
            expect(events.length).toBe(campaigns.length);
            
            // Verify seq numbers are consecutive
            for (let i = 0; i < events.length; i++) {
              expect(events[i].seq).toBe(i + 1);
            }
            
            db.close();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should maintain path edge accuracy after incremental analysis', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 2, maxLength: 4 }),
          async (emails) => {
            const uniqueEmails = [...new Set(emails)];
            if (uniqueEmails.length < 2) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns: A -> B -> C
            const campaignA = createTestCampaign(db, merchantId, 'Campaign A');
            const campaignB = createTestCampaign(db, merchantId, 'Campaign B');
            const campaignC = createTestCampaign(db, merchantId, 'Campaign C');
            
            service.setProjectRootCampaign(projectId, campaignA, true);
            
            // Phase 1: First user goes A -> B
            const baseTime = new Date('2025-01-01T00:00:00Z');
            createTestCampaignEmail(db, campaignA, uniqueEmails[0], baseTime);
            createTestCampaignEmail(db, campaignB, uniqueEmails[0], new Date(baseTime.getTime() + 1000));
            
            service.runFullAnalysis(projectId);
            const lastAnalysisTime = service.getLastAnalysisTime(projectId)!;
            
            // Phase 2: Second user goes A -> B -> C
            const phase2Time = new Date(lastAnalysisTime.getTime() + 1000);
            createTestCampaignEmail(db, campaignA, uniqueEmails[1], phase2Time);
            createTestCampaignEmail(db, campaignB, uniqueEmails[1], new Date(phase2Time.getTime() + 1000));
            createTestCampaignEmail(db, campaignC, uniqueEmails[1], new Date(phase2Time.getTime() + 2000));
            
            service.runIncrementalAnalysis(projectId, lastAnalysisTime);
            
            // Verify edges
            const edges = service.getProjectPathEdges(projectId);
            
            // A->B should have 2 users
            const abEdge = edges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignB);
            expect(abEdge).toBeDefined();
            expect(abEdge!.userCount).toBe(2);
            
            // B->C should have 1 user
            const bcEdge = edges.find(e => e.fromCampaignId === campaignB && e.toCampaignId === campaignC);
            expect(bcEdge).toBeDefined();
            expect(bcEdge!.userCount).toBe(1);
            
            db.close();
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});


describe('ProjectPathAnalysisService - Analysis Time Properties', () => {
  /**
   * **Feature: path-analysis-project-isolation, Property 6: Last Analysis Time Update**
   * **Validates: Requirements 6.7, 7.6**
   * 
   * For any completed analysis (full or incremental), the project's last_analysis_time
   * should be updated to a timestamp >= the analysis start time.
   */
  describe('Property 6: Last Analysis Time Update', () => {
    it('should update last_analysis_time after full analysis', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          subjectArb,
          async (email, subject) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create and set Root campaign
            const rootCampaign = createTestCampaign(db, merchantId, subject);
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            // Add email data
            const baseTime = new Date('2025-01-01T00:00:00Z');
            createTestCampaignEmail(db, rootCampaign, email, baseTime);
            
            // Verify no last_analysis_time before analysis
            const beforeTime = service.getLastAnalysisTime(projectId);
            expect(beforeTime).toBeNull();
            
            // Record time before analysis
            const analysisStartTime = new Date();
            
            // Run full analysis
            service.runFullAnalysis(projectId);
            
            // Verify last_analysis_time is updated
            const afterTime = service.getLastAnalysisTime(projectId);
            expect(afterTime).not.toBeNull();
            expect(afterTime!.getTime()).toBeGreaterThanOrEqual(analysisStartTime.getTime());
            
            db.close();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should update last_analysis_time after incremental analysis', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          subjectArb,
          async (email, subject) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create and set Root campaign
            const rootCampaign = createTestCampaign(db, merchantId, subject);
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            // Add initial email data
            const baseTime = new Date('2025-01-01T00:00:00Z');
            createTestCampaignEmail(db, rootCampaign, email, baseTime);
            
            // Run full analysis first
            service.runFullAnalysis(projectId);
            const firstAnalysisTime = service.getLastAnalysisTime(projectId)!;
            
            // Add more data after first analysis
            const newEmail = `new_${email}`;
            const newTime = new Date(firstAnalysisTime.getTime() + 1000);
            createTestCampaignEmail(db, rootCampaign, newEmail, newTime);
            
            // Record time before incremental analysis
            const incrementalStartTime = new Date();
            
            // Run incremental analysis
            service.runIncrementalAnalysis(projectId, firstAnalysisTime);
            
            // Verify last_analysis_time is updated
            const afterIncrementalTime = service.getLastAnalysisTime(projectId);
            expect(afterIncrementalTime).not.toBeNull();
            expect(afterIncrementalTime!.getTime()).toBeGreaterThanOrEqual(incrementalStartTime.getTime());
            // The time should be >= first analysis time (can be equal if analysis runs within same millisecond)
            expect(afterIncrementalTime!.getTime()).toBeGreaterThanOrEqual(firstAnalysisTime.getTime());
            
            db.close();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should update last_analysis_time even when no new data is found', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          subjectArb,
          async (email, subject) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create and set Root campaign
            const rootCampaign = createTestCampaign(db, merchantId, subject);
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            // Add email data
            const baseTime = new Date('2025-01-01T00:00:00Z');
            createTestCampaignEmail(db, rootCampaign, email, baseTime);
            
            // Run full analysis
            service.runFullAnalysis(projectId);
            const firstAnalysisTime = service.getLastAnalysisTime(projectId)!;
            
            // Run incremental analysis without adding new data
            const incrementalStartTime = new Date();
            service.runIncrementalAnalysis(projectId, firstAnalysisTime);
            
            // Verify last_analysis_time is still updated
            const afterIncrementalTime = service.getLastAnalysisTime(projectId);
            expect(afterIncrementalTime).not.toBeNull();
            expect(afterIncrementalTime!.getTime()).toBeGreaterThanOrEqual(incrementalStartTime.getTime());
            
            db.close();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should update last_analysis_time for projects with no Root campaigns', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null), // No specific input needed
          async () => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // No Root campaigns set
            
            // Verify no last_analysis_time before analysis
            const beforeTime = service.getLastAnalysisTime(projectId);
            expect(beforeTime).toBeNull();
            
            // Record time before analysis
            const analysisStartTime = new Date();
            
            // Run full analysis (should complete quickly with no Root campaigns)
            service.runFullAnalysis(projectId);
            
            // Verify last_analysis_time is still updated
            const afterTime = service.getLastAnalysisTime(projectId);
            expect(afterTime).not.toBeNull();
            expect(afterTime!.getTime()).toBeGreaterThanOrEqual(analysisStartTime.getTime());
            
            db.close();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * **Feature: path-analysis-project-isolation, Property: Project Deletion Cascade**
   * **Validates: Requirements 1.4**
   * 
   * When a project is deleted, all project-level data should be automatically deleted
   * via database cascade delete.
   */
  describe('Project Deletion Cascade (Requirement 1.4)', () => {
    it('should cascade delete all project data when project is deleted', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          subjectArb,
          async (email, subject) => {
            const db = new SQL.Database();
            db.run('PRAGMA foreign_keys = ON');
            
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            // Create test data
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            const campaignId = createTestCampaign(db, merchantId, subject);
            
            // Add data to all project-level tables
            service.setProjectRootCampaign(projectId, campaignId, true);
            service.addProjectNewUser(projectId, email, campaignId);
            service.addUserEvent(projectId, email, campaignId, new Date());
            service.updatePathEdge(projectId, campaignId, campaignId, 1);
            
            // Verify data exists
            expect(countProjectRecords(db, 'project_root_campaigns', projectId)).toBe(1);
            expect(countProjectRecords(db, 'project_new_users', projectId)).toBe(1);
            expect(countProjectRecords(db, 'project_user_events', projectId)).toBe(1);
            expect(countProjectRecords(db, 'project_path_edges', projectId)).toBe(1);
            
            // Delete the project
            deleteTestProject(db, projectId);
            
            // Verify all project data is deleted via cascade
            expect(countProjectRecords(db, 'project_root_campaigns', projectId)).toBe(0);
            expect(countProjectRecords(db, 'project_new_users', projectId)).toBe(0);
            expect(countProjectRecords(db, 'project_user_events', projectId)).toBe(0);
            expect(countProjectRecords(db, 'project_path_edges', projectId)).toBe(0);
            
            db.close();
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should not affect other projects when one project is deleted', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          emailArb,
          subjectArb,
          async (email1, email2, subject) => {
            const db = new SQL.Database();
            db.run('PRAGMA foreign_keys = ON');
            
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            // Create test data for two projects
            const merchantId = createTestMerchant(db, 'test.com');
            const projectA = createTestProject(db, merchantId, 'Project A');
            const projectB = createTestProject(db, merchantId, 'Project B');
            const campaignId = createTestCampaign(db, merchantId, subject);
            
            // Add data to both projects
            service.setProjectRootCampaign(projectA, campaignId, true);
            service.addProjectNewUser(projectA, email1, campaignId);
            service.addUserEvent(projectA, email1, campaignId, new Date());
            
            service.setProjectRootCampaign(projectB, campaignId, true);
            service.addProjectNewUser(projectB, email2, campaignId);
            service.addUserEvent(projectB, email2, campaignId, new Date());
            
            // Verify both projects have data
            expect(countProjectRecords(db, 'project_root_campaigns', projectA)).toBe(1);
            expect(countProjectRecords(db, 'project_root_campaigns', projectB)).toBe(1);
            
            // Delete project A
            deleteTestProject(db, projectA);
            
            // Verify project A data is deleted
            expect(countProjectRecords(db, 'project_root_campaigns', projectA)).toBe(0);
            expect(countProjectRecords(db, 'project_new_users', projectA)).toBe(0);
            expect(countProjectRecords(db, 'project_user_events', projectA)).toBe(0);
            
            // Verify project B data is NOT affected
            expect(countProjectRecords(db, 'project_root_campaigns', projectB)).toBe(1);
            expect(countProjectRecords(db, 'project_new_users', projectB)).toBe(1);
            expect(countProjectRecords(db, 'project_user_events', projectB)).toBe(1);
            
            db.close();
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
