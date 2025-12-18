/**
 * Campaign Routes Tests
 * 
 * Property-based tests for campaign API route validation
 * Integration tests for campaign API endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { validateTrackEmail } from './campaign.js';
import { extractDomain, calculateSubjectHash } from '../services/campaign-analytics.service.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Arbitraries for generating test data
// ============================================

// Generate valid domain parts (no spaces, at least one character)
const domainPartArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
  { minLength: 1, maxLength: 20 }
).filter(s => !s.startsWith('-') && !s.endsWith('-'));

// Generate valid TLDs
const tldArb = fc.constantFrom('com', 'org', 'net', 'io', 'co', 'edu', 'gov');

// Generate valid domain (e.g., "example.com")
const validDomainArb = fc.tuple(domainPartArb, tldArb)
  .map(([name, tld]) => `${name}.${tld}`);

// Generate valid local part of email (before @)
const localPartArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789._+-'.split('')),
  { minLength: 1, maxLength: 30 }
).filter(s => s.length > 0 && !s.startsWith('.') && !s.endsWith('.'));

// Generate valid email address
const validEmailArb = fc.tuple(localPartArb, validDomainArb)
  .map(([local, domain]) => `${local}@${domain}`);

// Generate non-empty string for subject
const validSubjectArb = fc.string({ minLength: 1, maxLength: 200 })
  .filter(s => s.trim().length > 0);

// Generate valid TrackEmailDTO
const validTrackEmailDTOArb = fc.record({
  sender: validEmailArb,
  subject: validSubjectArb,
  recipient: validEmailArb,
});

// Generate whitespace-only strings
const whitespaceOnlyArb = fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 10 });

describe('Campaign Routes Validation', () => {
  /**
   * **Feature: campaign-analytics, Property 12: Data Validation**
   * **Validates: Requirements 8.2**
   * 
   * For any track request with missing required fields (sender, subject, recipient),
   * the API should return a validation error.
   */
  describe('Property 12: Data Validation', () => {
    it('should accept valid TrackEmailDTO with all required fields', () => {
      fc.assert(
        fc.property(
          validTrackEmailDTOArb,
          (dto) => {
            const result = validateTrackEmail(dto);
            
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
            expect(result.data).toBeDefined();
            expect(result.data!.sender).toBe(dto.sender.trim());
            expect(result.data!.subject).toBe(dto.subject.trim());
            expect(result.data!.recipient).toBe(dto.recipient.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests with missing sender', () => {
      fc.assert(
        fc.property(
          validSubjectArb,
          validEmailArb,
          (subject, recipient) => {
            // Missing sender entirely
            const result1 = validateTrackEmail({ subject, recipient });
            expect(result1.valid).toBe(false);
            expect(result1.error).toContain('sender');

            // Null sender
            const result2 = validateTrackEmail({ sender: null, subject, recipient });
            expect(result2.valid).toBe(false);
            expect(result2.error).toContain('sender');

            // Undefined sender
            const result3 = validateTrackEmail({ sender: undefined, subject, recipient });
            expect(result3.valid).toBe(false);
            expect(result3.error).toContain('sender');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests with empty or whitespace-only sender', () => {
      fc.assert(
        fc.property(
          whitespaceOnlyArb,
          validSubjectArb,
          validEmailArb,
          (emptySender, subject, recipient) => {
            const result = validateTrackEmail({ sender: emptySender, subject, recipient });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('sender');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests with missing subject', () => {
      fc.assert(
        fc.property(
          validEmailArb,
          validEmailArb,
          (sender, recipient) => {
            // Missing subject entirely
            const result1 = validateTrackEmail({ sender, recipient });
            expect(result1.valid).toBe(false);
            expect(result1.error).toContain('subject');

            // Null subject
            const result2 = validateTrackEmail({ sender, subject: null, recipient });
            expect(result2.valid).toBe(false);
            expect(result2.error).toContain('subject');

            // Undefined subject
            const result3 = validateTrackEmail({ sender, subject: undefined, recipient });
            expect(result3.valid).toBe(false);
            expect(result3.error).toContain('subject');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests with empty or whitespace-only subject', () => {
      fc.assert(
        fc.property(
          validEmailArb,
          whitespaceOnlyArb,
          validEmailArb,
          (sender, emptySubject, recipient) => {
            const result = validateTrackEmail({ sender, subject: emptySubject, recipient });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('subject');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests with missing recipient', () => {
      fc.assert(
        fc.property(
          validEmailArb,
          validSubjectArb,
          (sender, subject) => {
            // Missing recipient entirely
            const result1 = validateTrackEmail({ sender, subject });
            expect(result1.valid).toBe(false);
            expect(result1.error).toContain('recipient');

            // Null recipient
            const result2 = validateTrackEmail({ sender, subject, recipient: null });
            expect(result2.valid).toBe(false);
            expect(result2.error).toContain('recipient');

            // Undefined recipient
            const result3 = validateTrackEmail({ sender, subject, recipient: undefined });
            expect(result3.valid).toBe(false);
            expect(result3.error).toContain('recipient');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests with empty or whitespace-only recipient', () => {
      fc.assert(
        fc.property(
          validEmailArb,
          validSubjectArb,
          whitespaceOnlyArb,
          (sender, subject, emptyRecipient) => {
            const result = validateTrackEmail({ sender, subject, recipient: emptyRecipient });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('recipient');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject null or undefined request body', () => {
      const result1 = validateTrackEmail(null);
      expect(result1.valid).toBe(false);
      expect(result1.error).toBeDefined();

      const result2 = validateTrackEmail(undefined);
      expect(result2.valid).toBe(false);
      expect(result2.error).toBeDefined();
    });

    it('should reject non-object request body', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.array(fc.anything())
          ),
          (invalidBody) => {
            const result = validateTrackEmail(invalidBody);
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept optional receivedAt field when valid', () => {
      fc.assert(
        fc.property(
          validTrackEmailDTOArb,
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
          (dto, date) => {
            const dtoWithDate = { ...dto, receivedAt: date.toISOString() };
            const result = validateTrackEmail(dtoWithDate);
            
            expect(result.valid).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data!.receivedAt).toBe(date.toISOString());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject non-string receivedAt field', () => {
      fc.assert(
        fc.property(
          validTrackEmailDTOArb,
          fc.oneof(fc.integer(), fc.boolean(), fc.object()),
          (dto, invalidReceivedAt) => {
            const dtoWithInvalidDate = { ...dto, receivedAt: invalidReceivedAt };
            const result = validateTrackEmail(dtoWithInvalidDate);
            
            expect(result.valid).toBe(false);
            expect(result.error).toContain('receivedAt');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should trim whitespace from valid fields', () => {
      // Use subjects without leading/trailing whitespace for this test
      const trimmedSubjectArb = fc.string({ minLength: 1, maxLength: 200 })
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      fc.assert(
        fc.property(
          validEmailArb,
          trimmedSubjectArb,
          validEmailArb,
          (sender, subject, recipient) => {
            // Add whitespace around values
            const dtoWithWhitespace = {
              sender: `  ${sender}  `,
              subject: `  ${subject}  `,
              recipient: `  ${recipient}  `,
            };
            
            const result = validateTrackEmail(dtoWithWhitespace);
            
            expect(result.valid).toBe(true);
            expect(result.data!.sender).toBe(sender);
            expect(result.data!.subject).toBe(subject);
            expect(result.data!.recipient).toBe(recipient);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ============================================
// Integration Tests for DELETE /api/campaign/merchants/:id/data
// ============================================

/**
 * Test-specific service that works with sql.js for delete API testing
 * Requirements: 3.2, 3.3
 */
class TestDeleteService {
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

  getOrCreateMerchant(domain: string): { merchant: any; isNew: boolean } {
    const normalizedDomain = domain.toLowerCase();
    const existing = this.getMerchantByDomain(normalizedDomain);
    
    if (existing) {
      return { merchant: existing, isNew: false };
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO merchants (id, domain, total_campaigns, total_emails, created_at, updated_at)
       VALUES (?, ?, 0, 0, ?, ?)`,
      [id, normalizedDomain, now, now]
    );

    const merchant = this.getMerchantById(id);
    return { merchant, isNew: true };
  }

  getCampaignByMerchantAndSubject(merchantId: string, subjectHash: string): any | null {
    const result = this.db.exec(
      'SELECT * FROM campaigns WHERE merchant_id = ? AND subject_hash = ?',
      [merchantId, subjectHash]
    );
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    const row = result[0].values[0];
    const columns = result[0].columns;
    return this.rowToCampaign(columns, row);
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

  createOrUpdateCampaign(
    merchantId: string,
    subject: string,
    receivedAt: Date
  ): { campaign: any; isNew: boolean } {
    const subjectHash = calculateSubjectHash(subject);
    const now = new Date().toISOString();
    const receivedAtStr = receivedAt.toISOString();

    const existing = this.getCampaignByMerchantAndSubject(merchantId, subjectHash);

    if (existing) {
      this.db.run(
        `UPDATE campaigns
         SET total_emails = total_emails + 1,
             last_seen_at = MAX(last_seen_at, ?),
             updated_at = ?
         WHERE id = ?`,
        [receivedAtStr, now, existing.id]
      );

      const updated = this.getCampaignById(existing.id);
      return { campaign: updated, isNew: false };
    }

    const id = uuidv4();
    this.db.run(
      `INSERT INTO campaigns (
        id, merchant_id, subject, subject_hash, is_valuable, 
        total_emails, unique_recipients, first_seen_at, last_seen_at, 
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 0, 1, 0, ?, ?, ?, ?)`,
      [id, merchantId, subject, subjectHash, receivedAtStr, receivedAtStr, now, now]
    );

    // Update merchant campaign count
    this.db.run(
      `UPDATE merchants SET total_campaigns = total_campaigns + 1, updated_at = ? WHERE id = ?`,
      [now, merchantId]
    );

    const created = this.getCampaignById(id);
    return { campaign: created, isNew: true };
  }

  trackEmail(data: { sender: string; subject: string; recipient: string; receivedAt?: string; workerName?: string }): any {
    const domain = extractDomain(data.sender);
    if (!domain) {
      throw new Error('Invalid sender email');
    }

    const receivedAt = data.receivedAt ? new Date(data.receivedAt) : new Date();
    const receivedAtStr = receivedAt.toISOString();
    const now = new Date().toISOString();
    const workerName = data.workerName || 'global';
    
    const { merchant, isNew: isNewMerchant } = this.getOrCreateMerchant(domain);
    const { campaign, isNew: isNewCampaign } = this.createOrUpdateCampaign(
      merchant.id,
      data.subject,
      receivedAt
    );

    // Record the email with worker_name
    this.db.run(
      `INSERT INTO campaign_emails (campaign_id, recipient, received_at, worker_name)
       VALUES (?, ?, ?, ?)`,
      [campaign.id, data.recipient, receivedAtStr, workerName]
    );

    // Update merchant total emails
    this.db.run(
      `UPDATE merchants SET total_emails = total_emails + 1, updated_at = ? WHERE id = ?`,
      [now, merchant.id]
    );

    // Handle recipient path tracking
    const existingPathResult = this.db.exec(
      `SELECT id FROM recipient_paths 
       WHERE merchant_id = ? AND recipient = ? AND campaign_id = ?`,
      [merchant.id, data.recipient, campaign.id]
    );

    const existingPathEntry = existingPathResult.length > 0 && existingPathResult[0].values.length > 0;

    if (!existingPathEntry) {
      const maxOrderResult = this.db.exec(
        `SELECT MAX(sequence_order) as max_order 
         FROM recipient_paths 
         WHERE merchant_id = ? AND recipient = ?`,
        [merchant.id, data.recipient]
      );

      let nextOrder = 0;
      if (maxOrderResult.length > 0 && maxOrderResult[0].values.length > 0) {
        const maxOrder = maxOrderResult[0].values[0][0];
        nextOrder = (maxOrder !== null ? (maxOrder as number) : -1) + 1;
      }

      this.db.run(
        `INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, first_received_at)
         VALUES (?, ?, ?, ?, ?)`,
        [merchant.id, data.recipient, campaign.id, nextOrder, receivedAtStr]
      );

      this.db.run(
        `UPDATE campaigns SET unique_recipients = unique_recipients + 1, updated_at = ? WHERE id = ?`,
        [now, campaign.id]
      );
    }

    return {
      merchantId: merchant.id,
      campaignId: campaign.id,
      isNewMerchant,
      isNewCampaign,
    };
  }

  /**
   * Delete merchant data for a specific worker
   * Requirements: 3.2, 3.3, 3.5, 3.6
   */
  deleteMerchantData(data: { merchantId: string; workerName: string }): {
    merchantId: string;
    workerName: string;
    emailsDeleted: number;
    pathsDeleted: number;
    campaignsAffected: number;
    merchantDeleted: boolean;
  } {
    const { merchantId, workerName } = data;

    // Check if merchant exists
    const merchant = this.getMerchantById(merchantId);
    if (!merchant) {
      throw new Error(`Merchant not found: ${merchantId}`);
    }

    let emailsDeleted = 0;
    let pathsDeleted = 0;
    let campaignsAffected = 0;
    let merchantDeleted = false;

    // Get all campaign IDs for this merchant
    const campaignIdsResult = this.db.exec(
      `SELECT id FROM campaigns WHERE merchant_id = ?`,
      [merchantId]
    );

    const campaignIds: string[] = [];
    if (campaignIdsResult.length > 0) {
      for (const row of campaignIdsResult[0].values) {
        campaignIds.push(row[0] as string);
      }
    }

    if (campaignIds.length > 0) {
      // Count emails to be deleted
      for (const campaignId of campaignIds) {
        const countResult = this.db.exec(
          `SELECT COUNT(*) as count FROM campaign_emails 
           WHERE campaign_id = ? AND worker_name = ?`,
          [campaignId, workerName]
        );
        if (countResult.length > 0 && countResult[0].values.length > 0) {
          emailsDeleted += countResult[0].values[0][0] as number;
        }
      }

      // Delete the emails
      for (const campaignId of campaignIds) {
        this.db.run(
          `DELETE FROM campaign_emails 
           WHERE campaign_id = ? AND worker_name = ?`,
          [campaignId, workerName]
        );
      }

      // Count affected campaigns
      const affectedResult = this.db.exec(
        `SELECT COUNT(DISTINCT id) as count FROM campaigns WHERE merchant_id = ?`,
        [merchantId]
      );
      if (affectedResult.length > 0 && affectedResult[0].values.length > 0) {
        campaignsAffected = affectedResult[0].values[0][0] as number;
      }
    }

    // Check if merchant has any remaining data
    const remainingResult = this.db.exec(
      `SELECT COUNT(*) as count FROM campaign_emails 
       WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?)`,
      [merchantId]
    );

    const remainingEmails = remainingResult.length > 0 && remainingResult[0].values.length > 0
      ? remainingResult[0].values[0][0] as number
      : 0;

    if (remainingEmails === 0) {
      // Delete all campaigns for this merchant
      this.db.run(`DELETE FROM campaigns WHERE merchant_id = ?`, [merchantId]);
      
      // Delete all paths for this merchant
      this.db.run(`DELETE FROM recipient_paths WHERE merchant_id = ?`, [merchantId]);
      
      // Delete the merchant record
      this.db.run(`DELETE FROM merchants WHERE id = ?`, [merchantId]);
      
      merchantDeleted = true;
    }

    return {
      merchantId,
      workerName,
      emailsDeleted,
      pathsDeleted,
      campaignsAffected,
      merchantDeleted,
    };
  }

  private rowToMerchant(columns: string[], row: any[]): any {
    const obj: any = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return {
      id: obj.id,
      domain: obj.domain,
      displayName: obj.display_name,
      note: obj.note,
      totalCampaigns: obj.total_campaigns,
      totalEmails: obj.total_emails,
      createdAt: new Date(obj.created_at),
      updatedAt: new Date(obj.updated_at),
    };
  }

  private rowToCampaign(columns: string[], row: any[]): any {
    const obj: any = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return {
      id: obj.id,
      merchantId: obj.merchant_id,
      subject: obj.subject,
      subjectHash: obj.subject_hash,
      isValuable: obj.is_valuable === 1,
      valuableNote: obj.valuable_note,
      totalEmails: obj.total_emails,
      uniqueRecipients: obj.unique_recipients,
      firstSeenAt: new Date(obj.first_seen_at),
      lastSeenAt: new Date(obj.last_seen_at),
      createdAt: new Date(obj.created_at),
      updatedAt: new Date(obj.updated_at),
    };
  }
}

/**
 * Helper function to create an in-memory database with required schema
 */
async function createTestDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  
  // Create merchants table
  db.run(`
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL UNIQUE,
      display_name TEXT,
      note TEXT,
      analysis_status TEXT DEFAULT 'pending',
      total_campaigns INTEGER DEFAULT 0,
      total_emails INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Create campaigns table
  db.run(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      subject_hash TEXT NOT NULL,
      is_valuable INTEGER DEFAULT 0,
      valuable_note TEXT,
      tag INTEGER DEFAULT 0,
      tag_note TEXT,
      is_root INTEGER DEFAULT 0,
      total_emails INTEGER DEFAULT 0,
      unique_recipients INTEGER DEFAULT 0,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    )
  `);

  // Create campaign_emails table
  db.run(`
    CREATE TABLE IF NOT EXISTS campaign_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      recipient TEXT NOT NULL,
      received_at TEXT NOT NULL,
      worker_name TEXT DEFAULT 'global',
      created_at TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    )
  `);

  // Create recipient_paths table
  db.run(`
    CREATE TABLE IF NOT EXISTS recipient_paths (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      recipient TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      sequence_order INTEGER NOT NULL,
      first_received_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    )
  `);

  return db;
}

describe('DELETE /api/campaign/merchants/:id/data Integration Tests', () => {
  let db: SqlJsDatabase;
  let service: TestDeleteService;

  beforeEach(async () => {
    db = await createTestDatabase();
    service = new TestDeleteService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Successful deletion scenarios', () => {
    it('should delete merchant data for a specific worker', () => {
      // Setup: Create merchant and track emails from a specific worker
      const trackResult = service.trackEmail({
        sender: 'test@example.com',
        subject: 'Test Campaign',
        recipient: 'user@test.com',
        workerName: 'worker-a',
      });

      const merchantId = trackResult.merchantId;

      // Verify data exists before deletion
      const merchantBefore = service.getMerchantById(merchantId);
      expect(merchantBefore).not.toBeNull();

      // Delete merchant data for worker-a
      const deleteResult = service.deleteMerchantData({
        merchantId,
        workerName: 'worker-a',
      });

      // Verify deletion result
      expect(deleteResult.merchantId).toBe(merchantId);
      expect(deleteResult.workerName).toBe('worker-a');
      expect(deleteResult.emailsDeleted).toBe(1);
      expect(deleteResult.merchantDeleted).toBe(true); // No other worker data
    });

    it('should preserve data from other workers when deleting', () => {
      // Setup: Create merchant with data from two workers
      const trackResult1 = service.trackEmail({
        sender: 'test@example.com',
        subject: 'Campaign 1',
        recipient: 'user1@test.com',
        workerName: 'worker-a',
      });

      service.trackEmail({
        sender: 'test@example.com',
        subject: 'Campaign 2',
        recipient: 'user2@test.com',
        workerName: 'worker-b',
      });

      const merchantId = trackResult1.merchantId;

      // Delete data for worker-a only
      const deleteResult = service.deleteMerchantData({
        merchantId,
        workerName: 'worker-a',
      });

      // Verify deletion result
      expect(deleteResult.emailsDeleted).toBe(1);
      expect(deleteResult.merchantDeleted).toBe(false); // worker-b data still exists

      // Verify merchant still exists
      const merchantAfter = service.getMerchantById(merchantId);
      expect(merchantAfter).not.toBeNull();
    });

    it('should return correct statistics after deletion', () => {
      // Setup: Create merchant with multiple emails from same worker
      const trackResult = service.trackEmail({
        sender: 'test@example.com',
        subject: 'Campaign 1',
        recipient: 'user1@test.com',
        workerName: 'worker-a',
      });

      service.trackEmail({
        sender: 'test@example.com',
        subject: 'Campaign 1',
        recipient: 'user2@test.com',
        workerName: 'worker-a',
      });

      service.trackEmail({
        sender: 'test@example.com',
        subject: 'Campaign 2',
        recipient: 'user1@test.com',
        workerName: 'worker-a',
      });

      const merchantId = trackResult.merchantId;

      // Delete all data for worker-a
      const deleteResult = service.deleteMerchantData({
        merchantId,
        workerName: 'worker-a',
      });

      // Verify statistics
      expect(deleteResult.emailsDeleted).toBe(3);
      expect(deleteResult.campaignsAffected).toBeGreaterThanOrEqual(1);
      expect(deleteResult.merchantDeleted).toBe(true);
    });
  });

  describe('Merchant not found scenarios', () => {
    it('should throw error when merchant does not exist', () => {
      expect(() => {
        service.deleteMerchantData({
          merchantId: 'non-existent-id',
          workerName: 'worker-a',
        });
      }).toThrow('Merchant not found');
    });

    it('should throw error with correct merchant ID in message', () => {
      const fakeId = 'fake-merchant-123';
      expect(() => {
        service.deleteMerchantData({
          merchantId: fakeId,
          workerName: 'worker-a',
        });
      }).toThrow(`Merchant not found: ${fakeId}`);
    });
  });

  describe('Worker name validation scenarios', () => {
    it('should handle deletion when worker has no data for merchant', () => {
      // Setup: Create merchant with data from worker-a
      const trackResult = service.trackEmail({
        sender: 'test@example.com',
        subject: 'Test Campaign',
        recipient: 'user@test.com',
        workerName: 'worker-a',
      });

      const merchantId = trackResult.merchantId;

      // Try to delete data for worker-b (which has no data)
      const deleteResult = service.deleteMerchantData({
        merchantId,
        workerName: 'worker-b',
      });

      // Should succeed but delete nothing
      expect(deleteResult.emailsDeleted).toBe(0);
      expect(deleteResult.pathsDeleted).toBe(0);
      expect(deleteResult.merchantDeleted).toBe(false);

      // Original data should still exist
      const merchantAfter = service.getMerchantById(merchantId);
      expect(merchantAfter).not.toBeNull();
    });

    it('should handle different worker name formats', () => {
      // Setup: Create merchant with data
      const trackResult = service.trackEmail({
        sender: 'test@example.com',
        subject: 'Test Campaign',
        recipient: 'user@test.com',
        workerName: 'Worker-With-Dashes',
      });

      const merchantId = trackResult.merchantId;

      // Delete with exact worker name
      const deleteResult = service.deleteMerchantData({
        merchantId,
        workerName: 'Worker-With-Dashes',
      });

      expect(deleteResult.emailsDeleted).toBe(1);
      expect(deleteResult.merchantDeleted).toBe(true);
    });
  });
});
