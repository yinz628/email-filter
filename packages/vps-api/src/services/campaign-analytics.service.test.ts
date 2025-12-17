/**
 * Campaign Analytics Service Tests
 * 
 * Property-based tests for campaign analytics functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractDomain, calculateSubjectHash } from './campaign-analytics.service.js';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// Test Repository for sql.js (in-memory testing)
// ============================================

/**
 * Test-specific CampaignAnalyticsService that works with sql.js
 */
class TestCampaignAnalyticsService {
  constructor(private db: SqlJsDatabase) {}

  getMerchantByDomain(domain: string): any | null {
    const result = this.db.exec('SELECT * FROM merchants WHERE domain = ?', [domain.toLowerCase()]);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    const row = result[0].values[0];
    const columns = result[0].columns;
    return this.rowToMerchant(columns, row);
  }

  getMerchantById(id: string): any | null {
    const result = this.db.exec('SELECT * FROM merchants WHERE id = ?', [id]);
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

  trackEmail(data: { sender: string; subject: string; recipient: string; receivedAt?: string }): any {
    const domain = extractDomain(data.sender);
    if (!domain) {
      throw new Error('Invalid sender email');
    }

    const receivedAt = data.receivedAt ? new Date(data.receivedAt) : new Date();
    const receivedAtStr = receivedAt.toISOString();
    const now = new Date().toISOString();
    
    const { merchant, isNew: isNewMerchant } = this.getOrCreateMerchant(domain);
    const { campaign, isNew: isNewCampaign } = this.createOrUpdateCampaign(
      merchant.id,
      data.subject,
      receivedAt
    );

    // Record the email
    this.db.run(
      `INSERT INTO campaign_emails (campaign_id, recipient, received_at)
       VALUES (?, ?, ?)`,
      [campaign.id, data.recipient, receivedAtStr]
    );

    // Update merchant total emails
    this.db.run(
      `UPDATE merchants SET total_emails = total_emails + 1, updated_at = ? WHERE id = ?`,
      [now, merchant.id]
    );

    // Handle recipient path tracking
    // Check if this campaign already exists in the recipient's path for this merchant
    const existingPathResult = this.db.exec(
      `SELECT id FROM recipient_paths 
       WHERE merchant_id = ? AND recipient = ? AND campaign_id = ?`,
      [merchant.id, data.recipient, campaign.id]
    );

    const existingPathEntry = existingPathResult.length > 0 && existingPathResult[0].values.length > 0;

    if (!existingPathEntry) {
      // Get the current max sequence order for this recipient's path
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

      // Add to recipient path
      this.db.run(
        `INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, first_received_at)
         VALUES (?, ?, ?, ?, ?)`,
        [merchant.id, data.recipient, campaign.id, nextOrder, receivedAtStr]
      );

      // Update campaign unique recipients count
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

  getRecipientPath(merchantId: string, recipient: string): any {
    const result = this.db.exec(
      `SELECT 
        rp.campaign_id,
        rp.sequence_order,
        rp.first_received_at,
        c.subject,
        c.is_valuable
      FROM recipient_paths rp
      JOIN campaigns c ON rp.campaign_id = c.id
      WHERE rp.merchant_id = ? AND rp.recipient = ?
      ORDER BY rp.sequence_order ASC`,
      [merchantId, recipient]
    );

    const campaigns: any[] = [];
    if (result.length > 0) {
      const columns = result[0].columns;
      for (const row of result[0].values) {
        const obj: any = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        campaigns.push({
          campaignId: obj.campaign_id,
          subject: obj.subject,
          isValuable: obj.is_valuable === 1,
          sequenceOrder: obj.sequence_order,
          firstReceivedAt: new Date(obj.first_received_at),
        });
      }
    }

    return {
      merchantId,
      recipient,
      campaigns,
    };
  }

  getCampaigns(filter?: { merchantId?: string; isValuable?: boolean }): any[] {
    let query = 'SELECT * FROM campaigns';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filter?.merchantId) {
      conditions.push('merchant_id = ?');
      params.push(filter.merchantId);
    }

    if (filter?.isValuable !== undefined) {
      conditions.push('is_valuable = ?');
      params.push(filter.isValuable ? 1 : 0);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const result = this.db.exec(query, params);
    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    return result[0].values.map(row => this.rowToCampaign(columns, row));
  }

  markCampaignValuable(id: string, data: { valuable: boolean; note?: string }): any | null {
    const now = new Date().toISOString();
    
    // Check if campaign exists
    const existing = this.getCampaignById(id);
    if (!existing) {
      return null;
    }

    this.db.run(
      `UPDATE campaigns
       SET is_valuable = ?,
           valuable_note = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        data.valuable ? 1 : 0,
        data.valuable ? (data.note ?? null) : null,
        now,
        id
      ]
    );

    return this.getCampaignById(id);
  }

  getEmailCountForCampaign(campaignId: string): number {
    const result = this.db.exec(
      'SELECT COUNT(*) as count FROM campaign_emails WHERE campaign_id = ?',
      [campaignId]
    );
    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }
    return result[0].values[0][0] as number;
  }

  getRecipientCountsForCampaign(campaignId: string): Array<{ recipient: string; count: number }> {
    const result = this.db.exec(
      `SELECT recipient, COUNT(*) as count 
       FROM campaign_emails 
       WHERE campaign_id = ? 
       GROUP BY recipient`,
      [campaignId]
    );
    if (result.length === 0) {
      return [];
    }
    return result[0].values.map(row => ({
      recipient: row[0] as string,
      count: row[1] as number,
    }));
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

  /**
   * Get campaign levels for a merchant
   * Calculates the level for each campaign based on recipient paths.
   * Level 1 = campaigns that appear first in at least one recipient's path
   * Level N = campaigns that appear at position N in recipient paths
   */
  getCampaignLevels(merchantId: string): any[] {
    // Get all unique recipients for this merchant
    const recipientsResult = this.db.exec(
      'SELECT DISTINCT recipient FROM recipient_paths WHERE merchant_id = ?',
      [merchantId]
    );
    
    const totalRecipients = recipientsResult.length > 0 ? recipientsResult[0].values.length : 0;
    if (totalRecipients === 0) {
      return [];
    }

    // Get all path entries with campaign info, grouped by level (sequence_order)
    const pathsResult = this.db.exec(
      `SELECT 
        rp.sequence_order,
        rp.campaign_id,
        c.subject,
        c.is_valuable,
        COUNT(DISTINCT rp.recipient) as recipient_count
      FROM recipient_paths rp
      JOIN campaigns c ON rp.campaign_id = c.id
      WHERE rp.merchant_id = ?
      GROUP BY rp.sequence_order, rp.campaign_id
      ORDER BY rp.sequence_order ASC, recipient_count DESC`,
      [merchantId]
    );

    if (pathsResult.length === 0) {
      return [];
    }

    // Group by level (sequence_order + 1 to make it 1-indexed)
    const levelMap = new Map<number, any[]>();
    const columns = pathsResult[0].columns;

    for (const row of pathsResult[0].values) {
      const obj: any = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });

      const level = (obj.sequence_order as number) + 1; // Convert 0-indexed to 1-indexed
      
      if (!levelMap.has(level)) {
        levelMap.set(level, []);
      }

      const levelCampaign = {
        campaignId: obj.campaign_id,
        subject: obj.subject,
        isValuable: obj.is_valuable === 1,
        recipientCount: obj.recipient_count,
        percentage: (obj.recipient_count / totalRecipients) * 100,
      };

      levelMap.get(level)!.push(levelCampaign);
    }

    // Convert map to sorted array of CampaignLevel
    const levels: any[] = [];
    const sortedLevelNumbers = Array.from(levelMap.keys()).sort((a, b) => a - b);

    for (const levelNum of sortedLevelNumbers) {
      levels.push({
        level: levelNum,
        campaigns: levelMap.get(levelNum)!,
      });
    }

    return levels;
  }

  /**
   * Get campaign flow analysis for a merchant
   * Calculates the flow of recipients through campaigns
   */
  getCampaignFlow(merchantId: string, startCampaignId?: string): any {
    // Get all recipient paths for this merchant
    const pathsResult = this.db.exec(
      `SELECT 
        rp.recipient,
        rp.campaign_id,
        rp.sequence_order,
        c.subject,
        c.is_valuable
      FROM recipient_paths rp
      JOIN campaigns c ON rp.campaign_id = c.id
      WHERE rp.merchant_id = ?
      ORDER BY rp.recipient, rp.sequence_order ASC`,
      [merchantId]
    );

    if (pathsResult.length === 0 || pathsResult[0].values.length === 0) {
      return {
        merchantId,
        startCampaignId,
        baselineRecipients: 0,
        nodes: [],
        edges: [],
      };
    }

    const columns = pathsResult[0].columns;
    const rows = pathsResult[0].values.map(row => {
      const obj: any = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });

    // Group paths by recipient
    const recipientPaths = new Map<string, Array<{
      campaignId: string;
      subject: string;
      isValuable: boolean;
      sequenceOrder: number;
    }>>();

    for (const row of rows) {
      if (!recipientPaths.has(row.recipient)) {
        recipientPaths.set(row.recipient, []);
      }
      recipientPaths.get(row.recipient)!.push({
        campaignId: row.campaign_id,
        subject: row.subject,
        isValuable: row.is_valuable === 1,
        sequenceOrder: row.sequence_order,
      });
    }

    // Determine baseline recipients
    let baselineRecipients: Set<string>;
    
    if (startCampaignId) {
      baselineRecipients = new Set<string>();
      for (const [recipient, path] of recipientPaths) {
        if (path.some(p => p.campaignId === startCampaignId)) {
          baselineRecipients.add(recipient);
        }
      }
    } else {
      baselineRecipients = new Set(recipientPaths.keys());
    }

    const baselineCount = baselineRecipients.size;

    if (baselineCount === 0) {
      return {
        merchantId,
        startCampaignId,
        baselineRecipients: 0,
        nodes: [],
        edges: [],
      };
    }

    // Filter paths to only include baseline recipients
    const filteredPaths = new Map<string, Array<{
      campaignId: string;
      subject: string;
      isValuable: boolean;
      sequenceOrder: number;
    }>>();

    for (const recipient of baselineRecipients) {
      const path = recipientPaths.get(recipient);
      if (path) {
        if (startCampaignId) {
          const startIndex = path.findIndex(p => p.campaignId === startCampaignId);
          if (startIndex !== -1) {
            const filteredPath = path.slice(startIndex).map((p, idx) => ({
              ...p,
              sequenceOrder: idx,
            }));
            filteredPaths.set(recipient, filteredPath);
          }
        } else {
          filteredPaths.set(recipient, path);
        }
      }
    }

    // Calculate nodes
    const nodeMap = new Map<string, {
      campaignId: string;
      subject: string;
      isValuable: boolean;
      level: number;
      recipients: Set<string>;
    }>();

    for (const [recipient, path] of filteredPaths) {
      for (const entry of path) {
        const level = entry.sequenceOrder + 1;
        const key = `${entry.campaignId}:${level}`;
        
        if (!nodeMap.has(key)) {
          nodeMap.set(key, {
            campaignId: entry.campaignId,
            subject: entry.subject,
            isValuable: entry.isValuable,
            level,
            recipients: new Set(),
          });
        }
        nodeMap.get(key)!.recipients.add(recipient);
      }
    }

    const nodes = Array.from(nodeMap.values()).map(node => ({
      campaignId: node.campaignId,
      subject: node.subject,
      isValuable: node.isValuable,
      level: node.level,
      recipientCount: node.recipients.size,
      percentage: (node.recipients.size / baselineCount) * 100,
    }));

    nodes.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return b.recipientCount - a.recipientCount;
    });

    // Calculate edges
    const edgeMap = new Map<string, {
      from: string;
      to: string;
      recipients: Set<string>;
    }>();

    for (const [recipient, path] of filteredPaths) {
      for (let i = 0; i < path.length - 1; i++) {
        const from = path[i].campaignId;
        const to = path[i + 1].campaignId;
        const key = `${from}:${to}`;
        
        if (!edgeMap.has(key)) {
          edgeMap.set(key, {
            from,
            to,
            recipients: new Set(),
          });
        }
        edgeMap.get(key)!.recipients.add(recipient);
      }
    }

    const edges = Array.from(edgeMap.values()).map(edge => ({
      from: edge.from,
      to: edge.to,
      recipientCount: edge.recipients.size,
      percentage: (edge.recipients.size / baselineCount) * 100,
    }));

    edges.sort((a, b) => b.recipientCount - a.recipientCount);

    return {
      merchantId,
      startCampaignId,
      baselineRecipients: baselineCount,
      nodes,
      edges,
    };
  }
}

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

// Helper to initialize test database
async function createTestDb(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  
  // Load campaign schema
  const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
  const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
  db.run(campaignSchema);
  
  return db;
}

describe('CampaignAnalyticsService', () => {
  /**
   * **Feature: campaign-analytics, Property 1: Domain Extraction Consistency**
   * **Validates: Requirements 1.1**
   * 
   * For any valid email address, extracting the domain should always return 
   * the portion after the @ symbol in lowercase.
   */
  describe('Property 1: Domain Extraction Consistency', () => {
    it('should extract domain from valid email addresses', () => {
      fc.assert(
        fc.property(
          validEmailArb,
          (email) => {
            const result = extractDomain(email);
            
            // Should not be null for valid emails
            expect(result).not.toBeNull();
            
            // Should be the part after @
            const expectedDomain = email.split('@').pop()!.toLowerCase();
            expect(result).toBe(expectedDomain);
            
            // Should be lowercase
            expect(result).toBe(result!.toLowerCase());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle uppercase emails by returning lowercase domain', () => {
      fc.assert(
        fc.property(
          validEmailArb,
          (email) => {
            const upperEmail = email.toUpperCase();
            const lowerEmail = email.toLowerCase();
            
            const upperResult = extractDomain(upperEmail);
            const lowerResult = extractDomain(lowerEmail);
            
            // Both should return the same lowercase domain
            expect(upperResult).toBe(lowerResult);
            expect(upperResult).toBe(upperResult!.toLowerCase());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for invalid emails without @', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !s.includes('@')),
          (invalidEmail) => {
            const result = extractDomain(invalidEmail);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for emails with @ at start or end', () => {
      fc.assert(
        fc.property(
          validDomainArb,
          (domain) => {
            // @ at start
            expect(extractDomain(`@${domain}`)).toBeNull();
            // @ at end
            expect(extractDomain(`user@`)).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle emails with multiple @ by using the last one', () => {
      fc.assert(
        fc.property(
          localPartArb,
          validDomainArb,
          (local, domain) => {
            // Email with @ in local part (quoted or edge case)
            const emailWithMultipleAt = `${local}@extra@${domain}`;
            const result = extractDomain(emailWithMultipleAt);
            
            // Should extract domain from after the last @
            expect(result).toBe(domain.toLowerCase());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for domains without a dot', () => {
      fc.assert(
        fc.property(
          localPartArb,
          domainPartArb.filter(s => !s.includes('.')),
          (local, invalidDomain) => {
            const email = `${local}@${invalidDomain}`;
            const result = extractDomain(email);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics, Property 2: Merchant Auto-Creation**
   * **Validates: Requirements 1.2**
   * 
   * For any email with a new sender domain, tracking that email should result 
   * in a new merchant record being created with that domain.
   */
  describe('Property 2: Merchant Auto-Creation', () => {
    it('should create merchant for new domain when tracking email', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 100 }), // subject
          validEmailArb, // recipient
          (sender, subject, recipient) => {
            // Create fresh database for each iteration to ensure isolation
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return; // Skip invalid emails

              // Verify merchant doesn't exist before
              const beforeMerchant = service.getMerchantByDomain(domain);
              expect(beforeMerchant).toBeNull();

              // Track the email
              const result = service.trackEmail({
                sender,
                subject,
                recipient,
              });

              // Verify merchant was created
              expect(result.isNewMerchant).toBe(true);
              
              const afterMerchant = service.getMerchantByDomain(domain);
              expect(afterMerchant).not.toBeNull();
              expect(afterMerchant.domain).toBe(domain);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not create duplicate merchant for same domain', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 }), // subjects
          validEmailArb, // recipient
          (sender, subjects, recipient) => {
            // Create fresh database for each iteration to ensure isolation
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track first email
              const firstResult = service.trackEmail({
                sender,
                subject: subjects[0],
                recipient,
              });
              expect(firstResult.isNewMerchant).toBe(true);

              // Track subsequent emails from same domain
              for (let i = 1; i < subjects.length; i++) {
                const result = service.trackEmail({
                  sender,
                  subject: subjects[i],
                  recipient,
                });
                expect(result.isNewMerchant).toBe(false);
                expect(result.merchantId).toBe(firstResult.merchantId);
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics, Property 3: Campaign Grouping Invariant**
   * **Validates: Requirements 2.2**
   * 
   * For any set of emails from the same merchant with identical subjects, 
   * all emails should be grouped into exactly one campaign.
   */
  describe('Property 3: Campaign Grouping Invariant', () => {
    it('should group emails with same subject into one campaign', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 100 }), // subject
          fc.array(validEmailArb, { minLength: 2, maxLength: 10 }), // recipients
          (sender, subject, recipients) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              let campaignId: string | null = null;

              // Track multiple emails with same subject
              for (const recipient of recipients) {
                const result = service.trackEmail({
                  sender,
                  subject,
                  recipient,
                });

                if (campaignId === null) {
                  campaignId = result.campaignId;
                  expect(result.isNewCampaign).toBe(true);
                } else {
                  // All subsequent emails should use the same campaign
                  expect(result.campaignId).toBe(campaignId);
                  expect(result.isNewCampaign).toBe(false);
                }
              }

              // Verify only one campaign exists for this merchant
              const campaigns = service.getCampaigns({ merchantId: service.getMerchantByDomain(domain).id });
              expect(campaigns.length).toBe(1);
              expect(campaigns[0].subject).toBe(subject);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create separate campaigns for different subjects', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          validEmailArb, // recipient
          (sender, subjects, recipient) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              const campaignIds = new Set<string>();

              // Track emails with different subjects
              for (const subject of subjects) {
                const result = service.trackEmail({
                  sender,
                  subject,
                  recipient,
                });
                campaignIds.add(result.campaignId);
              }

              // Each unique subject should create a unique campaign
              expect(campaignIds.size).toBe(subjects.length);

              // Verify campaign count matches
              const campaigns = service.getCampaigns({ merchantId: service.getMerchantByDomain(domain).id });
              expect(campaigns.length).toBe(subjects.length);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics, Property 4: Email Count Consistency**
   * **Validates: Requirements 2.3, 2.4**
   * 
   * For any campaign, the total email count should equal the sum of all 
   * individual recipient email counts for that campaign.
   */
  describe('Property 4: Email Count Consistency', () => {
    let db: SqlJsDatabase;
    let service: TestCampaignAnalyticsService;

    beforeEach(async () => {
      db = await createTestDb();
      service = new TestCampaignAnalyticsService(db);
    });

    afterEach(() => {
      if (db) {
        db.close();
      }
    });

    it('should maintain consistent email counts', () => {
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 100 }), // subject
          fc.array(validEmailArb, { minLength: 1, maxLength: 10 }), // recipients (may have duplicates)
          (sender, subject, recipients) => {
            const domain = extractDomain(sender);
            if (!domain) return;

            let campaignId: string | null = null;

            // Track all emails
            for (const recipient of recipients) {
              const result = service.trackEmail({
                sender,
                subject,
                recipient,
              });
              campaignId = result.campaignId;
            }

            if (!campaignId) return;

            // Get actual email count from campaign_emails table
            const actualEmailCount = service.getEmailCountForCampaign(campaignId);
            
            // Get recipient counts
            const recipientCounts = service.getRecipientCountsForCampaign(campaignId);
            const sumOfRecipientCounts = recipientCounts.reduce((sum, r) => sum + r.count, 0);

            // Total emails should equal sum of recipient counts
            expect(actualEmailCount).toBe(sumOfRecipientCounts);
            expect(actualEmailCount).toBe(recipients.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics, Property 5: Valuable Mark Round-Trip**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * For any campaign, marking it as valuable and then unmarking it should 
   * return it to the non-valuable state.
   */
  describe('Property 5: Valuable Mark Round-Trip', () => {
    it('should return to non-valuable state after mark and unmark', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 100 }), // subject
          validEmailArb, // recipient
          fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }), // optional note
          (sender, subject, recipient, note) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Create a campaign by tracking an email
              const trackResult = service.trackEmail({
                sender,
                subject,
                recipient,
              });

              const campaignId = trackResult.campaignId;

              // Verify initial state is not valuable
              const initialCampaign = service.getCampaignById(campaignId);
              expect(initialCampaign.isValuable).toBe(false);
              expect(initialCampaign.valuableNote).toBeNull();

              // Mark as valuable
              const markedCampaign = service.markCampaignValuable(campaignId, {
                valuable: true,
                note: note,
              });
              expect(markedCampaign.isValuable).toBe(true);
              if (note) {
                expect(markedCampaign.valuableNote).toBe(note);
              }

              // Unmark as valuable
              const unmarkedCampaign = service.markCampaignValuable(campaignId, {
                valuable: false,
              });

              // Should return to non-valuable state
              expect(unmarkedCampaign.isValuable).toBe(false);
              expect(unmarkedCampaign.valuableNote).toBeNull(); // Note should be cleared
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve valuable state when marking multiple times', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 100 }), // subject
          validEmailArb, // recipient
          fc.array(
            fc.record({
              valuable: fc.boolean(),
              note: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
            }),
            { minLength: 1, maxLength: 5 }
          ), // sequence of mark operations
          (sender, subject, recipient, markOperations) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Create a campaign
              const trackResult = service.trackEmail({
                sender,
                subject,
                recipient,
              });

              const campaignId = trackResult.campaignId;

              // Apply sequence of mark operations
              let lastOperation = markOperations[markOperations.length - 1];
              for (const op of markOperations) {
                service.markCampaignValuable(campaignId, op);
              }

              // Final state should match last operation
              const finalCampaign = service.getCampaignById(campaignId);
              expect(finalCampaign.isValuable).toBe(lastOperation.valuable);
              
              if (lastOperation.valuable && lastOperation.note) {
                expect(finalCampaign.valuableNote).toBe(lastOperation.note);
              } else if (!lastOperation.valuable) {
                expect(finalCampaign.valuableNote).toBeNull();
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for non-existent campaign', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          fc.uuid(), // random campaign ID that doesn't exist
          fc.boolean(), // valuable flag
          (campaignId, valuable) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const result = service.markCampaignValuable(campaignId, { valuable });
              expect(result).toBeNull();
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics, Property 6: Filter by Valuable Status**
   * **Validates: Requirements 3.4**
   * 
   * For any filter query by valuable status, all returned campaigns should 
   * have the matching valuable flag.
   */
  describe('Property 6: Filter by Valuable Status', () => {
    it('should return only valuable campaigns when filtering by valuable=true', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(
            fc.record({
              subject: fc.string({ minLength: 1, maxLength: 50 }),
              isValuable: fc.boolean(),
            }),
            { minLength: 2, maxLength: 10 }
          ).filter(arr => {
            // Ensure unique subjects and at least one valuable and one non-valuable
            const subjects = arr.map(a => a.subject);
            const hasValuable = arr.some(a => a.isValuable);
            const hasNonValuable = arr.some(a => !a.isValuable);
            return new Set(subjects).size === subjects.length && hasValuable && hasNonValuable;
          }),
          validEmailArb, // recipient
          (sender, campaignConfigs, recipient) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Create campaigns and mark some as valuable
              for (const config of campaignConfigs) {
                const result = service.trackEmail({
                  sender,
                  subject: config.subject,
                  recipient,
                });

                if (config.isValuable) {
                  service.markCampaignValuable(result.campaignId, { valuable: true });
                }
              }

              const merchant = service.getMerchantByDomain(domain);

              // Filter by valuable=true
              const valuableCampaigns = service.getCampaigns({ 
                merchantId: merchant.id, 
                isValuable: true 
              });

              // All returned campaigns should be valuable
              for (const campaign of valuableCampaigns) {
                expect(campaign.isValuable).toBe(true);
              }

              // Count should match expected
              const expectedValuableCount = campaignConfigs.filter(c => c.isValuable).length;
              expect(valuableCampaigns.length).toBe(expectedValuableCount);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return only non-valuable campaigns when filtering by valuable=false', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(
            fc.record({
              subject: fc.string({ minLength: 1, maxLength: 50 }),
              isValuable: fc.boolean(),
            }),
            { minLength: 2, maxLength: 10 }
          ).filter(arr => {
            // Ensure unique subjects and at least one valuable and one non-valuable
            const subjects = arr.map(a => a.subject);
            const hasValuable = arr.some(a => a.isValuable);
            const hasNonValuable = arr.some(a => !a.isValuable);
            return new Set(subjects).size === subjects.length && hasValuable && hasNonValuable;
          }),
          validEmailArb, // recipient
          (sender, campaignConfigs, recipient) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Create campaigns and mark some as valuable
              for (const config of campaignConfigs) {
                const result = service.trackEmail({
                  sender,
                  subject: config.subject,
                  recipient,
                });

                if (config.isValuable) {
                  service.markCampaignValuable(result.campaignId, { valuable: true });
                }
              }

              const merchant = service.getMerchantByDomain(domain);

              // Filter by valuable=false
              const nonValuableCampaigns = service.getCampaigns({ 
                merchantId: merchant.id, 
                isValuable: false 
              });

              // All returned campaigns should be non-valuable
              for (const campaign of nonValuableCampaigns) {
                expect(campaign.isValuable).toBe(false);
              }

              // Count should match expected
              const expectedNonValuableCount = campaignConfigs.filter(c => !c.isValuable).length;
              expect(nonValuableCampaigns.length).toBe(expectedNonValuableCount);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all campaigns when no valuable filter is applied', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(
            fc.record({
              subject: fc.string({ minLength: 1, maxLength: 50 }),
              isValuable: fc.boolean(),
            }),
            { minLength: 1, maxLength: 10 }
          ).filter(arr => {
            // Ensure unique subjects
            const subjects = arr.map(a => a.subject);
            return new Set(subjects).size === subjects.length;
          }),
          validEmailArb, // recipient
          (sender, campaignConfigs, recipient) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Create campaigns and mark some as valuable
              for (const config of campaignConfigs) {
                const result = service.trackEmail({
                  sender,
                  subject: config.subject,
                  recipient,
                });

                if (config.isValuable) {
                  service.markCampaignValuable(result.campaignId, { valuable: true });
                }
              }

              const merchant = service.getMerchantByDomain(domain);

              // Get all campaigns without filter
              const allCampaigns = service.getCampaigns({ merchantId: merchant.id });

              // Should return all campaigns
              expect(allCampaigns.length).toBe(campaignConfigs.length);

              // Verify valuable status matches what we set
              const valuableCount = allCampaigns.filter(c => c.isValuable).length;
              const expectedValuableCount = campaignConfigs.filter(c => c.isValuable).length;
              expect(valuableCount).toBe(expectedValuableCount);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics, Property 7: Path Chronological Order**
   * **Validates: Requirements 4.2**
   * 
   * For any recipient path, the campaigns should be ordered by their first 
   * received time in ascending order.
   */
  describe('Property 7: Path Chronological Order', () => {
    it('should maintain chronological order in recipient path', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 10 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          validEmailArb, // recipient
          (sender, subjects, recipient) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track emails with different subjects at increasing timestamps
              const baseTime = new Date('2024-01-01T00:00:00Z');
              const expectedOrder: string[] = [];

              for (let i = 0; i < subjects.length; i++) {
                const receivedAt = new Date(baseTime.getTime() + i * 60000); // 1 minute apart
                service.trackEmail({
                  sender,
                  subject: subjects[i],
                  recipient,
                  receivedAt: receivedAt.toISOString(),
                });
                expectedOrder.push(subjects[i]);
              }

              const merchant = service.getMerchantByDomain(domain);
              const path = service.getRecipientPath(merchant.id, recipient);

              // Verify path length matches number of unique subjects
              expect(path.campaigns.length).toBe(subjects.length);

              // Verify chronological order
              for (let i = 0; i < path.campaigns.length; i++) {
                expect(path.campaigns[i].subject).toBe(expectedOrder[i]);
                expect(path.campaigns[i].sequenceOrder).toBe(i);
              }

              // Verify firstReceivedAt is in ascending order
              for (let i = 1; i < path.campaigns.length; i++) {
                const prevTime = path.campaigns[i - 1].firstReceivedAt.getTime();
                const currTime = path.campaigns[i].firstReceivedAt.getTime();
                expect(currTime).toBeGreaterThan(prevTime);
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve order when emails arrive out of order for same campaign', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          validEmailArb, // recipient
          (sender, subjects, recipient) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track first email for each subject in order
              const baseTime = new Date('2024-01-01T00:00:00Z');
              for (let i = 0; i < subjects.length; i++) {
                const receivedAt = new Date(baseTime.getTime() + i * 60000);
                service.trackEmail({
                  sender,
                  subject: subjects[i],
                  recipient,
                  receivedAt: receivedAt.toISOString(),
                });
              }

              // Track additional emails for the first subject (later timestamp)
              // This should NOT change the path order
              const laterTime = new Date(baseTime.getTime() + subjects.length * 60000);
              service.trackEmail({
                sender,
                subject: subjects[0],
                recipient,
                receivedAt: laterTime.toISOString(),
              });

              const merchant = service.getMerchantByDomain(domain);
              const path = service.getRecipientPath(merchant.id, recipient);

              // Path should still have same length (no duplicates)
              expect(path.campaigns.length).toBe(subjects.length);

              // First campaign should still be the first subject
              expect(path.campaigns[0].subject).toBe(subjects[0]);
              expect(path.campaigns[0].sequenceOrder).toBe(0);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics, Property 8: Path Idempotence**
   * **Validates: Requirements 4.3**
   * 
   * For any recipient receiving the same campaign email multiple times, 
   * the path should contain that campaign exactly once.
   */
  describe('Property 8: Path Idempotence', () => {
    it('should contain each campaign exactly once regardless of email count', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          fc.integer({ min: 2, max: 10 }), // number of times to send same email
          (sender, subject, recipient, repeatCount) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track the same email multiple times
              const baseTime = new Date('2024-01-01T00:00:00Z');
              for (let i = 0; i < repeatCount; i++) {
                const receivedAt = new Date(baseTime.getTime() + i * 60000);
                service.trackEmail({
                  sender,
                  subject,
                  recipient,
                  receivedAt: receivedAt.toISOString(),
                });
              }

              const merchant = service.getMerchantByDomain(domain);
              const path = service.getRecipientPath(merchant.id, recipient);

              // Path should contain exactly one campaign
              expect(path.campaigns.length).toBe(1);
              expect(path.campaigns[0].subject).toBe(subject);
              expect(path.campaigns[0].sequenceOrder).toBe(0);

              // Verify the campaign has correct email count (all emails recorded)
              const campaign = service.getCampaignById(path.campaigns[0].campaignId);
              expect(campaign.totalEmails).toBe(repeatCount);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain path idempotence with multiple campaigns', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(
            fc.record({
              subject: fc.string({ minLength: 1, maxLength: 50 }),
              repeatCount: fc.integer({ min: 1, max: 5 }),
            }),
            { minLength: 2, maxLength: 5 }
          ).filter(arr => {
            // Ensure unique subjects
            const subjects = arr.map(a => a.subject);
            return new Set(subjects).size === subjects.length;
          }),
          validEmailArb, // recipient
          (sender, campaignConfigs, recipient) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track emails for each campaign config
              const baseTime = new Date('2024-01-01T00:00:00Z');
              let timeOffset = 0;

              for (const config of campaignConfigs) {
                for (let i = 0; i < config.repeatCount; i++) {
                  const receivedAt = new Date(baseTime.getTime() + timeOffset * 60000);
                  service.trackEmail({
                    sender,
                    subject: config.subject,
                    recipient,
                    receivedAt: receivedAt.toISOString(),
                  });
                  timeOffset++;
                }
              }

              const merchant = service.getMerchantByDomain(domain);
              const path = service.getRecipientPath(merchant.id, recipient);

              // Path should contain exactly one entry per unique subject
              expect(path.campaigns.length).toBe(campaignConfigs.length);

              // Verify each campaign appears exactly once
              const pathSubjects = path.campaigns.map(c => c.subject);
              const uniquePathSubjects = new Set(pathSubjects);
              expect(uniquePathSubjects.size).toBe(pathSubjects.length);

              // Verify all expected subjects are present
              for (const config of campaignConfigs) {
                expect(pathSubjects).toContain(config.subject);
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should record first received time correctly for duplicate emails', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          fc.integer({ min: 2, max: 5 }), // number of times to send same email
          (sender, subject, recipient, repeatCount) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track the same email multiple times with increasing timestamps
              const firstTime = new Date('2024-01-01T00:00:00Z');
              for (let i = 0; i < repeatCount; i++) {
                const receivedAt = new Date(firstTime.getTime() + i * 60000);
                service.trackEmail({
                  sender,
                  subject,
                  recipient,
                  receivedAt: receivedAt.toISOString(),
                });
              }

              const merchant = service.getMerchantByDomain(domain);
              const path = service.getRecipientPath(merchant.id, recipient);

              // Path should record the first received time
              expect(path.campaigns.length).toBe(1);
              expect(path.campaigns[0].firstReceivedAt.getTime()).toBe(firstTime.getTime());
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics, Property 9: Level Calculation Consistency**
   * **Validates: Requirements 5.2**
   * 
   * For any campaign appearing as the first campaign in at least one recipient path,
   * it should be marked as level 1.
   */
  describe('Property 9: Level Calculation Consistency', () => {
    it('should mark campaigns appearing first in any path as level 1', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          fc.array(validEmailArb, { minLength: 2, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique recipients
          (sender, subjects, recipients) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track emails: each recipient gets all subjects in order
              const baseTime = new Date('2024-01-01T00:00:00Z');
              let timeOffset = 0;

              for (const recipient of recipients) {
                for (const subject of subjects) {
                  const receivedAt = new Date(baseTime.getTime() + timeOffset * 60000);
                  service.trackEmail({
                    sender,
                    subject,
                    recipient,
                    receivedAt: receivedAt.toISOString(),
                  });
                  timeOffset++;
                }
              }

              const merchant = service.getMerchantByDomain(domain);
              const levels = service.getCampaignLevels(merchant.id);

              // Should have levels
              expect(levels.length).toBeGreaterThan(0);

              // Level 1 should exist and contain the first subject
              const level1 = levels.find((l: any) => l.level === 1);
              expect(level1).toBeDefined();
              
              // The first subject should be in level 1
              const firstSubjectInLevel1 = level1.campaigns.some(
                (c: any) => c.subject === subjects[0]
              );
              expect(firstSubjectInLevel1).toBe(true);

              // All campaigns in level 1 should have sequence_order 0 in at least one path
              for (const campaign of level1.campaigns) {
                // Verify this campaign appears at position 0 for at least one recipient
                let foundAtPosition0 = false;
                for (const recipient of recipients) {
                  const path = service.getRecipientPath(merchant.id, recipient);
                  if (path.campaigns.length > 0 && 
                      path.campaigns[0].campaignId === campaign.campaignId) {
                    foundAtPosition0 = true;
                    break;
                  }
                }
                expect(foundAtPosition0).toBe(true);
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate correct levels for sequential campaigns', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          validEmailArb, // single recipient
          (sender, subjects, recipient) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track emails in sequence for single recipient
              const baseTime = new Date('2024-01-01T00:00:00Z');
              for (let i = 0; i < subjects.length; i++) {
                const receivedAt = new Date(baseTime.getTime() + i * 60000);
                service.trackEmail({
                  sender,
                  subject: subjects[i],
                  recipient,
                  receivedAt: receivedAt.toISOString(),
                });
              }

              const merchant = service.getMerchantByDomain(domain);
              const levels = service.getCampaignLevels(merchant.id);

              // Should have as many levels as subjects
              expect(levels.length).toBe(subjects.length);

              // Each level should have exactly one campaign
              for (let i = 0; i < levels.length; i++) {
                expect(levels[i].level).toBe(i + 1);
                expect(levels[i].campaigns.length).toBe(1);
                expect(levels[i].campaigns[0].subject).toBe(subjects[i]);
                expect(levels[i].campaigns[0].recipientCount).toBe(1);
                expect(levels[i].campaigns[0].percentage).toBe(100);
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle campaigns appearing at multiple levels across different recipients', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 4 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          fc.tuple(validEmailArb, validEmailArb)
            .filter(([a, b]) => a !== b), // two different recipients
          (sender, subjects, [recipient1, recipient2]) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain || subjects.length < 2) return;

              const baseTime = new Date('2024-01-01T00:00:00Z');
              let timeOffset = 0;

              // Recipient 1 gets subjects in order: [0, 1, 2, ...]
              for (let i = 0; i < subjects.length; i++) {
                const receivedAt = new Date(baseTime.getTime() + timeOffset * 60000);
                service.trackEmail({
                  sender,
                  subject: subjects[i],
                  recipient: recipient1,
                  receivedAt: receivedAt.toISOString(),
                });
                timeOffset++;
              }

              // Recipient 2 gets subjects in reverse order: [..., 2, 1, 0]
              const reversedSubjects = [...subjects].reverse();
              for (let i = 0; i < reversedSubjects.length; i++) {
                const receivedAt = new Date(baseTime.getTime() + timeOffset * 60000);
                service.trackEmail({
                  sender,
                  subject: reversedSubjects[i],
                  recipient: recipient2,
                  receivedAt: receivedAt.toISOString(),
                });
                timeOffset++;
              }

              const merchant = service.getMerchantByDomain(domain);
              const levels = service.getCampaignLevels(merchant.id);

              // Level 1 should contain both the first subject (from recipient1)
              // and the last subject (from recipient2, who received it first)
              const level1 = levels.find((l: any) => l.level === 1);
              expect(level1).toBeDefined();
              
              // Both first and last subjects should appear at level 1
              const level1Subjects = level1.campaigns.map((c: any) => c.subject);
              expect(level1Subjects).toContain(subjects[0]); // First for recipient1
              expect(level1Subjects).toContain(subjects[subjects.length - 1]); // First for recipient2

              // Total recipients should be 2
              // Each campaign at level 1 should have recipientCount of 1 (each appears first for one recipient)
              for (const campaign of level1.campaigns) {
                expect(campaign.recipientCount).toBe(1);
                expect(campaign.percentage).toBe(50); // 1 out of 2 recipients
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array for merchant with no paths', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          fc.uuid(), // random merchant ID
          (merchantId) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const levels = service.getCampaignLevels(merchantId);
              expect(levels).toEqual([]);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics, Property 10: Baseline Population Accuracy**
   * **Validates: Requirements 6.1**
   * 
   * For any campaign selected as a starting point, the baseline recipient count 
   * should equal the number of unique recipients who received that campaign.
   */
  describe('Property 10: Baseline Population Accuracy', () => {
    it('should have baseline equal to unique recipients of start campaign', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          fc.array(validEmailArb, { minLength: 2, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique recipients
          (sender, subjects, recipients) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              const baseTime = new Date('2024-01-01T00:00:00Z');
              let timeOffset = 0;

              // Track emails: each recipient gets all subjects in order
              for (const recipient of recipients) {
                for (const subject of subjects) {
                  const receivedAt = new Date(baseTime.getTime() + timeOffset * 60000);
                  service.trackEmail({
                    sender,
                    subject,
                    recipient,
                    receivedAt: receivedAt.toISOString(),
                  });
                  timeOffset++;
                }
              }

              const merchant = service.getMerchantByDomain(domain);
              
              // Get the first campaign (all recipients received it)
              const campaigns = service.getCampaigns({ merchantId: merchant.id });
              const firstCampaign = campaigns.find((c: any) => c.subject === subjects[0]);
              
              if (!firstCampaign) return;

              // Get flow with first campaign as starting point
              const flow = service.getCampaignFlow(merchant.id, firstCampaign.id);

              // Baseline should equal number of unique recipients who received the start campaign
              // Since all recipients received all subjects, baseline should equal total recipients
              expect(flow.baselineRecipients).toBe(recipients.length);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have baseline equal to all recipients when no start campaign specified', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          fc.array(validEmailArb, { minLength: 1, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique recipients
          (sender, subjects, recipients) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              const baseTime = new Date('2024-01-01T00:00:00Z');
              let timeOffset = 0;

              // Track emails
              for (const recipient of recipients) {
                for (const subject of subjects) {
                  const receivedAt = new Date(baseTime.getTime() + timeOffset * 60000);
                  service.trackEmail({
                    sender,
                    subject,
                    recipient,
                    receivedAt: receivedAt.toISOString(),
                  });
                  timeOffset++;
                }
              }

              const merchant = service.getMerchantByDomain(domain);
              
              // Get flow without specifying start campaign
              const flow = service.getCampaignFlow(merchant.id);

              // Baseline should equal total unique recipients
              expect(flow.baselineRecipients).toBe(recipients.length);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have baseline equal to subset when start campaign not received by all', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 4 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          fc.tuple(validEmailArb, validEmailArb)
            .filter(([a, b]) => a !== b), // two different recipients
          (sender, subjects, [recipient1, recipient2]) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain || subjects.length < 2) return;

              const baseTime = new Date('2024-01-01T00:00:00Z');
              let timeOffset = 0;

              // Recipient 1 gets all subjects
              for (const subject of subjects) {
                const receivedAt = new Date(baseTime.getTime() + timeOffset * 60000);
                service.trackEmail({
                  sender,
                  subject,
                  recipient: recipient1,
                  receivedAt: receivedAt.toISOString(),
                });
                timeOffset++;
              }

              // Recipient 2 gets only the first subject
              const receivedAt = new Date(baseTime.getTime() + timeOffset * 60000);
              service.trackEmail({
                sender,
                subject: subjects[0],
                recipient: recipient2,
                receivedAt: receivedAt.toISOString(),
              });

              const merchant = service.getMerchantByDomain(domain);
              const campaigns = service.getCampaigns({ merchantId: merchant.id });
              
              // Get the second campaign (only recipient1 received it)
              const secondCampaign = campaigns.find((c: any) => c.subject === subjects[1]);
              
              if (!secondCampaign) return;

              // Get flow with second campaign as starting point
              const flow = service.getCampaignFlow(merchant.id, secondCampaign.id);

              // Baseline should be 1 (only recipient1 received the second campaign)
              expect(flow.baselineRecipients).toBe(1);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics, Property 11: Distribution Ratio Sum**
   * **Validates: Requirements 6.3**
   * 
   * For any level in the campaign flow, the sum of percentages of all campaigns 
   * at that level should not exceed 100% of the baseline population.
   */
  describe('Property 11: Distribution Ratio Sum', () => {
    it('should have level percentages not exceeding 100%', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          fc.array(validEmailArb, { minLength: 2, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique recipients
          (sender, subjects, recipients) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              const baseTime = new Date('2024-01-01T00:00:00Z');
              let timeOffset = 0;

              // Track emails: each recipient gets all subjects in order
              for (const recipient of recipients) {
                for (const subject of subjects) {
                  const receivedAt = new Date(baseTime.getTime() + timeOffset * 60000);
                  service.trackEmail({
                    sender,
                    subject,
                    recipient,
                    receivedAt: receivedAt.toISOString(),
                  });
                  timeOffset++;
                }
              }

              const merchant = service.getMerchantByDomain(domain);
              const flow = service.getCampaignFlow(merchant.id);

              // Group nodes by level
              const levelMap = new Map<number, number[]>();
              for (const node of flow.nodes) {
                if (!levelMap.has(node.level)) {
                  levelMap.set(node.level, []);
                }
                levelMap.get(node.level)!.push(node.percentage);
              }

              // For each level, sum of percentages should not exceed 100%
              // (can be less if some recipients don't continue to next level)
              for (const [level, percentages] of levelMap) {
                const sum = percentages.reduce((a, b) => a + b, 0);
                expect(sum).toBeLessThanOrEqual(100.01); // Allow small floating point error
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have first level percentages sum to 100% when all recipients start', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 50 }), // single subject for first campaign
          fc.array(validEmailArb, { minLength: 2, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique recipients
          (sender, subject, recipients) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              const baseTime = new Date('2024-01-01T00:00:00Z');

              // All recipients get the same first campaign
              for (let i = 0; i < recipients.length; i++) {
                const receivedAt = new Date(baseTime.getTime() + i * 60000);
                service.trackEmail({
                  sender,
                  subject,
                  recipient: recipients[i],
                  receivedAt: receivedAt.toISOString(),
                });
              }

              const merchant = service.getMerchantByDomain(domain);
              const flow = service.getCampaignFlow(merchant.id);

              // Level 1 should have exactly one campaign with 100% of recipients
              const level1Nodes = flow.nodes.filter((n: any) => n.level === 1);
              expect(level1Nodes.length).toBe(1);
              expect(level1Nodes[0].percentage).toBeCloseTo(100, 1);
              expect(level1Nodes[0].recipientCount).toBe(recipients.length);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have edge percentages not exceeding source node percentage', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 4 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          fc.array(validEmailArb, { minLength: 2, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique recipients
          (sender, subjects, recipients) => {
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              const baseTime = new Date('2024-01-01T00:00:00Z');
              let timeOffset = 0;

              // Track emails: each recipient gets all subjects in order
              for (const recipient of recipients) {
                for (const subject of subjects) {
                  const receivedAt = new Date(baseTime.getTime() + timeOffset * 60000);
                  service.trackEmail({
                    sender,
                    subject,
                    recipient,
                    receivedAt: receivedAt.toISOString(),
                  });
                  timeOffset++;
                }
              }

              const merchant = service.getMerchantByDomain(domain);
              const flow = service.getCampaignFlow(merchant.id);

              // For each edge, the percentage should not exceed the source node's percentage
              // (you can't have more recipients transitioning than were at the source)
              for (const edge of flow.edges) {
                // Find the source node (at any level)
                const sourceNodes = flow.nodes.filter((n: any) => n.campaignId === edge.from);
                
                if (sourceNodes.length > 0) {
                  // Edge percentage should not exceed the max source node percentage
                  const maxSourcePercentage = Math.max(...sourceNodes.map((n: any) => n.percentage));
                  expect(edge.percentage).toBeLessThanOrEqual(maxSourcePercentage + 0.01);
                }
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
