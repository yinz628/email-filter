/**
 * Campaign Routes Integration Tests
 * 
 * Tests for rebuild-paths and cleanup-old-customers API endpoints
 * Requirements: 3.1, 7.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// Test Service for sql.js (in-memory testing)
// ============================================

/**
 * Test-specific service that simulates the API behavior with sql.js
 */
class TestCampaignService {
  constructor(private db: SqlJsDatabase) {}

  getMerchantById(id: string): any | null {
    const result = this.db.exec('SELECT * FROM merchants WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    const row = result[0].values[0];
    const columns = result[0].columns;
    return this.rowToMerchant(columns, row);
  }

  getMerchantByDomain(domain: string): any | null {
    const result = this.db.exec('SELECT * FROM merchants WHERE domain = ?', [domain.toLowerCase()]);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    const row = result[0].values[0];
    const columns = result[0].columns;
    return this.rowToMerchant(columns, row);
  }

  createMerchant(domain: string): any {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO merchants (id, domain, total_campaigns, total_emails, created_at, updated_at)
       VALUES (?, ?, 0, 0, ?, ?)`,
      [id, domain.toLowerCase(), now, now]
    );
    return this.getMerchantById(id);
  }

  createCampaign(merchantId: string, subject: string, isRoot: boolean = false): any {
    const id = uuidv4();
    const now = new Date().toISOString();
    const subjectHash = this.calculateSubjectHash(subject);

    this.db.run(
      `INSERT INTO campaigns (
        id, merchant_id, subject, subject_hash, is_valuable, is_root,
        total_emails, unique_recipients, first_seen_at, last_seen_at, 
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 0, ?, 0, 0, ?, ?, ?, ?)`,
      [id, merchantId, subject, subjectHash, isRoot ? 1 : 0, now, now, now, now]
    );

    // Update merchant campaign count
    this.db.run(
      `UPDATE merchants SET total_campaigns = total_campaigns + 1, updated_at = ? WHERE id = ?`,
      [now, merchantId]
    );

    return this.getCampaignById(id);
  }

  getCampaignById(id: string): any | null {
    const result = this.db.exec('SELECT * FROM campaigns WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    const row = result[0].values[0];
    const columns = result[0].columns;
    return this.rowToCampaign(columns, row);
  }

  trackEmail(data: { campaignId: string; recipient: string; receivedAt: string; workerName: string }): void {
    if (!data.workerName || data.workerName.trim() === '') {
      throw new Error('workerName is required');
    }
    this.db.run(
      `INSERT INTO campaign_emails (campaign_id, recipient, received_at, worker_name)
       VALUES (?, ?, ?, ?)`,
      [data.campaignId, data.recipient, data.receivedAt, data.workerName]
    );
  }


  addRecipientPath(merchantId: string, recipient: string, campaignId: string, sequenceOrder: number, isNewUser: boolean | null = null): void {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, first_received_at, is_new_user)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [merchantId, recipient, campaignId, sequenceOrder, now, isNewUser === null ? null : (isNewUser ? 1 : 0)]
    );
  }

  getRecipientPaths(merchantId: string): any[] {
    const result = this.db.exec(
      `SELECT * FROM recipient_paths WHERE merchant_id = ? ORDER BY recipient, sequence_order`,
      [merchantId]
    );
    if (result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj: any = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  getCampaignEmails(merchantId: string): any[] {
    const result = this.db.exec(
      `SELECT ce.* FROM campaign_emails ce
       JOIN campaigns c ON ce.campaign_id = c.id
       WHERE c.merchant_id = ?`,
      [merchantId]
    );
    if (result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj: any = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }


  /**
   * Rebuild recipient paths from campaign_emails data
   * Simulates POST /api/campaign/merchants/:id/rebuild-paths
   * Requirements: 3.1, 3.4
   */
  rebuildRecipientPaths(
    merchantId: string,
    workerNames?: string[]
  ): { pathsDeleted: number; pathsCreated: number; recipientsProcessed: number } {
    // Get all campaign emails for this merchant, ordered by recipient and received_at
    let emailsQuery = `
      SELECT ce.recipient, ce.campaign_id, ce.received_at
      FROM campaign_emails ce
      JOIN campaigns c ON ce.campaign_id = c.id
      WHERE c.merchant_id = ?
    `;
    const params: any[] = [merchantId];

    // Filter by worker names if provided and non-empty
    if (workerNames && workerNames.length > 0) {
      const placeholders = workerNames.map(() => '?').join(', ');
      emailsQuery += ` AND ce.worker_name IN (${placeholders})`;
      params.push(...workerNames);
    }

    emailsQuery += ' ORDER BY ce.recipient, ce.received_at ASC';

    const emailsResult = this.db.exec(emailsQuery, params);
    const emails: Array<{ recipient: string; campaign_id: string; received_at: string }> = [];
    if (emailsResult.length > 0) {
      const columns = emailsResult[0].columns;
      for (const row of emailsResult[0].values) {
        const obj: any = {};
        columns.forEach((col, i) => { obj[col] = row[i]; });
        emails.push(obj);
      }
    }

    // Delete existing paths for this merchant
    const beforeDelete = this.getRecipientPaths(merchantId);
    this.db.run('DELETE FROM recipient_paths WHERE merchant_id = ?', [merchantId]);
    const pathsDeleted = beforeDelete.length;


    // Group emails by recipient
    const recipientEmails = new Map<string, Array<{ campaign_id: string; received_at: string }>>();
    for (const email of emails) {
      if (!recipientEmails.has(email.recipient)) {
        recipientEmails.set(email.recipient, []);
      }
      recipientEmails.get(email.recipient)!.push({
        campaign_id: email.campaign_id,
        received_at: email.received_at,
      });
    }

    // Rebuild paths for each recipient
    let pathsCreated = 0;
    for (const [recipient, emailList] of recipientEmails) {
      const addedCampaigns = new Set<string>();
      let sequenceOrder = 1;

      for (const email of emailList) {
        if (!addedCampaigns.has(email.campaign_id)) {
          this.db.run(
            `INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, first_received_at)
             VALUES (?, ?, ?, ?, ?)`,
            [merchantId, recipient, email.campaign_id, sequenceOrder, email.received_at]
          );
          addedCampaigns.add(email.campaign_id);
          sequenceOrder++;
          pathsCreated++;
        }
      }
    }

    // Recalculate new/old user flags
    this.recalculateAllNewUsers(merchantId);

    return {
      pathsDeleted,
      pathsCreated,
      recipientsProcessed: recipientEmails.size,
    };
  }


  /**
   * Cleanup old customer paths
   * Simulates POST /api/campaign/merchants/:id/cleanup-old-customers
   * Requirements: 7.4, 7.6
   */
  cleanupOldCustomerPaths(
    merchantId: string,
    workerNames?: string[]
  ): { pathsDeleted: number; recipientsAffected: number } {
    // Get all recipients who are old customers (is_new_user = 0 or NULL)
    let oldCustomersQuery = `
      SELECT DISTINCT recipient
      FROM recipient_paths
      WHERE merchant_id = ?
        AND (is_new_user = 0 OR is_new_user IS NULL)
    `;
    const params: any[] = [merchantId];

    // If workerNames is provided and non-empty, filter by workers
    if (workerNames && workerNames.length > 0) {
      const placeholders = workerNames.map(() => '?').join(', ');
      oldCustomersQuery += `
        AND recipient IN (
          SELECT DISTINCT ce.recipient
          FROM campaign_emails ce
          JOIN campaigns c ON ce.campaign_id = c.id
          WHERE c.merchant_id = ? AND ce.worker_name IN (${placeholders})
        )
      `;
      params.push(merchantId, ...workerNames);
    }

    const oldCustomersResult = this.db.exec(oldCustomersQuery, params);
    const oldCustomers: string[] = [];
    if (oldCustomersResult.length > 0) {
      for (const row of oldCustomersResult[0].values) {
        oldCustomers.push(row[0] as string);
      }
    }

    const recipientsAffected = oldCustomers.length;
    if (recipientsAffected === 0) {
      return { pathsDeleted: 0, recipientsAffected: 0 };
    }


    // Count paths before deletion
    const pathsBeforeResult = this.db.exec(
      `SELECT COUNT(*) FROM recipient_paths WHERE merchant_id = ? AND recipient IN (${oldCustomers.map(() => '?').join(', ')})`,
      [merchantId, ...oldCustomers]
    );
    const pathsBefore = pathsBeforeResult.length > 0 ? pathsBeforeResult[0].values[0][0] as number : 0;

    // Delete paths for old customers (preserve campaign_emails per Requirements 7.5)
    this.db.run(
      `DELETE FROM recipient_paths WHERE merchant_id = ? AND recipient IN (${oldCustomers.map(() => '?').join(', ')})`,
      [merchantId, ...oldCustomers]
    );

    return {
      pathsDeleted: pathsBefore,
      recipientsAffected,
    };
  }

  recalculateAllNewUsers(merchantId: string): void {
    // Get all root campaigns for this merchant
    const rootCampaignsResult = this.db.exec(
      'SELECT id FROM campaigns WHERE merchant_id = ? AND is_root = 1',
      [merchantId]
    );
    const rootCampaignIds: string[] = [];
    if (rootCampaignsResult.length > 0) {
      for (const row of rootCampaignsResult[0].values) {
        rootCampaignIds.push(row[0] as string);
      }
    }

    if (rootCampaignIds.length === 0) {
      // No root campaigns, mark all as NULL (unknown)
      this.db.run('UPDATE recipient_paths SET is_new_user = NULL WHERE merchant_id = ?', [merchantId]);
      return;
    }


    // Get all recipients and their first campaign
    const recipientsResult = this.db.exec(
      `SELECT recipient, campaign_id FROM recipient_paths 
       WHERE merchant_id = ? AND sequence_order = 1`,
      [merchantId]
    );

    if (recipientsResult.length === 0) return;

    for (const row of recipientsResult[0].values) {
      const recipient = row[0] as string;
      const firstCampaignId = row[1] as string;
      const isNewUser = rootCampaignIds.includes(firstCampaignId) ? 1 : 0;

      this.db.run(
        'UPDATE recipient_paths SET is_new_user = ? WHERE merchant_id = ? AND recipient = ?',
        [isNewUser, merchantId, recipient]
      );
    }
  }

  private calculateSubjectHash(subject: string): string {
    // Simple hash for testing
    let hash = 0;
    for (let i = 0; i < subject.length; i++) {
      const char = subject.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  private rowToMerchant(columns: string[], row: any[]): any {
    const obj: any = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return {
      id: obj.id,
      domain: obj.domain,
      displayName: obj.display_name,
      totalCampaigns: obj.total_campaigns,
      totalEmails: obj.total_emails,
    };
  }

  private rowToCampaign(columns: string[], row: any[]): any {
    const obj: any = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return {
      id: obj.id,
      merchantId: obj.merchant_id,
      subject: obj.subject,
      isRoot: obj.is_root === 1,
    };
  }
}


// Helper to initialize test database
async function createTestDb(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  
  // Load campaign schema
  const campaignSchemaPath = join(__dirname, '../db/schema.sql');
  const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
  db.run(campaignSchema);
  
  // Add migration columns that are added via migrate-campaign.ts
  db.run('ALTER TABLE campaigns ADD COLUMN is_root INTEGER DEFAULT 0');
  db.run('ALTER TABLE campaigns ADD COLUMN is_root_candidate INTEGER DEFAULT 0');
  db.run('ALTER TABLE campaigns ADD COLUMN root_candidate_reason TEXT');
  db.run('ALTER TABLE campaigns ADD COLUMN tag INTEGER DEFAULT 0');
  db.run('ALTER TABLE recipient_paths ADD COLUMN is_new_user INTEGER DEFAULT 0');
  db.run('ALTER TABLE recipient_paths ADD COLUMN first_root_campaign_id TEXT');
  
  return db;
}

// ============================================
// Integration Tests for API Endpoints
// ============================================

describe('Campaign Routes Integration Tests', () => {
  /**
   * Tests for POST /api/campaign/merchants/:id/rebuild-paths
   * Requirements: 3.1, 3.4
   */
  describe('POST /merchants/:id/rebuild-paths', () => {
    it('should rebuild paths from campaign_emails data', async () => {
      const db = await createTestDb();
      const service = new TestCampaignService(db);

      try {
        // Setup: Create merchant and campaigns
        const merchant = service.createMerchant('test.com');
        const campaign1 = service.createCampaign(merchant.id, 'Welcome Email', true);
        const campaign2 = service.createCampaign(merchant.id, 'Promo Email');

        // Track emails for recipient
        const baseTime = new Date('2024-01-01T10:00:00Z');
        service.trackEmail({
          campaignId: campaign1.id,
          recipient: 'user@example.com',
          receivedAt: baseTime.toISOString(),
          workerName: 'test-worker',
        });
        service.trackEmail({
          campaignId: campaign2.id,
          recipient: 'user@example.com',
          receivedAt: new Date(baseTime.getTime() + 3600000).toISOString(),
          workerName: 'test-worker',
        });


        // Execute rebuild
        const result = service.rebuildRecipientPaths(merchant.id);

        // Verify result
        expect(result.recipientsProcessed).toBe(1);
        expect(result.pathsCreated).toBe(2);

        // Verify paths are in correct order
        const paths = service.getRecipientPaths(merchant.id);
        expect(paths.length).toBe(2);
        expect(paths[0].campaign_id).toBe(campaign1.id);
        expect(paths[0].sequence_order).toBe(1);
        expect(paths[1].campaign_id).toBe(campaign2.id);
        expect(paths[1].sequence_order).toBe(2);
      } finally {
        db.close();
      }
    });

    it('should filter by workerNames when provided', async () => {
      const db = await createTestDb();
      const service = new TestCampaignService(db);

      try {
        // Setup: Create merchant and campaigns
        const merchant = service.createMerchant('test.com');
        const campaign1 = service.createCampaign(merchant.id, 'Welcome Email', true);
        const campaign2 = service.createCampaign(merchant.id, 'Promo Email');

        // Track emails from different workers
        const baseTime = new Date('2024-01-01T10:00:00Z');
        service.trackEmail({
          campaignId: campaign1.id,
          recipient: 'user@example.com',
          receivedAt: baseTime.toISOString(),
          workerName: 'worker-a',
        });
        service.trackEmail({
          campaignId: campaign2.id,
          recipient: 'user@example.com',
          receivedAt: new Date(baseTime.getTime() + 3600000).toISOString(),
          workerName: 'worker-b',
        });


        // Rebuild with only worker-a filter
        const result = service.rebuildRecipientPaths(merchant.id, ['worker-a']);

        // Verify only worker-a emails are included
        expect(result.recipientsProcessed).toBe(1);
        expect(result.pathsCreated).toBe(1);

        const paths = service.getRecipientPaths(merchant.id);
        expect(paths.length).toBe(1);
        expect(paths[0].campaign_id).toBe(campaign1.id);
      } finally {
        db.close();
      }
    });

    it('should delete existing paths before rebuilding', async () => {
      const db = await createTestDb();
      const service = new TestCampaignService(db);

      try {
        // Setup: Create merchant and campaigns
        const merchant = service.createMerchant('test.com');
        const campaign1 = service.createCampaign(merchant.id, 'Welcome Email', true);

        // Add existing path manually
        service.addRecipientPath(merchant.id, 'old@example.com', campaign1.id, 1, true);
        expect(service.getRecipientPaths(merchant.id).length).toBe(1);

        // Track new email
        service.trackEmail({
          campaignId: campaign1.id,
          recipient: 'new@example.com',
          receivedAt: new Date().toISOString(),
          workerName: 'test-worker',
        });

        // Rebuild paths
        const result = service.rebuildRecipientPaths(merchant.id);

        // Verify old paths were deleted
        expect(result.pathsDeleted).toBe(1);
        expect(result.recipientsProcessed).toBe(1);

        const paths = service.getRecipientPaths(merchant.id);
        expect(paths.length).toBe(1);
        expect(paths[0].recipient).toBe('new@example.com');
      } finally {
        db.close();
      }
    });


    it('should recalculate new/old user flags after rebuild', async () => {
      const db = await createTestDb();
      const service = new TestCampaignService(db);

      try {
        // Setup: Create merchant with root and non-root campaigns
        const merchant = service.createMerchant('test.com');
        const rootCampaign = service.createCampaign(merchant.id, 'Welcome Email', true);
        const promoCampaign = service.createCampaign(merchant.id, 'Promo Email', false);

        const baseTime = new Date('2024-01-01T10:00:00Z');

        // New user: first email from root campaign
        service.trackEmail({
          campaignId: rootCampaign.id,
          recipient: 'newuser@example.com',
          receivedAt: baseTime.toISOString(),
          workerName: 'test-worker',
        });

        // Old user: first email from non-root campaign
        service.trackEmail({
          campaignId: promoCampaign.id,
          recipient: 'olduser@example.com',
          receivedAt: baseTime.toISOString(),
          workerName: 'test-worker',
        });

        // Rebuild paths
        service.rebuildRecipientPaths(merchant.id);

        // Verify new/old user flags
        const paths = service.getRecipientPaths(merchant.id);
        const newUserPath = paths.find(p => p.recipient === 'newuser@example.com');
        const oldUserPath = paths.find(p => p.recipient === 'olduser@example.com');

        expect(newUserPath?.is_new_user).toBe(1);
        expect(oldUserPath?.is_new_user).toBe(0);
      } finally {
        db.close();
      }
    });
  });


  /**
   * Tests for POST /api/campaign/merchants/:id/cleanup-old-customers
   * Requirements: 7.4, 7.6
   */
  describe('POST /merchants/:id/cleanup-old-customers', () => {
    it('should remove paths for old customers only', async () => {
      const db = await createTestDb();
      const service = new TestCampaignService(db);

      try {
        // Setup: Create merchant with root campaign
        const merchant = service.createMerchant('test.com');
        const rootCampaign = service.createCampaign(merchant.id, 'Welcome Email', true);
        const promoCampaign = service.createCampaign(merchant.id, 'Promo Email', false);

        // Add paths for new user (is_new_user = 1)
        service.addRecipientPath(merchant.id, 'newuser@example.com', rootCampaign.id, 1, true);
        service.addRecipientPath(merchant.id, 'newuser@example.com', promoCampaign.id, 2, true);

        // Add paths for old user (is_new_user = 0)
        service.addRecipientPath(merchant.id, 'olduser@example.com', promoCampaign.id, 1, false);

        // Track emails for both users (needed for worker filter)
        service.trackEmail({
          campaignId: rootCampaign.id,
          recipient: 'newuser@example.com',
          receivedAt: new Date().toISOString(),
          workerName: 'test-worker',
        });
        service.trackEmail({
          campaignId: promoCampaign.id,
          recipient: 'olduser@example.com',
          receivedAt: new Date().toISOString(),
          workerName: 'test-worker',
        });

        // Cleanup old customers
        const result = service.cleanupOldCustomerPaths(merchant.id);

        // Verify only old customer paths were removed
        expect(result.recipientsAffected).toBe(1);
        expect(result.pathsDeleted).toBe(1);

        const paths = service.getRecipientPaths(merchant.id);
        expect(paths.length).toBe(2);
        expect(paths.every(p => p.recipient === 'newuser@example.com')).toBe(true);
      } finally {
        db.close();
      }
    });


    it('should preserve campaign_emails records after cleanup', async () => {
      const db = await createTestDb();
      const service = new TestCampaignService(db);

      try {
        // Setup: Create merchant with campaigns
        const merchant = service.createMerchant('test.com');
        const promoCampaign = service.createCampaign(merchant.id, 'Promo Email', false);

        // Add path for old user
        service.addRecipientPath(merchant.id, 'olduser@example.com', promoCampaign.id, 1, false);

        // Track email
        service.trackEmail({
          campaignId: promoCampaign.id,
          recipient: 'olduser@example.com',
          receivedAt: new Date().toISOString(),
          workerName: 'test-worker',
        });

        // Verify email exists before cleanup
        const emailsBefore = service.getCampaignEmails(merchant.id);
        expect(emailsBefore.length).toBe(1);

        // Cleanup old customers
        service.cleanupOldCustomerPaths(merchant.id);

        // Verify campaign_emails are preserved (Requirements 7.5)
        const emailsAfter = service.getCampaignEmails(merchant.id);
        expect(emailsAfter.length).toBe(1);
        expect(emailsAfter[0].recipient).toBe('olduser@example.com');

        // Verify paths are deleted
        const paths = service.getRecipientPaths(merchant.id);
        expect(paths.length).toBe(0);
      } finally {
        db.close();
      }
    });

    it('should filter by workerNames when provided', async () => {
      const db = await createTestDb();
      const service = new TestCampaignService(db);

      try {
        // Setup: Create merchant with campaigns
        const merchant = service.createMerchant('test.com');
        const promoCampaign = service.createCampaign(merchant.id, 'Promo Email', false);


        // Add paths for old users from different workers
        service.addRecipientPath(merchant.id, 'olduser-a@example.com', promoCampaign.id, 1, false);
        service.addRecipientPath(merchant.id, 'olduser-b@example.com', promoCampaign.id, 1, false);

        // Track emails from different workers
        service.trackEmail({
          campaignId: promoCampaign.id,
          recipient: 'olduser-a@example.com',
          receivedAt: new Date().toISOString(),
          workerName: 'worker-a',
        });
        service.trackEmail({
          campaignId: promoCampaign.id,
          recipient: 'olduser-b@example.com',
          receivedAt: new Date().toISOString(),
          workerName: 'worker-b',
        });

        // Cleanup only worker-a old customers
        const result = service.cleanupOldCustomerPaths(merchant.id, ['worker-a']);

        // Verify only worker-a old customer was affected
        expect(result.recipientsAffected).toBe(1);

        const paths = service.getRecipientPaths(merchant.id);
        expect(paths.length).toBe(1);
        expect(paths[0].recipient).toBe('olduser-b@example.com');
      } finally {
        db.close();
      }
    });

    it('should return zero counts when no old customers exist', async () => {
      const db = await createTestDb();
      const service = new TestCampaignService(db);

      try {
        // Setup: Create merchant with only new users
        const merchant = service.createMerchant('test.com');
        const rootCampaign = service.createCampaign(merchant.id, 'Welcome Email', true);

        // Add path for new user only
        service.addRecipientPath(merchant.id, 'newuser@example.com', rootCampaign.id, 1, true);

        // Cleanup old customers
        const result = service.cleanupOldCustomerPaths(merchant.id);

        // Verify no changes
        expect(result.recipientsAffected).toBe(0);
        expect(result.pathsDeleted).toBe(0);

        const paths = service.getRecipientPaths(merchant.id);
        expect(paths.length).toBe(1);
      } finally {
        db.close();
      }
    });
  });
});
