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
  ): { seq: number; isNew: boolean } {
    // Check if exists
    const existing = this.db.exec(
      `SELECT seq FROM project_user_events WHERE project_id = ? AND recipient = ? AND campaign_id = ?`,
      [projectId, recipient, campaignId]
    );
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      return { seq: existing[0].values[0][0] as number, isNew: false };
    }
    
    // Calculate the correct seq based on received_at time order
    // Count how many events this user has with received_at <= this event's received_at
    const seqResult = this.db.exec(
      `SELECT COUNT(*) as count FROM project_user_events
       WHERE project_id = ? AND recipient = ? AND received_at <= ?`,
      [projectId, recipient, receivedAt.toISOString()]
    );
    const newSeq = (seqResult.length > 0 && seqResult[0].values.length > 0 
      ? (seqResult[0].values[0][0] as number) 
      : 0) + 1;
    
    // Shift existing events with later received_at
    this.db.run(
      `UPDATE project_user_events
       SET seq = seq + 1
       WHERE project_id = ? AND recipient = ? AND received_at > ?`,
      [projectId, recipient, receivedAt.toISOString()]
    );
    
    this.db.run(
      `INSERT INTO project_user_events (project_id, recipient, campaign_id, seq, received_at)
       VALUES (?, ?, ?, ?, ?)`,
      [projectId, recipient, campaignId, newSeq, receivedAt.toISOString()]
    );
    
    return { seq: newSeq, isNew: true };
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

  // ========== Event Sequence Validation ==========

  validateEventSequence(projectId: string): {
    isValid: boolean;
    totalUsers: number;
    usersWithIssues: number;
    issues: Array<{
      recipient: string;
      issueType: 'gap' | 'order' | 'duplicate';
      details: string;
    }>;
  } {
    const issues: Array<{
      recipient: string;
      issueType: 'gap' | 'order' | 'duplicate';
      details: string;
    }> = [];
    
    // Get all distinct recipients for this project
    const recipientsResult = this.db.exec(
      `SELECT DISTINCT recipient FROM project_user_events WHERE project_id = ?`,
      [projectId]
    );
    
    const recipients: string[] = [];
    if (recipientsResult.length > 0) {
      for (const row of recipientsResult[0].values) {
        recipients.push(row[0] as string);
      }
    }
    
    const totalUsers = recipients.length;
    const usersWithIssuesSet = new Set<string>();
    
    for (const recipient of recipients) {
      // Get all events for this user ordered by seq
      const events = this.getUserEvents(projectId, recipient);
      
      if (events.length === 0) continue;
      
      // Check 1: seq numbers should start from 1 and be consecutive
      for (let i = 0; i < events.length; i++) {
        const expectedSeq = i + 1;
        if (events[i].seq !== expectedSeq) {
          usersWithIssuesSet.add(recipient);
          if (events[i].seq > expectedSeq) {
            issues.push({
              recipient,
              issueType: 'gap',
              details: `Gap in seq: expected ${expectedSeq}, got ${events[i].seq}`,
            });
          } else {
            issues.push({
              recipient,
              issueType: 'duplicate',
              details: `Duplicate or out-of-order seq: expected ${expectedSeq}, got ${events[i].seq}`,
            });
          }
          break;
        }
      }
      
      // Check 2: seq order should match received_at time order
      for (let i = 0; i < events.length - 1; i++) {
        const currentTime = events[i].receivedAt.getTime();
        const nextTime = events[i + 1].receivedAt.getTime();
        
        if (currentTime > nextTime) {
          usersWithIssuesSet.add(recipient);
          issues.push({
            recipient,
            issueType: 'order',
            details: `Time order mismatch: seq ${events[i].seq} (${events[i].receivedAt.toISOString()}) > seq ${events[i + 1].seq} (${events[i + 1].receivedAt.toISOString()})`,
          });
          break;
        }
      }
    }
    
    return {
      isValid: issues.length === 0,
      totalUsers,
      usersWithIssues: usersWithIssuesSet.size,
      issues,
    };
  }

  fixEventSequence(projectId: string): {
    usersFixed: number;
    eventsReordered: number;
    pathEdgesRebuilt: boolean;
  } {
    let usersFixed = 0;
    let eventsReordered = 0;
    
    // Get all distinct recipients for this project
    const recipientsResult = this.db.exec(
      `SELECT DISTINCT recipient FROM project_user_events WHERE project_id = ?`,
      [projectId]
    );
    
    const recipients: string[] = [];
    if (recipientsResult.length > 0) {
      for (const row of recipientsResult[0].values) {
        recipients.push(row[0] as string);
      }
    }
    
    for (const recipient of recipients) {
      // Get all events for this user ordered by received_at time
      const eventsResult = this.db.exec(
        `SELECT id, campaign_id, seq, received_at
         FROM project_user_events
         WHERE project_id = ? AND recipient = ?
         ORDER BY received_at ASC, id ASC`,
        [projectId, recipient]
      );
      
      if (eventsResult.length === 0 || eventsResult[0].values.length === 0) continue;
      
      const events = eventsResult[0].values.map(row => ({
        id: row[0] as number,
        campaignId: row[1] as string,
        seq: row[2] as number,
        receivedAt: row[3] as string,
      }));
      
      let userNeedsFixing = false;
      
      // Check if this user needs fixing
      for (let i = 0; i < events.length; i++) {
        const expectedSeq = i + 1;
        if (events[i].seq !== expectedSeq) {
          userNeedsFixing = true;
          break;
        }
      }
      
      if (userNeedsFixing) {
        usersFixed++;
        
        // Update seq numbers based on time order
        for (let i = 0; i < events.length; i++) {
          const newSeq = i + 1;
          if (events[i].seq !== newSeq) {
            this.db.run(
              `UPDATE project_user_events SET seq = ? WHERE id = ?`,
              [newSeq, events[i].id]
            );
            eventsReordered++;
          }
        }
      }
    }
    
    // Rebuild path edges if any fixes were made
    let pathEdgesRebuilt = false;
    if (usersFixed > 0) {
      this.buildPathEdgesFromEvents(projectId);
      pathEdgesRebuilt = true;
    }
    
    return {
      usersFixed,
      eventsReordered,
      pathEdgesRebuilt,
    };
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
              const result = service.addUserEvent(projectId, email, campaigns[i], now);
              // Each new event should get seq = i + 1
              expect(result.seq).toBe(i + 1);
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
            const result1 = service.addUserEvent(projectId, email, campaign, now);
            const result2 = service.addUserEvent(projectId, email, campaign, now);
            const result3 = service.addUserEvent(projectId, email, campaign, now);
            
            // All should return the same seq (no duplicates)
            expect(result1.seq).toBe(1);
            expect(result1.isNew).toBe(true);
            expect(result2.seq).toBe(1);
            expect(result2.isNew).toBe(false);
            expect(result3.seq).toBe(1);
            expect(result3.isNew).toBe(false);
            
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
   * **Feature: path-analysis-seq-fix, Property 16: Event Insertion Correctness**
   * **Validates: Requirements 1.2, 3.1, 3.2**
   * 
   * For any new event added to a user's event stream, if its received_at time is earlier
   * than existing events, the new event should be inserted at the correct position and
   * all subsequent events should have their seq numbers incremented by 1.
   */
  describe('Property 16: Event Insertion Correctness', () => {
    it('should insert events at correct position based on received_at time', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          fc.integer({ min: 2, max: 10 }), // Number of campaigns
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
            
            const baseTime = new Date('2024-01-01T00:00:00Z');
            
            // Add events in REVERSE time order (latest first)
            // This tests that seq is calculated based on received_at, not insertion order
            for (let i = numCampaigns - 1; i >= 0; i--) {
              const receivedAt = new Date(baseTime.getTime() + i * 60000); // i minutes after base
              service.addUserEvent(projectId, email, campaigns[i], receivedAt);
            }
            
            // Verify events are ordered by received_at time
            const events = service.getUserEvents(projectId, email);
            expect(events.length).toBe(numCampaigns);
            
            // Events should be in time order (seq 1 = earliest, seq n = latest)
            for (let i = 0; i < events.length; i++) {
              expect(events[i].seq).toBe(i + 1);
              expect(events[i].campaignId).toBe(campaigns[i]);
            }
            
            // Verify time order matches seq order
            for (let i = 0; i < events.length - 1; i++) {
              expect(events[i].receivedAt.getTime()).toBeLessThanOrEqual(events[i + 1].receivedAt.getTime());
            }
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should shift subsequent seq numbers when inserting earlier event', async () => {
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
            
            // Create 3 campaigns
            const campaignA = createTestCampaign(db, merchantId, 'Campaign A');
            const campaignB = createTestCampaign(db, merchantId, 'Campaign B');
            const campaignC = createTestCampaign(db, merchantId, 'Campaign C');
            
            const time1 = new Date('2024-01-01T10:00:00Z');
            const time2 = new Date('2024-01-01T12:00:00Z');
            const time3 = new Date('2024-01-01T11:00:00Z'); // Between time1 and time2
            
            // Add events: A at time1, B at time2
            service.addUserEvent(projectId, email, campaignA, time1);
            service.addUserEvent(projectId, email, campaignB, time2);
            
            // Verify initial state: A=seq1, B=seq2
            let events = service.getUserEvents(projectId, email);
            expect(events.length).toBe(2);
            expect(events[0].campaignId).toBe(campaignA);
            expect(events[0].seq).toBe(1);
            expect(events[1].campaignId).toBe(campaignB);
            expect(events[1].seq).toBe(2);
            
            // Insert C at time3 (between A and B)
            const result = service.addUserEvent(projectId, email, campaignC, time3);
            expect(result.seq).toBe(2); // C should get seq=2
            expect(result.isNew).toBe(true);
            
            // Verify final state: A=seq1, C=seq2, B=seq3
            events = service.getUserEvents(projectId, email);
            expect(events.length).toBe(3);
            expect(events[0].campaignId).toBe(campaignA);
            expect(events[0].seq).toBe(1);
            expect(events[1].campaignId).toBe(campaignC);
            expect(events[1].seq).toBe(2);
            expect(events[2].campaignId).toBe(campaignB);
            expect(events[2].seq).toBe(3);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should insert event at beginning when received_at is earliest', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          fc.integer({ min: 2, max: 5 }),
          async (email, numExistingEvents) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns
            const campaigns: string[] = [];
            for (let i = 0; i <= numExistingEvents; i++) {
              campaigns.push(createTestCampaign(db, merchantId, `Campaign ${i}`));
            }
            
            const baseTime = new Date('2024-01-01T10:00:00Z');
            
            // Add existing events (campaigns 1 to n) with times starting from baseTime
            for (let i = 1; i <= numExistingEvents; i++) {
              const receivedAt = new Date(baseTime.getTime() + i * 60000);
              service.addUserEvent(projectId, email, campaigns[i], receivedAt);
            }
            
            // Verify existing events
            let events = service.getUserEvents(projectId, email);
            expect(events.length).toBe(numExistingEvents);
            
            // Insert campaign 0 with earliest time (before baseTime)
            const earliestTime = new Date(baseTime.getTime() - 60000);
            const result = service.addUserEvent(projectId, email, campaigns[0], earliestTime);
            expect(result.seq).toBe(1); // Should be inserted at seq=1
            expect(result.isNew).toBe(true);
            
            // Verify all events shifted correctly
            events = service.getUserEvents(projectId, email);
            expect(events.length).toBe(numExistingEvents + 1);
            expect(events[0].campaignId).toBe(campaigns[0]);
            expect(events[0].seq).toBe(1);
            
            // All other events should have seq incremented by 1
            for (let i = 1; i <= numExistingEvents; i++) {
              expect(events[i].campaignId).toBe(campaigns[i]);
              expect(events[i].seq).toBe(i + 1);
            }
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain seq-time consistency after multiple out-of-order insertions', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 3, maxLength: 10 }),
          async (email, timeOffsets) => {
            // Ensure unique time offsets to avoid same-time conflicts
            const uniqueOffsets = [...new Set(timeOffsets)];
            if (uniqueOffsets.length < 3) return; // Skip if not enough unique offsets
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns for each unique offset
            const campaigns: string[] = [];
            for (let i = 0; i < uniqueOffsets.length; i++) {
              campaigns.push(createTestCampaign(db, merchantId, `Campaign ${i}`));
            }
            
            const baseTime = new Date('2024-01-01T00:00:00Z');
            
            // Add events in the order of timeOffsets (which may be out of time order)
            for (let i = 0; i < uniqueOffsets.length; i++) {
              const receivedAt = new Date(baseTime.getTime() + uniqueOffsets[i] * 60000);
              service.addUserEvent(projectId, email, campaigns[i], receivedAt);
            }
            
            // Get all events
            const events = service.getUserEvents(projectId, email);
            expect(events.length).toBe(uniqueOffsets.length);
            
            // Property: seq numbers should be consecutive starting from 1
            for (let i = 0; i < events.length; i++) {
              expect(events[i].seq).toBe(i + 1);
            }
            
            // Property: events should be sorted by received_at time
            for (let i = 0; i < events.length - 1; i++) {
              expect(events[i].receivedAt.getTime()).toBeLessThanOrEqual(events[i + 1].receivedAt.getTime());
            }
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: path-analysis-seq-fix, Property 15: Seq-Time Consistency**
   * **Validates: Requirements 1.1, 1.4, 2.2, 6.1, 6.2**
   * 
   * For any user in a project, the sequence numbers in their event stream should be
   * consecutive integers starting from 1, and the seq order should match the received_at
   * time order.
   */
  describe('Property 15: Seq-Time Consistency', () => {
    it('should validate that seq numbers are consecutive starting from 1', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 1, maxLength: 5 }),
          fc.integer({ min: 1, max: 5 }), // Number of campaigns per user
          async (emails, numCampaigns) => {
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
            
            // Create campaigns
            const campaigns: string[] = [];
            for (let i = 0; i < numCampaigns; i++) {
              campaigns.push(createTestCampaign(db, merchantId, `Campaign ${i}`));
            }
            
            const baseTime = new Date('2024-01-01T00:00:00Z');
            
            // Add events for each user in time order
            for (const email of uniqueEmails) {
              for (let i = 0; i < numCampaigns; i++) {
                const receivedAt = new Date(baseTime.getTime() + i * 60000);
                service.addUserEvent(projectId, email, campaigns[i], receivedAt);
              }
            }
            
            // Validate event sequence
            const validation = service.validateEventSequence(projectId);
            
            // Property: validation should pass (no issues)
            expect(validation.isValid).toBe(true);
            expect(validation.usersWithIssues).toBe(0);
            expect(validation.issues.length).toBe(0);
            expect(validation.totalUsers).toBe(uniqueEmails.length);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate that seq order matches received_at time order', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 8 }),
          async (email, timeOffsets) => {
            // Ensure unique time offsets
            const uniqueOffsets = [...new Set(timeOffsets)];
            if (uniqueOffsets.length < 2) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns
            const campaigns: string[] = [];
            for (let i = 0; i < uniqueOffsets.length; i++) {
              campaigns.push(createTestCampaign(db, merchantId, `Campaign ${i}`));
            }
            
            const baseTime = new Date('2024-01-01T00:00:00Z');
            
            // Add events in random order (based on timeOffsets order)
            for (let i = 0; i < uniqueOffsets.length; i++) {
              const receivedAt = new Date(baseTime.getTime() + uniqueOffsets[i] * 60000);
              service.addUserEvent(projectId, email, campaigns[i], receivedAt);
            }
            
            // Validate event sequence
            const validation = service.validateEventSequence(projectId);
            
            // Property: validation should pass (seq order matches time order)
            expect(validation.isValid).toBe(true);
            expect(validation.usersWithIssues).toBe(0);
            
            // Also verify directly that events are in time order
            const events = service.getUserEvents(projectId, email);
            for (let i = 0; i < events.length - 1; i++) {
              expect(events[i].receivedAt.getTime()).toBeLessThanOrEqual(events[i + 1].receivedAt.getTime());
            }
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should fix event sequence when seq numbers have gaps', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          fc.integer({ min: 2, max: 5 }),
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
            
            const baseTime = new Date('2024-01-01T00:00:00Z');
            
            // Manually insert events with gaps in seq numbers
            for (let i = 0; i < numCampaigns; i++) {
              const receivedAt = new Date(baseTime.getTime() + i * 60000);
              const gappedSeq = (i + 1) * 2; // seq: 2, 4, 6, ... (gaps)
              db.run(
                `INSERT INTO project_user_events (project_id, recipient, campaign_id, seq, received_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [projectId, email, campaigns[i], gappedSeq, receivedAt.toISOString()]
              );
            }
            
            // Validate should detect gaps
            const validationBefore = service.validateEventSequence(projectId);
            expect(validationBefore.isValid).toBe(false);
            expect(validationBefore.usersWithIssues).toBe(1);
            
            // Fix the sequence
            const fixResult = service.fixEventSequence(projectId);
            expect(fixResult.usersFixed).toBe(1);
            expect(fixResult.eventsReordered).toBeGreaterThan(0);
            
            // Validate should pass after fix
            const validationAfter = service.validateEventSequence(projectId);
            expect(validationAfter.isValid).toBe(true);
            expect(validationAfter.usersWithIssues).toBe(0);
            
            // Verify seq numbers are now consecutive
            const events = service.getUserEvents(projectId, email);
            for (let i = 0; i < events.length; i++) {
              expect(events[i].seq).toBe(i + 1);
            }
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should rebuild path edges after fixing event sequence', async () => {
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
            
            // Create 3 campaigns
            const campaignA = createTestCampaign(db, merchantId, 'Campaign A');
            const campaignB = createTestCampaign(db, merchantId, 'Campaign B');
            const campaignC = createTestCampaign(db, merchantId, 'Campaign C');
            
            const time1 = new Date('2024-01-01T10:00:00Z');
            const time2 = new Date('2024-01-01T11:00:00Z');
            const time3 = new Date('2024-01-01T12:00:00Z');
            
            // Manually insert events with wrong seq order (not matching time order)
            // Time order: A(10:00) -> B(11:00) -> C(12:00)
            // But we insert with seq: A=3, B=1, C=2 (wrong order)
            db.run(
              `INSERT INTO project_user_events (project_id, recipient, campaign_id, seq, received_at)
               VALUES (?, ?, ?, ?, ?)`,
              [projectId, email, campaignA, 3, time1.toISOString()]
            );
            db.run(
              `INSERT INTO project_user_events (project_id, recipient, campaign_id, seq, received_at)
               VALUES (?, ?, ?, ?, ?)`,
              [projectId, email, campaignB, 1, time2.toISOString()]
            );
            db.run(
              `INSERT INTO project_user_events (project_id, recipient, campaign_id, seq, received_at)
               VALUES (?, ?, ?, ?, ?)`,
              [projectId, email, campaignC, 2, time3.toISOString()]
            );
            
            // Fix the sequence
            const fixResult = service.fixEventSequence(projectId);
            expect(fixResult.usersFixed).toBe(1);
            expect(fixResult.pathEdgesRebuilt).toBe(true);
            
            // Verify events are now in correct time order with correct seq
            const events = service.getUserEvents(projectId, email);
            expect(events.length).toBe(3);
            expect(events[0].campaignId).toBe(campaignA);
            expect(events[0].seq).toBe(1);
            expect(events[1].campaignId).toBe(campaignB);
            expect(events[1].seq).toBe(2);
            expect(events[2].campaignId).toBe(campaignC);
            expect(events[2].seq).toBe(3);
            
            // Verify path edges are correct: A->B, B->C
            const edges = service.getProjectPathEdges(projectId);
            expect(edges.length).toBe(2);
            
            const edgeAB = edges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignB);
            const edgeBC = edges.find(e => e.fromCampaignId === campaignB && e.toCampaignId === campaignC);
            
            expect(edgeAB).toBeDefined();
            expect(edgeAB!.userCount).toBe(1);
            expect(edgeBC).toBeDefined();
            expect(edgeBC!.userCount).toBe(1);
            
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
   * Requirements 2.1, 2.2: Group emails by user first, then sort each user's emails by received_at
   * CRITICAL FIX: Only process emails received AFTER the user's first Root email
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

    // Build a map of each user's first Root email time
    const userFirstRootTime = new Map<string, Date>();
    for (const [recipient, firstRoot] of recipientFirstRoot) {
      userFirstRootTime.set(recipient, firstRoot.receivedAt);
    }

    // Get all emails and group by recipient (Requirements 2.1)
    const newUserRecipients = new Set(recipientFirstRoot.keys());
    const allEmails = this.getAllCampaignEmails(projectInfo.merchantId, projectInfo.workerNames);
    
    // Group emails by recipient first
    const emailsByRecipient = new Map<string, Array<{ campaign_id: string; recipient: string; received_at: string }>>();
    for (const email of allEmails) {
      if (!newUserRecipients.has(email.recipient)) continue;
      if (!emailsByRecipient.has(email.recipient)) {
        emailsByRecipient.set(email.recipient, []);
      }
      emailsByRecipient.get(email.recipient)!.push(email);
    }
    
    // Sort each user's emails by received_at time (Requirements 2.2)
    for (const [, emails] of emailsByRecipient) {
      emails.sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
    }
    
    // Process each user's emails in time order
    for (const [recipient, emails] of emailsByRecipient) {
      // Get this user's first Root email time
      const firstRootTime = userFirstRootTime.get(recipient);
      
      for (const email of emails) {
        // Skip Root campaign emails (already processed as seq=1)
        if (rootCampaignIds.includes(email.campaign_id)) continue;
        
        // CRITICAL FIX: Skip emails received BEFORE the user's first Root email
        // This ensures the path always starts from the Root campaign (seq=1)
        const emailTime = new Date(email.received_at);
        if (firstRootTime && emailTime < firstRootTime) {
          continue;
        }
        
        const result = this.addUserEvent(projectId, recipient, email.campaign_id, new Date(email.received_at));
        if (result.isNew && result.seq > 1) eventsCreated++;
      }
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


// ============================================
// Extended Test Service for Valuable Stats Testing
// ============================================

/**
 * Extended test service that includes valuable stats methods for testing
 */
class TestProjectPathAnalysisServiceWithValuableStats extends TestProjectPathAnalysisServiceWithAnalysis {
  constructor(db: SqlJsDatabase) {
    super(db);
  }

  /**
   * Set campaign tag for a project
   */
  setProjectCampaignTag(
    projectId: string,
    campaignId: string,
    tag: number,
    note?: string
  ): void {
    const now = new Date().toISOString();
    
    // Check if exists
    const existing = this.db.exec(
      `SELECT id FROM project_campaign_tags WHERE project_id = ? AND campaign_id = ?`,
      [projectId, campaignId]
    );
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      this.db.run(
        `UPDATE project_campaign_tags SET tag = ?, tag_note = ?, updated_at = ?
         WHERE project_id = ? AND campaign_id = ?`,
        [tag, note ?? null, now, projectId, campaignId]
      );
    } else {
      this.db.run(
        `INSERT INTO project_campaign_tags (project_id, campaign_id, tag, tag_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [projectId, campaignId, tag, note ?? null, now, now]
      );
    }
  }

  /**
   * Get all campaign tags for a project
   */
  getProjectCampaignTags(projectId: string): Array<{
    campaignId: string;
    tag: number;
    isValuable: boolean;
  }> {
    const result = this.db.exec(
      `SELECT campaign_id, tag FROM project_campaign_tags WHERE project_id = ?`,
      [projectId]
    );
    
    if (result.length === 0) return [];
    
    return result[0].values.map(row => ({
      campaignId: row[0] as string,
      tag: row[1] as number,
      isValuable: (row[1] as number) === 1 || (row[1] as number) === 2,
    }));
  }

  /**
   * Calculate valuable stats for a project
   * 
   * **Feature: path-analysis-algorithm-review, Property 13: Valuable User Reach Accuracy**
   * **Feature: path-analysis-algorithm-review, Property 14: Valuable Conversion Rate Calculation**
   * **Validates: Requirements 9.3, 9.4, 9.5**
   * 
   * Note: In tests, we only use project-level tags (project_campaign_tags table)
   * since the campaigns table doesn't have a tag column in the test schema.
   */
  calculateValuableStats(projectId: string): {
    valuableCampaignCount: number;
    highValueCampaignCount: number;
    valuableUserReach: number;
    valuableConversionRate: number;
  } {
    // Get project info
    const projectInfo = this.getProjectInfo(projectId);
    if (!projectInfo) {
      return {
        valuableCampaignCount: 0,
        highValueCampaignCount: 0,
        valuableUserReach: 0,
        valuableConversionRate: 0,
      };
    }

    // Get all project campaign tags (in tests, we only use project-level tags)
    const projectTags = this.getProjectCampaignTags(projectId);
    
    // Count valuable campaigns from project tags
    let valuableCampaignCount = 0;
    let highValueCampaignCount = 0;
    const valuableCampaignIds = new Set<string>();

    for (const tag of projectTags) {
      if (tag.tag === 1 || tag.tag === 2) {
        valuableCampaignCount++;
        valuableCampaignIds.add(tag.campaignId);
      }
      if (tag.tag === 2) {
        highValueCampaignCount++;
      }
    }

    // Get total new users
    const userStats = this.getProjectUserStats(projectId);
    const totalNewUsers = userStats.totalNewUsers;

    // Calculate valuable user reach - count distinct users who reached any valuable campaign
    let valuableUserReach = 0;
    if (valuableCampaignIds.size > 0 && totalNewUsers > 0) {
      const placeholders = Array.from(valuableCampaignIds).map(id => `'${id}'`).join(',');
      const reachResult = this.db.exec(
        `SELECT COUNT(DISTINCT recipient) as reach_count
         FROM project_user_events
         WHERE project_id = '${projectId}' AND campaign_id IN (${placeholders})`
      );
      if (reachResult.length > 0 && reachResult[0].values.length > 0) {
        valuableUserReach = reachResult[0].values[0][0] as number;
      }
    }

    // Calculate conversion rate
    const valuableConversionRate = totalNewUsers > 0 
      ? (valuableUserReach / totalNewUsers) * 100 
      : 0;

    return {
      valuableCampaignCount,
      highValueCampaignCount,
      valuableUserReach,
      valuableConversionRate: Math.round(valuableConversionRate * 100) / 100, // Round to 2 decimal places
    };
  }
}

describe('ProjectPathAnalysisService - Valuable Stats Properties', () => {
  /**
   * **Feature: path-analysis-algorithm-review, Property 13: Valuable User Reach Accuracy**
   * **Validates: Requirements 9.3, 9.4**
   * 
   * For any project, valuableUserReach should equal the count of distinct users who have
   * at least one event with a campaign where tag=1 or tag=2.
   */
  describe('Property 13: Valuable User Reach Accuracy', () => {
    it('should count distinct users who reached valuable campaigns (tag=1 or tag=2)', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 2, maxLength: 8 }),
          fc.integer({ min: 0, max: 2 }), // Number of users who reach valuable campaigns
          async (emails, valuableReachCount) => {
            const uniqueEmails = [...new Set(emails)];
            if (uniqueEmails.length < 2) return;
            
            // Ensure valuableReachCount doesn't exceed available users
            const actualValuableReachCount = Math.min(valuableReachCount, uniqueEmails.length);
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithValuableStats(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const valuableCampaign = createTestCampaign(db, merchantId, 'Valuable Campaign');
            const normalCampaign = createTestCampaign(db, merchantId, 'Normal Campaign');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            // Set valuable campaign tag (tag=1)
            service.setProjectCampaignTag(projectId, valuableCampaign, 1);
            
            const now = new Date();
            
            // Add users - some reach valuable campaign, some don't
            for (let i = 0; i < uniqueEmails.length; i++) {
              const email = uniqueEmails[i];
              
              // All users get Root campaign
              service.addProjectNewUser(projectId, email, rootCampaign);
              service.addUserEvent(projectId, email, rootCampaign, now);
              
              if (i < actualValuableReachCount) {
                // These users reach the valuable campaign
                service.addUserEvent(projectId, email, valuableCampaign, new Date(now.getTime() + 1000));
              } else {
                // These users only reach normal campaign
                service.addUserEvent(projectId, email, normalCampaign, new Date(now.getTime() + 1000));
              }
            }
            
            // Calculate valuable stats
            const stats = service.calculateValuableStats(projectId);
            
            // Property assertion: valuableUserReach should equal the count of users who reached valuable campaigns
            expect(stats.valuableUserReach).toBe(actualValuableReachCount);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should count users who reached high-value campaigns (tag=2)', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 3, maxLength: 6 }),
          async (emails) => {
            const uniqueEmails = [...new Set(emails)];
            if (uniqueEmails.length < 3) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithValuableStats(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const highValueCampaign = createTestCampaign(db, merchantId, 'High Value Campaign');
            const valuableCampaign = createTestCampaign(db, merchantId, 'Valuable Campaign');
            const normalCampaign = createTestCampaign(db, merchantId, 'Normal Campaign');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            // Set campaign tags
            service.setProjectCampaignTag(projectId, highValueCampaign, 2); // High value
            service.setProjectCampaignTag(projectId, valuableCampaign, 1);  // Valuable
            
            const now = new Date();
            
            // User 0: reaches high-value campaign
            service.addProjectNewUser(projectId, uniqueEmails[0], rootCampaign);
            service.addUserEvent(projectId, uniqueEmails[0], rootCampaign, now);
            service.addUserEvent(projectId, uniqueEmails[0], highValueCampaign, new Date(now.getTime() + 1000));
            
            // User 1: reaches valuable campaign (tag=1)
            service.addProjectNewUser(projectId, uniqueEmails[1], rootCampaign);
            service.addUserEvent(projectId, uniqueEmails[1], rootCampaign, now);
            service.addUserEvent(projectId, uniqueEmails[1], valuableCampaign, new Date(now.getTime() + 1000));
            
            // User 2: reaches only normal campaign
            service.addProjectNewUser(projectId, uniqueEmails[2], rootCampaign);
            service.addUserEvent(projectId, uniqueEmails[2], rootCampaign, now);
            service.addUserEvent(projectId, uniqueEmails[2], normalCampaign, new Date(now.getTime() + 1000));
            
            // Calculate valuable stats
            const stats = service.calculateValuableStats(projectId);
            
            // Property assertion: valuableUserReach should count users who reached tag=1 OR tag=2
            expect(stats.valuableUserReach).toBe(2); // User 0 and User 1
            expect(stats.highValueCampaignCount).toBe(1); // Only highValueCampaign
            expect(stats.valuableCampaignCount).toBe(2); // highValueCampaign + valuableCampaign
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should count each user only once even if they reached multiple valuable campaigns', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          async (email) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithValuableStats(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const valuable1 = createTestCampaign(db, merchantId, 'Valuable 1');
            const valuable2 = createTestCampaign(db, merchantId, 'Valuable 2');
            const highValue = createTestCampaign(db, merchantId, 'High Value');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            // Set campaign tags
            service.setProjectCampaignTag(projectId, valuable1, 1);
            service.setProjectCampaignTag(projectId, valuable2, 1);
            service.setProjectCampaignTag(projectId, highValue, 2);
            
            const now = new Date();
            
            // Single user reaches ALL valuable campaigns
            service.addProjectNewUser(projectId, email, rootCampaign);
            service.addUserEvent(projectId, email, rootCampaign, now);
            service.addUserEvent(projectId, email, valuable1, new Date(now.getTime() + 1000));
            service.addUserEvent(projectId, email, valuable2, new Date(now.getTime() + 2000));
            service.addUserEvent(projectId, email, highValue, new Date(now.getTime() + 3000));
            
            // Calculate valuable stats
            const stats = service.calculateValuableStats(projectId);
            
            // Property assertion: user should be counted only once
            expect(stats.valuableUserReach).toBe(1);
            expect(stats.valuableCampaignCount).toBe(3); // valuable1 + valuable2 + highValue
            expect(stats.highValueCampaignCount).toBe(1); // Only highValue
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 valuableUserReach when no valuable campaigns exist', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 1, maxLength: 5 }),
          async (emails) => {
            const uniqueEmails = [...new Set(emails)];
            if (uniqueEmails.length === 0) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithValuableStats(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns (no valuable tags)
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const normalCampaign = createTestCampaign(db, merchantId, 'Normal Campaign');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            const now = new Date();
            
            // Add users
            for (const email of uniqueEmails) {
              service.addProjectNewUser(projectId, email, rootCampaign);
              service.addUserEvent(projectId, email, rootCampaign, now);
              service.addUserEvent(projectId, email, normalCampaign, new Date(now.getTime() + 1000));
            }
            
            // Calculate valuable stats
            const stats = service.calculateValuableStats(projectId);
            
            // Property assertion: no valuable campaigns means 0 reach
            expect(stats.valuableCampaignCount).toBe(0);
            expect(stats.highValueCampaignCount).toBe(0);
            expect(stats.valuableUserReach).toBe(0);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: path-analysis-algorithm-review, Property 14: Valuable Conversion Rate Calculation**
   * **Validates: Requirements 9.5**
   * 
   * For any project with totalNewUsers > 0, valuableConversionRate should equal
   * (valuableUserReach / totalNewUsers) * 100.
   */
  describe('Property 14: Valuable Conversion Rate Calculation', () => {
    it('should calculate conversion rate as (valuableUserReach / totalNewUsers) * 100', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }), // Total users
          fc.integer({ min: 0, max: 10 }), // Users who reach valuable campaigns
          async (totalUsers, valuableUsers) => {
            // Ensure valuableUsers doesn't exceed totalUsers
            const actualValuableUsers = Math.min(valuableUsers, totalUsers);
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithValuableStats(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const valuableCampaign = createTestCampaign(db, merchantId, 'Valuable Campaign');
            const normalCampaign = createTestCampaign(db, merchantId, 'Normal Campaign');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            // Set valuable campaign tag
            service.setProjectCampaignTag(projectId, valuableCampaign, 1);
            
            const now = new Date();
            
            // Add users
            for (let i = 0; i < totalUsers; i++) {
              const email = `user${i}@test.com`;
              
              service.addProjectNewUser(projectId, email, rootCampaign);
              service.addUserEvent(projectId, email, rootCampaign, now);
              
              if (i < actualValuableUsers) {
                service.addUserEvent(projectId, email, valuableCampaign, new Date(now.getTime() + 1000));
              } else {
                service.addUserEvent(projectId, email, normalCampaign, new Date(now.getTime() + 1000));
              }
            }
            
            // Calculate valuable stats
            const stats = service.calculateValuableStats(projectId);
            
            // Calculate expected conversion rate
            const expectedRate = (actualValuableUsers / totalUsers) * 100;
            const expectedRateRounded = Math.round(expectedRate * 100) / 100;
            
            // Property assertion: conversion rate should match formula
            expect(stats.valuableUserReach).toBe(actualValuableUsers);
            expect(stats.valuableConversionRate).toBe(expectedRateRounded);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 conversion rate when totalNewUsers is 0', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithValuableStats(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns but don't add any users
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const valuableCampaign = createTestCampaign(db, merchantId, 'Valuable Campaign');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            // Set valuable campaign tag
            service.setProjectCampaignTag(projectId, valuableCampaign, 1);
            
            // Calculate valuable stats (no users)
            const stats = service.calculateValuableStats(projectId);
            
            // Property assertion: 0 users means 0 conversion rate (avoid division by zero)
            expect(stats.valuableUserReach).toBe(0);
            expect(stats.valuableConversionRate).toBe(0);
            
            db.close();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should return 100% conversion rate when all users reach valuable campaigns', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (totalUsers) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithValuableStats(db);
            
            const merchantId = createTestMerchant(db, 'test.com');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Create campaigns
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const valuableCampaign = createTestCampaign(db, merchantId, 'Valuable Campaign');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            // Set valuable campaign tag
            service.setProjectCampaignTag(projectId, valuableCampaign, 1);
            
            const now = new Date();
            
            // All users reach valuable campaign
            for (let i = 0; i < totalUsers; i++) {
              const email = `user${i}@test.com`;
              
              service.addProjectNewUser(projectId, email, rootCampaign);
              service.addUserEvent(projectId, email, rootCampaign, now);
              service.addUserEvent(projectId, email, valuableCampaign, new Date(now.getTime() + 1000));
            }
            
            // Calculate valuable stats
            const stats = service.calculateValuableStats(projectId);
            
            // Property assertion: all users reaching valuable = 100% conversion
            expect(stats.valuableUserReach).toBe(totalUsers);
            expect(stats.valuableConversionRate).toBe(100);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ============================================
// Level Stats Sorting Tests (Property 12)
// ============================================

/**
 * Interface for CampaignLevelStat used in buildLevelStats
 */
interface CampaignLevelStat {
  campaignId: string;
  subject: string;
  level: number;
  userCount: number;
  coverage: number;
  isRoot: boolean;
  tag?: number;
  isValuable?: boolean;
}

/**
 * Simplified buildLevelStats function for testing
 * This mirrors the sorting logic from packages/vps-api/src/routes/campaign.ts
 * 
 * **Feature: path-analysis-algorithm-review, Property 12: Valuable Campaign Priority Sorting**
 * **Validates: Requirements 9.1**
 */
function buildLevelStatsForTest(
  levelStats: CampaignLevelStat[]
): CampaignLevelStat[] {
  // Sort by level, then by tag priority (tag=2 first, tag=1 second), then by user count descending
  // Requirements 9.1: Valuable campaigns should be sorted first within each level
  return [...levelStats].sort((a, b) => {
    // First sort by level
    if (a.level !== b.level) return a.level - b.level;
    
    // Within same level, sort by tag priority (tag=2 > tag=1 > others)
    const aTag = a.tag ?? 0;
    const bTag = b.tag ?? 0;
    const aTagPriority = aTag === 2 ? 0 : (aTag === 1 ? 1 : 2);
    const bTagPriority = bTag === 2 ? 0 : (bTag === 1 ? 1 : 2);
    
    if (aTagPriority !== bTagPriority) return aTagPriority - bTagPriority;
    
    // Finally sort by user count descending
    return b.userCount - a.userCount;
  });
}

/**
 * Generate arbitrary CampaignLevelStat for testing
 */
const campaignLevelStatArb = fc.record({
  campaignId: fc.uuid(),
  subject: fc.string({ minLength: 1, maxLength: 50 }),
  level: fc.integer({ min: 1, max: 5 }),
  userCount: fc.integer({ min: 0, max: 1000 }),
  coverage: fc.float({ min: 0, max: 100 }),
  isRoot: fc.boolean(),
  tag: fc.option(fc.integer({ min: 0, max: 4 }), { nil: undefined }),
  isValuable: fc.option(fc.boolean(), { nil: undefined }),
});

describe('ProjectPathAnalysisService - Level Stats Sorting Properties', () => {
  /**
   * **Feature: path-analysis-algorithm-review, Property 12: Valuable Campaign Priority Sorting**
   * **Validates: Requirements 9.1**
   * 
   * For any level stats result, within the same level, campaigns should be sorted with
   * tag=2 first, then tag=1, then others by userCount descending.
   */
  describe('Property 12: Valuable Campaign Priority Sorting', () => {
    it('should sort tag=2 (高价值) campaigns before tag=1 (有价值) within same level', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }), // level
          fc.integer({ min: 0, max: 100 }), // userCount for tag=2
          fc.integer({ min: 0, max: 100 }), // userCount for tag=1
          (level, userCount2, userCount1) => {
            const stats: CampaignLevelStat[] = [
              {
                campaignId: 'campaign-1',
                subject: 'Valuable Campaign',
                level,
                userCount: userCount1,
                coverage: 50,
                isRoot: false,
                tag: 1, // 有价值
                isValuable: true,
              },
              {
                campaignId: 'campaign-2',
                subject: 'High Value Campaign',
                level,
                userCount: userCount2,
                coverage: 50,
                isRoot: false,
                tag: 2, // 高价值
                isValuable: true,
              },
            ];
            
            const sorted = buildLevelStatsForTest(stats);
            
            // Property assertion: tag=2 should come before tag=1 regardless of userCount
            expect(sorted[0].tag).toBe(2);
            expect(sorted[1].tag).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sort tag=1 (有价值) campaigns before normal campaigns within same level', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }), // level
          fc.integer({ min: 0, max: 100 }), // userCount for tag=1
          fc.integer({ min: 0, max: 100 }), // userCount for normal
          (level, userCount1, userCountNormal) => {
            const stats: CampaignLevelStat[] = [
              {
                campaignId: 'campaign-normal',
                subject: 'Normal Campaign',
                level,
                userCount: userCountNormal,
                coverage: 50,
                isRoot: false,
                tag: 0, // 普通
                isValuable: false,
              },
              {
                campaignId: 'campaign-valuable',
                subject: 'Valuable Campaign',
                level,
                userCount: userCount1,
                coverage: 50,
                isRoot: false,
                tag: 1, // 有价值
                isValuable: true,
              },
            ];
            
            const sorted = buildLevelStatsForTest(stats);
            
            // Property assertion: tag=1 should come before tag=0 regardless of userCount
            expect(sorted[0].tag).toBe(1);
            expect(sorted[1].tag).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sort by userCount descending within same tag priority', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }), // level
          fc.integer({ min: 0, max: 4 }), // tag (same for both)
          fc.integer({ min: 0, max: 100 }), // userCount1
          fc.integer({ min: 0, max: 100 }), // userCount2
          (level, tag, userCount1, userCount2) => {
            // Skip if userCounts are equal (order is undefined)
            if (userCount1 === userCount2) return;
            
            const stats: CampaignLevelStat[] = [
              {
                campaignId: 'campaign-1',
                subject: 'Campaign 1',
                level,
                userCount: userCount1,
                coverage: 50,
                isRoot: false,
                tag,
                isValuable: tag === 1 || tag === 2,
              },
              {
                campaignId: 'campaign-2',
                subject: 'Campaign 2',
                level,
                userCount: userCount2,
                coverage: 50,
                isRoot: false,
                tag,
                isValuable: tag === 1 || tag === 2,
              },
            ];
            
            const sorted = buildLevelStatsForTest(stats);
            
            // Property assertion: higher userCount should come first
            expect(sorted[0].userCount).toBeGreaterThan(sorted[1].userCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain level ordering as primary sort', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }), // level1
          fc.integer({ min: 4, max: 6 }), // level2 (always higher)
          (level1, level2) => {
            const stats: CampaignLevelStat[] = [
              {
                campaignId: 'campaign-high-level',
                subject: 'High Level Campaign',
                level: level2,
                userCount: 1000, // High user count
                coverage: 100,
                isRoot: false,
                tag: 2, // High value
                isValuable: true,
              },
              {
                campaignId: 'campaign-low-level',
                subject: 'Low Level Campaign',
                level: level1,
                userCount: 1, // Low user count
                coverage: 1,
                isRoot: false,
                tag: 0, // Normal
                isValuable: false,
              },
            ];
            
            const sorted = buildLevelStatsForTest(stats);
            
            // Property assertion: lower level should come first regardless of tag or userCount
            expect(sorted[0].level).toBe(level1);
            expect(sorted[1].level).toBe(level2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly sort mixed campaigns across multiple levels', () => {
      fc.assert(
        fc.property(
          fc.array(campaignLevelStatArb, { minLength: 2, maxLength: 20 }),
          (stats) => {
            const sorted = buildLevelStatsForTest(stats);
            
            // Verify sorting invariants
            for (let i = 0; i < sorted.length - 1; i++) {
              const current = sorted[i];
              const next = sorted[i + 1];
              
              // Level should be non-decreasing
              expect(current.level).toBeLessThanOrEqual(next.level);
              
              // If same level, check tag priority
              if (current.level === next.level) {
                const currentTag = current.tag ?? 0;
                const nextTag = next.tag ?? 0;
                const currentPriority = currentTag === 2 ? 0 : (currentTag === 1 ? 1 : 2);
                const nextPriority = nextTag === 2 ? 0 : (nextTag === 1 ? 1 : 2);
                
                // Tag priority should be non-decreasing (lower priority number = higher priority)
                expect(currentPriority).toBeLessThanOrEqual(nextPriority);
                
                // If same tag priority, userCount should be non-increasing
                if (currentPriority === nextPriority) {
                  expect(current.userCount).toBeGreaterThanOrEqual(next.userCount);
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle campaigns with undefined tags as tag=0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }), // level
          fc.integer({ min: 0, max: 100 }), // userCount
          (level, userCount) => {
            const stats: CampaignLevelStat[] = [
              {
                campaignId: 'campaign-undefined-tag',
                subject: 'Undefined Tag Campaign',
                level,
                userCount,
                coverage: 50,
                isRoot: false,
                // tag is undefined
              },
              {
                campaignId: 'campaign-valuable',
                subject: 'Valuable Campaign',
                level,
                userCount,
                coverage: 50,
                isRoot: false,
                tag: 1,
                isValuable: true,
              },
            ];
            
            const sorted = buildLevelStatsForTest(stats);
            
            // Property assertion: tag=1 should come before undefined tag
            expect(sorted[0].tag).toBe(1);
            expect(sorted[1].tag).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all campaigns after sorting (no data loss)', () => {
      fc.assert(
        fc.property(
          fc.array(campaignLevelStatArb, { minLength: 0, maxLength: 50 }),
          (stats) => {
            const sorted = buildLevelStatsForTest(stats);
            
            // Property assertion: same number of items
            expect(sorted.length).toBe(stats.length);
            
            // Property assertion: all campaign IDs are preserved
            const originalIds = new Set(stats.map(s => s.campaignId));
            const sortedIds = new Set(sorted.map(s => s.campaignId));
            expect(sortedIds).toEqual(originalIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be idempotent - sorting twice gives same result', () => {
      fc.assert(
        fc.property(
          fc.array(campaignLevelStatArb, { minLength: 0, maxLength: 20 }),
          (stats) => {
            const sorted1 = buildLevelStatsForTest(stats);
            const sorted2 = buildLevelStatsForTest(sorted1);
            
            // Property assertion: sorting twice should give same result
            expect(sorted2.map(s => s.campaignId)).toEqual(sorted1.map(s => s.campaignId));
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

/**
 * **Feature: path-analysis-seq-fix, Property 17: Full Analysis Event Order**
 * **Validates: Requirements 2.1, 2.3**
 * 
 * For any full analysis execution, each user's events should be processed in received_at time order,
 * and duplicate campaign events (same user, same campaign) should only record the first occurrence.
 */
describe('ProjectPathAnalysisService - Full Analysis Event Order Properties', () => {
  describe('Property 17: Full Analysis Event Order', () => {
    it('should process each user events in received_at time order', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 1, maxLength: 3 }),
          fc.array(fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }), { minLength: 3, maxLength: 6 }),
          async (emails, dates) => {
            const uniqueEmails = [...new Set(emails)];
            if (uniqueEmails.length === 0) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            // Create test data
            const merchantId = createTestMerchant(db, 'test.com');
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const campaign1 = createTestCampaign(db, merchantId, 'Campaign 1');
            const campaign2 = createTestCampaign(db, merchantId, 'Campaign 2');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            // Sort dates to create a predictable time sequence
            const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());
            
            // Create emails for each user with various timestamps
            for (const email of uniqueEmails) {
              // Root email at earliest time
              createTestCampaignEmail(db, rootCampaign, email, sortedDates[0]);
              
              // Add other campaign emails at different times
              if (sortedDates.length > 1) {
                createTestCampaignEmail(db, campaign1, email, sortedDates[1]);
              }
              if (sortedDates.length > 2) {
                createTestCampaignEmail(db, campaign2, email, sortedDates[2]);
              }
            }
            
            // Run full analysis
            service.runFullAnalysis(projectId);
            
            // Verify each user's events are in time order
            for (const email of uniqueEmails) {
              const events = service.getUserEvents(projectId, email);
              
              // Events should be sorted by seq
              for (let i = 0; i < events.length - 1; i++) {
                expect(events[i].seq).toBeLessThan(events[i + 1].seq);
              }
              
              // Seq order should match received_at time order
              for (let i = 0; i < events.length - 1; i++) {
                expect(events[i].receivedAt.getTime()).toBeLessThanOrEqual(events[i + 1].receivedAt.getTime());
              }
            }
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only record first occurrence of duplicate campaign events for same user', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          fc.integer({ min: 2, max: 5 }), // Number of duplicate emails
          async (email, duplicateCount) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            // Create test data
            const merchantId = createTestMerchant(db, 'test.com');
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const campaign1 = createTestCampaign(db, merchantId, 'Campaign 1');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            const baseTime = new Date('2024-06-01T10:00:00Z');
            
            // Create Root email
            createTestCampaignEmail(db, rootCampaign, email, baseTime);
            
            // Create multiple emails for the same campaign (duplicates)
            for (let i = 0; i < duplicateCount; i++) {
              const emailTime = new Date(baseTime.getTime() + (i + 1) * 3600000); // 1 hour apart
              createTestCampaignEmail(db, campaign1, email, emailTime);
            }
            
            // Run full analysis
            service.runFullAnalysis(projectId);
            
            // Verify only one event per campaign per user (Requirements 2.3)
            const events = service.getUserEvents(projectId, email);
            const campaignIds = events.map(e => e.campaignId);
            const uniqueCampaignIds = [...new Set(campaignIds)];
            
            // Should have exactly 2 events: root + campaign1 (no duplicates)
            expect(events.length).toBe(2);
            expect(uniqueCampaignIds.length).toBe(2);
            expect(uniqueCampaignIds).toContain(rootCampaign);
            expect(uniqueCampaignIds).toContain(campaign1);
            
            // The campaign1 event should have the earliest received_at time
            const campaign1Event = events.find(e => e.campaignId === campaign1);
            expect(campaign1Event).toBeDefined();
            // First duplicate was at baseTime + 1 hour
            const expectedTime = new Date(baseTime.getTime() + 3600000);
            expect(campaign1Event!.receivedAt.getTime()).toBe(expectedTime.getTime());
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should process users independently - one user events should not affect another', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(emailArb, emailArb).filter(([a, b]) => a !== b),
          async ([email1, email2]) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            // Create test data
            const merchantId = createTestMerchant(db, 'test.com');
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const campaignA = createTestCampaign(db, merchantId, 'Campaign A');
            const campaignB = createTestCampaign(db, merchantId, 'Campaign B');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            const baseTime = new Date('2024-06-01T10:00:00Z');
            
            // User 1: Root -> A -> B (in time order)
            createTestCampaignEmail(db, rootCampaign, email1, baseTime);
            createTestCampaignEmail(db, campaignA, email1, new Date(baseTime.getTime() + 1000));
            createTestCampaignEmail(db, campaignB, email1, new Date(baseTime.getTime() + 2000));
            
            // User 2: Root -> B -> A (different order)
            createTestCampaignEmail(db, rootCampaign, email2, baseTime);
            createTestCampaignEmail(db, campaignB, email2, new Date(baseTime.getTime() + 1000));
            createTestCampaignEmail(db, campaignA, email2, new Date(baseTime.getTime() + 2000));
            
            // Run full analysis
            service.runFullAnalysis(projectId);
            
            // Verify user 1's events
            const events1 = service.getUserEvents(projectId, email1);
            expect(events1.length).toBe(3);
            expect(events1[0].campaignId).toBe(rootCampaign);
            expect(events1[1].campaignId).toBe(campaignA);
            expect(events1[2].campaignId).toBe(campaignB);
            
            // Verify user 2's events (different order)
            const events2 = service.getUserEvents(projectId, email2);
            expect(events2.length).toBe(3);
            expect(events2[0].campaignId).toBe(rootCampaign);
            expect(events2[1].campaignId).toBe(campaignB);
            expect(events2[2].campaignId).toBe(campaignA);
            
            // Verify seq numbers are independent
            expect(events1.map(e => e.seq)).toEqual([1, 2, 3]);
            expect(events2.map(e => e.seq)).toEqual([1, 2, 3]);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain seq-time consistency after full analysis', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 1, maxLength: 5 }),
          fc.array(fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }), { minLength: 2, maxLength: 8 }),
          async (emails, dates) => {
            const uniqueEmails = [...new Set(emails)];
            if (uniqueEmails.length === 0 || dates.length < 2) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            // Create test data
            const merchantId = createTestMerchant(db, 'test.com');
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const campaigns = [
              createTestCampaign(db, merchantId, 'Campaign 1'),
              createTestCampaign(db, merchantId, 'Campaign 2'),
              createTestCampaign(db, merchantId, 'Campaign 3'),
            ];
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            // Sort dates
            const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());
            
            // Create emails for each user
            for (const email of uniqueEmails) {
              // Root email at earliest time
              createTestCampaignEmail(db, rootCampaign, email, sortedDates[0]);
              
              // Add other campaign emails
              for (let i = 0; i < Math.min(campaigns.length, sortedDates.length - 1); i++) {
                createTestCampaignEmail(db, campaigns[i], email, sortedDates[i + 1]);
              }
            }
            
            // Run full analysis
            service.runFullAnalysis(projectId);
            
            // Validate event sequence for all users
            const validation = service.validateEventSequence(projectId);
            
            // Property assertion: all users should have valid event sequences
            expect(validation.isValid).toBe(true);
            expect(validation.usersWithIssues).toBe(0);
            expect(validation.issues.length).toBe(0);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


/**
 * **Feature: path-analysis-seq-fix, Property 18: Path Edge Rebuild After Modification**
 * **Validates: Requirements 3.3, 5.1, 5.2**
 * 
 * For any modification to user events (insertion, deletion, or reordering), the path edges
 * should be rebuilt to accurately reflect the updated event transitions.
 */
describe('ProjectPathAnalysisService - Path Edge Rebuild Properties', () => {
  describe('Property 18: Path Edge Rebuild After Modification', () => {
    it('should rebuild path edges correctly after inserting new events', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 1, maxLength: 3 }),
          async (emails) => {
            const uniqueEmails = [...new Set(emails)];
            if (uniqueEmails.length === 0) return;
            
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            // Create test data
            const merchantId = createTestMerchant(db, 'test.com');
            const campaignA = createTestCampaign(db, merchantId, 'Campaign A');
            const campaignB = createTestCampaign(db, merchantId, 'Campaign B');
            const campaignC = createTestCampaign(db, merchantId, 'Campaign C');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            const baseTime = new Date('2024-06-01T10:00:00Z');
            
            // Add initial events for each user: A -> C (skipping B)
            for (const email of uniqueEmails) {
              service.addUserEvent(projectId, email, campaignA, baseTime);
              service.addUserEvent(projectId, email, campaignC, new Date(baseTime.getTime() + 2000));
            }
            
            // Build initial path edges
            service.buildPathEdgesFromEvents(projectId);
            
            // Verify initial edges: A -> C
            const initialEdges = service.getProjectPathEdges(projectId);
            expect(initialEdges.length).toBe(1);
            expect(initialEdges[0].fromCampaignId).toBe(campaignA);
            expect(initialEdges[0].toCampaignId).toBe(campaignC);
            expect(initialEdges[0].userCount).toBe(uniqueEmails.length);
            
            // Insert event B between A and C (time between A and C)
            for (const email of uniqueEmails) {
              service.addUserEvent(projectId, email, campaignB, new Date(baseTime.getTime() + 1000));
            }
            
            // Rebuild path edges after modification (Requirements 3.3)
            service.buildPathEdgesFromEvents(projectId);
            
            // Verify new edges: A -> B -> C
            const newEdges = service.getProjectPathEdges(projectId);
            expect(newEdges.length).toBe(2);
            
            // Find A -> B edge
            const abEdge = newEdges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignB);
            expect(abEdge).toBeDefined();
            expect(abEdge!.userCount).toBe(uniqueEmails.length);
            
            // Find B -> C edge
            const bcEdge = newEdges.find(e => e.fromCampaignId === campaignB && e.toCampaignId === campaignC);
            expect(bcEdge).toBeDefined();
            expect(bcEdge!.userCount).toBe(uniqueEmails.length);
            
            // Verify A -> C edge no longer exists (Requirements 5.1: only consecutive seq transitions)
            const acEdge = newEdges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignC);
            expect(acEdge).toBeUndefined();
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only count consecutive seq transitions in path edges (Requirements 5.1)', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          fc.integer({ min: 3, max: 6 }), // Number of campaigns
          async (email, numCampaigns) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            // Create test data
            const merchantId = createTestMerchant(db, 'test.com');
            const campaigns: string[] = [];
            for (let i = 0; i < numCampaigns; i++) {
              campaigns.push(createTestCampaign(db, merchantId, `Campaign ${i}`));
            }
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            const baseTime = new Date('2024-06-01T10:00:00Z');
            
            // Add events in order
            for (let i = 0; i < numCampaigns; i++) {
              service.addUserEvent(projectId, email, campaigns[i], new Date(baseTime.getTime() + i * 1000));
            }
            
            // Build path edges
            service.buildPathEdgesFromEvents(projectId);
            
            // Verify edges
            const edges = service.getProjectPathEdges(projectId);
            
            // Should have exactly numCampaigns - 1 edges (consecutive transitions)
            expect(edges.length).toBe(numCampaigns - 1);
            
            // Each edge should be from campaign[i] to campaign[i+1]
            for (let i = 0; i < numCampaigns - 1; i++) {
              const edge = edges.find(e => 
                e.fromCampaignId === campaigns[i] && e.toCampaignId === campaigns[i + 1]
              );
              expect(edge).toBeDefined();
              expect(edge!.userCount).toBe(1);
            }
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly count user_count for path edges (Requirements 5.2)', async () => {
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
            
            const service = new TestProjectPathAnalysisService(db);
            
            // Create test data
            const merchantId = createTestMerchant(db, 'test.com');
            const campaignA = createTestCampaign(db, merchantId, 'Campaign A');
            const campaignB = createTestCampaign(db, merchantId, 'Campaign B');
            const campaignC = createTestCampaign(db, merchantId, 'Campaign C');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            const baseTime = new Date('2024-06-01T10:00:00Z');
            
            // All users: A -> B
            for (const email of uniqueEmails) {
              service.addUserEvent(projectId, email, campaignA, baseTime);
              service.addUserEvent(projectId, email, campaignB, new Date(baseTime.getTime() + 1000));
            }
            
            // Only first user: B -> C
            service.addUserEvent(projectId, uniqueEmails[0], campaignC, new Date(baseTime.getTime() + 2000));
            
            // Build path edges
            service.buildPathEdgesFromEvents(projectId);
            
            // Verify edges
            const edges = service.getProjectPathEdges(projectId);
            
            // A -> B edge should have all users
            const abEdge = edges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignB);
            expect(abEdge).toBeDefined();
            expect(abEdge!.userCount).toBe(uniqueEmails.length);
            
            // B -> C edge should have only 1 user
            const bcEdge = edges.find(e => e.fromCampaignId === campaignB && e.toCampaignId === campaignC);
            expect(bcEdge).toBeDefined();
            expect(bcEdge!.userCount).toBe(1);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should rebuild path edges after fixEventSequence (Requirements 5.2)', async () => {
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
            
            // Create test data
            const merchantId = createTestMerchant(db, 'test.com');
            const campaignA = createTestCampaign(db, merchantId, 'Campaign A');
            const campaignB = createTestCampaign(db, merchantId, 'Campaign B');
            const campaignC = createTestCampaign(db, merchantId, 'Campaign C');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            const baseTime = new Date('2024-06-01T10:00:00Z');
            
            // Add events in order: A -> B -> C
            service.addUserEvent(projectId, email, campaignA, baseTime);
            service.addUserEvent(projectId, email, campaignB, new Date(baseTime.getTime() + 1000));
            service.addUserEvent(projectId, email, campaignC, new Date(baseTime.getTime() + 2000));
            
            // Build initial path edges
            service.buildPathEdgesFromEvents(projectId);
            
            // Verify initial edges
            const initialEdges = service.getProjectPathEdges(projectId);
            expect(initialEdges.length).toBe(2);
            
            // Manually corrupt the seq numbers to simulate inconsistency
            db.run(
              `UPDATE project_user_events SET seq = 10 WHERE project_id = ? AND campaign_id = ?`,
              [projectId, campaignB]
            );
            
            // Validate should detect the issue
            const validation = service.validateEventSequence(projectId);
            expect(validation.isValid).toBe(false);
            
            // Fix the sequence
            const fixResult = service.fixEventSequence(projectId);
            expect(fixResult.usersFixed).toBe(1);
            expect(fixResult.pathEdgesRebuilt).toBe(true);
            
            // Verify path edges are correctly rebuilt
            const fixedEdges = service.getProjectPathEdges(projectId);
            expect(fixedEdges.length).toBe(2);
            
            // Verify A -> B edge
            const abEdge = fixedEdges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignB);
            expect(abEdge).toBeDefined();
            expect(abEdge!.userCount).toBe(1);
            
            // Verify B -> C edge
            const bcEdge = fixedEdges.find(e => e.fromCampaignId === campaignB && e.toCampaignId === campaignC);
            expect(bcEdge).toBeDefined();
            expect(bcEdge!.userCount).toBe(1);
            
            // Validate sequence is now correct
            const validationAfterFix = service.validateEventSequence(projectId);
            expect(validationAfterFix.isValid).toBe(true);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multiple users with different paths correctly', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(emailArb, emailArb).filter(([a, b]) => a !== b),
          async ([email1, email2]) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisService(db);
            
            // Create test data
            const merchantId = createTestMerchant(db, 'test.com');
            const campaignA = createTestCampaign(db, merchantId, 'Campaign A');
            const campaignB = createTestCampaign(db, merchantId, 'Campaign B');
            const campaignC = createTestCampaign(db, merchantId, 'Campaign C');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            const baseTime = new Date('2024-06-01T10:00:00Z');
            
            // User 1: A -> B -> C
            service.addUserEvent(projectId, email1, campaignA, baseTime);
            service.addUserEvent(projectId, email1, campaignB, new Date(baseTime.getTime() + 1000));
            service.addUserEvent(projectId, email1, campaignC, new Date(baseTime.getTime() + 2000));
            
            // User 2: A -> C (different path, skipping B)
            service.addUserEvent(projectId, email2, campaignA, baseTime);
            service.addUserEvent(projectId, email2, campaignC, new Date(baseTime.getTime() + 1000));
            
            // Build path edges
            service.buildPathEdgesFromEvents(projectId);
            
            // Verify edges
            const edges = service.getProjectPathEdges(projectId);
            
            // A -> B edge (only user 1)
            const abEdge = edges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignB);
            expect(abEdge).toBeDefined();
            expect(abEdge!.userCount).toBe(1);
            
            // B -> C edge (only user 1)
            const bcEdge = edges.find(e => e.fromCampaignId === campaignB && e.toCampaignId === campaignC);
            expect(bcEdge).toBeDefined();
            expect(bcEdge!.userCount).toBe(1);
            
            // A -> C edge (only user 2)
            const acEdge = edges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignC);
            expect(acEdge).toBeDefined();
            expect(acEdge!.userCount).toBe(1);
            
            // Now insert B for user 2 between A and C
            service.addUserEvent(projectId, email2, campaignB, new Date(baseTime.getTime() + 500));
            
            // Rebuild path edges
            service.buildPathEdgesFromEvents(projectId);
            
            // Verify updated edges
            const updatedEdges = service.getProjectPathEdges(projectId);
            
            // A -> B edge (now both users)
            const updatedAbEdge = updatedEdges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignB);
            expect(updatedAbEdge).toBeDefined();
            expect(updatedAbEdge!.userCount).toBe(2);
            
            // B -> C edge (now both users)
            const updatedBcEdge = updatedEdges.find(e => e.fromCampaignId === campaignB && e.toCampaignId === campaignC);
            expect(updatedBcEdge).toBeDefined();
            expect(updatedBcEdge!.userCount).toBe(2);
            
            // A -> C edge should no longer exist
            const updatedAcEdge = updatedEdges.find(e => e.fromCampaignId === campaignA && e.toCampaignId === campaignC);
            expect(updatedAcEdge).toBeUndefined();
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

/**
 * **Feature: path-analysis-seq-fix, Property 19: Path Always Starts From Root**
 * **Validates: Requirements 1.1, 3.1**
 * 
 * For any user in a project, the path should always start from the Root campaign (seq=1),
 * even if the user received other campaign emails before the Root email.
 * Emails received before the Root email should be excluded from the path analysis.
 */
describe('ProjectPathAnalysisService - Path Start From Root Properties', () => {
  describe('Property 19: Path Always Starts From Root', () => {
    it('should always start path from Root campaign even if user received other emails before Root', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          async (email) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            // Create test data
            const merchantId = createTestMerchant(db, 'test.com');
            const rootCampaign = createTestCampaign(db, merchantId, 'Welcome to Macys - Root');
            const priceDropCampaign = createTestCampaign(db, merchantId, 'Price drop alert');
            const followUpCampaign = createTestCampaign(db, merchantId, 'Follow up campaign');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            const baseTime = new Date('2024-06-01T10:00:00Z');
            
            // CRITICAL TEST CASE: User receives "Price drop alert" BEFORE "Root" email
            // This simulates the bug scenario where path incorrectly starts from "Price drop alert"
            createTestCampaignEmail(db, priceDropCampaign, email, baseTime); // Before Root
            createTestCampaignEmail(db, rootCampaign, email, new Date(baseTime.getTime() + 3600000)); // Root at +1 hour
            createTestCampaignEmail(db, followUpCampaign, email, new Date(baseTime.getTime() + 7200000)); // After Root at +2 hours
            
            // Run full analysis
            service.runFullAnalysis(projectId);
            
            // Verify the path starts from Root, not from "Price drop alert"
            const events = service.getUserEvents(projectId, email);
            
            // Should have exactly 2 events: Root (seq=1) and Follow up (seq=2)
            // "Price drop alert" should be excluded because it was received before Root
            expect(events.length).toBe(2);
            
            // First event (seq=1) should be the Root campaign
            expect(events[0].seq).toBe(1);
            expect(events[0].campaignId).toBe(rootCampaign);
            
            // Second event (seq=2) should be the follow up campaign
            expect(events[1].seq).toBe(2);
            expect(events[1].campaignId).toBe(followUpCampaign);
            
            // "Price drop alert" should NOT be in the events
            const priceDropEvent = events.find(e => e.campaignId === priceDropCampaign);
            expect(priceDropEvent).toBeUndefined();
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all emails received after Root in the path', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          fc.integer({ min: 1, max: 5 }), // Number of emails before Root
          fc.integer({ min: 1, max: 5 }), // Number of emails after Root
          async (email, beforeCount, afterCount) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            // Create test data
            const merchantId = createTestMerchant(db, 'test.com');
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            const rootTime = new Date('2024-06-01T12:00:00Z');
            
            // Create campaigns and emails BEFORE Root
            const beforeCampaigns: string[] = [];
            for (let i = 0; i < beforeCount; i++) {
              const campaign = createTestCampaign(db, merchantId, `Before Campaign ${i}`);
              beforeCampaigns.push(campaign);
              // Emails before Root (1 hour apart, ending 1 hour before Root)
              const emailTime = new Date(rootTime.getTime() - (beforeCount - i) * 3600000);
              createTestCampaignEmail(db, campaign, email, emailTime);
            }
            
            // Create Root email
            createTestCampaignEmail(db, rootCampaign, email, rootTime);
            
            // Create campaigns and emails AFTER Root
            const afterCampaigns: string[] = [];
            for (let i = 0; i < afterCount; i++) {
              const campaign = createTestCampaign(db, merchantId, `After Campaign ${i}`);
              afterCampaigns.push(campaign);
              // Emails after Root (1 hour apart, starting 1 hour after Root)
              const emailTime = new Date(rootTime.getTime() + (i + 1) * 3600000);
              createTestCampaignEmail(db, campaign, email, emailTime);
            }
            
            // Run full analysis
            service.runFullAnalysis(projectId);
            
            // Verify events
            const events = service.getUserEvents(projectId, email);
            
            // Should have Root + afterCount events (beforeCount emails should be excluded)
            expect(events.length).toBe(1 + afterCount);
            
            // First event should be Root
            expect(events[0].campaignId).toBe(rootCampaign);
            expect(events[0].seq).toBe(1);
            
            // All "before" campaigns should NOT be in events
            for (const beforeCampaign of beforeCampaigns) {
              const found = events.find(e => e.campaignId === beforeCampaign);
              expect(found).toBeUndefined();
            }
            
            // All "after" campaigns should be in events
            for (const afterCampaign of afterCampaigns) {
              const found = events.find(e => e.campaignId === afterCampaign);
              expect(found).toBeDefined();
            }
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should build correct path edges starting from Root', async () => {
      const SQL = await initSqlJs();
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(emailArb, emailArb).filter(([a, b]) => a !== b),
          async ([email1, email2]) => {
            const db = new SQL.Database();
            const schemaPath = join(__dirname, '../db/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            db.run(schema);
            
            const service = new TestProjectPathAnalysisServiceWithAnalysis(db);
            
            // Create test data
            const merchantId = createTestMerchant(db, 'test.com');
            const rootCampaign = createTestCampaign(db, merchantId, 'Root Campaign');
            const priceDropCampaign = createTestCampaign(db, merchantId, 'Price drop alert');
            const followUpCampaign = createTestCampaign(db, merchantId, 'Follow up campaign');
            const projectId = createTestProject(db, merchantId, 'Test Project');
            
            // Set Root campaign
            service.setProjectRootCampaign(projectId, rootCampaign, true);
            
            const baseTime = new Date('2024-06-01T10:00:00Z');
            
            // User 1: Price drop (before Root) -> Root -> Follow up
            createTestCampaignEmail(db, priceDropCampaign, email1, baseTime);
            createTestCampaignEmail(db, rootCampaign, email1, new Date(baseTime.getTime() + 3600000));
            createTestCampaignEmail(db, followUpCampaign, email1, new Date(baseTime.getTime() + 7200000));
            
            // User 2: Root -> Follow up (no email before Root)
            createTestCampaignEmail(db, rootCampaign, email2, baseTime);
            createTestCampaignEmail(db, followUpCampaign, email2, new Date(baseTime.getTime() + 3600000));
            
            // Run full analysis
            service.runFullAnalysis(projectId);
            
            // Verify path edges
            const edges = service.getProjectPathEdges(projectId);
            
            // Should have Root -> Follow up edge with count 2 (both users)
            const rootToFollowUp = edges.find(
              e => e.fromCampaignId === rootCampaign && e.toCampaignId === followUpCampaign
            );
            expect(rootToFollowUp).toBeDefined();
            expect(rootToFollowUp!.userCount).toBe(2);
            
            // Should NOT have Price drop -> Root edge (Price drop is excluded for user 1)
            const priceDropToRoot = edges.find(
              e => e.fromCampaignId === priceDropCampaign && e.toCampaignId === rootCampaign
            );
            expect(priceDropToRoot).toBeUndefined();
            
            // Should NOT have Price drop -> anything edge
            const priceDropEdges = edges.filter(e => e.fromCampaignId === priceDropCampaign);
            expect(priceDropEdges.length).toBe(0);
            
            db.close();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});