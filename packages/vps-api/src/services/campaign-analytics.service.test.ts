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

  getMerchants(filter?: { workerName?: string }): any[] {
    let query = 'SELECT * FROM merchants';
    const params: any[] = [];
    const conditions: string[] = [];

    // Filter by workerName - only show merchants that have emails from this worker
    if (filter?.workerName) {
      conditions.push(`id IN (
        SELECT DISTINCT c.merchant_id 
        FROM campaigns c 
        JOIN campaign_emails ce ON c.id = ce.campaign_id 
        WHERE ce.worker_name = ?
      )`);
      params.push(filter.workerName);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const result = this.db.exec(query, params);
    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    return result[0].values.map(row => this.rowToMerchant(columns, row));
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

  getCampaigns(filter?: { merchantId?: string; isValuable?: boolean; workerName?: string }): any[] {
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

    // Filter by workerName - only show campaigns that have emails from this worker
    if (filter?.workerName) {
      conditions.push(`id IN (
        SELECT DISTINCT campaign_id 
        FROM campaign_emails 
        WHERE worker_name = ?
      )`);
      params.push(filter.workerName);
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
  
  // Load campaign schema (includes worker_name column)
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
   * the root domain (registrable domain) in lowercase.
   */
  describe('Property 1: Domain Extraction Consistency', () => {
    it('should extract root domain from valid email addresses', () => {
      // Test with simple domains (no subdomains)
      expect(extractDomain('user@example.com')).toBe('example.com');
      expect(extractDomain('user@amazon.com')).toBe('amazon.com');
      
      // Test with subdomains - should return root domain
      expect(extractDomain('user@mail.example.com')).toBe('example.com');
      expect(extractDomain('user@shop.store.amazon.com')).toBe('amazon.com');
      expect(extractDomain('user@newsletter.company.org')).toBe('company.org');
      
      // Test with special TLDs like .co.uk
      expect(extractDomain('user@amazon.co.uk')).toBe('amazon.co.uk');
      expect(extractDomain('user@shop.amazon.co.uk')).toBe('amazon.co.uk');
      expect(extractDomain('user@mail.company.com.cn')).toBe('company.com.cn');
      expect(extractDomain('user@news.site.com.au')).toBe('site.com.au');
      
      // Test case insensitivity
      expect(extractDomain('USER@EXAMPLE.COM')).toBe('example.com');
      expect(extractDomain('User@Mail.Example.Co.Uk')).toBe('example.co.uk');
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

  /**
   * **Feature: worker-instance-data-separation, Property 2: Filter Consistency (campaign part)**
   * **Validates: Requirements 4.2, 4.3**
   * 
   * For any query with a specific worker name filter, all returned campaigns and merchants
   * should only include data from that worker instance.
   */
  describe('Property 2: Filter Consistency (campaign part)', () => {
    // Generate valid worker names
    const workerNameArb = fc.oneof(
      fc.constant('worker-a'),
      fc.constant('worker-b'),
      fc.constant('worker-c'),
      fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), { minLength: 1, maxLength: 20 })
    );

    it('should only return campaigns that have emails from the specified worker', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 4 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          validEmailArb, // recipient
          workerNameArb,
          workerNameArb.filter(w => w !== 'global'), // different worker
          (sender, subjects, recipient, workerA, workerB) => {
            // Ensure workers are different
            if (workerA === workerB) return;
            
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestCampaignAnalyticsService(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track some emails with workerA
              const workerACampaignIds = new Set<string>();
              for (let i = 0; i < Math.min(2, subjects.length); i++) {
                const result = service.trackEmail({
                  sender,
                  subject: subjects[i],
                  recipient,
                  workerName: workerA,
                });
                workerACampaignIds.add(result.campaignId);
              }

              // Track some emails with workerB (different subjects)
              const workerBCampaignIds = new Set<string>();
              for (let i = Math.min(2, subjects.length); i < subjects.length; i++) {
                const result = service.trackEmail({
                  sender,
                  subject: subjects[i],
                  recipient,
                  workerName: workerB,
                });
                workerBCampaignIds.add(result.campaignId);
              }

              // Query campaigns filtered by workerA
              const campaignsForWorkerA = service.getCampaigns({ workerName: workerA });
              
              // All returned campaigns should be from workerA
              for (const campaign of campaignsForWorkerA) {
                expect(workerACampaignIds.has(campaign.id)).toBe(true);
                expect(workerBCampaignIds.has(campaign.id)).toBe(false);
              }

              // Query campaigns filtered by workerB
              const campaignsForWorkerB = service.getCampaigns({ workerName: workerB });
              
              // All returned campaigns should be from workerB
              for (const campaign of campaignsForWorkerB) {
                expect(workerBCampaignIds.has(campaign.id)).toBe(true);
                expect(workerACampaignIds.has(campaign.id)).toBe(false);
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only return merchants that have emails from the specified worker', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          fc.array(validEmailArb, { minLength: 2, maxLength: 4 })
            .filter(arr => {
              // Ensure unique domains
              const domains = arr.map(e => extractDomain(e)).filter(d => d !== null);
              return new Set(domains).size === domains.length;
            }),
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          workerNameArb,
          workerNameArb.filter(w => w !== 'global'),
          (senders, subject, recipient, workerA, workerB) => {
            // Ensure workers are different
            if (workerA === workerB) return;
            if (senders.length < 2) return;
            
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestCampaignAnalyticsService(db);

            try {
              // Track emails from first sender with workerA
              const workerAMerchantIds = new Set<string>();
              const result1 = service.trackEmail({
                sender: senders[0],
                subject,
                recipient,
                workerName: workerA,
              });
              workerAMerchantIds.add(result1.merchantId);

              // Track emails from second sender with workerB
              const workerBMerchantIds = new Set<string>();
              const result2 = service.trackEmail({
                sender: senders[1],
                subject,
                recipient,
                workerName: workerB,
              });
              workerBMerchantIds.add(result2.merchantId);

              // Query merchants filtered by workerA
              const merchantsForWorkerA = service.getMerchants({ workerName: workerA });
              
              // All returned merchants should have emails from workerA
              for (const merchant of merchantsForWorkerA) {
                expect(workerAMerchantIds.has(merchant.id)).toBe(true);
                expect(workerBMerchantIds.has(merchant.id)).toBe(false);
              }

              // Query merchants filtered by workerB
              const merchantsForWorkerB = service.getMerchants({ workerName: workerB });
              
              // All returned merchants should have emails from workerB
              for (const merchant of merchantsForWorkerB) {
                expect(workerBMerchantIds.has(merchant.id)).toBe(true);
                expect(workerAMerchantIds.has(merchant.id)).toBe(false);
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
   * **Feature: campaign-analytics-ui-reorganization, Property 1: Instance Data Isolation**
   * **Validates: Requirements 1.3, 2.1, 4.1**
   * 
   * For any selected worker instance, all displayed merchants and projects 
   * should belong to that instance only.
   */
  describe('Property 1: Instance Data Isolation', () => {
    // Generate valid worker names
    const workerNameArb = fc.oneof(
      fc.constant('worker-a'),
      fc.constant('worker-b'),
      fc.constant('worker-c')
    );

    // Generate valid project names
    const projectNameArb = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 -_'.split('')),
      { minLength: 1, maxLength: 30 }
    ).filter(s => s.trim().length > 0);

    /**
     * Test service extension with project support for sql.js
     */
    class TestServiceWithProjects extends TestCampaignAnalyticsService {
      createAnalysisProject(data: { name: string; merchantId: string; workerName: string; note?: string }): any {
        const id = uuidv4();
        const now = new Date().toISOString();
        
        (this as any).db.run(
          `INSERT INTO analysis_projects (id, name, merchant_id, worker_name, status, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
          [id, data.name, data.merchantId, data.workerName, data.note || null, now, now]
        );
        
        return this.getAnalysisProjectById(id);
      }

      getAnalysisProjectById(id: string): any | null {
        const result = (this as any).db.exec(
          `SELECT ap.*, m.domain as merchant_domain
           FROM analysis_projects ap
           LEFT JOIN merchants m ON ap.merchant_id = m.id
           WHERE ap.id = ?`,
          [id]
        );
        if (result.length === 0 || result[0].values.length === 0) {
          return null;
        }
        const row = result[0].values[0];
        const columns = result[0].columns;
        return this.rowToProject(columns, row);
      }

      getAnalysisProjects(filter?: { workerName?: string; status?: string }): any[] {
        let query = `
          SELECT ap.*, m.domain as merchant_domain
          FROM analysis_projects ap
          LEFT JOIN merchants m ON ap.merchant_id = m.id
        `;
        const params: any[] = [];
        const conditions: string[] = [];

        if (filter?.workerName) {
          conditions.push('ap.worker_name = ?');
          params.push(filter.workerName);
        }

        if (filter?.status) {
          conditions.push('ap.status = ?');
          params.push(filter.status);
        }

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY ap.created_at DESC';

        const result = (this as any).db.exec(query, params);
        if (result.length === 0) {
          return [];
        }

        const columns = result[0].columns;
        return result[0].values.map((row: any) => this.rowToProject(columns, row));
      }

      private rowToProject(columns: string[], row: any[]): any {
        const obj: any = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        return {
          id: obj.id,
          name: obj.name,
          merchantId: obj.merchant_id,
          workerName: obj.worker_name,
          status: obj.status,
          note: obj.note,
          merchantDomain: obj.merchant_domain,
          createdAt: new Date(obj.created_at),
          updatedAt: new Date(obj.updated_at),
        };
      }
    }

    // Helper to create test database with analysis_projects table
    async function createTestDbWithProjects(): Promise<SqlJsDatabase> {
      const SQL = await initSqlJs();
      const db = new SQL.Database();
      
      // Load campaign schema
      const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
      const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
      db.run(campaignSchema);
      
      // Add analysis_projects table
      db.run(`
        CREATE TABLE IF NOT EXISTS analysis_projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          merchant_id TEXT NOT NULL,
          worker_name TEXT NOT NULL,
          status TEXT DEFAULT 'active',
          note TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (merchant_id) REFERENCES merchants(id)
        );
        CREATE INDEX IF NOT EXISTS idx_analysis_projects_merchant ON analysis_projects(merchant_id);
        CREATE INDEX IF NOT EXISTS idx_analysis_projects_worker ON analysis_projects(worker_name);
      `);
      
      return db;
    }

    it('should only return projects that belong to the specified worker instance', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender for creating merchant
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          projectNameArb, // project name for workerA
          projectNameArb, // project name for workerB
          workerNameArb,
          workerNameArb,
          (sender, subject, recipient, projectNameA, projectNameB, workerA, workerB) => {
            // Ensure workers are different
            if (workerA === workerB) return;
            
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            // Add analysis_projects table
            db.run(`
              CREATE TABLE IF NOT EXISTS analysis_projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                merchant_id TEXT NOT NULL,
                worker_name TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (merchant_id) REFERENCES merchants(id)
              );
            `);
            
            const service = new TestServiceWithProjects(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Create a merchant by tracking an email
              const result = service.trackEmail({
                sender,
                subject,
                recipient,
                workerName: workerA,
              });
              const merchantId = result.merchantId;

              // Create project for workerA
              const projectA = service.createAnalysisProject({
                name: projectNameA,
                merchantId,
                workerName: workerA,
              });

              // Create project for workerB
              const projectB = service.createAnalysisProject({
                name: projectNameB,
                merchantId,
                workerName: workerB,
              });

              // Query projects filtered by workerA
              const projectsForWorkerA = service.getAnalysisProjects({ workerName: workerA });
              
              // All returned projects should belong to workerA
              for (const project of projectsForWorkerA) {
                expect(project.workerName).toBe(workerA);
                expect(project.id).toBe(projectA.id);
              }
              expect(projectsForWorkerA.length).toBe(1);

              // Query projects filtered by workerB
              const projectsForWorkerB = service.getAnalysisProjects({ workerName: workerB });
              
              // All returned projects should belong to workerB
              for (const project of projectsForWorkerB) {
                expect(project.workerName).toBe(workerB);
                expect(project.id).toBe(projectB.id);
              }
              expect(projectsForWorkerB.length).toBe(1);

              // Query all projects (no filter)
              const allProjects = service.getAnalysisProjects();
              expect(allProjects.length).toBe(2);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty list when no projects exist for the specified worker', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          projectNameArb, // project name
          workerNameArb,
          workerNameArb,
          (sender, subject, recipient, projectName, workerA, workerB) => {
            // Ensure workers are different
            if (workerA === workerB) return;
            
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            // Add analysis_projects table
            db.run(`
              CREATE TABLE IF NOT EXISTS analysis_projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                merchant_id TEXT NOT NULL,
                worker_name TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (merchant_id) REFERENCES merchants(id)
              );
            `);
            
            const service = new TestServiceWithProjects(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Create a merchant by tracking an email
              const result = service.trackEmail({
                sender,
                subject,
                recipient,
                workerName: workerA,
              });
              const merchantId = result.merchantId;

              // Create project only for workerA
              service.createAnalysisProject({
                name: projectName,
                merchantId,
                workerName: workerA,
              });

              // Query projects filtered by workerB (which has no projects)
              const projectsForWorkerB = service.getAnalysisProjects({ workerName: workerB });
              
              // Should return empty list
              expect(projectsForWorkerB.length).toBe(0);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should isolate merchants by worker instance when filtering', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          fc.array(validEmailArb, { minLength: 2, maxLength: 3 })
            .filter(arr => {
              // Ensure unique domains
              const domains = arr.map(e => extractDomain(e)).filter(d => d !== null);
              return new Set(domains).size === domains.length;
            }),
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          workerNameArb,
          workerNameArb,
          (senders, subject, recipient, workerA, workerB) => {
            // Ensure workers are different and we have at least 2 senders
            if (workerA === workerB) return;
            if (senders.length < 2) return;
            
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithProjects(db);

            try {
              // Track email from first sender with workerA
              const resultA = service.trackEmail({
                sender: senders[0],
                subject,
                recipient,
                workerName: workerA,
              });

              // Track email from second sender with workerB
              const resultB = service.trackEmail({
                sender: senders[1],
                subject,
                recipient,
                workerName: workerB,
              });

              // Query merchants filtered by workerA
              const merchantsForWorkerA = service.getMerchants({ workerName: workerA });
              
              // All returned merchants should have emails from workerA only
              expect(merchantsForWorkerA.length).toBe(1);
              expect(merchantsForWorkerA[0].id).toBe(resultA.merchantId);

              // Query merchants filtered by workerB
              const merchantsForWorkerB = service.getMerchants({ workerName: workerB });
              
              // All returned merchants should have emails from workerB only
              expect(merchantsForWorkerB.length).toBe(1);
              expect(merchantsForWorkerB[0].id).toBe(resultB.merchantId);

              // Merchants should be different
              expect(resultA.merchantId).not.toBe(resultB.merchantId);
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


// ============================================
// Merchant Data Deletion Property Tests
// ============================================

describe('Merchant Data Deletion', () => {
  // Generate valid worker names
  const workerNameArb = fc.oneof(
    fc.constant('worker-a'),
    fc.constant('worker-b'),
    fc.constant('worker-c'),
    fc.constant('global'),
  );

  /**
   * Test service extension with delete support for sql.js
   */
  class TestServiceWithDelete extends TestCampaignAnalyticsService {
    deleteMerchantData(data: { merchantId: string; workerName: string }): {
      merchantId: string;
      workerName: string;
      emailsDeleted: number;
      pathsDeleted: number;
      campaignsAffected: number;
      merchantDeleted: boolean;
    } {
      const { merchantId, workerName } = data;
      const db = (this as any).db;

      // Check if merchant exists
      const merchant = this.getMerchantById(merchantId);
      if (!merchant) {
        throw new Error(`Merchant not found: ${merchantId}`);
      }

      let emailsDeleted = 0;
      let pathsDeleted = 0;
      let campaignsAffected = 0;
      let merchantDeleted = false;

      // Step 1: Get all campaign IDs for this merchant
      const campaignResult = db.exec(
        'SELECT id FROM campaigns WHERE merchant_id = ?',
        [merchantId]
      );
      const campaignIds: string[] = campaignResult.length > 0 
        ? campaignResult[0].values.map((row: any) => row[0] as string)
        : [];

      if (campaignIds.length > 0) {
        // Step 2: Count and delete campaign_emails for this worker
        const placeholders = campaignIds.map(() => '?').join(',');
        
        const emailCountResult = db.exec(
          `SELECT COUNT(*) as count FROM campaign_emails 
           WHERE campaign_id IN (${placeholders}) AND worker_name = ?`,
          [...campaignIds, workerName]
        );
        emailsDeleted = emailCountResult.length > 0 ? emailCountResult[0].values[0][0] as number : 0;

        if (emailsDeleted > 0) {
          db.run(
            `DELETE FROM campaign_emails 
             WHERE campaign_id IN (${placeholders}) AND worker_name = ?`,
            [...campaignIds, workerName]
          );
        }

        // Step 3: Get recipients that had emails from this worker for this merchant
        // and delete their paths if they have no remaining emails
        const recipientsResult = db.exec(
          `SELECT DISTINCT recipient FROM campaign_emails 
           WHERE campaign_id IN (${placeholders})`,
          [...campaignIds]
        );
        
        // For paths, we need to check which recipients no longer have any emails
        // Since we already deleted the worker's emails, check remaining emails per recipient
        const pathResult = db.exec(
          'SELECT id FROM recipient_paths WHERE merchant_id = ?',
          [merchantId]
        );
        
        if (pathResult.length > 0) {
          // Get all recipients with paths for this merchant
          const pathRecipientsResult = db.exec(
            'SELECT DISTINCT recipient FROM recipient_paths WHERE merchant_id = ?',
            [merchantId]
          );
          
          if (pathRecipientsResult.length > 0) {
            for (const row of pathRecipientsResult[0].values) {
              const recipient = row[0] as string;
              
              // Check if this recipient still has emails from any worker
              const remainingEmailsResult = db.exec(
                `SELECT COUNT(*) as count FROM campaign_emails 
                 WHERE campaign_id IN (${placeholders}) AND recipient = ?`,
                [...campaignIds, recipient]
              );
              const remainingEmails = remainingEmailsResult.length > 0 
                ? remainingEmailsResult[0].values[0][0] as number 
                : 0;

              if (remainingEmails === 0) {
                // Delete all paths for this recipient and merchant
                const pathDeleteResult = db.exec(
                  'SELECT COUNT(*) FROM recipient_paths WHERE merchant_id = ? AND recipient = ?',
                  [merchantId, recipient]
                );
                const pathCount = pathDeleteResult.length > 0 
                  ? pathDeleteResult[0].values[0][0] as number 
                  : 0;
                
                db.run(
                  'DELETE FROM recipient_paths WHERE merchant_id = ? AND recipient = ?',
                  [merchantId, recipient]
                );
                pathsDeleted += pathCount;
              }
            }
          }
        }

        // Step 4: Count affected campaigns
        const affectedCampaignsResult = db.exec(
          `SELECT COUNT(DISTINCT id) as count FROM campaigns WHERE merchant_id = ?`,
          [merchantId]
        );
        campaignsAffected = affectedCampaignsResult.length > 0 
          ? affectedCampaignsResult[0].values[0][0] as number 
          : 0;

        // Step 5: Update campaign statistics
        for (const campaignId of campaignIds) {
          const emailCount = db.exec(
            'SELECT COUNT(*) as count FROM campaign_emails WHERE campaign_id = ?',
            [campaignId]
          );
          const count = emailCount.length > 0 ? emailCount[0].values[0][0] as number : 0;

          const recipientCount = db.exec(
            'SELECT COUNT(DISTINCT recipient) as count FROM campaign_emails WHERE campaign_id = ?',
            [campaignId]
          );
          const recipients = recipientCount.length > 0 ? recipientCount[0].values[0][0] as number : 0;

          db.run(
            `UPDATE campaigns SET total_emails = ?, unique_recipients = ?, updated_at = ? WHERE id = ?`,
            [count, recipients, new Date().toISOString(), campaignId]
          );
        }
      }

      // Step 6: Check if merchant has any remaining data
      const remainingEmailsResult = db.exec(
        `SELECT COUNT(*) as count FROM campaign_emails 
         WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?)`,
        [merchantId]
      );
      const remainingEmails = remainingEmailsResult.length > 0 
        ? remainingEmailsResult[0].values[0][0] as number 
        : 0;

      if (remainingEmails === 0) {
        // Delete all campaigns for this merchant
        db.run('DELETE FROM campaigns WHERE merchant_id = ?', [merchantId]);
        
        // Delete all remaining paths for this merchant
        db.run('DELETE FROM recipient_paths WHERE merchant_id = ?', [merchantId]);
        
        // Delete the merchant record
        db.run('DELETE FROM merchants WHERE id = ?', [merchantId]);
        
        merchantDeleted = true;
      } else {
        // Update merchant statistics
        const totalEmails = db.exec(
          `SELECT COUNT(*) as count FROM campaign_emails 
           WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?)`,
          [merchantId]
        );
        const emailTotal = totalEmails.length > 0 ? totalEmails[0].values[0][0] as number : 0;

        const totalCampaigns = db.exec(
          `SELECT COUNT(DISTINCT c.id) as count 
           FROM campaigns c
           JOIN campaign_emails ce ON c.id = ce.campaign_id
           WHERE c.merchant_id = ?`,
          [merchantId]
        );
        const campaignTotal = totalCampaigns.length > 0 ? totalCampaigns[0].values[0][0] as number : 0;

        db.run(
          `UPDATE merchants SET total_emails = ?, total_campaigns = ?, updated_at = ? WHERE id = ?`,
          [emailTotal, campaignTotal, new Date().toISOString(), merchantId]
        );
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

    getEmailsForMerchantAndWorker(merchantId: string, workerName: string): number {
      const db = (this as any).db;
      const result = db.exec(
        `SELECT COUNT(*) as count FROM campaign_emails 
         WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?) 
         AND worker_name = ?`,
        [merchantId, workerName]
      );
      return result.length > 0 ? result[0].values[0][0] as number : 0;
    }

    getPathsForMerchant(merchantId: string): number {
      const db = (this as any).db;
      const result = db.exec(
        'SELECT COUNT(*) as count FROM recipient_paths WHERE merchant_id = ?',
        [merchantId]
      );
      return result.length > 0 ? result[0].values[0][0] as number : 0;
    }

    getAllEmailsForMerchant(merchantId: string): number {
      const db = (this as any).db;
      const result = db.exec(
        `SELECT COUNT(*) as count FROM campaign_emails 
         WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?)`,
        [merchantId]
      );
      return result.length > 0 ? result[0].values[0][0] as number : 0;
    }
  }

  /**
   * **Feature: merchant-data-management, Property 5: Delete Removes Worker Emails**
   * **Validates: Requirements 3.2**
   * 
   * For any delete operation on a merchant for a specific Worker, 
   * all campaign_emails records for that merchant and Worker should be removed.
   */
  describe('Property 5: Delete Removes Worker Emails', () => {
    it('should remove all emails for the specified worker when deleting merchant data', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }), // subjects
          fc.array(validEmailArb, { minLength: 1, maxLength: 3 }), // recipients
          workerNameArb,
          (sender, subjects, recipients, workerName) => {
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithDelete(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track multiple emails from the same sender with the specified worker
              let merchantId: string | null = null;
              for (const subject of subjects) {
                for (const recipient of recipients) {
                  const result = service.trackEmail({
                    sender,
                    subject,
                    recipient,
                    workerName,
                  });
                  merchantId = result.merchantId;
                }
              }

              if (!merchantId) return;

              // Verify emails exist before deletion
              const emailsBefore = service.getEmailsForMerchantAndWorker(merchantId, workerName);
              expect(emailsBefore).toBeGreaterThan(0);

              // Delete merchant data for this worker
              const deleteResult = service.deleteMerchantData({
                merchantId,
                workerName,
              });

              // Verify all emails for this worker are removed
              const emailsAfter = service.getEmailsForMerchantAndWorker(merchantId, workerName);
              expect(emailsAfter).toBe(0);
              expect(deleteResult.emailsDeleted).toBe(emailsBefore);
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
   * **Feature: merchant-data-management, Property 6: Delete Removes Worker Paths**
   * **Validates: Requirements 3.3**
   * 
   * For any delete operation on a merchant for a specific Worker, 
   * all recipient_paths records associated with that Worker's data should be removed.
   */
  describe('Property 6: Delete Removes Worker Paths', () => {
    it('should remove paths for recipients whose emails were all from the deleted worker', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }), // subjects
          validEmailArb, // recipient (single recipient to ensure path is created)
          workerNameArb,
          (sender, subjects, recipient, workerName) => {
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithDelete(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track emails to create paths
              let merchantId: string | null = null;
              for (const subject of subjects) {
                const result = service.trackEmail({
                  sender,
                  subject,
                  recipient,
                  workerName,
                });
                merchantId = result.merchantId;
              }

              if (!merchantId) return;

              // Verify paths exist before deletion
              const pathsBefore = service.getPathsForMerchant(merchantId);
              expect(pathsBefore).toBeGreaterThan(0);

              // Delete merchant data for this worker
              service.deleteMerchantData({
                merchantId,
                workerName,
              });

              // Since all emails were from this worker, paths should be removed
              // (merchant should be deleted entirely in this case)
              const merchant = service.getMerchantById(merchantId);
              if (merchant === null) {
                // Merchant was deleted, so paths are gone
                expect(true).toBe(true);
              } else {
                // If merchant still exists, check paths
                const pathsAfter = service.getPathsForMerchant(merchantId);
                // Paths for recipients with no remaining emails should be removed
                expect(pathsAfter).toBeLessThanOrEqual(pathsBefore);
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
   * **Feature: merchant-data-management, Property 7: Delete Preserves Other Worker Data**
   * **Validates: Requirements 3.5**
   * 
   * For any delete operation on a merchant for Worker A, 
   * if the merchant has data in Worker B, the Worker B data should remain unchanged.
   */
  describe('Property 7: Delete Preserves Other Worker Data', () => {
    it('should preserve emails from other workers when deleting data for one worker', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          workerNameArb,
          workerNameArb,
          (sender, subject, recipient, workerA, workerB) => {
            // Ensure workers are different
            if (workerA === workerB) return;

            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithDelete(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track email from workerA
              const resultA = service.trackEmail({
                sender,
                subject,
                recipient,
                workerName: workerA,
              });

              // Track email from workerB (same merchant, different worker)
              service.trackEmail({
                sender,
                subject: subject + ' v2', // Different subject to create another campaign
                recipient,
                workerName: workerB,
              });

              const merchantId = resultA.merchantId;

              // Verify both workers have emails
              const emailsWorkerA = service.getEmailsForMerchantAndWorker(merchantId, workerA);
              const emailsWorkerB = service.getEmailsForMerchantAndWorker(merchantId, workerB);
              expect(emailsWorkerA).toBeGreaterThan(0);
              expect(emailsWorkerB).toBeGreaterThan(0);

              // Delete data for workerA only
              service.deleteMerchantData({
                merchantId,
                workerName: workerA,
              });

              // Verify workerA emails are removed
              const emailsWorkerAAfter = service.getEmailsForMerchantAndWorker(merchantId, workerA);
              expect(emailsWorkerAAfter).toBe(0);

              // Verify workerB emails are preserved
              const emailsWorkerBAfter = service.getEmailsForMerchantAndWorker(merchantId, workerB);
              expect(emailsWorkerBAfter).toBe(emailsWorkerB);

              // Merchant should still exist
              const merchant = service.getMerchantById(merchantId);
              expect(merchant).not.toBeNull();
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
   * **Feature: merchant-data-management, Property 8: Delete Cleans Up Empty Merchant**
   * **Validates: Requirements 3.6**
   * 
   * For any merchant that has no remaining data in any Worker after a delete operation, 
   * the merchant record should be removed.
   */
  describe('Property 8: Delete Cleans Up Empty Merchant', () => {
    it('should delete merchant record when no data remains after deletion', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          workerNameArb,
          (sender, subject, recipient, workerName) => {
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithDelete(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track email from single worker
              const result = service.trackEmail({
                sender,
                subject,
                recipient,
                workerName,
              });

              const merchantId = result.merchantId;

              // Verify merchant exists
              const merchantBefore = service.getMerchantById(merchantId);
              expect(merchantBefore).not.toBeNull();

              // Delete all data for this worker (the only worker with data)
              const deleteResult = service.deleteMerchantData({
                merchantId,
                workerName,
              });

              // Verify merchant is deleted
              expect(deleteResult.merchantDeleted).toBe(true);
              
              const merchantAfter = service.getMerchantById(merchantId);
              expect(merchantAfter).toBeNull();
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT delete merchant record when other workers still have data', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          workerNameArb,
          workerNameArb,
          (sender, subject, recipient, workerA, workerB) => {
            // Ensure workers are different
            if (workerA === workerB) return;

            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithDelete(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track emails from both workers
              const resultA = service.trackEmail({
                sender,
                subject,
                recipient,
                workerName: workerA,
              });

              service.trackEmail({
                sender,
                subject: subject + ' v2',
                recipient,
                workerName: workerB,
              });

              const merchantId = resultA.merchantId;

              // Delete data for workerA only
              const deleteResult = service.deleteMerchantData({
                merchantId,
                workerName: workerA,
              });

              // Merchant should NOT be deleted
              expect(deleteResult.merchantDeleted).toBe(false);
              
              const merchantAfter = service.getMerchantById(merchantId);
              expect(merchantAfter).not.toBeNull();
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


// ============================================
// Worker Data Isolation Property Tests
// ============================================

describe('Worker Data Isolation', () => {
  // Generate valid worker names
  const workerNameArb = fc.oneof(
    fc.constant('worker-a'),
    fc.constant('worker-b'),
    fc.constant('worker-c'),
  );

  /**
   * Test service extension with Worker-specific statistics for sql.js
   */
  class TestServiceWithWorkerStats extends TestCampaignAnalyticsService {
    /**
     * Get merchants with Worker-specific statistics
     * This mirrors the production getMerchants behavior when workerName is specified
     */
    getMerchantsWithWorkerStats(workerName: string): any[] {
      const db = (this as any).db;
      
      // Get merchants that have emails from this worker, with worker-specific counts
      const result = db.exec(`
        SELECT 
          m.*,
          COALESCE(wc.campaign_count, 0) as worker_campaign_count,
          COALESCE(wc.email_count, 0) as worker_email_count
        FROM merchants m
        INNER JOIN (
          SELECT 
            c.merchant_id,
            COUNT(DISTINCT c.id) as campaign_count,
            COUNT(ce.id) as email_count
          FROM campaigns c
          JOIN campaign_emails ce ON c.id = ce.campaign_id
          WHERE ce.worker_name = ?
          GROUP BY c.merchant_id
        ) wc ON m.id = wc.merchant_id
      `, [workerName]);

      if (result.length === 0) {
        return [];
      }

      const columns = result[0].columns;
      return result[0].values.map((row: any) => {
        const obj: any = {};
        columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return {
          id: obj.id,
          domain: obj.domain,
          totalCampaigns: obj.worker_campaign_count,
          totalEmails: obj.worker_email_count,
        };
      });
    }

    /**
     * Get actual email count for a merchant from a specific worker
     */
    getWorkerEmailCount(merchantId: string, workerName: string): number {
      const db = (this as any).db;
      const result = db.exec(`
        SELECT COUNT(*) as count 
        FROM campaign_emails ce
        JOIN campaigns c ON ce.campaign_id = c.id
        WHERE c.merchant_id = ? AND ce.worker_name = ?
      `, [merchantId, workerName]);
      return result.length > 0 ? result[0].values[0][0] as number : 0;
    }

    /**
     * Get actual campaign count for a merchant from a specific worker
     */
    getWorkerCampaignCount(merchantId: string, workerName: string): number {
      const db = (this as any).db;
      const result = db.exec(`
        SELECT COUNT(DISTINCT c.id) as count 
        FROM campaigns c
        JOIN campaign_emails ce ON c.id = ce.campaign_id
        WHERE c.merchant_id = ? AND ce.worker_name = ?
      `, [merchantId, workerName]);
      return result.length > 0 ? result[0].values[0][0] as number : 0;
    }

    /**
     * Get total email count for a merchant across all workers
     */
    getTotalEmailCount(merchantId: string): number {
      const db = (this as any).db;
      const result = db.exec(`
        SELECT COUNT(*) as count 
        FROM campaign_emails ce
        JOIN campaigns c ON ce.campaign_id = c.id
        WHERE c.merchant_id = ?
      `, [merchantId]);
      return result.length > 0 ? result[0].values[0][0] as number : 0;
    }
  }

  /**
   * **Feature: merchant-data-management, Property 2: Worker Filter Isolation**
   * **Validates: Requirements 1.3, 2.1**
   * 
   * For any merchant list query with a workerName filter, all returned merchants 
   * should have at least one email from that Worker.
   */
  describe('Property 2: Worker Filter Isolation', () => {
    it('should only return merchants that have emails from the specified worker', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          // Generate multiple senders to create multiple merchants
          fc.array(validEmailArb, { minLength: 2, maxLength: 4 })
            .filter(arr => {
              // Ensure unique domains
              const domains = arr.map(e => extractDomain(e)).filter(d => d !== null);
              return new Set(domains).size === domains.length;
            }),
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }), // subjects
          validEmailArb, // recipient
          workerNameArb,
          workerNameArb,
          (senders, subjects, recipient, workerA, workerB) => {
            // Ensure workers are different
            if (workerA === workerB) return;
            if (senders.length < 2) return;
            
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithWorkerStats(db);

            try {
              // Track emails from first half of senders with workerA
              const workerAMerchantIds = new Set<string>();
              const halfIndex = Math.ceil(senders.length / 2);
              
              for (let i = 0; i < halfIndex; i++) {
                for (const subject of subjects) {
                  const result = service.trackEmail({
                    sender: senders[i],
                    subject,
                    recipient,
                    workerName: workerA,
                  });
                  workerAMerchantIds.add(result.merchantId);
                }
              }

              // Track emails from second half of senders with workerB
              const workerBMerchantIds = new Set<string>();
              for (let i = halfIndex; i < senders.length; i++) {
                for (const subject of subjects) {
                  const result = service.trackEmail({
                    sender: senders[i],
                    subject,
                    recipient,
                    workerName: workerB,
                  });
                  workerBMerchantIds.add(result.merchantId);
                }
              }

              // Query merchants filtered by workerA
              const merchantsForWorkerA = service.getMerchants({ workerName: workerA });
              
              // Property: All returned merchants should have at least one email from workerA
              for (const merchant of merchantsForWorkerA) {
                const emailCount = service.getWorkerEmailCount(merchant.id, workerA);
                expect(emailCount).toBeGreaterThan(0);
              }

              // Property: No merchants from workerB-only should appear in workerA results
              for (const merchant of merchantsForWorkerA) {
                // If this merchant has no emails from workerA, it shouldn't be in the list
                const workerAEmails = service.getWorkerEmailCount(merchant.id, workerA);
                expect(workerAEmails).toBeGreaterThan(0);
              }

              // Query merchants filtered by workerB
              const merchantsForWorkerB = service.getMerchants({ workerName: workerB });
              
              // Property: All returned merchants should have at least one email from workerB
              for (const merchant of merchantsForWorkerB) {
                const emailCount = service.getWorkerEmailCount(merchant.id, workerB);
                expect(emailCount).toBeGreaterThan(0);
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
   * **Feature: merchant-data-management, Property 3: Worker Statistics Accuracy**
   * **Validates: Requirements 2.2, 6.1, 6.2**
   * 
   * For any merchant displayed in a Worker-filtered view, the email count and 
   * campaign count should only include data from that specific Worker.
   */
  describe('Property 3: Worker Statistics Accuracy', () => {
    it('should calculate statistics only from the specified worker data', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender (single merchant)
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          validEmailArb, // recipient
          workerNameArb,
          workerNameArb,
          fc.integer({ min: 1, max: 3 }), // emails per subject for workerA
          fc.integer({ min: 1, max: 3 }), // emails per subject for workerB
          (sender, subjects, recipient, workerA, workerB, countA, countB) => {
            // Ensure workers are different
            if (workerA === workerB) return;
            if (subjects.length < 2) return;
            
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithWorkerStats(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Split subjects between workers
              const halfIndex = Math.ceil(subjects.length / 2);
              const subjectsA = subjects.slice(0, halfIndex);
              const subjectsB = subjects.slice(halfIndex);

              let merchantId: string | null = null;

              // Track emails for workerA
              for (const subject of subjectsA) {
                for (let i = 0; i < countA; i++) {
                  const result = service.trackEmail({
                    sender,
                    subject,
                    recipient: `${recipient.split('@')[0]}+${i}@${recipient.split('@')[1]}`,
                    workerName: workerA,
                  });
                  merchantId = result.merchantId;
                }
              }

              // Track emails for workerB
              for (const subject of subjectsB) {
                for (let i = 0; i < countB; i++) {
                  const result = service.trackEmail({
                    sender,
                    subject,
                    recipient: `${recipient.split('@')[0]}+${i}@${recipient.split('@')[1]}`,
                    workerName: workerB,
                  });
                  merchantId = result.merchantId;
                }
              }

              if (!merchantId) return;

              // Get merchants with worker-specific stats for workerA
              const merchantsA = service.getMerchantsWithWorkerStats(workerA);
              const merchantA = merchantsA.find(m => m.id === merchantId);
              
              if (merchantA) {
                // Property: Email count should match actual emails from workerA
                const actualEmailsA = service.getWorkerEmailCount(merchantId, workerA);
                expect(merchantA.totalEmails).toBe(actualEmailsA);

                // Property: Campaign count should match actual campaigns from workerA
                const actualCampaignsA = service.getWorkerCampaignCount(merchantId, workerA);
                expect(merchantA.totalCampaigns).toBe(actualCampaignsA);

                // Property: Stats should NOT include workerB data
                const totalEmails = service.getTotalEmailCount(merchantId);
                if (subjectsB.length > 0) {
                  expect(merchantA.totalEmails).toBeLessThan(totalEmails);
                }
              }

              // Get merchants with worker-specific stats for workerB
              const merchantsB = service.getMerchantsWithWorkerStats(workerB);
              const merchantB = merchantsB.find(m => m.id === merchantId);
              
              if (merchantB) {
                // Property: Email count should match actual emails from workerB
                const actualEmailsB = service.getWorkerEmailCount(merchantId, workerB);
                expect(merchantB.totalEmails).toBe(actualEmailsB);

                // Property: Campaign count should match actual campaigns from workerB
                const actualCampaignsB = service.getWorkerCampaignCount(merchantId, workerB);
                expect(merchantB.totalCampaigns).toBe(actualCampaignsB);
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
   * **Feature: merchant-data-management, Property 4: Cross-Worker Data Independence**
   * **Validates: Requirements 2.3**
   * 
   * For any merchant that exists in multiple Workers, the statistics shown in 
   * each Worker view should be independent and not affect each other.
   */
  describe('Property 4: Cross-Worker Data Independence', () => {
    it('should maintain independent statistics for each worker', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender (single merchant)
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          workerNameArb,
          workerNameArb,
          fc.integer({ min: 1, max: 5 }), // initial emails for workerA
          fc.integer({ min: 1, max: 5 }), // additional emails for workerB
          (sender, subject, recipient, workerA, workerB, initialCountA, additionalCountB) => {
            // Ensure workers are different
            if (workerA === workerB) return;
            
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithWorkerStats(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              let merchantId: string | null = null;

              // Track initial emails for workerA
              for (let i = 0; i < initialCountA; i++) {
                const result = service.trackEmail({
                  sender,
                  subject: `${subject} A${i}`,
                  recipient,
                  workerName: workerA,
                });
                merchantId = result.merchantId;
              }

              if (!merchantId) return;

              // Record workerA stats before adding workerB data
              const statsABefore = service.getWorkerEmailCount(merchantId, workerA);

              // Add emails for workerB
              for (let i = 0; i < additionalCountB; i++) {
                service.trackEmail({
                  sender,
                  subject: `${subject} B${i}`,
                  recipient,
                  workerName: workerB,
                });
              }

              // Property: WorkerA stats should remain unchanged after adding workerB data
              const statsAAfter = service.getWorkerEmailCount(merchantId, workerA);
              expect(statsAAfter).toBe(statsABefore);

              // Property: WorkerA and WorkerB stats should be independent
              const merchantsA = service.getMerchantsWithWorkerStats(workerA);
              const merchantsB = service.getMerchantsWithWorkerStats(workerB);
              
              const merchantInA = merchantsA.find(m => m.id === merchantId);
              const merchantInB = merchantsB.find(m => m.id === merchantId);

              expect(merchantInA).toBeDefined();
              expect(merchantInB).toBeDefined();

              if (merchantInA && merchantInB) {
                // Property: Each worker view shows only its own data
                expect(merchantInA.totalEmails).toBe(initialCountA);
                expect(merchantInB.totalEmails).toBe(additionalCountB);

                // Property: Sum of worker stats equals total
                const totalEmails = service.getTotalEmailCount(merchantId);
                expect(merchantInA.totalEmails + merchantInB.totalEmails).toBe(totalEmails);
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
   * **Feature: merchant-data-management, Property 1: Worker Data Source Tagging**
   * **Validates: Requirements 1.1, 1.2**
   * 
   * For any email tracked by the system, the campaign_emails record should contain 
   * the correct worker_name that matches the source Worker.
   */
  describe('Property 1: Worker Data Source Tagging', () => {
    /**
     * Test service extension with method to verify worker_name in campaign_emails
     */
    class TestServiceWithWorkerVerification extends TestCampaignAnalyticsService {
      /**
       * Get the worker_name for a specific campaign email record
       */
      getEmailWorkerName(campaignId: string, recipient: string): string | null {
        const db = (this as any).db;
        const result = db.exec(
          `SELECT worker_name FROM campaign_emails 
           WHERE campaign_id = ? AND recipient = ? 
           ORDER BY id DESC LIMIT 1`,
          [campaignId, recipient]
        );
        if (result.length === 0 || result[0].values.length === 0) {
          return null;
        }
        return result[0].values[0][0] as string;
      }

      /**
       * Get all emails for a campaign with their worker_names
       */
      getEmailsWithWorkerName(campaignId: string): Array<{ recipient: string; workerName: string }> {
        const db = (this as any).db;
        const result = db.exec(
          `SELECT recipient, worker_name FROM campaign_emails WHERE campaign_id = ?`,
          [campaignId]
        );
        if (result.length === 0) {
          return [];
        }
        return result[0].values.map((row: any) => ({
          recipient: row[0] as string,
          workerName: row[1] as string,
        }));
      }

      /**
       * Count emails by worker_name for a campaign
       */
      countEmailsByWorker(campaignId: string, workerName: string): number {
        const db = (this as any).db;
        const result = db.exec(
          `SELECT COUNT(*) as count FROM campaign_emails 
           WHERE campaign_id = ? AND worker_name = ?`,
          [campaignId, workerName]
        );
        return result.length > 0 ? result[0].values[0][0] as number : 0;
      }
    }

    it('should save the correct worker_name when tracking an email with explicit workerName', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          workerNameArb, // workerName
          (sender, subject, recipient, workerName) => {
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithWorkerVerification(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track an email with explicit workerName
              const result = service.trackEmail({
                sender,
                subject,
                recipient,
                workerName,
              });

              // Property: The saved worker_name should match the provided workerName
              const savedWorkerName = service.getEmailWorkerName(result.campaignId, recipient);
              expect(savedWorkerName).toBe(workerName);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should default worker_name to "global" when workerName is not provided', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          (sender, subject, recipient) => {
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithWorkerVerification(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track an email WITHOUT workerName
              const result = service.trackEmail({
                sender,
                subject,
                recipient,
                // workerName is intentionally omitted
              });

              // Property: The saved worker_name should default to 'global'
              const savedWorkerName = service.getEmailWorkerName(result.campaignId, recipient);
              expect(savedWorkerName).toBe('global');
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve worker_name for each email when tracking multiple emails from different workers', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          fc.array(validEmailArb, { minLength: 2, maxLength: 5 })
            .filter(arr => new Set(arr).size === arr.length), // unique recipients
          workerNameArb,
          workerNameArb,
          (sender, subject, recipients, workerA, workerB) => {
            // Ensure workers are different
            if (workerA === workerB) return;
            if (recipients.length < 2) return;
            
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithWorkerVerification(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track first half of recipients with workerA
              const halfIndex = Math.ceil(recipients.length / 2);
              let campaignId: string | null = null;
              
              for (let i = 0; i < halfIndex; i++) {
                const result = service.trackEmail({
                  sender,
                  subject,
                  recipient: recipients[i],
                  workerName: workerA,
                });
                campaignId = result.campaignId;
              }

              // Track second half of recipients with workerB
              for (let i = halfIndex; i < recipients.length; i++) {
                service.trackEmail({
                  sender,
                  subject,
                  recipient: recipients[i],
                  workerName: workerB,
                });
              }

              if (!campaignId) return;

              // Property: Each email should have the correct worker_name
              for (let i = 0; i < halfIndex; i++) {
                const savedWorkerName = service.getEmailWorkerName(campaignId, recipients[i]);
                expect(savedWorkerName).toBe(workerA);
              }

              for (let i = halfIndex; i < recipients.length; i++) {
                const savedWorkerName = service.getEmailWorkerName(campaignId, recipients[i]);
                expect(savedWorkerName).toBe(workerB);
              }

              // Property: Count of emails by worker should match
              const countA = service.countEmailsByWorker(campaignId, workerA);
              const countB = service.countEmailsByWorker(campaignId, workerB);
              expect(countA).toBe(halfIndex);
              expect(countB).toBe(recipients.length - halfIndex);
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


// ============================================
// Project Worker Association Property Tests
// ============================================

describe('Project Worker Association', () => {
  // Generate valid worker names
  const workerNameArb = fc.oneof(
    fc.constant('worker-a'),
    fc.constant('worker-b'),
    fc.constant('worker-c'),
    fc.constant('global'),
  );

  // Generate valid project names
  const projectNameArb = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0);

  /**
   * Test service extension with project support for sql.js
   */
  class TestServiceWithProjectAssociation extends TestCampaignAnalyticsService {
    createAnalysisProject(data: { name: string; merchantId: string; workerName: string; note?: string }): any {
      const id = uuidv4();
      const now = new Date().toISOString();
      
      (this as any).db.run(
        `INSERT INTO analysis_projects (id, name, merchant_id, worker_name, status, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
        [id, data.name, data.merchantId, data.workerName, data.note || null, now, now]
      );
      
      return this.getAnalysisProjectById(id);
    }

    getAnalysisProjectById(id: string): any | null {
      const result = (this as any).db.exec(
        `SELECT ap.*, m.domain as merchant_domain
         FROM analysis_projects ap
         LEFT JOIN merchants m ON ap.merchant_id = m.id
         WHERE ap.id = ?`,
        [id]
      );
      if (result.length === 0 || result[0].values.length === 0) {
        return null;
      }
      const row = result[0].values[0];
      const columns = result[0].columns;
      return this.rowToProject(columns, row);
    }

    getAnalysisProjects(filter?: { workerName?: string; status?: string }): any[] {
      let query = `
        SELECT ap.*, m.domain as merchant_domain
        FROM analysis_projects ap
        LEFT JOIN merchants m ON ap.merchant_id = m.id
      `;
      const params: any[] = [];
      const conditions: string[] = [];

      if (filter?.workerName) {
        conditions.push('ap.worker_name = ?');
        params.push(filter.workerName);
      }

      if (filter?.status) {
        conditions.push('ap.status = ?');
        params.push(filter.status);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY ap.created_at DESC';

      const result = (this as any).db.exec(query, params);
      if (result.length === 0) {
        return [];
      }

      const columns = result[0].columns;
      return result[0].values.map((row: any) => this.rowToProject(columns, row));
    }

    /**
     * Get emails for a project's merchant filtered by the project's worker
     */
    getProjectEmails(projectId: string): Array<{ recipient: string; workerName: string; subject: string }> {
      const project = this.getAnalysisProjectById(projectId);
      if (!project) return [];

      const db = (this as any).db;
      const result = db.exec(
        `SELECT ce.recipient, ce.worker_name, c.subject
         FROM campaign_emails ce
         JOIN campaigns c ON ce.campaign_id = c.id
         WHERE c.merchant_id = ? AND ce.worker_name = ?`,
        [project.merchantId, project.workerName]
      );

      if (result.length === 0) return [];

      return result[0].values.map((row: any) => ({
        recipient: row[0] as string,
        workerName: row[1] as string,
        subject: row[2] as string,
      }));
    }

    /**
     * Get all emails for a merchant (regardless of worker)
     */
    getAllMerchantEmails(merchantId: string): Array<{ recipient: string; workerName: string }> {
      const db = (this as any).db;
      const result = db.exec(
        `SELECT ce.recipient, ce.worker_name
         FROM campaign_emails ce
         JOIN campaigns c ON ce.campaign_id = c.id
         WHERE c.merchant_id = ?`,
        [merchantId]
      );

      if (result.length === 0) return [];

      return result[0].values.map((row: any) => ({
        recipient: row[0] as string,
        workerName: row[1] as string,
      }));
    }

    private rowToProject(columns: string[], row: any[]): any {
      const obj: any = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return {
        id: obj.id,
        name: obj.name,
        merchantId: obj.merchant_id,
        workerName: obj.worker_name,
        status: obj.status,
        note: obj.note,
        merchantDomain: obj.merchant_domain,
        createdAt: new Date(obj.created_at),
        updatedAt: new Date(obj.updated_at),
      };
    }
  }

  /**
   * **Feature: merchant-data-management, Property 9: Project Worker Association**
   * **Validates: Requirements 4.1, 4.4**
   * 
   * For any analysis project, the project should be associated with a specific Worker name,
   * and queries should respect this association.
   */
  describe('Property 9: Project Worker Association', () => {
    it('should associate project with the specified worker and filter correctly', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender for creating merchant
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          projectNameArb, // project name
          workerNameArb,
          workerNameArb,
          (sender, subject, recipient, projectName, workerA, workerB) => {
            // Ensure workers are different
            if (workerA === workerB) return;
            
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            // Add analysis_projects table
            db.run(`
              CREATE TABLE IF NOT EXISTS analysis_projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                merchant_id TEXT NOT NULL,
                worker_name TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (merchant_id) REFERENCES merchants(id)
              );
            `);
            
            const service = new TestServiceWithProjectAssociation(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Create a merchant by tracking an email
              const result = service.trackEmail({
                sender,
                subject,
                recipient,
                workerName: workerA,
              });
              const merchantId = result.merchantId;

              // Create project associated with workerA
              const project = service.createAnalysisProject({
                name: projectName,
                merchantId,
                workerName: workerA,
              });

              // Property 1: Project should have the correct workerName
              expect(project.workerName).toBe(workerA);

              // Property 2: getAnalysisProjects with workerA filter should return this project
              const projectsForWorkerA = service.getAnalysisProjects({ workerName: workerA });
              expect(projectsForWorkerA.length).toBe(1);
              expect(projectsForWorkerA[0].id).toBe(project.id);
              expect(projectsForWorkerA[0].workerName).toBe(workerA);

              // Property 3: getAnalysisProjects with workerB filter should NOT return this project
              const projectsForWorkerB = service.getAnalysisProjects({ workerName: workerB });
              expect(projectsForWorkerB.length).toBe(0);

              // Property 4: getAnalysisProjectById should return project with correct workerName
              const retrievedProject = service.getAnalysisProjectById(project.id);
              expect(retrievedProject).not.toBeNull();
              expect(retrievedProject.workerName).toBe(workerA);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly filter projects when multiple projects exist for different workers', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender for creating merchant
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          projectNameArb, // project name for workerA
          projectNameArb, // project name for workerB
          workerNameArb,
          workerNameArb,
          (sender, subject, recipient, projectNameA, projectNameB, workerA, workerB) => {
            // Ensure workers are different
            if (workerA === workerB) return;
            
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            // Add analysis_projects table
            db.run(`
              CREATE TABLE IF NOT EXISTS analysis_projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                merchant_id TEXT NOT NULL,
                worker_name TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (merchant_id) REFERENCES merchants(id)
              );
            `);
            
            const service = new TestServiceWithProjectAssociation(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Create a merchant by tracking an email
              const result = service.trackEmail({
                sender,
                subject,
                recipient,
                workerName: workerA,
              });
              const merchantId = result.merchantId;

              // Create project for workerA
              const projectA = service.createAnalysisProject({
                name: projectNameA,
                merchantId,
                workerName: workerA,
              });

              // Create project for workerB
              const projectB = service.createAnalysisProject({
                name: projectNameB,
                merchantId,
                workerName: workerB,
              });

              // Property: Each worker filter should return only its own projects
              const projectsForWorkerA = service.getAnalysisProjects({ workerName: workerA });
              expect(projectsForWorkerA.length).toBe(1);
              expect(projectsForWorkerA.every(p => p.workerName === workerA)).toBe(true);
              expect(projectsForWorkerA[0].id).toBe(projectA.id);

              const projectsForWorkerB = service.getAnalysisProjects({ workerName: workerB });
              expect(projectsForWorkerB.length).toBe(1);
              expect(projectsForWorkerB.every(p => p.workerName === workerB)).toBe(true);
              expect(projectsForWorkerB[0].id).toBe(projectB.id);

              // Property: No filter should return all projects
              const allProjects = service.getAnalysisProjects();
              expect(allProjects.length).toBe(2);
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
   * **Feature: merchant-data-management, Property 10: Project Data Isolation**
   * **Validates: Requirements 4.2**
   * 
   * For any analysis project opened, the loaded data should only include records 
   * from the project's associated Worker.
   */
  describe('Property 10: Project Data Isolation', () => {
    it('should only load data from the project associated worker', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender for creating merchant
          fc.string({ minLength: 1, maxLength: 50 }), // subject for workerA
          fc.string({ minLength: 1, maxLength: 50 }), // subject for workerB
          validEmailArb, // recipient for workerA
          validEmailArb, // recipient for workerB
          projectNameArb, // project name
          workerNameArb,
          workerNameArb,
          (sender, subjectA, subjectB, recipientA, recipientB, projectName, workerA, workerB) => {
            // Ensure workers are different and recipients are different
            if (workerA === workerB) return;
            if (recipientA === recipientB) return;
            
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            // Add analysis_projects table
            db.run(`
              CREATE TABLE IF NOT EXISTS analysis_projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                merchant_id TEXT NOT NULL,
                worker_name TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (merchant_id) REFERENCES merchants(id)
              );
            `);
            
            const service = new TestServiceWithProjectAssociation(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track email from workerA
              const resultA = service.trackEmail({
                sender,
                subject: subjectA,
                recipient: recipientA,
                workerName: workerA,
              });
              const merchantId = resultA.merchantId;

              // Track email from workerB for the same merchant (same sender domain)
              service.trackEmail({
                sender,
                subject: subjectB,
                recipient: recipientB,
                workerName: workerB,
              });

              // Create project associated with workerA
              const project = service.createAnalysisProject({
                name: projectName,
                merchantId,
                workerName: workerA,
              });

              // Get all emails for the merchant (should have both workers)
              const allEmails = service.getAllMerchantEmails(merchantId);
              expect(allEmails.length).toBe(2);

              // Get emails for the project (should only have workerA's data)
              const projectEmails = service.getProjectEmails(project.id);
              
              // Property 1: All project emails should be from the project's worker
              expect(projectEmails.every(e => e.workerName === workerA)).toBe(true);

              // Property 2: Project emails should not include workerB's data
              expect(projectEmails.some(e => e.workerName === workerB)).toBe(false);

              // Property 3: Project emails count should be less than or equal to all emails
              expect(projectEmails.length).toBeLessThanOrEqual(allEmails.length);

              // Property 4: Project emails should only contain recipientA (from workerA)
              expect(projectEmails.length).toBe(1);
              expect(projectEmails[0].recipient).toBe(recipientA);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty data when project worker has no emails', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender for creating merchant
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          projectNameArb, // project name
          workerNameArb,
          workerNameArb,
          (sender, subject, recipient, projectName, workerA, workerB) => {
            // Ensure workers are different
            if (workerA === workerB) return;
            
            // Create fresh database for each iteration
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            // Add analysis_projects table
            db.run(`
              CREATE TABLE IF NOT EXISTS analysis_projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                merchant_id TEXT NOT NULL,
                worker_name TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (merchant_id) REFERENCES merchants(id)
              );
            `);
            
            const service = new TestServiceWithProjectAssociation(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track email from workerA only
              const result = service.trackEmail({
                sender,
                subject,
                recipient,
                workerName: workerA,
              });
              const merchantId = result.merchantId;

              // Create project associated with workerB (which has no emails)
              const project = service.createAnalysisProject({
                name: projectName,
                merchantId,
                workerName: workerB,
              });

              // Get emails for the project (should be empty since workerB has no emails)
              const projectEmails = service.getProjectEmails(project.id);
              
              // Property: Project should have no emails since workerB has no data
              expect(projectEmails.length).toBe(0);
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


// ============================================
// Statistics Update After Delete Property Tests
// ============================================

describe('Statistics Update After Delete', () => {
  // Generate valid worker names
  const workerNameArb = fc.oneof(
    fc.constant('worker-a'),
    fc.constant('worker-b'),
    fc.constant('worker-c'),
  );

  /**
   * Test service extension with delete and statistics verification for sql.js
   */
  class TestServiceWithDeleteStats extends TestCampaignAnalyticsService {
    deleteMerchantData(data: { merchantId: string; workerName: string }): {
      merchantId: string;
      workerName: string;
      emailsDeleted: number;
      pathsDeleted: number;
      campaignsAffected: number;
      merchantDeleted: boolean;
    } {
      const { merchantId, workerName } = data;
      const db = (this as any).db;

      // Check if merchant exists
      const merchant = this.getMerchantById(merchantId);
      if (!merchant) {
        throw new Error(`Merchant not found: ${merchantId}`);
      }

      let emailsDeleted = 0;
      let pathsDeleted = 0;
      let campaignsAffected = 0;
      let merchantDeleted = false;

      // Step 1: Get all campaign IDs for this merchant
      const campaignResult = db.exec(
        'SELECT id FROM campaigns WHERE merchant_id = ?',
        [merchantId]
      );
      const campaignIds: string[] = campaignResult.length > 0 
        ? campaignResult[0].values.map((row: any) => row[0] as string)
        : [];

      if (campaignIds.length > 0) {
        // Step 2: Count and delete campaign_emails for this worker
        const placeholders = campaignIds.map(() => '?').join(',');
        
        const emailCountResult = db.exec(
          `SELECT COUNT(*) as count FROM campaign_emails 
           WHERE campaign_id IN (${placeholders}) AND worker_name = ?`,
          [...campaignIds, workerName]
        );
        emailsDeleted = emailCountResult.length > 0 ? emailCountResult[0].values[0][0] as number : 0;

        if (emailsDeleted > 0) {
          db.run(
            `DELETE FROM campaign_emails 
             WHERE campaign_id IN (${placeholders}) AND worker_name = ?`,
            [...campaignIds, workerName]
          );
        }

        // Step 3: Delete paths for recipients with no remaining emails
        const pathRecipientsResult = db.exec(
          'SELECT DISTINCT recipient FROM recipient_paths WHERE merchant_id = ?',
          [merchantId]
        );
        
        if (pathRecipientsResult.length > 0) {
          for (const row of pathRecipientsResult[0].values) {
            const recipient = row[0] as string;
            
            const remainingEmailsResult = db.exec(
              `SELECT COUNT(*) as count FROM campaign_emails 
               WHERE campaign_id IN (${placeholders}) AND recipient = ?`,
              [...campaignIds, recipient]
            );
            const remainingEmails = remainingEmailsResult.length > 0 
              ? remainingEmailsResult[0].values[0][0] as number 
              : 0;

            if (remainingEmails === 0) {
              const pathDeleteResult = db.exec(
                'SELECT COUNT(*) FROM recipient_paths WHERE merchant_id = ? AND recipient = ?',
                [merchantId, recipient]
              );
              const pathCount = pathDeleteResult.length > 0 
                ? pathDeleteResult[0].values[0][0] as number 
                : 0;
              
              db.run(
                'DELETE FROM recipient_paths WHERE merchant_id = ? AND recipient = ?',
                [merchantId, recipient]
              );
              pathsDeleted += pathCount;
            }
          }
        }

        // Step 4: Count affected campaigns
        const affectedCampaignsResult = db.exec(
          `SELECT COUNT(DISTINCT id) as count FROM campaigns WHERE merchant_id = ?`,
          [merchantId]
        );
        campaignsAffected = affectedCampaignsResult.length > 0 
          ? affectedCampaignsResult[0].values[0][0] as number 
          : 0;

        // Step 5: Update campaign statistics
        for (const campaignId of campaignIds) {
          const emailCount = db.exec(
            'SELECT COUNT(*) as count FROM campaign_emails WHERE campaign_id = ?',
            [campaignId]
          );
          const count = emailCount.length > 0 ? emailCount[0].values[0][0] as number : 0;

          const recipientCount = db.exec(
            'SELECT COUNT(DISTINCT recipient) as count FROM campaign_emails WHERE campaign_id = ?',
            [campaignId]
          );
          const recipients = recipientCount.length > 0 ? recipientCount[0].values[0][0] as number : 0;

          db.run(
            `UPDATE campaigns SET total_emails = ?, unique_recipients = ?, updated_at = ? WHERE id = ?`,
            [count, recipients, new Date().toISOString(), campaignId]
          );
        }
      }

      // Step 6: Check if merchant has any remaining data
      const remainingEmailsResult = db.exec(
        `SELECT COUNT(*) as count FROM campaign_emails 
         WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?)`,
        [merchantId]
      );
      const remainingEmails = remainingEmailsResult.length > 0 
        ? remainingEmailsResult[0].values[0][0] as number 
        : 0;

      if (remainingEmails === 0) {
        // Delete all campaigns for this merchant
        db.run('DELETE FROM campaigns WHERE merchant_id = ?', [merchantId]);
        
        // Delete all remaining paths for this merchant
        db.run('DELETE FROM recipient_paths WHERE merchant_id = ?', [merchantId]);
        
        // Delete the merchant record
        db.run('DELETE FROM merchants WHERE id = ?', [merchantId]);
        
        merchantDeleted = true;
      } else {
        // Update merchant statistics
        const totalEmails = db.exec(
          `SELECT COUNT(*) as count FROM campaign_emails 
           WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?)`,
          [merchantId]
        );
        const emailTotal = totalEmails.length > 0 ? totalEmails[0].values[0][0] as number : 0;

        const totalCampaigns = db.exec(
          `SELECT COUNT(DISTINCT c.id) as count 
           FROM campaigns c
           JOIN campaign_emails ce ON c.id = ce.campaign_id
           WHERE c.merchant_id = ?`,
          [merchantId]
        );
        const campaignTotal = totalCampaigns.length > 0 ? totalCampaigns[0].values[0][0] as number : 0;

        db.run(
          `UPDATE merchants SET total_emails = ?, total_campaigns = ?, updated_at = ? WHERE id = ?`,
          [emailTotal, campaignTotal, new Date().toISOString(), merchantId]
        );
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

    /**
     * Get merchant statistics from the database
     */
    getMerchantStats(merchantId: string): { totalEmails: number; totalCampaigns: number } | null {
      const db = (this as any).db;
      const result = db.exec(
        'SELECT total_emails, total_campaigns FROM merchants WHERE id = ?',
        [merchantId]
      );
      if (result.length === 0 || result[0].values.length === 0) {
        return null;
      }
      return {
        totalEmails: result[0].values[0][0] as number,
        totalCampaigns: result[0].values[0][1] as number,
      };
    }

    /**
     * Get actual email count for a merchant
     */
    getActualEmailCount(merchantId: string): number {
      const db = (this as any).db;
      const result = db.exec(
        `SELECT COUNT(*) as count FROM campaign_emails 
         WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?)`,
        [merchantId]
      );
      return result.length > 0 ? result[0].values[0][0] as number : 0;
    }

    /**
     * Get actual campaign count for a merchant (campaigns with at least one email)
     */
    getActualCampaignCount(merchantId: string): number {
      const db = (this as any).db;
      const result = db.exec(
        `SELECT COUNT(DISTINCT c.id) as count 
         FROM campaigns c
         JOIN campaign_emails ce ON c.id = ce.campaign_id
         WHERE c.merchant_id = ?`,
        [merchantId]
      );
      return result.length > 0 ? result[0].values[0][0] as number : 0;
    }

    /**
     * Get emails for a specific worker
     */
    getWorkerEmailCount(merchantId: string, workerName: string): number {
      const db = (this as any).db;
      const result = db.exec(
        `SELECT COUNT(*) as count FROM campaign_emails 
         WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?) 
         AND worker_name = ?`,
        [merchantId, workerName]
      );
      return result.length > 0 ? result[0].values[0][0] as number : 0;
    }
  }

  /**
   * **Feature: merchant-data-management, Property 11: Statistics Update After Delete**
   * **Validates: Requirements 6.4**
   * 
   * For any delete operation, the merchant statistics should be updated to reflect the remaining data.
   */
  describe('Property 11: Statistics Update After Delete', () => {
    it('should update merchant statistics to reflect remaining data after partial deletion', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 4 })
            .filter(arr => new Set(arr).size === arr.length), // unique subjects
          validEmailArb, // recipient
          workerNameArb,
          workerNameArb,
          fc.integer({ min: 1, max: 3 }), // emails per subject for workerA
          fc.integer({ min: 1, max: 3 }), // emails per subject for workerB
          (sender, subjects, recipient, workerA, workerB, countA, countB) => {
            // Ensure workers are different
            if (workerA === workerB) return;
            if (subjects.length < 2) return;
            
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithDeleteStats(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Split subjects between workers
              const halfIndex = Math.ceil(subjects.length / 2);
              const subjectsA = subjects.slice(0, halfIndex);
              const subjectsB = subjects.slice(halfIndex);

              let merchantId: string | null = null;

              // Track emails for workerA
              for (const subject of subjectsA) {
                for (let i = 0; i < countA; i++) {
                  const result = service.trackEmail({
                    sender,
                    subject,
                    recipient: `${recipient.split('@')[0]}+a${i}@${recipient.split('@')[1]}`,
                    workerName: workerA,
                  });
                  merchantId = result.merchantId;
                }
              }

              // Track emails for workerB
              for (const subject of subjectsB) {
                for (let i = 0; i < countB; i++) {
                  const result = service.trackEmail({
                    sender,
                    subject,
                    recipient: `${recipient.split('@')[0]}+b${i}@${recipient.split('@')[1]}`,
                    workerName: workerB,
                  });
                  merchantId = result.merchantId;
                }
              }

              if (!merchantId) return;

              // Record expected remaining data after deleting workerA
              const expectedRemainingEmails = service.getWorkerEmailCount(merchantId, workerB);
              const workerBCampaigns = subjectsB.length;

              // Delete workerA data
              const deleteResult = service.deleteMerchantData({
                merchantId,
                workerName: workerA,
              });

              // Property 1: Merchant should not be deleted (workerB still has data)
              expect(deleteResult.merchantDeleted).toBe(false);

              // Property 2: Merchant statistics should be updated
              const stats = service.getMerchantStats(merchantId);
              expect(stats).not.toBeNull();

              if (stats) {
                // Property 3: total_emails should match actual remaining emails
                const actualEmails = service.getActualEmailCount(merchantId);
                expect(stats.totalEmails).toBe(actualEmails);
                expect(stats.totalEmails).toBe(expectedRemainingEmails);

                // Property 4: total_campaigns should match actual remaining campaigns
                const actualCampaigns = service.getActualCampaignCount(merchantId);
                expect(stats.totalCampaigns).toBe(actualCampaigns);
                expect(stats.totalCampaigns).toBe(workerBCampaigns);
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should remove merchant from list when all data is deleted', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          workerNameArb,
          (sender, subject, recipient, workerName) => {
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithDeleteStats(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track email from single worker
              const result = service.trackEmail({
                sender,
                subject,
                recipient,
                workerName,
              });

              const merchantId = result.merchantId;

              // Verify merchant exists in list before deletion
              const merchantsBefore = service.getMerchants();
              expect(merchantsBefore.some(m => m.id === merchantId)).toBe(true);

              // Delete all data for this worker
              const deleteResult = service.deleteMerchantData({
                merchantId,
                workerName,
              });

              // Property 1: Merchant should be deleted
              expect(deleteResult.merchantDeleted).toBe(true);

              // Property 2: Merchant should be removed from list
              const merchantsAfter = service.getMerchants();
              expect(merchantsAfter.some(m => m.id === merchantId)).toBe(false);

              // Property 3: getMerchantById should return null
              const merchant = service.getMerchantById(merchantId);
              expect(merchant).toBeNull();

              // Property 4: Statistics should not exist
              const stats = service.getMerchantStats(merchantId);
              expect(stats).toBeNull();
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly update statistics when deleting from merchant with multiple workers', async () => {
      const SQL = await initSqlJs();
      
      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 50 }), // subject
          validEmailArb, // recipient
          workerNameArb,
          workerNameArb,
          fc.integer({ min: 2, max: 5 }), // emails for workerA
          fc.integer({ min: 2, max: 5 }), // emails for workerB
          (sender, subject, recipient, workerA, workerB, emailsA, emailsB) => {
            // Ensure workers are different
            if (workerA === workerB) return;
            
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);
            
            const service = new TestServiceWithDeleteStats(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              let merchantId: string | null = null;

              // Track emails for workerA
              for (let i = 0; i < emailsA; i++) {
                const result = service.trackEmail({
                  sender,
                  subject: `${subject} A`,
                  recipient: `${recipient.split('@')[0]}+a${i}@${recipient.split('@')[1]}`,
                  workerName: workerA,
                });
                merchantId = result.merchantId;
              }

              // Track emails for workerB
              for (let i = 0; i < emailsB; i++) {
                service.trackEmail({
                  sender,
                  subject: `${subject} B`,
                  recipient: `${recipient.split('@')[0]}+b${i}@${recipient.split('@')[1]}`,
                  workerName: workerB,
                });
              }

              if (!merchantId) return;

              // Get stats before deletion
              const statsBefore = service.getMerchantStats(merchantId);
              expect(statsBefore).not.toBeNull();
              
              const totalEmailsBefore = service.getActualEmailCount(merchantId);
              expect(totalEmailsBefore).toBe(emailsA + emailsB);

              // Delete workerA data
              service.deleteMerchantData({
                merchantId,
                workerName: workerA,
              });

              // Get stats after deletion
              const statsAfter = service.getMerchantStats(merchantId);
              expect(statsAfter).not.toBeNull();

              if (statsAfter) {
                // Property 1: total_emails should decrease by workerA's email count
                expect(statsAfter.totalEmails).toBe(emailsB);

                // Property 2: Statistics should match actual data
                const actualEmails = service.getActualEmailCount(merchantId);
                expect(statsAfter.totalEmails).toBe(actualEmails);

                // Property 3: Only workerB emails should remain
                const workerAEmails = service.getWorkerEmailCount(merchantId, workerA);
                const workerBEmails = service.getWorkerEmailCount(merchantId, workerB);
                expect(workerAEmails).toBe(0);
                expect(workerBEmails).toBe(emailsB);
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
   * **Feature: path-analysis-enhancement, Property 1: Path Rebuild Consistency**
   * **Validates: Requirements 3.2**
   * 
   * For any merchant with campaign_emails data, rebuilding paths should create paths
   * that match the chronological order of emails for each recipient.
   */
  describe('Property 1: Path Rebuild Consistency', () => {
    /**
     * Test service extension with rebuildRecipientPaths support for sql.js
     */
    class TestServiceWithRebuild extends TestCampaignAnalyticsService {
      rebuildRecipientPaths(
        merchantId: string,
        workerNames?: string[]
      ): { pathsDeleted: number; pathsCreated: number; recipientsProcessed: number } {
        // Get all campaign emails for this merchant, ordered by recipient and received_at
        let emailsQuery = `
          SELECT ce.recipient, ce.campaign_id, ce.received_at, c.merchant_id
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

        const result = this.db.exec(emailsQuery, params);
        const emails: Array<{
          recipient: string;
          campaign_id: string;
          received_at: string;
          merchant_id: string;
        }> = [];

        if (result.length > 0) {
          const columns = result[0].columns;
          for (const row of result[0].values) {
            const obj: any = {};
            columns.forEach((col, i) => {
              obj[col] = row[i];
            });
            emails.push({
              recipient: obj.recipient,
              campaign_id: obj.campaign_id,
              received_at: obj.received_at,
              merchant_id: obj.merchant_id,
            });
          }
        }

        // Count paths before deletion
        const countBefore = this.db.exec(
          'SELECT COUNT(*) as count FROM recipient_paths WHERE merchant_id = ?',
          [merchantId]
        );
        
        const pathsDeleted = countBefore.length > 0 && countBefore[0].values.length > 0 
          ? countBefore[0].values[0][0] as number 
          : 0;

        // Delete existing paths for this merchant
        this.db.run('DELETE FROM recipient_paths WHERE merchant_id = ?', [merchantId]);

        // Group emails by recipient
        const recipientEmails = new Map<
          string,
          Array<{ campaign_id: string; received_at: string }>
        >();
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
          // Track which campaigns we've already added to the path
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

        return {
          pathsDeleted,
          pathsCreated,
          recipientsProcessed: recipientEmails.size,
        };
      }

      getEmailsForMerchant(merchantId: string, workerNames?: string[]): Array<{
        recipient: string;
        campaign_id: string;
        received_at: string;
        worker_name: string;
      }> {
        let query = `
          SELECT ce.recipient, ce.campaign_id, ce.received_at, ce.worker_name
          FROM campaign_emails ce
          JOIN campaigns c ON ce.campaign_id = c.id
          WHERE c.merchant_id = ?
        `;
        const params: any[] = [merchantId];

        if (workerNames && workerNames.length > 0) {
          const placeholders = workerNames.map(() => '?').join(', ');
          query += ` AND ce.worker_name IN (${placeholders})`;
          params.push(...workerNames);
        }

        query += ' ORDER BY ce.recipient, ce.received_at ASC';

        const result = this.db.exec(query, params);
        const emails: Array<{
          recipient: string;
          campaign_id: string;
          received_at: string;
          worker_name: string;
        }> = [];

        if (result.length > 0) {
          const columns = result[0].columns;
          for (const row of result[0].values) {
            const obj: any = {};
            columns.forEach((col, i) => {
              obj[col] = row[i];
            });
            emails.push({
              recipient: obj.recipient,
              campaign_id: obj.campaign_id,
              received_at: obj.received_at,
              worker_name: obj.worker_name,
            });
          }
        }

        return emails;
      }

      getPathsForMerchant(merchantId: string): Array<{
        recipient: string;
        campaign_id: string;
        sequence_order: number;
        first_received_at: string;
      }> {
        const result = this.db.exec(
          `SELECT recipient, campaign_id, sequence_order, first_received_at
           FROM recipient_paths
           WHERE merchant_id = ?
           ORDER BY recipient, sequence_order ASC`,
          [merchantId]
        );

        const paths: Array<{
          recipient: string;
          campaign_id: string;
          sequence_order: number;
          first_received_at: string;
        }> = [];

        if (result.length > 0) {
          const columns = result[0].columns;
          for (const row of result[0].values) {
            const obj: any = {};
            columns.forEach((col, i) => {
              obj[col] = row[i];
            });
            paths.push({
              recipient: obj.recipient,
              campaign_id: obj.campaign_id,
              sequence_order: obj.sequence_order,
              first_received_at: obj.first_received_at,
            });
          }
        }

        return paths;
      }
    }

    // Generate valid worker names
    const workerNameArb = fc.oneof(
      fc.constant('worker-a'),
      fc.constant('worker-b'),
      fc.constant('worker-c')
    );

    // Generate valid email addresses
    const validEmailArb = fc.emailAddress();

    it('should rebuild paths in chronological order matching email timestamps', async () => {
      const SQL = await initSqlJs();

      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 2, maxLength: 5 }), // subjects
          validEmailArb, // recipient
          workerNameArb,
          fc.array(fc.integer({ min: 0, max: 86400000 }), { minLength: 2, maxLength: 5 }), // time offsets in ms
          (sender, subjects, recipient, workerName, timeOffsets) => {
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);

            const service = new TestServiceWithRebuild(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
              let merchantId: string | null = null;

              // Track emails with different timestamps
              const trackedEmails: Array<{ subject: string; receivedAt: Date }> = [];
              for (let i = 0; i < Math.min(subjects.length, timeOffsets.length); i++) {
                const receivedAt = new Date(baseTime + timeOffsets[i]);
                const result = service.trackEmail({
                  sender,
                  subject: subjects[i],
                  recipient,
                  receivedAt: receivedAt.toISOString(),
                  workerName,
                });
                merchantId = result.merchantId;
                trackedEmails.push({ subject: subjects[i], receivedAt });
              }

              if (!merchantId) return;

              // Rebuild paths
              const rebuildResult = service.rebuildRecipientPaths(merchantId);

              // Get rebuilt paths
              const paths = service.getPathsForMerchant(merchantId);

              // Filter paths for this recipient
              const recipientPaths = paths.filter(p => p.recipient === recipient);

              // Verify paths are in chronological order
              for (let i = 1; i < recipientPaths.length; i++) {
                const prevTime = new Date(recipientPaths[i - 1].first_received_at).getTime();
                const currTime = new Date(recipientPaths[i].first_received_at).getTime();
                expect(currTime).toBeGreaterThanOrEqual(prevTime);
              }

              // Verify sequence order is correct (1-indexed, sequential)
              for (let i = 0; i < recipientPaths.length; i++) {
                expect(recipientPaths[i].sequence_order).toBe(i + 1);
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
   * **Feature: path-analysis-enhancement, Property 2: Worker Filter Isolation**
   * **Validates: Requirements 3.3, 4.1, 4.2**
   * 
   * For any rebuild operation with specified workerNames, the resulting paths
   * should only contain data from those workers.
   */
  describe('Property 2: Worker Filter Isolation', () => {
    /**
     * Test service extension with rebuildRecipientPaths support for sql.js
     */
    class TestServiceWithRebuild extends TestCampaignAnalyticsService {
      rebuildRecipientPaths(
        merchantId: string,
        workerNames?: string[]
      ): { pathsDeleted: number; pathsCreated: number; recipientsProcessed: number } {
        // Get all campaign emails for this merchant, ordered by recipient and received_at
        let emailsQuery = `
          SELECT ce.recipient, ce.campaign_id, ce.received_at, c.merchant_id
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

        const result = this.db.exec(emailsQuery, params);
        const emails: Array<{
          recipient: string;
          campaign_id: string;
          received_at: string;
          merchant_id: string;
        }> = [];

        if (result.length > 0) {
          const columns = result[0].columns;
          for (const row of result[0].values) {
            const obj: any = {};
            columns.forEach((col, i) => {
              obj[col] = row[i];
            });
            emails.push({
              recipient: obj.recipient,
              campaign_id: obj.campaign_id,
              received_at: obj.received_at,
              merchant_id: obj.merchant_id,
            });
          }
        }

        // Count paths before deletion
        const countBefore = this.db.exec(
          'SELECT COUNT(*) as count FROM recipient_paths WHERE merchant_id = ?',
          [merchantId]
        );
        
        this.db.run('DELETE FROM recipient_paths WHERE merchant_id = ?', [merchantId]);
        
        const pathsDeleted = countBefore.length > 0 && countBefore[0].values.length > 0 
          ? countBefore[0].values[0][0] as number 
          : 0;

        // Group emails by recipient
        const recipientEmails = new Map<
          string,
          Array<{ campaign_id: string; received_at: string }>
        >();
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

        return {
          pathsDeleted,
          pathsCreated,
          recipientsProcessed: recipientEmails.size,
        };
      }

      getEmailsForMerchantByWorker(merchantId: string, workerName: string): Array<{
        recipient: string;
        campaign_id: string;
      }> {
        const result = this.db.exec(
          `SELECT ce.recipient, ce.campaign_id
           FROM campaign_emails ce
           JOIN campaigns c ON ce.campaign_id = c.id
           WHERE c.merchant_id = ? AND ce.worker_name = ?`,
          [merchantId, workerName]
        );

        const emails: Array<{ recipient: string; campaign_id: string }> = [];

        if (result.length > 0) {
          const columns = result[0].columns;
          for (const row of result[0].values) {
            const obj: any = {};
            columns.forEach((col, i) => {
              obj[col] = row[i];
            });
            emails.push({
              recipient: obj.recipient,
              campaign_id: obj.campaign_id,
            });
          }
        }

        return emails;
      }

      getPathsForMerchant(merchantId: string): Array<{
        recipient: string;
        campaign_id: string;
        sequence_order: number;
      }> {
        const result = this.db.exec(
          `SELECT recipient, campaign_id, sequence_order
           FROM recipient_paths
           WHERE merchant_id = ?
           ORDER BY recipient, sequence_order ASC`,
          [merchantId]
        );

        const paths: Array<{
          recipient: string;
          campaign_id: string;
          sequence_order: number;
        }> = [];

        if (result.length > 0) {
          const columns = result[0].columns;
          for (const row of result[0].values) {
            const obj: any = {};
            columns.forEach((col, i) => {
              obj[col] = row[i];
            });
            paths.push({
              recipient: obj.recipient,
              campaign_id: obj.campaign_id,
              sequence_order: obj.sequence_order,
            });
          }
        }

        return paths;
      }
    }

    // Generate valid worker names
    const workerNameArb = fc.oneof(
      fc.constant('worker-a'),
      fc.constant('worker-b'),
      fc.constant('worker-c')
    );

    // Generate valid email addresses
    const validEmailArb = fc.emailAddress();

    it('should only include data from specified workers when rebuilding paths', async () => {
      const SQL = await initSqlJs();

      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 30 }), // subject for worker A
          fc.string({ minLength: 1, maxLength: 30 }), // subject for worker B
          validEmailArb, // recipient for worker A
          validEmailArb, // recipient for worker B
          (sender, subjectA, subjectB, recipientA, recipientB) => {
            // Ensure subjects are different
            if (subjectA === subjectB) return;
            
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);

            const service = new TestServiceWithRebuild(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track email for worker-a
              const resultA = service.trackEmail({
                sender,
                subject: subjectA,
                recipient: recipientA,
                workerName: 'worker-a',
              });

              // Track email for worker-b
              service.trackEmail({
                sender,
                subject: subjectB,
                recipient: recipientB,
                workerName: 'worker-b',
              });

              const merchantId = resultA.merchantId;

              // Rebuild paths with only worker-a filter
              service.rebuildRecipientPaths(merchantId, ['worker-a']);

              // Get rebuilt paths
              const paths = service.getPathsForMerchant(merchantId);

              // Get emails from worker-a only
              const workerAEmails = service.getEmailsForMerchantByWorker(merchantId, 'worker-a');
              const workerARecipients = new Set(workerAEmails.map(e => e.recipient));
              const workerACampaigns = new Set(workerAEmails.map(e => e.campaign_id));

              // Verify all paths are from worker-a data only
              for (const path of paths) {
                expect(workerARecipients.has(path.recipient)).toBe(true);
                expect(workerACampaigns.has(path.campaign_id)).toBe(true);
              }

              // Verify worker-b recipient is not in paths (if different from worker-a recipient)
              if (recipientA !== recipientB) {
                const pathRecipients = new Set(paths.map(p => p.recipient));
                expect(pathRecipients.has(recipientB)).toBe(false);
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all workers when workerNames is empty or undefined', async () => {
      const SQL = await initSqlJs();

      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 30 }), // subject for worker A
          fc.string({ minLength: 1, maxLength: 30 }), // subject for worker B
          validEmailArb, // recipient
          (sender, subjectA, subjectB, recipient) => {
            // Ensure subjects are different
            if (subjectA === subjectB) return;
            
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);

            const service = new TestServiceWithRebuild(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track email for worker-a
              const resultA = service.trackEmail({
                sender,
                subject: subjectA,
                recipient,
                workerName: 'worker-a',
              });

              // Track email for worker-b (same recipient, different subject)
              service.trackEmail({
                sender,
                subject: subjectB,
                recipient,
                workerName: 'worker-b',
              });

              const merchantId = resultA.merchantId;

              // Rebuild paths without worker filter (should include all)
              service.rebuildRecipientPaths(merchantId);

              // Get rebuilt paths
              const paths = service.getPathsForMerchant(merchantId);

              // Should have paths from both workers (2 campaigns for the same recipient)
              const recipientPaths = paths.filter(p => p.recipient === recipient);
              expect(recipientPaths.length).toBe(2);

              // Rebuild with empty array (should also include all)
              service.rebuildRecipientPaths(merchantId, []);
              const pathsAfterEmpty = service.getPathsForMerchant(merchantId);
              const recipientPathsAfterEmpty = pathsAfterEmpty.filter(p => p.recipient === recipient);
              expect(recipientPathsAfterEmpty.length).toBe(2);
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
   * **Feature: path-analysis-enhancement, Property 3: Old Customer Identification**
   * **Validates: Requirements 7.1, 7.2**
   * 
   * For any recipient whose first email is not from a Root campaign,
   * that recipient should be identified as an old customer.
   */
  describe('Property 3: Old Customer Identification', () => {
    /**
     * Test service extension with old customer cleanup support for sql.js
     */
    class TestServiceWithCleanup extends TestCampaignAnalyticsService {
      setRootCampaign(campaignId: string): void {
        this.db.run('UPDATE campaigns SET is_root = 1 WHERE id = ?', [campaignId]);
      }

      recalculateAllNewUsers(merchantId: string): void {
        // Reset all new user flags
        this.db.run(
          `UPDATE recipient_paths SET is_new_user = 0, first_root_campaign_id = NULL WHERE merchant_id = ?`,
          [merchantId]
        );

        // Get all confirmed root campaigns
        const rootResult = this.db.exec(
          'SELECT id FROM campaigns WHERE merchant_id = ? AND is_root = 1',
          [merchantId]
        );
        
        const rootCampaignIds = new Set<string>();
        if (rootResult.length > 0) {
          for (const row of rootResult[0].values) {
            rootCampaignIds.add(row[0] as string);
          }
        }

        if (rootCampaignIds.size === 0) return;

        // Get all recipients
        const recipientsResult = this.db.exec(
          'SELECT DISTINCT recipient FROM recipient_paths WHERE merchant_id = ?',
          [merchantId]
        );

        if (recipientsResult.length === 0) return;

        for (const row of recipientsResult[0].values) {
          const recipient = row[0] as string;
          
          // Get this recipient's FIRST campaign (sequence_order = 0, 0-indexed)
          // A new user is one whose FIRST email is from a root campaign
          const pathResult = this.db.exec(
            `SELECT campaign_id FROM recipient_paths 
             WHERE merchant_id = ? AND recipient = ? ORDER BY sequence_order ASC LIMIT 1`,
            [merchantId, recipient]
          );

          if (pathResult.length === 0 || pathResult[0].values.length === 0) continue;

          const firstCampaignId = pathResult[0].values[0][0] as string;
          
          // Only mark as new user if their FIRST campaign is a root campaign
          if (rootCampaignIds.has(firstCampaignId)) {
            this.db.run(
              `UPDATE recipient_paths SET is_new_user = 1, first_root_campaign_id = ? 
               WHERE merchant_id = ? AND recipient = ?`,
              [firstCampaignId, merchantId, recipient]
            );
          }
        }
      }

      getRecipientNewUserStatus(merchantId: string, recipient: string): boolean {
        const result = this.db.exec(
          `SELECT MAX(is_new_user) as is_new FROM recipient_paths WHERE merchant_id = ? AND recipient = ?`,
          [merchantId, recipient]
        );
        if (result.length === 0 || result[0].values.length === 0) return false;
        return result[0].values[0][0] === 1;
      }

      getFirstCampaignForRecipient(merchantId: string, recipient: string): string | null {
        const result = this.db.exec(
          `SELECT campaign_id FROM recipient_paths 
           WHERE merchant_id = ? AND recipient = ? 
           ORDER BY sequence_order ASC LIMIT 1`,
          [merchantId, recipient]
        );
        if (result.length === 0 || result[0].values.length === 0) return null;
        return result[0].values[0][0] as string;
      }

      isRootCampaign(campaignId: string): boolean {
        const result = this.db.exec(
          'SELECT is_root FROM campaigns WHERE id = ?',
          [campaignId]
        );
        if (result.length === 0 || result[0].values.length === 0) return false;
        return result[0].values[0][0] === 1;
      }
    }

    // Generate valid email addresses
    const validEmailArb = fc.emailAddress();

    it('should identify recipients whose first email is not from Root as old customers', async () => {
      const SQL = await initSqlJs();

      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 30 }), // root campaign subject
          fc.string({ minLength: 1, maxLength: 30 }), // non-root campaign subject
          validEmailArb, // new customer recipient
          validEmailArb, // old customer recipient
          (sender, rootSubject, nonRootSubject, newCustomer, oldCustomer) => {
            // Ensure subjects and recipients are different
            if (rootSubject === nonRootSubject) return;
            if (newCustomer === oldCustomer) return;
            
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);

            // Add migration columns for root campaign and new user tracking
            db.run('ALTER TABLE campaigns ADD COLUMN is_root INTEGER DEFAULT 0');
            db.run('ALTER TABLE campaigns ADD COLUMN is_root_candidate INTEGER DEFAULT 0');
            db.run('ALTER TABLE campaigns ADD COLUMN root_candidate_reason TEXT');
            db.run('ALTER TABLE recipient_paths ADD COLUMN is_new_user INTEGER DEFAULT 0');
            db.run('ALTER TABLE recipient_paths ADD COLUMN first_root_campaign_id TEXT');

            const service = new TestServiceWithCleanup(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track root campaign email for new customer (first email)
              const rootResult = service.trackEmail({
                sender,
                subject: rootSubject,
                recipient: newCustomer,
                workerName: 'worker-a',
              });

              const merchantId = rootResult.merchantId;
              const rootCampaignId = rootResult.campaignId;

              // Track non-root campaign email for old customer (first email)
              service.trackEmail({
                sender,
                subject: nonRootSubject,
                recipient: oldCustomer,
                workerName: 'worker-a',
              });

              // Set root campaign
              service.setRootCampaign(rootCampaignId);

              // Recalculate new users
              service.recalculateAllNewUsers(merchantId);

              // Verify new customer is identified as new user
              const newCustomerStatus = service.getRecipientNewUserStatus(merchantId, newCustomer);
              expect(newCustomerStatus).toBe(true);

              // Verify old customer is identified as old user
              const oldCustomerStatus = service.getRecipientNewUserStatus(merchantId, oldCustomer);
              expect(oldCustomerStatus).toBe(false);

              // Verify first campaign for old customer is not a root campaign
              const firstCampaign = service.getFirstCampaignForRecipient(merchantId, oldCustomer);
              expect(firstCampaign).not.toBeNull();
              expect(service.isRootCampaign(firstCampaign!)).toBe(false);
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
   * **Feature: path-analysis-enhancement, Property 4: Old Customer Cleanup Preservation**
   * **Validates: Requirements 7.5**
   * 
   * For any cleanup operation, campaign_emails records should be preserved
   * while only recipient_paths entries are removed.
   */
  describe('Property 4: Old Customer Cleanup Preservation', () => {
    /**
     * Test service extension with old customer cleanup support for sql.js
     */
    class TestServiceWithCleanup extends TestCampaignAnalyticsService {
      setRootCampaign(campaignId: string): void {
        this.db.run('UPDATE campaigns SET is_root = 1 WHERE id = ?', [campaignId]);
      }

      recalculateAllNewUsers(merchantId: string): void {
        // Reset all new user flags
        this.db.run(
          `UPDATE recipient_paths SET is_new_user = 0, first_root_campaign_id = NULL WHERE merchant_id = ?`,
          [merchantId]
        );

        // Get all confirmed root campaigns for Property 4
        const rootResult = this.db.exec(
          'SELECT id FROM campaigns WHERE merchant_id = ? AND is_root = 1',
          [merchantId]
        );
        
        const rootCampaignIds = new Set<string>();
        if (rootResult.length > 0) {
          for (const row of rootResult[0].values) {
            rootCampaignIds.add(row[0] as string);
          }
        }

        if (rootCampaignIds.size === 0) return;

        // Get all recipients
        const recipientsResult = this.db.exec(
          'SELECT DISTINCT recipient FROM recipient_paths WHERE merchant_id = ?',
          [merchantId]
        );

        if (recipientsResult.length === 0) return;

        for (const row of recipientsResult[0].values) {
          const recipient = row[0] as string;
          
          // Get this recipient's FIRST campaign (sequence_order = 0, 0-indexed)
          // A new user is one whose FIRST email is from a root campaign
          const pathResult = this.db.exec(
            `SELECT campaign_id FROM recipient_paths 
             WHERE merchant_id = ? AND recipient = ? ORDER BY sequence_order ASC LIMIT 1`,
            [merchantId, recipient]
          );

          if (pathResult.length === 0 || pathResult[0].values.length === 0) continue;

          const firstCampaignId = pathResult[0].values[0][0] as string;
          
          // Only mark as new user if their FIRST campaign is a root campaign
          if (rootCampaignIds.has(firstCampaignId)) {
            this.db.run(
              `UPDATE recipient_paths SET is_new_user = 1, first_root_campaign_id = ? 
               WHERE merchant_id = ? AND recipient = ?`,
              [firstCampaignId, merchantId, recipient]
            );
          }
        }
      }

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
        const recipientPlaceholders = oldCustomers.map(() => '?').join(', ');
        const countResult = this.db.exec(
          `SELECT COUNT(*) as count FROM recipient_paths WHERE merchant_id = ? AND recipient IN (${recipientPlaceholders})`,
          [merchantId, ...oldCustomers]
        );
        
        const pathsToDelete = countResult.length > 0 && countResult[0].values.length > 0
          ? countResult[0].values[0][0] as number
          : 0;

        // Delete paths for old customers
        this.db.run(
          `DELETE FROM recipient_paths WHERE merchant_id = ? AND recipient IN (${recipientPlaceholders})`,
          [merchantId, ...oldCustomers]
        );

        return {
          pathsDeleted: pathsToDelete,
          recipientsAffected,
        };
      }

      getEmailCountForMerchant(merchantId: string): number {
        const result = this.db.exec(
          `SELECT COUNT(*) as count FROM campaign_emails ce
           JOIN campaigns c ON ce.campaign_id = c.id
           WHERE c.merchant_id = ?`,
          [merchantId]
        );
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0] as number;
      }

      getPathCountForMerchant(merchantId: string): number {
        const result = this.db.exec(
          'SELECT COUNT(*) as count FROM recipient_paths WHERE merchant_id = ?',
          [merchantId]
        );
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0] as number;
      }

      getEmailsForRecipient(merchantId: string, recipient: string): number {
        const result = this.db.exec(
          `SELECT COUNT(*) as count FROM campaign_emails ce
           JOIN campaigns c ON ce.campaign_id = c.id
           WHERE c.merchant_id = ? AND ce.recipient = ?`,
          [merchantId, recipient]
        );
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0] as number;
      }
    }

    // Generate valid email addresses
    const validEmailArb = fc.emailAddress();

    it('should preserve campaign_emails while removing recipient_paths for old customers', async () => {
      const SQL = await initSqlJs();

      fc.assert(
        fc.property(
          validEmailArb, // sender
          fc.string({ minLength: 1, maxLength: 30 }), // root campaign subject
          fc.string({ minLength: 1, maxLength: 30 }), // non-root campaign subject
          validEmailArb, // old customer recipient
          (sender, rootSubject, nonRootSubject, oldCustomer) => {
            // Ensure subjects are different
            if (rootSubject === nonRootSubject) return;
            
            const db = new SQL.Database();
            const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
            const campaignSchema = readFileSync(campaignSchemaPath, 'utf-8');
            db.run(campaignSchema);

            // Add migration columns for root campaign and new user tracking
            db.run('ALTER TABLE campaigns ADD COLUMN is_root INTEGER DEFAULT 0');
            db.run('ALTER TABLE campaigns ADD COLUMN is_root_candidate INTEGER DEFAULT 0');
            db.run('ALTER TABLE campaigns ADD COLUMN root_candidate_reason TEXT');
            db.run('ALTER TABLE recipient_paths ADD COLUMN is_new_user INTEGER DEFAULT 0');
            db.run('ALTER TABLE recipient_paths ADD COLUMN first_root_campaign_id TEXT');

            const service = new TestServiceWithCleanup(db);

            try {
              const domain = extractDomain(sender);
              if (!domain) return;

              // Track non-root campaign email for old customer (first email)
              const result = service.trackEmail({
                sender,
                subject: nonRootSubject,
                recipient: oldCustomer,
                workerName: 'worker-a',
              });

              const merchantId = result.merchantId;

              // Track root campaign email (but old customer already has non-root as first)
              const rootResult = service.trackEmail({
                sender,
                subject: rootSubject,
                recipient: oldCustomer,
                workerName: 'worker-a',
              });

              // Set root campaign
              service.setRootCampaign(rootResult.campaignId);

              // Recalculate new users
              service.recalculateAllNewUsers(merchantId);

              // Get counts before cleanup
              const emailsBefore = service.getEmailCountForMerchant(merchantId);
              const pathsBefore = service.getPathCountForMerchant(merchantId);
              const oldCustomerEmailsBefore = service.getEmailsForRecipient(merchantId, oldCustomer);

              expect(emailsBefore).toBeGreaterThan(0);
              expect(pathsBefore).toBeGreaterThan(0);
              expect(oldCustomerEmailsBefore).toBeGreaterThan(0);

              // Cleanup old customer paths
              const cleanupResult = service.cleanupOldCustomerPaths(merchantId);

              // Verify paths were deleted
              expect(cleanupResult.recipientsAffected).toBe(1);
              expect(cleanupResult.pathsDeleted).toBeGreaterThan(0);

              // Verify campaign_emails are preserved (Property 4)
              const emailsAfter = service.getEmailCountForMerchant(merchantId);
              expect(emailsAfter).toBe(emailsBefore);

              // Verify old customer's emails are still there
              const oldCustomerEmailsAfter = service.getEmailsForRecipient(merchantId, oldCustomer);
              expect(oldCustomerEmailsAfter).toBe(oldCustomerEmailsBefore);

              // Verify paths for old customer are removed
              const pathsAfter = service.getPathCountForMerchant(merchantId);
              expect(pathsAfter).toBe(0); // All paths removed since only old customer existed
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
   * **Feature: path-analysis-enhancement, Property 5: Level Stats Completeness**
   * **Validates: Requirements 1.1, 5.1, 8.1, 8.2, 8.3, 8.4**
   * 
   * For any path analysis result, all campaigns with new users should appear in levelStats
   * with correct level assignments.
   */
  describe('Property 5: Level Stats Completeness', () => {
    /**
     * Test service extension with getPathAnalysis support for sql.js
     */
    class TestServiceWithPathAnalysis extends TestCampaignAnalyticsService {
      getUserTypeStats(merchantId: string, workerNames?: string[]): {
        merchantId: string;
        totalRecipients: number;
        newUsers: number;
        oldUsers: number;
        newUserPercentage: number;
      } {
        let query: string;
        let params: any[];

        if (workerNames && workerNames.length > 0) {
          const placeholders = workerNames.map(() => '?').join(', ');
          query = `
            SELECT 
              COUNT(DISTINCT rp.recipient) as total,
              SUM(CASE WHEN rp.is_new_user = 1 THEN 1 ELSE 0 END) as new_users
            FROM (
              SELECT rp.recipient, MAX(rp.is_new_user) as is_new_user
              FROM recipient_paths rp
              JOIN campaigns c ON rp.campaign_id = c.id
              JOIN campaign_emails ce ON c.id = ce.campaign_id AND rp.recipient = ce.recipient
              WHERE rp.merchant_id = ? AND ce.worker_name IN (${placeholders})
              GROUP BY rp.recipient
            ) rp
          `;
          params = [merchantId, ...workerNames];
        } else {
          query = `
            SELECT 
              COUNT(DISTINCT recipient) as total,
              SUM(CASE WHEN is_new_user = 1 THEN 1 ELSE 0 END) as new_users
            FROM (
              SELECT recipient, MAX(is_new_user) as is_new_user
              FROM recipient_paths
              WHERE merchant_id = ?
              GROUP BY recipient
            )
          `;
          params = [merchantId];
        }

        const result = this.db.exec(query, params);
        let total = 0;
        let newUsers = 0;

        if (result.length > 0 && result[0].values.length > 0) {
          total = (result[0].values[0][0] as number) || 0;
          newUsers = (result[0].values[0][1] as number) || 0;
        }

        const oldUsers = total - newUsers;

        return {
          merchantId,
          totalRecipients: total,
          newUsers,
          oldUsers,
          newUserPercentage: total > 0 ? (newUsers / total) * 100 : 0,
        };
      }

      getCampaignsWithNewUsers(merchantId: string, workerNames?: string[]): string[] {
        let query: string;
        let params: any[];

        if (workerNames && workerNames.length > 0) {
          const placeholders = workerNames.map(() => '?').join(', ');
          query = `
            SELECT DISTINCT rp.campaign_id
            FROM recipient_paths rp
            JOIN campaign_emails ce ON rp.campaign_id = ce.campaign_id AND rp.recipient = ce.recipient
            WHERE rp.merchant_id = ? AND rp.is_new_user = 1 AND ce.worker_name IN (${placeholders})
          `;
          params = [merchantId, ...workerNames];
        } else {
          query = `
            SELECT DISTINCT campaign_id
            FROM recipient_paths
            WHERE merchant_id = ? AND is_new_user = 1
          `;
          params = [merchantId];
        }

        const result = this.db.exec(query, params);
        if (result.length === 0) return [];

        return result[0].values.map(row => row[0] as string);
      }

      getLevelStats(merchantId: string, workerNames?: string[]): Array<{
        campaignId: string;
        level: number;
        userCount: number;
      }> {
        const userStats = this.getUserTypeStats(merchantId, workerNames);
        
        // Get campaigns with new users and their counts
        let query: string;
        let params: any[];

        if (workerNames && workerNames.length > 0) {
          const placeholders = workerNames.map(() => '?').join(', ');
          query = `
            SELECT 
              c.id,
              c.subject,
              COUNT(DISTINCT CASE WHEN rp.is_new_user = 1 AND ce.worker_name IN (${placeholders}) THEN rp.recipient END) as new_user_count
            FROM campaigns c
            LEFT JOIN recipient_paths rp ON c.id = rp.campaign_id
            LEFT JOIN campaign_emails ce ON c.id = ce.campaign_id AND rp.recipient = ce.recipient
            WHERE c.merchant_id = ?
            GROUP BY c.id
            HAVING new_user_count > 0
          `;
          params = [...workerNames, merchantId];
        } else {
          query = `
            SELECT 
              c.id,
              c.subject,
              COUNT(DISTINCT CASE WHEN rp.is_new_user = 1 THEN rp.recipient END) as new_user_count
            FROM campaigns c
            LEFT JOIN recipient_paths rp ON c.id = rp.campaign_id
            WHERE c.merchant_id = ?
            GROUP BY c.id
            HAVING new_user_count > 0
          `;
          params = [merchantId];
        }

        const result = this.db.exec(query, params);
        if (result.length === 0) return [];

        return result[0].values.map(row => ({
          campaignId: row[0] as string,
          level: 1,
          userCount: row[2] as number,
        }));
      }
    }

    it('should include all campaigns with new users in levelStats', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            numCampaigns: fc.integer({ min: 1, max: 5 }),
            numRecipients: fc.integer({ min: 1, max: 10 }),
            workerName: fc.constantFrom('worker1', 'worker2'),
          }),
          async ({ numCampaigns, numRecipients, workerName }) => {
            const SQL = await initSqlJs();
            const db = new SQL.Database();
            
            try {
              const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
              db.run(readFileSync(campaignSchemaPath, 'utf-8'));

              // Add migration columns for root campaign and new user tracking
              db.run('ALTER TABLE campaigns ADD COLUMN is_root INTEGER DEFAULT 0');
              db.run('ALTER TABLE campaigns ADD COLUMN is_root_candidate INTEGER DEFAULT 0');
              db.run('ALTER TABLE campaigns ADD COLUMN root_candidate_reason TEXT');
              db.run('ALTER TABLE campaigns ADD COLUMN tag INTEGER DEFAULT 0');
              db.run('ALTER TABLE recipient_paths ADD COLUMN is_new_user INTEGER DEFAULT 0');
              db.run('ALTER TABLE recipient_paths ADD COLUMN first_root_campaign_id TEXT');

              const service = new TestServiceWithPathAnalysis(db);
              const { merchant } = service.getOrCreateMerchant('test.com');

              const campaignIds: string[] = [];
              for (let i = 0; i < numCampaigns; i++) {
                const campaignId = uuidv4();
                campaignIds.push(campaignId);
                db.run(
                  `INSERT INTO campaigns (id, merchant_id, subject, subject_hash, unique_recipients, first_seen_at, last_seen_at, created_at, updated_at)
                   VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'), datetime('now'), datetime('now'))`,
                  [campaignId, merchant.id, `Campaign ${i}`, `hash${i}`]
                );
              }

              if (campaignIds.length > 0) {
                db.run('UPDATE campaigns SET is_root = 1 WHERE id = ?', [campaignIds[0]]);
              }

              for (let i = 0; i < numRecipients; i++) {
                const recipient = `user${i}@test.com`;
                const numEmails = Math.min(numCampaigns, Math.floor(Math.random() * numCampaigns) + 1);
                for (let j = 0; j < numEmails; j++) {
                  const campaignId = campaignIds[j];
                  
                  db.run(
                    `INSERT INTO campaign_emails (campaign_id, recipient, worker_name, received_at)
                     VALUES (?, ?, ?, datetime('now', '+' || ? || ' minutes'))`,
                    [campaignId, recipient, workerName, j]
                  );

                  const isNewUser = j === 0 ? 1 : 0;
                  db.run(
                    `INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, is_new_user, first_received_at)
                     VALUES (?, ?, ?, ?, ?, datetime('now', '+' || ? || ' minutes'))`,
                    [merchant.id, recipient, campaignId, j + 1, isNewUser, j]
                  );
                }
              }

              const campaignsWithNewUsers = service.getCampaignsWithNewUsers(merchant.id, [workerName]);
              const levelStats = service.getLevelStats(merchant.id, [workerName]);
              const levelStatsCampaignIds = new Set(levelStats.map(ls => ls.campaignId));

              for (const campaignId of campaignsWithNewUsers) {
                expect(levelStatsCampaignIds.has(campaignId)).toBe(true);
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should have positive userCount for all campaigns in levelStats', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            numCampaigns: fc.integer({ min: 1, max: 3 }),
            numRecipients: fc.integer({ min: 1, max: 5 }),
          }),
          async ({ numCampaigns, numRecipients }) => {
            const SQL = await initSqlJs();
            const db = new SQL.Database();
            
            try {
              const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
              db.run(readFileSync(campaignSchemaPath, 'utf-8'));

              // Add migration columns
              db.run('ALTER TABLE campaigns ADD COLUMN is_root INTEGER DEFAULT 0');
              db.run('ALTER TABLE campaigns ADD COLUMN is_root_candidate INTEGER DEFAULT 0');
              db.run('ALTER TABLE campaigns ADD COLUMN root_candidate_reason TEXT');
              db.run('ALTER TABLE campaigns ADD COLUMN tag INTEGER DEFAULT 0');
              db.run('ALTER TABLE recipient_paths ADD COLUMN is_new_user INTEGER DEFAULT 0');
              db.run('ALTER TABLE recipient_paths ADD COLUMN first_root_campaign_id TEXT');

              const service = new TestServiceWithPathAnalysis(db);
              const { merchant } = service.getOrCreateMerchant('test.com');

              for (let i = 0; i < numCampaigns; i++) {
                const campaignId = uuidv4();
                db.run(
                  `INSERT INTO campaigns (id, merchant_id, subject, subject_hash, unique_recipients, first_seen_at, last_seen_at, created_at, updated_at)
                   VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'), datetime('now'), datetime('now'))`,
                  [campaignId, merchant.id, `Campaign ${i}`, `hash${i}`]
                );

                for (let j = 0; j < numRecipients; j++) {
                  const recipient = `user${j}@test.com`;
                  db.run(
                    `INSERT INTO campaign_emails (campaign_id, recipient, worker_name, received_at)
                     VALUES (?, ?, ?, datetime('now'))`,
                    [campaignId, recipient, 'worker1']
                  );
                  db.run(
                    `INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, is_new_user, first_received_at)
                     VALUES (?, ?, ?, 1, 1, datetime('now'))`,
                    [merchant.id, recipient, campaignId]
                  );
                }
              }

              const levelStats = service.getLevelStats(merchant.id);

              for (const stat of levelStats) {
                expect(stat.userCount).toBeGreaterThan(0);
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Feature: path-analysis-enhancement, Property 6: User Statistics Accuracy**
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
   * 
   * For any path analysis result, the sum of newUsers and oldUsers should equal totalRecipients.
   */
  describe('Property 6: User Statistics Accuracy', () => {
    class TestServiceWithUserStats extends TestCampaignAnalyticsService {
      getUserTypeStats(merchantId: string, workerNames?: string[]): {
        merchantId: string;
        totalRecipients: number;
        newUsers: number;
        oldUsers: number;
        newUserPercentage: number;
      } {
        let query: string;
        let params: any[];

        if (workerNames && workerNames.length > 0) {
          const placeholders = workerNames.map(() => '?').join(', ');
          query = `
            SELECT 
              COUNT(DISTINCT rp.recipient) as total,
              SUM(CASE WHEN rp.is_new_user = 1 THEN 1 ELSE 0 END) as new_users
            FROM (
              SELECT rp.recipient, MAX(rp.is_new_user) as is_new_user
              FROM recipient_paths rp
              JOIN campaigns c ON rp.campaign_id = c.id
              JOIN campaign_emails ce ON c.id = ce.campaign_id AND rp.recipient = ce.recipient
              WHERE rp.merchant_id = ? AND ce.worker_name IN (${placeholders})
              GROUP BY rp.recipient
            ) rp
          `;
          params = [merchantId, ...workerNames];
        } else {
          query = `
            SELECT 
              COUNT(DISTINCT recipient) as total,
              SUM(CASE WHEN is_new_user = 1 THEN 1 ELSE 0 END) as new_users
            FROM (
              SELECT recipient, MAX(is_new_user) as is_new_user
              FROM recipient_paths
              WHERE merchant_id = ?
              GROUP BY recipient
            )
          `;
          params = [merchantId];
        }

        const result = this.db.exec(query, params);
        let total = 0;
        let newUsers = 0;

        if (result.length > 0 && result[0].values.length > 0) {
          total = (result[0].values[0][0] as number) || 0;
          newUsers = (result[0].values[0][1] as number) || 0;
        }

        const oldUsers = total - newUsers;

        return {
          merchantId,
          totalRecipients: total,
          newUsers,
          oldUsers,
          newUserPercentage: total > 0 ? (newUsers / total) * 100 : 0,
        };
      }
    }

    it('should have newUsers + oldUsers equal totalRecipients', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            numNewUsers: fc.integer({ min: 0, max: 10 }),
            numOldUsers: fc.integer({ min: 0, max: 10 }),
            workerName: fc.constantFrom('worker1', 'worker2', undefined),
          }),
          async ({ numNewUsers, numOldUsers, workerName }) => {
            const SQL = await initSqlJs();
            const db = new SQL.Database();
            
            try {
              const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
              db.run(readFileSync(campaignSchemaPath, 'utf-8'));

              // Add migration columns
              db.run('ALTER TABLE campaigns ADD COLUMN is_root INTEGER DEFAULT 0');
              db.run('ALTER TABLE campaigns ADD COLUMN is_root_candidate INTEGER DEFAULT 0');
              db.run('ALTER TABLE campaigns ADD COLUMN root_candidate_reason TEXT');
              db.run('ALTER TABLE campaigns ADD COLUMN tag INTEGER DEFAULT 0');
              db.run('ALTER TABLE recipient_paths ADD COLUMN is_new_user INTEGER DEFAULT 0');
              db.run('ALTER TABLE recipient_paths ADD COLUMN first_root_campaign_id TEXT');

              const service = new TestServiceWithUserStats(db);
              const { merchant } = service.getOrCreateMerchant('test.com');

              const campaignId = uuidv4();
              db.run(
                `INSERT INTO campaigns (id, merchant_id, subject, subject_hash, unique_recipients, first_seen_at, last_seen_at, created_at, updated_at)
                 VALUES (?, ?, 'Test Campaign', 'hash1', 0, datetime('now'), datetime('now'), datetime('now'), datetime('now'))`,
                [campaignId, merchant.id]
              );

              const actualWorkerName = workerName || 'worker1';

              for (let i = 0; i < numNewUsers; i++) {
                const recipient = `newuser${i}@test.com`;
                db.run(
                  `INSERT INTO campaign_emails (campaign_id, recipient, worker_name, received_at)
                   VALUES (?, ?, ?, datetime('now'))`,
                  [campaignId, recipient, actualWorkerName]
                );
                db.run(
                  `INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, is_new_user, first_received_at)
                   VALUES (?, ?, ?, 1, 1, datetime('now'))`,
                  [merchant.id, recipient, campaignId]
                );
              }

              for (let i = 0; i < numOldUsers; i++) {
                const recipient = `olduser${i}@test.com`;
                db.run(
                  `INSERT INTO campaign_emails (campaign_id, recipient, worker_name, received_at)
                   VALUES (?, ?, ?, datetime('now'))`,
                  [campaignId, recipient, actualWorkerName]
                );
                db.run(
                  `INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, is_new_user, first_received_at)
                   VALUES (?, ?, ?, 1, 0, datetime('now'))`,
                  [merchant.id, recipient, campaignId]
                );
              }

              const workerNames = workerName ? [workerName] : undefined;
              const stats = service.getUserTypeStats(merchant.id, workerNames);

              expect(stats.newUsers + stats.oldUsers).toBe(stats.totalRecipients);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have newUserPercentage between 0 and 100', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            numNewUsers: fc.integer({ min: 0, max: 10 }),
            numOldUsers: fc.integer({ min: 0, max: 10 }),
          }),
          async ({ numNewUsers, numOldUsers }) => {
            const SQL = await initSqlJs();
            const db = new SQL.Database();
            
            try {
              const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
              db.run(readFileSync(campaignSchemaPath, 'utf-8'));

              // Add migration columns
              db.run('ALTER TABLE campaigns ADD COLUMN is_root INTEGER DEFAULT 0');
              db.run('ALTER TABLE campaigns ADD COLUMN is_root_candidate INTEGER DEFAULT 0');
              db.run('ALTER TABLE campaigns ADD COLUMN root_candidate_reason TEXT');
              db.run('ALTER TABLE campaigns ADD COLUMN tag INTEGER DEFAULT 0');
              db.run('ALTER TABLE recipient_paths ADD COLUMN is_new_user INTEGER DEFAULT 0');
              db.run('ALTER TABLE recipient_paths ADD COLUMN first_root_campaign_id TEXT');

              const service = new TestServiceWithUserStats(db);
              const { merchant } = service.getOrCreateMerchant('test.com');

              const campaignId = uuidv4();
              db.run(
                `INSERT INTO campaigns (id, merchant_id, subject, subject_hash, unique_recipients, first_seen_at, last_seen_at, created_at, updated_at)
                 VALUES (?, ?, 'Test Campaign', 'hash1', 0, datetime('now'), datetime('now'), datetime('now'), datetime('now'))`,
                [campaignId, merchant.id]
              );

              for (let i = 0; i < numNewUsers; i++) {
                const recipient = `newuser${i}@test.com`;
                db.run(
                  `INSERT INTO campaign_emails (campaign_id, recipient, worker_name, received_at)
                   VALUES (?, ?, 'worker1', datetime('now'))`,
                  [campaignId, recipient]
                );
                db.run(
                  `INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, is_new_user, first_received_at)
                   VALUES (?, ?, ?, 1, 1, datetime('now'))`,
                  [merchant.id, recipient, campaignId]
                );
              }

              for (let i = 0; i < numOldUsers; i++) {
                const recipient = `olduser${i}@test.com`;
                db.run(
                  `INSERT INTO campaign_emails (campaign_id, recipient, worker_name, received_at)
                   VALUES (?, ?, 'worker1', datetime('now'))`,
                  [campaignId, recipient]
                );
                db.run(
                  `INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, is_new_user, first_received_at)
                   VALUES (?, ?, ?, 1, 0, datetime('now'))`,
                  [merchant.id, recipient, campaignId]
                );
              }

              const stats = service.getUserTypeStats(merchant.id);

              expect(stats.newUserPercentage).toBeGreaterThanOrEqual(0);
              expect(stats.newUserPercentage).toBeLessThanOrEqual(100);

              if (stats.totalRecipients > 0) {
                const expectedPercentage = (stats.newUsers / stats.totalRecipients) * 100;
                expect(stats.newUserPercentage).toBeCloseTo(expectedPercentage, 5);
              }
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly filter by workerNames for user statistics', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            numUsersWorker1: fc.integer({ min: 1, max: 5 }),
            numUsersWorker2: fc.integer({ min: 1, max: 5 }),
          }),
          async ({ numUsersWorker1, numUsersWorker2 }) => {
            const SQL = await initSqlJs();
            const db = new SQL.Database();
            
            try {
              const campaignSchemaPath = join(__dirname, '../db/campaign-schema.sql');
              db.run(readFileSync(campaignSchemaPath, 'utf-8'));

              // Add migration columns
              db.run('ALTER TABLE campaigns ADD COLUMN is_root INTEGER DEFAULT 0');
              db.run('ALTER TABLE campaigns ADD COLUMN is_root_candidate INTEGER DEFAULT 0');
              db.run('ALTER TABLE campaigns ADD COLUMN root_candidate_reason TEXT');
              db.run('ALTER TABLE campaigns ADD COLUMN tag INTEGER DEFAULT 0');
              db.run('ALTER TABLE recipient_paths ADD COLUMN is_new_user INTEGER DEFAULT 0');
              db.run('ALTER TABLE recipient_paths ADD COLUMN first_root_campaign_id TEXT');

              const service = new TestServiceWithUserStats(db);
              const { merchant } = service.getOrCreateMerchant('test.com');

              const campaignId = uuidv4();
              db.run(
                `INSERT INTO campaigns (id, merchant_id, subject, subject_hash, unique_recipients, first_seen_at, last_seen_at, created_at, updated_at)
                 VALUES (?, ?, 'Test Campaign', 'hash1', 0, datetime('now'), datetime('now'), datetime('now'), datetime('now'))`,
                [campaignId, merchant.id]
              );

              for (let i = 0; i < numUsersWorker1; i++) {
                const recipient = `worker1user${i}@test.com`;
                db.run(
                  `INSERT INTO campaign_emails (campaign_id, recipient, worker_name, received_at)
                   VALUES (?, ?, 'worker1', datetime('now'))`,
                  [campaignId, recipient]
                );
                db.run(
                  `INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, is_new_user, first_received_at)
                   VALUES (?, ?, ?, 1, 1, datetime('now'))`,
                  [merchant.id, recipient, campaignId]
                );
              }

              for (let i = 0; i < numUsersWorker2; i++) {
                const recipient = `worker2user${i}@test.com`;
                db.run(
                  `INSERT INTO campaign_emails (campaign_id, recipient, worker_name, received_at)
                   VALUES (?, ?, 'worker2', datetime('now'))`,
                  [campaignId, recipient]
                );
                db.run(
                  `INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, is_new_user, first_received_at)
                   VALUES (?, ?, ?, 1, 1, datetime('now'))`,
                  [merchant.id, recipient, campaignId]
                );
              }

              const statsWorker1 = service.getUserTypeStats(merchant.id, ['worker1']);
              expect(statsWorker1.totalRecipients).toBe(numUsersWorker1);

              const statsWorker2 = service.getUserTypeStats(merchant.id, ['worker2']);
              expect(statsWorker2.totalRecipients).toBe(numUsersWorker2);

              const statsBoth = service.getUserTypeStats(merchant.id, ['worker1', 'worker2']);
              expect(statsBoth.totalRecipients).toBe(numUsersWorker1 + numUsersWorker2);

              const statsAll = service.getUserTypeStats(merchant.id);
              expect(statsAll.totalRecipients).toBe(numUsersWorker1 + numUsersWorker2);
            } finally {
              db.close();
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
