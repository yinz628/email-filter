/**
 * Campaign Analytics Service
 * Handles merchant identification, campaign tracking, and path analysis
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type Database from 'better-sqlite3';
import type {
  Merchant,
  Campaign,
  CampaignDetail,
  CampaignFilter,
  MerchantFilter,
  UpdateMerchantDTO,
  MarkValuableDTO,
  SetCampaignTagDTO,
  CampaignTag,
  TrackEmailDTO,
  TrackResult,
  MerchantRow,
  CampaignRow,
  RecipientStat,
  RecipientPath,
  PathCampaign,
  RecipientPathRow,
  CampaignLevel,
  LevelCampaign,
  CampaignFlow,
  FlowNode,
  FlowEdge,
  CampaignTransition,
  CampaignTransitionsResult,
  PathBranch,
  PathBranchAnalysis,
  ValuableCampaignPath,
  ValuableCampaignsAnalysis,
  PredecessorInfo,
  SuccessorInfo,
  RootCampaign,
  SetRootCampaignDTO,
  UserTypeStats,
  CampaignCoverage,
  CampaignLevelStats,
  PathAnalysisResult,
  MerchantAnalysisStatus,
  SetMerchantAnalysisStatusDTO,
  AnalysisProject,
  AnalysisProjectRow,
  AnalysisProjectStatus,
  CreateAnalysisProjectDTO,
  UpdateAnalysisProjectDTO,
  DeleteMerchantDataDTO,
  DeleteMerchantDataResult,
  MerchantByWorker,
} from '@email-filter/shared';
import { toMerchant, toCampaign, toAnalysisProject, ROOT_CAMPAIGN_KEYWORDS } from '@email-filter/shared';

/**
 * Common second-level TLDs that should be treated as part of the TLD
 * e.g., .co.uk, .com.cn, .org.uk, etc.
 */
const SECOND_LEVEL_TLDS = new Set([
  // UK
  'co.uk', 'org.uk', 'me.uk', 'net.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk',
  // China
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  // Australia
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',
  // Japan
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'ad.jp', 'ed.jp', 'go.jp', 'gr.jp',
  // Brazil
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  // India
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in',
  // New Zealand
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz', 'school.nz',
  // South Africa
  'co.za', 'net.za', 'org.za', 'gov.za', 'edu.za',
  // Hong Kong
  'com.hk', 'net.hk', 'org.hk', 'gov.hk', 'edu.hk', 'idv.hk',
  // Taiwan
  'com.tw', 'net.tw', 'org.tw', 'gov.tw', 'edu.tw', 'idv.tw',
  // Singapore
  'com.sg', 'net.sg', 'org.sg', 'gov.sg', 'edu.sg',
  // Korea
  'co.kr', 'ne.kr', 'or.kr', 'go.kr', 'ac.kr', 're.kr',
  // Russia
  'com.ru', 'net.ru', 'org.ru',
  // Mexico
  'com.mx', 'net.mx', 'org.mx', 'gob.mx', 'edu.mx',
  // Other common ones
  'co.il', 'org.il', 'net.il', 'ac.il', 'gov.il', // Israel
  'com.tr', 'net.tr', 'org.tr', 'gov.tr', 'edu.tr', // Turkey
  'com.my', 'net.my', 'org.my', 'gov.my', 'edu.my', // Malaysia
  'com.ph', 'net.ph', 'org.ph', 'gov.ph', 'edu.ph', // Philippines
  'co.th', 'in.th', 'ac.th', 'go.th', 'or.th', 'net.th', // Thailand
  'com.vn', 'net.vn', 'org.vn', 'gov.vn', 'edu.vn', // Vietnam
  'co.id', 'or.id', 'ac.id', 'go.id', 'web.id', // Indonesia
]);

/**
 * Extract root domain (registrable domain) from email address
 * Returns the primary domain without subdomains, handling special TLDs like .co.uk
 * 
 * Examples:
 * - user@mail.example.com -> example.com
 * - user@shop.amazon.co.uk -> amazon.co.uk
 * - user@newsletter.company.com.cn -> company.com.cn
 * 
 * @param email - Email address to extract domain from
 * @returns Root domain string in lowercase, or null if invalid
 * 
 * Requirements: 1.1
 */
export function extractDomain(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }

  const trimmed = email.trim();
  if (!trimmed) {
    return null;
  }

  // Find the last @ symbol (handles edge cases with multiple @)
  const atIndex = trimmed.lastIndexOf('@');
  
  if (atIndex === -1 || atIndex === 0 || atIndex === trimmed.length - 1) {
    return null;
  }

  const fullDomain = trimmed.substring(atIndex + 1).toLowerCase();
  
  // Basic validation: domain should have at least one dot and no spaces
  if (!fullDomain || fullDomain.includes(' ') || !fullDomain.includes('.')) {
    return null;
  }

  // Extract root domain
  return extractRootDomain(fullDomain);
}

/**
 * Extract root domain from a full domain string
 * Handles subdomains and special TLDs like .co.uk
 * 
 * @param fullDomain - Full domain string (e.g., mail.example.co.uk)
 * @returns Root domain (e.g., example.co.uk)
 */
export function extractRootDomain(fullDomain: string): string {
  const parts = fullDomain.split('.');
  
  if (parts.length <= 2) {
    // Already a root domain (e.g., example.com)
    return fullDomain;
  }
  
  // Check if the last two parts form a known second-level TLD
  const lastTwo = parts.slice(-2).join('.');
  if (SECOND_LEVEL_TLDS.has(lastTwo)) {
    // Need at least 3 parts for domains like example.co.uk
    if (parts.length >= 3) {
      return parts.slice(-3).join('.');
    }
    return fullDomain;
  }
  
  // Standard TLD - return last two parts (e.g., example.com from mail.example.com)
  return parts.slice(-2).join('.');
}

/**
 * Calculate hash for subject string (for fast lookup)
 * 
 * @param subject - Subject string to hash
 * @returns SHA-256 hash of the subject
 */
export function calculateSubjectHash(subject: string): string {
  return createHash('sha256').update(subject).digest('hex');
}

/**
 * Campaign Analytics Service class
 * Provides merchant management, campaign tracking, and analysis functionality
 */
export class CampaignAnalyticsService {
  constructor(private db: Database.Database) {}

  // ============================================
  // Merchant Management Methods
  // ============================================

  /**
   * Get all merchants with optional filtering
   * 
   * @param filter - Optional filter options (including workerName for instance filtering)
   * @returns Array of Merchant objects
   * 
   * Requirements: 1.3, 4.3, 7.1
   */
  getMerchants(filter?: MerchantFilter): Merchant[] {
    const sortBy = filter?.sortBy || 'created_at';
    const sortOrder = filter?.sortOrder || 'desc';
    const limit = filter?.limit || 100;
    const offset = filter?.offset || 0;

    // Map sortBy to database column names
    const columnMap: Record<string, string> = {
      domain: 'm.domain',
      totalCampaigns: 'total_campaigns',
      totalEmails: 'total_emails',
      createdAt: 'm.created_at',
    };

    const column = columnMap[sortBy] || 'm.created_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Check if merchant_worker_status table exists
    const workerStatusTableExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_worker_status'
    `).get();

    // Build WHERE clause conditions
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // When workerName is specified, calculate counts dynamically for that worker
    // and use worker-specific analysis status
    if (filter?.workerName) {
      // Filter by worker-specific analysis status if provided
      if (filter?.analysisStatus) {
        if (workerStatusTableExists) {
          conditions.push(`COALESCE(mws.analysis_status, m.analysis_status, 'pending') = ?`);
        } else {
          conditions.push(`COALESCE(m.analysis_status, 'pending') = ?`);
        }
        params.push(filter.analysisStatus);
      }

      conditions.push(`m.id IN (
        SELECT DISTINCT c.merchant_id 
        FROM campaigns c 
        JOIN campaign_emails ce ON c.id = ce.campaign_id 
        WHERE ce.worker_name = ?
      )`);
      params.push(filter.workerName);

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Query with worker-specific counts and status
      let query: string;
      let queryParams: (string | number)[];

      if (workerStatusTableExists) {
        query = `
          SELECT 
            m.*,
            COALESCE(wc.campaign_count, 0) as total_campaigns,
            COALESCE(wc.email_count, 0) as total_emails,
            COALESCE(wc.valuable_count, 0) as valuable_campaigns,
            COALESCE(mws.analysis_status, m.analysis_status, 'pending') as analysis_status,
            COALESCE(mws.display_name, m.display_name) as display_name
          FROM merchants m
          LEFT JOIN (
            SELECT 
              c.merchant_id,
              COUNT(DISTINCT c.id) as campaign_count,
              COUNT(ce.id) as email_count,
              COUNT(DISTINCT CASE WHEN c.is_valuable = 1 THEN c.id END) as valuable_count
            FROM campaigns c
            JOIN campaign_emails ce ON c.id = ce.campaign_id
            WHERE ce.worker_name = ?
            GROUP BY c.merchant_id
          ) wc ON m.id = wc.merchant_id
          LEFT JOIN merchant_worker_status mws ON m.id = mws.merchant_id AND mws.worker_name = ?
          ${whereClause}
          ORDER BY ${column} ${order}
          LIMIT ? OFFSET ?
        `;
        queryParams = [filter.workerName, filter.workerName, ...params, limit, offset];
      } else {
        // Fallback without merchant_worker_status table
        query = `
          SELECT 
            m.*,
            COALESCE(wc.campaign_count, 0) as total_campaigns,
            COALESCE(wc.email_count, 0) as total_emails,
            COALESCE(wc.valuable_count, 0) as valuable_campaigns
          FROM merchants m
          LEFT JOIN (
            SELECT 
              c.merchant_id,
              COUNT(DISTINCT c.id) as campaign_count,
              COUNT(ce.id) as email_count,
              COUNT(DISTINCT CASE WHEN c.is_valuable = 1 THEN c.id END) as valuable_count
            FROM campaigns c
            JOIN campaign_emails ce ON c.id = ce.campaign_id
            WHERE ce.worker_name = ?
            GROUP BY c.merchant_id
          ) wc ON m.id = wc.merchant_id
          ${whereClause}
          ORDER BY ${column} ${order}
          LIMIT ? OFFSET ?
        `;
        queryParams = [filter.workerName, ...params, limit, offset];
      }

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...queryParams) as MerchantRow[];
      return rows.map(toMerchant);
    }

    // No workerName filter - show all merchants (global view)
    // Include merchants with matching status in global OR any worker instance
    if (filter?.analysisStatus && workerStatusTableExists) {
      // Filter by status: match global status OR any worker-specific status
      conditions.push(`(
        m.analysis_status = ? 
        OR m.id IN (
          SELECT merchant_id FROM merchant_worker_status WHERE analysis_status = ?
        )
      )`);
      params.push(filter.analysisStatus, filter.analysisStatus);
    } else if (filter?.analysisStatus) {
      conditions.push('m.analysis_status = ?');
      params.push(filter.analysisStatus);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const stmt = this.db.prepare(`
      SELECT 
        m.*,
        COALESCE(vc.valuable_count, 0) as valuable_campaigns
      FROM merchants m
      LEFT JOIN (
        SELECT merchant_id, COUNT(*) as valuable_count
        FROM campaigns
        WHERE is_valuable = 1
        GROUP BY merchant_id
      ) vc ON m.id = vc.merchant_id
      ${whereClause}
      ORDER BY ${column} ${order}
      LIMIT ? OFFSET ?
    `);

    params.push(limit, offset);
    const rows = stmt.all(...params) as MerchantRow[];
    return rows.map(toMerchant);
  }

  /**
   * Set merchant analysis status (per worker instance)
   * 
   * @param id - Merchant ID
   * @param data - Status data including optional workerName
   * @returns Updated Merchant or null
   */
  setMerchantAnalysisStatus(id: string, data: SetMerchantAnalysisStatusDTO): Merchant | null {
    const now = new Date().toISOString();
    const workerName = data.workerName || 'global';

    // Check if merchant exists
    const merchantExists = this.db.prepare('SELECT id FROM merchants WHERE id = ?').get(id);
    if (!merchantExists) {
      return null;
    }

    // If workerName is 'global', update the merchants table directly
    // This ensures the global view shows the correct status
    if (workerName === 'global') {
      this.db.prepare(`
        UPDATE merchants SET analysis_status = ?, updated_at = ? WHERE id = ?
      `).run(data.status, now, id);
      return this.getMerchantById(id);
    }

    // For specific worker instances, use merchant_worker_status table
    const tableExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_worker_status'
    `).get();

    if (tableExists) {
      // Use UPSERT to insert or update the worker-specific status
      const stmt = this.db.prepare(`
        INSERT INTO merchant_worker_status (merchant_id, worker_name, analysis_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(merchant_id, worker_name) DO UPDATE SET
          analysis_status = excluded.analysis_status,
          updated_at = excluded.updated_at
      `);
      stmt.run(id, workerName, data.status, now, now);
    } else {
      // Fallback: update global status in merchants table
      this.db.prepare(`
        UPDATE merchants SET analysis_status = ?, updated_at = ? WHERE id = ?
      `).run(data.status, now, id);
    }

    return this.getMerchantById(id, workerName);
  }

  /**
   * Get merchant analysis status for a specific worker
   * 
   * @param merchantId - Merchant ID
   * @param workerName - Worker name (defaults to 'global')
   * @returns Analysis status or 'pending' if not set
   */
  getMerchantWorkerStatus(merchantId: string, workerName: string = 'global'): string {
    // Check if merchant_worker_status table exists
    const tableExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_worker_status'
    `).get();

    if (tableExists) {
      const stmt = this.db.prepare(`
        SELECT analysis_status FROM merchant_worker_status
        WHERE merchant_id = ? AND worker_name = ?
      `);
      const row = stmt.get(merchantId, workerName) as { analysis_status: string } | undefined;
      if (row) return row.analysis_status;
    }

    // Fallback: get global status from merchants table
    const merchantStmt = this.db.prepare(`
      SELECT analysis_status FROM merchants WHERE id = ?
    `);
    const merchantRow = merchantStmt.get(merchantId) as { analysis_status: string } | undefined;
    return merchantRow?.analysis_status || 'pending';
  }

  /**
   * Get merchant by domain
   * 
   * @param domain - Domain to search for
   * @returns Merchant or null if not found
   */
  getMerchantByDomain(domain: string): Merchant | null {
    const stmt = this.db.prepare(`
      SELECT 
        m.*,
        COALESCE(vc.valuable_count, 0) as valuable_campaigns
      FROM merchants m
      LEFT JOIN (
        SELECT merchant_id, COUNT(*) as valuable_count
        FROM campaigns
        WHERE is_valuable = 1
        GROUP BY merchant_id
      ) vc ON m.id = vc.merchant_id
      WHERE m.domain = ?
    `);
    const row = stmt.get(domain.toLowerCase()) as MerchantRow | undefined;
    return row ? toMerchant(row) : null;
  }

  /**
   * Get merchant by ID
   * 
   * @param id - Merchant ID
   * @param workerName - Optional worker name for per-instance status
   * @returns Merchant or null if not found
   */
  getMerchantById(id: string, workerName?: string): Merchant | null {
    const stmt = this.db.prepare(`
      SELECT 
        m.*,
        COALESCE(vc.valuable_count, 0) as valuable_campaigns
      FROM merchants m
      LEFT JOIN (
        SELECT merchant_id, COUNT(*) as valuable_count
        FROM campaigns
        WHERE is_valuable = 1
        GROUP BY merchant_id
      ) vc ON m.id = vc.merchant_id
      WHERE m.id = ?
    `);
    const row = stmt.get(id) as MerchantRow | undefined;
    if (!row) return null;

    const merchant = toMerchant(row);
    
    // If workerName is provided, get the worker-specific status
    if (workerName) {
      merchant.analysisStatus = this.getMerchantWorkerStatus(id, workerName) as any;
    }
    
    return merchant;
  }

  /**
   * Update merchant information
   * Supports per-instance display name when workerName is provided
   * 
   * @param id - Merchant ID to update
   * @param data - Update data (including optional workerName for per-instance update)
   * @returns Updated Merchant or null if not found
   * 
   * Requirements: 1.4
   */
  updateMerchant(id: string, data: UpdateMerchantDTO & { workerName?: string }): Merchant | null {
    const now = new Date().toISOString();
    const workerName = data.workerName || 'global';

    // Check if merchant exists
    const merchantExists = this.db.prepare('SELECT id FROM merchants WHERE id = ?').get(id);
    if (!merchantExists) {
      return null;
    }

    // If workerName is 'global', update the merchants table directly
    if (workerName === 'global') {
      const stmt = this.db.prepare(`
        UPDATE merchants
        SET display_name = COALESCE(?, display_name),
            note = COALESCE(?, note),
            updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        data.displayName ?? null,
        data.note ?? null,
        now,
        id
      );

      return this.getMerchantById(id);
    }

    // For specific worker instances, update merchant_worker_status table
    const tableExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_worker_status'
    `).get();

    if (tableExists && data.displayName !== undefined) {
      // Check if record exists
      const existing = this.db.prepare(`
        SELECT id FROM merchant_worker_status WHERE merchant_id = ? AND worker_name = ?
      `).get(id, workerName);

      if (existing) {
        // Update existing record
        this.db.prepare(`
          UPDATE merchant_worker_status 
          SET display_name = ?, updated_at = ?
          WHERE merchant_id = ? AND worker_name = ?
        `).run(data.displayName || null, now, id, workerName);
      } else {
        // Insert new record
        this.db.prepare(`
          INSERT INTO merchant_worker_status (merchant_id, worker_name, display_name, analysis_status, created_at, updated_at)
          VALUES (?, ?, ?, 'pending', ?, ?)
        `).run(id, workerName, data.displayName || null, now, now);
      }
    }

    // Also update note in global merchants table if provided
    if (data.note !== undefined) {
      this.db.prepare(`
        UPDATE merchants SET note = ?, updated_at = ? WHERE id = ?
      `).run(data.note, now, id);
    }

    return this.getMerchantById(id, workerName);
  }

  /**
   * Create a new merchant (internal use)
   * 
   * @param domain - Domain for the new merchant
   * @returns Created Merchant
   * 
   * Requirements: 1.2
   */
  private createMerchant(domain: string): Merchant {
    const id = uuidv4();
    const now = new Date().toISOString();
    const normalizedDomain = domain.toLowerCase();

    const stmt = this.db.prepare(`
      INSERT INTO merchants (id, domain, total_campaigns, total_emails, created_at, updated_at)
      VALUES (?, ?, 0, 0, ?, ?)
    `);

    stmt.run(id, normalizedDomain, now, now);

    return this.getMerchantById(id)!;
  }

  /**
   * Get or create merchant by domain
   * Auto-creates merchant if not found
   * 
   * @param domain - Domain to find or create
   * @returns Merchant object and whether it was newly created
   * 
   * Requirements: 1.2
   */
  getOrCreateMerchant(domain: string): { merchant: Merchant; isNew: boolean } {
    const normalizedDomain = domain.toLowerCase();
    const existing = this.getMerchantByDomain(normalizedDomain);
    
    if (existing) {
      return { merchant: existing, isNew: false };
    }

    const merchant = this.createMerchant(normalizedDomain);
    return { merchant, isNew: true };
  }

  // ============================================
  // Campaign Management Methods
  // ============================================

  /**
   * Get campaigns with optional filtering
   * 
   * @param filter - Optional filter options (including workerName for instance filtering)
   * @returns Array of Campaign objects
   * 
   * Requirements: 2.5, 3.3, 3.4, 4.2
   */
  getCampaigns(filter?: CampaignFilter): Campaign[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter?.merchantId) {
      conditions.push('c.merchant_id = ?');
      params.push(filter.merchantId);
    }

    // Filter by specific tag
    if (filter?.tag !== undefined) {
      conditions.push('c.tag = ?');
      params.push(filter.tag);
    }

    // Exclude campaigns with specific tag (e.g., 4 for ignorable)
    if (filter?.excludeTag !== undefined) {
      conditions.push('(c.tag IS NULL OR c.tag != ?)');
      params.push(filter.excludeTag);
    }

    // Legacy isValuable filter (tag 1 or 2)
    if (filter?.isValuable !== undefined) {
      if (filter.isValuable) {
        conditions.push('(c.tag = 1 OR c.tag = 2)');
      } else {
        conditions.push('(c.tag IS NULL OR c.tag = 0 OR c.tag = 3 OR c.tag = 4)');
      }
    }

    // Map sortBy to database column names
    const columnMap: Record<string, string> = {
      firstSeenAt: 'first_seen_at',
      lastSeenAt: 'last_seen_at',
      totalEmails: 'total_emails',
      uniqueRecipients: 'unique_recipients',
    };

    const sortBy = filter?.sortBy || 'lastSeenAt';
    const column = columnMap[sortBy] || 'last_seen_at';
    const order = (filter?.sortOrder || 'desc') === 'asc' ? 'ASC' : 'DESC';
    const limit = filter?.limit || 100;
    const offset = filter?.offset || 0;

    // When workerName is specified, calculate worker-specific email counts
    if (filter?.workerName) {
      const workerConditions = [...conditions];
      const workerParams = [...params];
      
      // Add worker filter for the join
      workerConditions.push('ce.worker_name = ?');
      workerParams.push(filter.workerName);

      const whereClause = workerConditions.length > 0 
        ? `WHERE ${workerConditions.join(' AND ')}` 
        : '';

      // Use subquery to calculate worker-specific counts
      const stmt = this.db.prepare(`
        SELECT 
          c.id, c.merchant_id, c.subject, c.tag, c.is_valuable,
          c.first_seen_at, c.last_seen_at, c.created_at, c.updated_at,
          COUNT(ce.id) as total_emails,
          COUNT(DISTINCT ce.recipient) as unique_recipients
        FROM campaigns c
        INNER JOIN campaign_emails ce ON c.id = ce.campaign_id
        ${whereClause}
        GROUP BY c.id
        ORDER BY ${column === 'total_emails' || column === 'unique_recipients' ? column : 'c.' + column} ${order}
        LIMIT ? OFFSET ?
      `);

      workerParams.push(limit, offset);
      const rows = stmt.all(...workerParams) as CampaignRow[];
      return rows.map(toCampaign);
    }

    // No workerName filter - use global counts from campaigns table
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ').replace(/c\./g, '')}` 
      : '';

    const stmt = this.db.prepare(`
      SELECT * FROM campaigns
      ${whereClause}
      ORDER BY ${column} ${order}
      LIMIT ? OFFSET ?
    `);

    params.push(limit, offset);
    const rows = stmt.all(...params) as CampaignRow[];
    return rows.map(toCampaign);
  }

  /**
   * Get campaign by ID
   * 
   * @param id - Campaign ID
   * @returns Campaign or null if not found
   */
  getCampaignById(id: string): CampaignDetail | null {
    const stmt = this.db.prepare('SELECT * FROM campaigns WHERE id = ?');
    const row = stmt.get(id) as CampaignRow | undefined;
    
    if (!row) {
      return null;
    }

    const campaign = toCampaign(row);
    const merchant = this.getMerchantById(campaign.merchantId);
    
    if (!merchant) {
      return null;
    }

    // Get recipient statistics
    const recipientStats = this.getRecipientStatsForCampaign(id);

    return {
      ...campaign,
      merchant,
      recipientStats,
    };
  }

  /**
   * Mark or unmark a campaign as valuable (legacy method)
   * 
   * @param id - Campaign ID
   * @param data - Mark valuable data (valuable flag and optional note)
   * @returns Updated Campaign or null if not found
   * 
   * Requirements: 3.1, 3.2, 3.5
   */
  markCampaignValuable(id: string, data: MarkValuableDTO): Campaign | null {
    // Convert to new tag system: valuable = tag 1, not valuable = tag 0
    return this.setCampaignTag(id, {
      tag: data.valuable ? 1 : 0,
      note: data.note,
    });
  }

  /**
   * Set campaign tag
   * 
   * @param id - Campaign ID
   * @param data - Tag data (tag value 0-4 and optional note)
   * @returns Updated Campaign or null if not found
   * 
   * Tag values:
   * 0 = 未标记
   * 1 = 高价值（含折扣码）
   * 2 = 重要营销
   * 3 = 一般营销
   * 4 = 可忽略
   */
  setCampaignTag(id: string, data: SetCampaignTagDTO): Campaign | null {
    const now = new Date().toISOString();
    
    // Check if campaign exists
    const existingStmt = this.db.prepare('SELECT id FROM campaigns WHERE id = ?');
    const existing = existingStmt.get(id);
    
    if (!existing) {
      return null;
    }

    // Validate tag value
    const tag = data.tag as number;
    if (tag < 0 || tag > 4) {
      throw new Error('Invalid tag value. Must be 0-4.');
    }

    const stmt = this.db.prepare(`
      UPDATE campaigns
      SET tag = ?,
          tag_note = ?,
          is_valuable = ?,
          valuable_note = ?,
          updated_at = ?
      WHERE id = ?
    `);

    const isValuable = tag === 1 || tag === 2 ? 1 : 0;

    stmt.run(
      tag,
      data.note ?? null,
      isValuable,
      data.note ?? null, // Keep backward compatibility
      now,
      id
    );

    // Return updated campaign
    const updatedStmt = this.db.prepare('SELECT * FROM campaigns WHERE id = ?');
    const row = updatedStmt.get(id) as CampaignRow;
    return toCampaign(row);
  }

  /**
   * Get recipient statistics for a campaign
   * 
   * @param campaignId - Campaign ID
   * @returns Array of RecipientStat
   * 
   * Requirements: 2.4
   */
  private getRecipientStatsForCampaign(campaignId: string): RecipientStat[] {
    const stmt = this.db.prepare(`
      SELECT 
        recipient,
        COUNT(*) as email_count,
        MIN(received_at) as first_received_at,
        MAX(received_at) as last_received_at
      FROM campaign_emails
      WHERE campaign_id = ?
      GROUP BY recipient
      ORDER BY email_count DESC
    `);

    const rows = stmt.all(campaignId) as Array<{
      recipient: string;
      email_count: number;
      first_received_at: string;
      last_received_at: string;
    }>;

    return rows.map(row => ({
      recipient: row.recipient,
      emailCount: row.email_count,
      firstReceivedAt: new Date(row.first_received_at),
      lastReceivedAt: new Date(row.last_received_at),
    }));
  }

  /**
   * Create or update a campaign
   * 
   * @param merchantId - Merchant ID
   * @param subject - Email subject
   * @param receivedAt - When the email was received
   * @returns Campaign and whether it was newly created
   * 
   * Requirements: 2.1, 2.2
   */
  createOrUpdateCampaign(
    merchantId: string,
    subject: string,
    receivedAt: Date
  ): { campaign: Campaign; isNew: boolean } {
    const subjectHash = calculateSubjectHash(subject);
    const now = new Date().toISOString();
    const receivedAtStr = receivedAt.toISOString();

    // Try to find existing campaign
    const findStmt = this.db.prepare(`
      SELECT * FROM campaigns 
      WHERE merchant_id = ? AND subject_hash = ?
    `);
    const existing = findStmt.get(merchantId, subjectHash) as CampaignRow | undefined;

    if (existing) {
      // Update existing campaign
      const updateStmt = this.db.prepare(`
        UPDATE campaigns
        SET total_emails = total_emails + 1,
            last_seen_at = MAX(last_seen_at, ?),
            updated_at = ?
        WHERE id = ?
      `);
      updateStmt.run(receivedAtStr, now, existing.id);

      const updated = this.db.prepare('SELECT * FROM campaigns WHERE id = ?')
        .get(existing.id) as CampaignRow;
      
      return { campaign: toCampaign(updated), isNew: false };
    }

    // Create new campaign
    const id = uuidv4();
    const insertStmt = this.db.prepare(`
      INSERT INTO campaigns (
        id, merchant_id, subject, subject_hash, is_valuable, 
        total_emails, unique_recipients, first_seen_at, last_seen_at, 
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 0, 1, 0, ?, ?, ?, ?)
    `);
    insertStmt.run(id, merchantId, subject, subjectHash, receivedAtStr, receivedAtStr, now, now);

    // Update merchant campaign count
    this.db.prepare(`
      UPDATE merchants 
      SET total_campaigns = total_campaigns + 1, updated_at = ?
      WHERE id = ?
    `).run(now, merchantId);

    const created = this.db.prepare('SELECT * FROM campaigns WHERE id = ?')
      .get(id) as CampaignRow;
    
    return { campaign: toCampaign(created), isNew: true };
  }

  // ============================================
  // Email Tracking Methods
  // ============================================

  /**
   * Track an email - creates/updates merchant, campaign, and recipient path
   * 
   * @param data - Email tracking data (sender, subject, recipient, receivedAt, workerName)
   * @returns TrackResult with merchant and campaign IDs
   * 
   * Requirements: 4.1, 4.2, 4.3
   */
  trackEmail(data: TrackEmailDTO): TrackResult {
    const domain = extractDomain(data.sender);
    if (!domain) {
      throw new Error('Invalid sender email address');
    }

    if (!data.workerName || data.workerName.trim() === '') {
      throw new Error('workerName is required');
    }

    const receivedAt = data.receivedAt ? new Date(data.receivedAt) : new Date();
    const receivedAtStr = receivedAt.toISOString();
    const now = new Date().toISOString();
    const workerName = data.workerName.trim();

    // Get or create merchant
    const { merchant, isNew: isNewMerchant } = this.getOrCreateMerchant(domain);

    // Create or update campaign
    const { campaign, isNew: isNewCampaign } = this.createOrUpdateCampaign(
      merchant.id,
      data.subject,
      receivedAt
    );

    // Record the email in campaign_emails with worker_name
    this.db.prepare(`
      INSERT INTO campaign_emails (campaign_id, recipient, received_at, worker_name)
      VALUES (?, ?, ?, ?)
    `).run(campaign.id, data.recipient, receivedAtStr, workerName);

    // Update merchant total emails
    this.db.prepare(`
      UPDATE merchants SET total_emails = total_emails + 1, updated_at = ? WHERE id = ?
    `).run(now, merchant.id);

    // Handle recipient path tracking
    // Check if this campaign already exists in the recipient's path for this merchant
    const existingPathEntry = this.db.prepare(`
      SELECT id FROM recipient_paths 
      WHERE merchant_id = ? AND recipient = ? AND campaign_id = ?
    `).get(merchant.id, data.recipient, campaign.id);

    if (!existingPathEntry) {
      // Get the current max sequence order for this recipient's path
      const maxOrderResult = this.db.prepare(`
        SELECT MAX(sequence_order) as max_order 
        FROM recipient_paths 
        WHERE merchant_id = ? AND recipient = ?
      `).get(merchant.id, data.recipient) as { max_order: number | null } | undefined;

      const nextOrder = (maxOrderResult?.max_order ?? -1) + 1;

      // Add to recipient path
      this.db.prepare(`
        INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, first_received_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(merchant.id, data.recipient, campaign.id, nextOrder, receivedAtStr);

      // Update campaign unique recipients count
      this.db.prepare(`
        UPDATE campaigns SET unique_recipients = unique_recipients + 1, updated_at = ? WHERE id = ?
      `).run(now, campaign.id);
    }

    return {
      merchantId: merchant.id,
      campaignId: campaign.id,
      isNewMerchant,
      isNewCampaign,
    };
  }

  // ============================================
  // Recipient Path Methods
  // ============================================

  /**
   * Get the complete campaign path for a recipient within a merchant
   * 
   * @param merchantId - Merchant ID
   * @param recipient - Recipient email address
   * @returns RecipientPath with ordered campaigns
   * 
   * Requirements: 4.4
   */
  getRecipientPath(merchantId: string, recipient: string): RecipientPath {
    const stmt = this.db.prepare(`
      SELECT 
        rp.campaign_id,
        rp.sequence_order,
        rp.first_received_at,
        c.subject,
        c.tag,
        c.is_valuable
      FROM recipient_paths rp
      JOIN campaigns c ON rp.campaign_id = c.id
      WHERE rp.merchant_id = ? AND rp.recipient = ?
      ORDER BY rp.sequence_order ASC
    `);

    const rows = stmt.all(merchantId, recipient) as Array<{
      campaign_id: string;
      sequence_order: number;
      first_received_at: string;
      subject: string;
      tag: number;
      is_valuable: number;
    }>;

    const campaigns: PathCampaign[] = rows.map(row => {
      const tag = (row.tag ?? 0) as CampaignTag;
      return {
        campaignId: row.campaign_id,
        subject: row.subject,
        tag,
        isValuable: tag === 1 || tag === 2,
        sequenceOrder: row.sequence_order,
        firstReceivedAt: new Date(row.first_received_at),
      };
    });

    return {
      merchantId,
      recipient,
      campaigns,
    };
  }

  // ============================================
  // Campaign Level Analysis Methods
  // ============================================

  /**
   * Get campaign levels for a merchant
   * Calculates the level for each campaign based on recipient paths.
   * Level 1 = campaigns that appear first in at least one recipient's path
   * Level N = campaigns that appear at position N in recipient paths
   * 
   * A campaign can appear at multiple levels if different recipients
   * received it at different positions in their journey.
   * 
   * @param merchantId - Merchant ID to analyze
   * @returns Array of CampaignLevel objects, sorted by level
   * 
   * Requirements: 5.1, 5.2, 5.3, 5.4
   */
  getCampaignLevels(merchantId: string): CampaignLevel[] {
    // Get all unique recipients for this merchant
    const recipientsStmt = this.db.prepare(`
      SELECT DISTINCT recipient FROM recipient_paths WHERE merchant_id = ?
    `);
    const recipientRows = recipientsStmt.all(merchantId) as Array<{ recipient: string }>;
    
    const totalRecipients = recipientRows.length;
    if (totalRecipients === 0) {
      return [];
    }

    // Get all path entries with campaign info, grouped by level (sequence_order)
    // sequence_order 0 = level 1, sequence_order 1 = level 2, etc.
    const pathsStmt = this.db.prepare(`
      SELECT 
        rp.sequence_order,
        rp.campaign_id,
        c.subject,
        c.is_valuable,
        COUNT(DISTINCT rp.recipient) as recipient_count
      FROM recipient_paths rp
      JOIN campaigns c ON rp.campaign_id = c.id
      WHERE rp.merchant_id = ?
      GROUP BY rp.sequence_order, rp.campaign_id
      ORDER BY rp.sequence_order ASC, recipient_count DESC
    `);

    const rows = pathsStmt.all(merchantId) as Array<{
      sequence_order: number;
      campaign_id: string;
      subject: string;
      is_valuable: number;
      recipient_count: number;
    }>;

    // Group by level (sequence_order + 1 to make it 1-indexed)
    const levelMap = new Map<number, LevelCampaign[]>();

    for (const row of rows) {
      const level = row.sequence_order + 1; // Convert 0-indexed to 1-indexed
      
      if (!levelMap.has(level)) {
        levelMap.set(level, []);
      }

      const levelCampaign: LevelCampaign = {
        campaignId: row.campaign_id,
        subject: row.subject,
        isValuable: row.is_valuable === 1,
        recipientCount: row.recipient_count,
        percentage: (row.recipient_count / totalRecipients) * 100,
      };

      levelMap.get(level)!.push(levelCampaign);
    }

    // Convert map to sorted array of CampaignLevel
    const levels: CampaignLevel[] = [];
    const sortedLevelNumbers = Array.from(levelMap.keys()).sort((a, b) => a - b);

    for (const levelNum of sortedLevelNumbers) {
      levels.push({
        level: levelNum,
        campaigns: levelMap.get(levelNum)!,
      });
    }

    return levels;
  }

  // ============================================
  // Campaign Flow Analysis Methods
  // ============================================

  /**
   * Get campaign flow analysis for a merchant
   * Calculates the flow of recipients through campaigns, showing how recipients
   * move from one campaign to the next.
   * 
   * @param merchantId - Merchant ID to analyze
   * @param startCampaignId - Optional starting campaign ID to filter the flow
   * @returns CampaignFlow with nodes and edges representing the flow graph
   * 
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
   */
  getCampaignFlow(merchantId: string, startCampaignId?: string): CampaignFlow {
    // Get all recipient paths for this merchant
    const pathsStmt = this.db.prepare(`
      SELECT 
        rp.recipient,
        rp.campaign_id,
        rp.sequence_order,
        c.subject,
        c.is_valuable
      FROM recipient_paths rp
      JOIN campaigns c ON rp.campaign_id = c.id
      WHERE rp.merchant_id = ?
      ORDER BY rp.recipient, rp.sequence_order ASC
    `);

    const rows = pathsStmt.all(merchantId) as Array<{
      recipient: string;
      campaign_id: string;
      sequence_order: number;
      subject: string;
      is_valuable: number;
    }>;

    if (rows.length === 0) {
      return {
        merchantId,
        startCampaignId,
        baselineRecipients: 0,
        nodes: [],
        edges: [],
      };
    }

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
      // Baseline = recipients who received the start campaign
      baselineRecipients = new Set<string>();
      for (const [recipient, path] of recipientPaths) {
        if (path.some(p => p.campaignId === startCampaignId)) {
          baselineRecipients.add(recipient);
        }
      }
    } else {
      // Baseline = all unique recipients
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
        // If startCampaignId is specified, filter path to start from that campaign
        if (startCampaignId) {
          const startIndex = path.findIndex(p => p.campaignId === startCampaignId);
          if (startIndex !== -1) {
            // Re-index sequence orders starting from 0
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

    // Calculate nodes: count recipients at each campaign at each level
    const nodeMap = new Map<string, {
      campaignId: string;
      subject: string;
      isValuable: boolean;
      level: number;
      recipients: Set<string>;
    }>();

    for (const [recipient, path] of filteredPaths) {
      for (const entry of path) {
        const level = entry.sequenceOrder + 1; // 1-indexed
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

    // Convert node map to FlowNode array
    const nodes: FlowNode[] = Array.from(nodeMap.values()).map(node => ({
      campaignId: node.campaignId,
      subject: node.subject,
      isValuable: node.isValuable,
      level: node.level,
      recipientCount: node.recipients.size,
      percentage: (node.recipients.size / baselineCount) * 100,
    }));

    // Sort nodes by level, then by recipient count descending
    nodes.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return b.recipientCount - a.recipientCount;
    });

    // Calculate edges: count transitions between campaigns
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

    // Convert edge map to FlowEdge array
    const edges: FlowEdge[] = Array.from(edgeMap.values()).map(edge => ({
      from: edge.from,
      to: edge.to,
      recipientCount: edge.recipients.size,
      percentage: (edge.recipients.size / baselineCount) * 100,
    }));

    // Sort edges by recipient count descending
    edges.sort((a, b) => b.recipientCount - a.recipientCount);

    return {
      merchantId,
      startCampaignId,
      baselineRecipients: baselineCount,
      nodes,
      edges,
    };
  }

  // ============================================
  // Campaign Transition Analysis Methods (活动转移路径)
  // ============================================

  /**
   * Get campaign transitions for a merchant
   * Extracts all campaign-to-campaign transitions from recipient paths
   * 
   * @param merchantId - Merchant ID to analyze
   * @returns CampaignTransitionsResult with all transitions
   */
  getCampaignTransitions(merchantId: string): CampaignTransitionsResult {
    // Get all recipient paths
    const pathsStmt = this.db.prepare(`
      SELECT 
        rp.recipient,
        rp.campaign_id,
        rp.sequence_order,
        c.subject,
        c.is_valuable
      FROM recipient_paths rp
      JOIN campaigns c ON rp.campaign_id = c.id
      WHERE rp.merchant_id = ?
      ORDER BY rp.recipient, rp.sequence_order ASC
    `);

    const rows = pathsStmt.all(merchantId) as Array<{
      recipient: string;
      campaign_id: string;
      sequence_order: number;
      subject: string;
      is_valuable: number;
    }>;

    // Group by recipient
    const recipientPaths = new Map<string, Array<{
      campaignId: string;
      subject: string;
      isValuable: boolean;
    }>>();

    for (const row of rows) {
      if (!recipientPaths.has(row.recipient)) {
        recipientPaths.set(row.recipient, []);
      }
      recipientPaths.get(row.recipient)!.push({
        campaignId: row.campaign_id,
        subject: row.subject,
        isValuable: row.is_valuable === 1,
      });
    }

    const totalRecipients = recipientPaths.size;

    // Extract transitions
    const transitionMap = new Map<string, {
      fromCampaignId: string;
      fromSubject: string;
      fromIsValuable: boolean;
      toCampaignId: string;
      toSubject: string;
      toIsValuable: boolean;
      users: Set<string>;
    }>();

    for (const [recipient, path] of recipientPaths) {
      for (let i = 0; i < path.length - 1; i++) {
        const from = path[i];
        const to = path[i + 1];
        const key = `${from.campaignId}:${to.campaignId}`;

        if (!transitionMap.has(key)) {
          transitionMap.set(key, {
            fromCampaignId: from.campaignId,
            fromSubject: from.subject,
            fromIsValuable: from.isValuable,
            toCampaignId: to.campaignId,
            toSubject: to.subject,
            toIsValuable: to.isValuable,
            users: new Set(),
          });
        }
        transitionMap.get(key)!.users.add(recipient);
      }
    }

    // Convert to result array
    const transitions: CampaignTransition[] = Array.from(transitionMap.values())
      .map(t => ({
        fromCampaignId: t.fromCampaignId,
        fromSubject: t.fromSubject,
        fromIsValuable: t.fromIsValuable,
        toCampaignId: t.toCampaignId,
        toSubject: t.toSubject,
        toIsValuable: t.toIsValuable,
        userCount: t.users.size,
        transitionRatio: totalRecipients > 0 ? (t.users.size / totalRecipients) * 100 : 0,
      }))
      .sort((a, b) => b.userCount - a.userCount);

    return {
      merchantId,
      totalRecipients,
      transitions,
    };
  }

  // ============================================
  // Path Branch Analysis Methods (路径分支分析)
  // ============================================

  /**
   * Analyze path branches for a merchant
   * Identifies main paths (high frequency) and secondary paths (lower frequency)
   * 
   * @param merchantId - Merchant ID to analyze
   * @param minPathLength - Minimum path length to consider (default: 2)
   * @param mainPathThreshold - Percentage threshold for main paths (default: 5%)
   * @returns PathBranchAnalysis with main and secondary paths
   */
  getPathBranchAnalysis(
    merchantId: string,
    minPathLength: number = 2,
    mainPathThreshold: number = 5
  ): PathBranchAnalysis {
    // Get all recipient paths
    const pathsStmt = this.db.prepare(`
      SELECT 
        rp.recipient,
        rp.campaign_id,
        rp.sequence_order,
        c.subject,
        c.is_valuable
      FROM recipient_paths rp
      JOIN campaigns c ON rp.campaign_id = c.id
      WHERE rp.merchant_id = ?
      ORDER BY rp.recipient, rp.sequence_order ASC
    `);

    const rows = pathsStmt.all(merchantId) as Array<{
      recipient: string;
      campaign_id: string;
      sequence_order: number;
      subject: string;
      is_valuable: number;
    }>;

    // Group by recipient
    const recipientPaths = new Map<string, Array<{
      campaignId: string;
      subject: string;
      isValuable: boolean;
    }>>();

    for (const row of rows) {
      if (!recipientPaths.has(row.recipient)) {
        recipientPaths.set(row.recipient, []);
      }
      recipientPaths.get(row.recipient)!.push({
        campaignId: row.campaign_id,
        subject: row.subject,
        isValuable: row.is_valuable === 1,
      });
    }

    const totalRecipients = recipientPaths.size;

    // Count unique paths
    const pathCountMap = new Map<string, {
      path: string[];
      subjects: string[];
      valuableCampaignIds: string[];
      count: number;
    }>();

    for (const [, path] of recipientPaths) {
      if (path.length < minPathLength) continue;

      const pathKey = path.map(p => p.campaignId).join('->');
      
      if (!pathCountMap.has(pathKey)) {
        pathCountMap.set(pathKey, {
          path: path.map(p => p.campaignId),
          subjects: path.map(p => p.subject),
          valuableCampaignIds: path.filter(p => p.isValuable).map(p => p.campaignId),
          count: 0,
        });
      }
      pathCountMap.get(pathKey)!.count++;
    }

    // Convert to PathBranch array
    const allPaths: PathBranch[] = Array.from(pathCountMap.values())
      .map(p => ({
        path: p.path,
        subjects: p.subjects,
        userCount: p.count,
        percentage: totalRecipients > 0 ? (p.count / totalRecipients) * 100 : 0,
        hasValuable: p.valuableCampaignIds.length > 0,
        valuableCampaignIds: p.valuableCampaignIds,
      }))
      .sort((a, b) => b.userCount - a.userCount);

    // Separate into main and secondary paths
    const mainPaths = allPaths.filter(p => p.percentage >= mainPathThreshold);
    const secondaryPaths = allPaths.filter(p => p.percentage < mainPathThreshold && p.percentage >= 1);
    const valuablePaths = allPaths.filter(p => p.hasValuable).slice(0, 20);

    return {
      merchantId,
      totalRecipients,
      mainPaths: mainPaths.slice(0, 10),
      secondaryPaths: secondaryPaths.slice(0, 20),
      valuablePaths,
    };
  }

  // ============================================
  // Valuable Campaign Analysis Methods (有价值活动路径视图)
  // ============================================

  /**
   * Analyze valuable campaigns and their path context
   * Shows common predecessors and successors for each valuable campaign
   * 
   * @param merchantId - Merchant ID to analyze
   * @param workerNames - Optional array of worker names for multi-worker filtering. Empty array or undefined includes all workers.
   * @returns ValuableCampaignsAnalysis with detailed path info for valuable campaigns
   */
  getValuableCampaignsAnalysis(merchantId: string, workerNames?: string[]): ValuableCampaignsAnalysis {
    // Get all valuable campaigns for this merchant
    // When workerNames is provided, only include campaigns that have emails from these workers
    let valuableCampaigns: Array<{ id: string; subject: string; unique_recipients: number }>;
    let totalRecipients: number;

    if (workerNames && workerNames.length > 0) {
      const placeholders = workerNames.map(() => '?').join(', ');
      const valuableCampaignsStmt = this.db.prepare(`
        SELECT DISTINCT c.id, c.subject, 
          (SELECT COUNT(DISTINCT ce2.recipient) FROM campaign_emails ce2 WHERE ce2.campaign_id = c.id AND ce2.worker_name IN (${placeholders})) as unique_recipients
        FROM campaigns c
        JOIN campaign_emails ce ON c.id = ce.campaign_id
        WHERE c.merchant_id = ? AND c.is_valuable = 1 AND ce.worker_name IN (${placeholders})
        ORDER BY unique_recipients DESC
      `);
      valuableCampaigns = valuableCampaignsStmt.all(...workerNames, merchantId, ...workerNames) as Array<{
        id: string;
        subject: string;
        unique_recipients: number;
      }>;

      const totalRecipientsStmt = this.db.prepare(`
        SELECT COUNT(DISTINCT rp.recipient) as total
        FROM recipient_paths rp
        JOIN campaigns c ON rp.campaign_id = c.id
        JOIN campaign_emails ce ON c.id = ce.campaign_id AND rp.recipient = ce.recipient
        WHERE rp.merchant_id = ? AND ce.worker_name IN (${placeholders})
      `);
      const totalResult = totalRecipientsStmt.get(merchantId, ...workerNames) as { total: number };
      totalRecipients = totalResult.total;
    } else {
      const valuableCampaignsStmt = this.db.prepare(`
        SELECT id, subject, unique_recipients
        FROM campaigns
        WHERE merchant_id = ? AND is_valuable = 1
        ORDER BY unique_recipients DESC
      `);
      valuableCampaigns = valuableCampaignsStmt.all(merchantId) as Array<{
        id: string;
        subject: string;
        unique_recipients: number;
      }>;

      const totalRecipientsStmt = this.db.prepare(`
        SELECT COUNT(DISTINCT recipient) as total
        FROM recipient_paths
        WHERE merchant_id = ?
      `);
      const totalResult = totalRecipientsStmt.get(merchantId) as { total: number };
      totalRecipients = totalResult.total;
    }

    if (valuableCampaigns.length === 0) {
      return {
        merchantId,
        totalValuableCampaigns: 0,
        valuableCampaigns: [],
      };
    }

    // Get transitions data
    const transitions = this.getCampaignTransitions(merchantId);

    // Calculate DAG levels using topological sort
    const levels = this.calculateDAGLevels(merchantId);

    // Build analysis for each valuable campaign
    const valuableCampaignPaths: ValuableCampaignPath[] = valuableCampaigns.map(vc => {
      // Find predecessors (campaigns that lead to this one)
      const predecessors: PredecessorInfo[] = transitions.transitions
        .filter(t => t.toCampaignId === vc.id)
        .map(t => ({
          campaignId: t.fromCampaignId,
          subject: t.fromSubject,
          isValuable: t.fromIsValuable,
          transitionCount: t.userCount,
          transitionRatio: t.transitionRatio,
        }))
        .sort((a, b) => b.transitionCount - a.transitionCount)
        .slice(0, 5);

      // Find successors (campaigns that follow this one)
      const successors: SuccessorInfo[] = transitions.transitions
        .filter(t => t.fromCampaignId === vc.id)
        .map(t => ({
          campaignId: t.toCampaignId,
          subject: t.toSubject,
          isValuable: t.toIsValuable,
          transitionCount: t.userCount,
          transitionRatio: t.transitionRatio,
        }))
        .sort((a, b) => b.transitionCount - a.transitionCount)
        .slice(0, 5);

      return {
        campaignId: vc.id,
        subject: vc.subject,
        level: levels.get(vc.id) || 1,
        recipientCount: vc.unique_recipients,
        percentage: totalRecipients > 0 ? (vc.unique_recipients / totalRecipients) * 100 : 0,
        commonPredecessors: predecessors,
        commonSuccessors: successors,
      };
    });

    return {
      merchantId,
      totalValuableCampaigns: valuableCampaigns.length,
      valuableCampaigns: valuableCampaignPaths,
    };
  }

  /**
   * Calculate DAG levels for campaigns using topological sort
   * Level 1 = campaigns with no predecessors (in-degree 0)
   * Level N = campaigns whose all predecessors are at level < N
   * 
   * @param merchantId - Merchant ID
   * @returns Map of campaignId to level
   */
  calculateDAGLevels(merchantId: string): Map<string, number> {
    const transitions = this.getCampaignTransitions(merchantId);
    
    // Build adjacency list and in-degree count
    const inDegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>();
    const allCampaigns = new Set<string>();

    for (const t of transitions.transitions) {
      allCampaigns.add(t.fromCampaignId);
      allCampaigns.add(t.toCampaignId);

      // Initialize in-degree
      if (!inDegree.has(t.fromCampaignId)) inDegree.set(t.fromCampaignId, 0);
      if (!inDegree.has(t.toCampaignId)) inDegree.set(t.toCampaignId, 0);

      // Increment in-degree for target
      inDegree.set(t.toCampaignId, (inDegree.get(t.toCampaignId) || 0) + 1);

      // Add to out edges
      if (!outEdges.has(t.fromCampaignId)) outEdges.set(t.fromCampaignId, []);
      outEdges.get(t.fromCampaignId)!.push(t.toCampaignId);
    }

    // Topological sort with level assignment
    const levels = new Map<string, number>();
    const queue: string[] = [];

    // Start with in-degree 0 nodes (Level 1)
    for (const [campaignId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(campaignId);
        levels.set(campaignId, 1);
      }
    }

    // BFS to assign levels
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentLevel = levels.get(current) || 1;
      const neighbors = outEdges.get(current) || [];

      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);

        // Update level to be max of current level + 1
        const existingLevel = levels.get(neighbor) || 0;
        levels.set(neighbor, Math.max(existingLevel, currentLevel + 1));

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Handle any remaining campaigns (cycles or isolated)
    for (const campaignId of allCampaigns) {
      if (!levels.has(campaignId)) {
        levels.set(campaignId, 1);
      }
    }

    return levels;
  }

  // ============================================
  // Root Campaign Management (第一层级活动管理)
  // ============================================

  /**
   * Get root campaigns for a merchant
   * Returns both confirmed and candidate root campaigns
   * 
   * @param merchantId - Merchant ID
   * @param workerNames - Optional array of worker names for multi-worker filtering. Empty array or undefined includes all workers.
   * @returns Array of RootCampaign
   */
  getRootCampaigns(merchantId: string, workerNames?: string[]): RootCampaign[] {
    // Get campaigns marked as root or candidate
    // When workerNames is provided, only count new users from those workers
    if (workerNames && workerNames.length > 0) {
      const placeholders = workerNames.map(() => '?').join(', ');
      const stmt = this.db.prepare(`
        SELECT 
          c.id,
          c.subject,
          c.is_root,
          c.is_root_candidate,
          c.root_candidate_reason,
          c.updated_at,
          COUNT(DISTINCT CASE 
            WHEN ce.worker_name IN (${placeholders}) THEN rp.recipient 
            ELSE NULL 
          END) as new_user_count
        FROM campaigns c
        LEFT JOIN recipient_paths rp ON c.id = rp.first_root_campaign_id
        LEFT JOIN campaign_emails ce ON c.id = ce.campaign_id AND rp.recipient = ce.recipient
        WHERE c.merchant_id = ? AND (c.is_root = 1 OR c.is_root_candidate = 1)
        GROUP BY c.id
        ORDER BY c.is_root DESC, new_user_count DESC
      `);

      const rows = stmt.all(...workerNames, merchantId) as Array<{
        id: string;
        subject: string;
        is_root: number;
        is_root_candidate: number;
        root_candidate_reason: string | null;
        updated_at: string;
        new_user_count: number;
      }>;

      return rows.map(row => ({
        campaignId: row.id,
        subject: row.subject,
        isConfirmed: row.is_root === 1,
        isCandidate: row.is_root_candidate === 1,
        candidateReason: row.root_candidate_reason ?? undefined,
        newUserCount: row.new_user_count,
        confirmedAt: row.is_root === 1 ? new Date(row.updated_at) : undefined,
      }));
    }

    // Original logic without worker filter
    const stmt = this.db.prepare(`
      SELECT 
        c.id,
        c.subject,
        c.is_root,
        c.is_root_candidate,
        c.root_candidate_reason,
        c.updated_at,
        COUNT(DISTINCT rp.recipient) as new_user_count
      FROM campaigns c
      LEFT JOIN recipient_paths rp ON c.id = rp.first_root_campaign_id
      WHERE c.merchant_id = ? AND (c.is_root = 1 OR c.is_root_candidate = 1)
      GROUP BY c.id
      ORDER BY c.is_root DESC, new_user_count DESC
    `);

    const rows = stmt.all(merchantId) as Array<{
      id: string;
      subject: string;
      is_root: number;
      is_root_candidate: number;
      root_candidate_reason: string | null;
      updated_at: string;
      new_user_count: number;
    }>;

    return rows.map(row => ({
      campaignId: row.id,
      subject: row.subject,
      isConfirmed: row.is_root === 1,
      isCandidate: row.is_root_candidate === 1,
      candidateReason: row.root_candidate_reason ?? undefined,
      newUserCount: row.new_user_count,
      confirmedAt: row.is_root === 1 ? new Date(row.updated_at) : undefined,
    }));
  }

  /**
   * Auto-detect root campaign candidates based on keywords
   * 
   * @param merchantId - Merchant ID
   * @returns Number of candidates detected
   */
  detectRootCampaignCandidates(merchantId: string): number {
    const campaigns = this.getCampaigns({ merchantId, limit: 1000 });
    let count = 0;

    for (const campaign of campaigns) {
      const subjectLower = campaign.subject.toLowerCase();
      
      for (const keyword of ROOT_CAMPAIGN_KEYWORDS) {
        if (subjectLower.includes(keyword.toLowerCase())) {
          // Mark as candidate
          this.db.prepare(`
            UPDATE campaigns 
            SET is_root_candidate = 1, root_candidate_reason = ?
            WHERE id = ? AND is_root = 0
          `).run(`关键词匹配: ${keyword}`, campaign.id);
          count++;
          break;
        }
      }
    }

    return count;
  }

  /**
   * Set or unset a campaign as root campaign
   * 
   * @param data - SetRootCampaignDTO
   * @returns Updated campaign or null
   */
  setRootCampaign(data: SetRootCampaignDTO): Campaign | null {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      UPDATE campaigns
      SET is_root = ?, updated_at = ?
      WHERE id = ?
    `);

    const result = stmt.run(data.isRoot ? 1 : 0, now, data.campaignId);
    
    if (result.changes === 0) {
      return null;
    }

    // If setting as root, recalculate new users
    if (data.isRoot) {
      this.recalculateNewUsers(data.campaignId);
    }

    const row = this.db.prepare('SELECT * FROM campaigns WHERE id = ?')
      .get(data.campaignId) as CampaignRow;
    return row ? toCampaign(row) : null;
  }

  /**
   * Recalculate new users based on root campaign
   * 
   * @param rootCampaignId - Root campaign ID
   */
  private recalculateNewUsers(rootCampaignId: string): void {
    // Get merchant ID for this campaign
    const campaign = this.db.prepare('SELECT merchant_id FROM campaigns WHERE id = ?')
      .get(rootCampaignId) as { merchant_id: string } | undefined;
    
    if (!campaign) return;

    const merchantId = campaign.merchant_id;

    // Get all recipients who received this root campaign
    const recipientsStmt = this.db.prepare(`
      SELECT DISTINCT recipient 
      FROM recipient_paths 
      WHERE merchant_id = ? AND campaign_id = ?
    `);
    const recipients = recipientsStmt.all(merchantId, rootCampaignId) as Array<{ recipient: string }>;

    // Mark these recipients as new users
    const updateStmt = this.db.prepare(`
      UPDATE recipient_paths
      SET is_new_user = 1, first_root_campaign_id = ?
      WHERE merchant_id = ? AND recipient = ? AND first_root_campaign_id IS NULL
    `);

    for (const { recipient } of recipients) {
      updateStmt.run(rootCampaignId, merchantId, recipient);
    }
  }

  /**
   * Recalculate all new users for a merchant based on confirmed root campaigns
   * 
   * @param merchantId - Merchant ID
   */
  recalculateAllNewUsers(merchantId: string): void {
    // Reset all new user flags
    this.db.prepare(`
      UPDATE recipient_paths
      SET is_new_user = 0, first_root_campaign_id = NULL
      WHERE merchant_id = ?
    `).run(merchantId);

    // Get all confirmed root campaigns
    const rootCampaigns = this.db.prepare(`
      SELECT id FROM campaigns WHERE merchant_id = ? AND is_root = 1
    `).all(merchantId) as Array<{ id: string }>;

    // For each recipient, find their first root campaign (by sequence order)
    const recipientsStmt = this.db.prepare(`
      SELECT DISTINCT recipient FROM recipient_paths WHERE merchant_id = ?
    `);
    const recipients = recipientsStmt.all(merchantId) as Array<{ recipient: string }>;

    const rootCampaignIds = new Set(rootCampaigns.map(r => r.id));

    for (const { recipient } of recipients) {
      // Get this recipient's path
      const pathStmt = this.db.prepare(`
        SELECT campaign_id, sequence_order
        FROM recipient_paths
        WHERE merchant_id = ? AND recipient = ?
        ORDER BY sequence_order ASC
      `);
      const path = pathStmt.all(merchantId, recipient) as Array<{
        campaign_id: string;
        sequence_order: number;
      }>;

      // Find first root campaign in path
      for (const entry of path) {
        if (rootCampaignIds.has(entry.campaign_id)) {
          // Mark as new user
          this.db.prepare(`
            UPDATE recipient_paths
            SET is_new_user = 1, first_root_campaign_id = ?
            WHERE merchant_id = ? AND recipient = ?
          `).run(entry.campaign_id, merchantId, recipient);
          break;
        }
      }
    }
  }

  /**
   * Rebuild recipient paths for a merchant from campaign_emails data
   * This will delete all existing paths and recreate them based on email timestamps
   * Includes all campaigns (valuable campaigns will be highlighted in UI)
   * 
   * @param merchantId - Merchant ID
   * @param workerNames - Optional array of worker names to filter by. Empty array or undefined includes all workers.
   * @returns Statistics about the rebuild operation
   * 
   * Requirements: 3.2, 3.3, 4.2, 4.3, 4.6
   */
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
    const params: (string | number)[] = [merchantId];

    // Filter by worker names if provided and non-empty
    if (workerNames && workerNames.length > 0) {
      const placeholders = workerNames.map(() => '?').join(', ');
      emailsQuery += ` AND ce.worker_name IN (${placeholders})`;
      params.push(...workerNames);
    }

    emailsQuery += ' ORDER BY ce.recipient, ce.received_at ASC';

    const emails = this.db.prepare(emailsQuery).all(...params) as Array<{
      recipient: string;
      campaign_id: string;
      received_at: string;
      merchant_id: string;
    }>;

    // Delete existing paths for this merchant
    let deleteQuery = 'DELETE FROM recipient_paths WHERE merchant_id = ?';
    const deleteParams: string[] = [merchantId];

    const deleteResult = this.db.prepare(deleteQuery).run(...deleteParams);
    const pathsDeleted = deleteResult.changes;

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
    const insertStmt = this.db.prepare(`
      INSERT INTO recipient_paths (merchant_id, recipient, campaign_id, sequence_order, first_received_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const [recipient, emailList] of recipientEmails) {
      // Track which campaigns we've already added to the path
      const addedCampaigns = new Set<string>();
      let sequenceOrder = 1;

      for (const email of emailList) {
        if (!addedCampaigns.has(email.campaign_id)) {
          insertStmt.run(
            merchantId,
            recipient,
            email.campaign_id,
            sequenceOrder,
            email.received_at
          );
          addedCampaigns.add(email.campaign_id);
          sequenceOrder++;
          pathsCreated++;
        }
      }
    }

    // Recalculate new/old user flags based on Root campaigns
    // Requirements: 4.6
    this.recalculateAllNewUsers(merchantId);

    return {
      pathsDeleted,
      pathsCreated,
      recipientsProcessed: recipientEmails.size,
    };
  }

  /**
   * Cleanup old customer paths for a merchant
   * Removes recipient_paths entries for recipients identified as old customers
   * (recipients whose first email was NOT from a Root campaign)
   * Preserves campaign_emails records.
   * 
   * @param merchantId - Merchant ID
   * @param workerNames - Optional array of worker names to filter by. Empty array or undefined includes all workers.
   * @returns Statistics about the cleanup operation
   * 
   * Requirements: 7.4, 7.5, 7.6
   */
  cleanupOldCustomerPaths(
    merchantId: string,
    workerNames?: string[]
  ): { pathsDeleted: number; recipientsAffected: number } {
    // Get all recipients who are old customers (is_new_user = 0 or NULL)
    // Old customers are those whose first email was NOT from a Root campaign
    let oldCustomersQuery = `
      SELECT DISTINCT rp.recipient
      FROM recipient_paths rp
      WHERE rp.merchant_id = ?
        AND (rp.is_new_user = 0 OR rp.is_new_user IS NULL)
    `;
    const params: (string | number)[] = [merchantId];

    // If workerNames is provided and non-empty, filter by workers
    if (workerNames && workerNames.length > 0) {
      const placeholders = workerNames.map(() => '?').join(', ');
      oldCustomersQuery += `
        AND rp.recipient IN (
          SELECT DISTINCT ce.recipient
          FROM campaign_emails ce
          JOIN campaigns c ON ce.campaign_id = c.id
          WHERE c.merchant_id = ? AND ce.worker_name IN (${placeholders})
        )
      `;
      params.push(merchantId, ...workerNames);
    }

    const oldCustomers = this.db.prepare(oldCustomersQuery).all(...params) as Array<{ recipient: string }>;
    const recipientsAffected = oldCustomers.length;

    if (recipientsAffected === 0) {
      return { pathsDeleted: 0, recipientsAffected: 0 };
    }

    // Delete paths for old customers
    // Note: We preserve campaign_emails records as per Requirements 7.5
    const recipientList = oldCustomers.map(r => r.recipient);
    const recipientPlaceholders = recipientList.map(() => '?').join(', ');
    
    const deleteStmt = this.db.prepare(`
      DELETE FROM recipient_paths
      WHERE merchant_id = ? AND recipient IN (${recipientPlaceholders})
    `);
    
    const deleteResult = deleteStmt.run(merchantId, ...recipientList);
    const pathsDeleted = deleteResult.changes;

    return {
      pathsDeleted,
      recipientsAffected,
    };
  }

  // ============================================
  // New/Old User Statistics (新老用户统计)
  // ============================================

  /**
   * Get user type statistics for a merchant
   * 
   * @param merchantId - Merchant ID
   * @param workerNames - Optional array of worker names for multi-worker filtering. Empty array or undefined includes all workers.
   * @returns UserTypeStats
   */
  getUserTypeStats(merchantId: string, workerNames?: string[]): UserTypeStats {
    if (workerNames && workerNames.length > 0) {
      // Filter by workers - only count recipients who have emails from these workers
      const placeholders = workerNames.map(() => '?').join(', ');
      const stmt = this.db.prepare(`
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
      `);

      const result = stmt.get(merchantId, ...workerNames) as { total: number; new_users: number };
      const total = result.total || 0;
      const newUsers = result.new_users || 0;
      const oldUsers = total - newUsers;

      return {
        merchantId,
        totalRecipients: total,
        newUsers,
        oldUsers,
        newUserPercentage: total > 0 ? (newUsers / total) * 100 : 0,
      };
    }

    // Original logic without worker filter
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(DISTINCT recipient) as total,
        SUM(CASE WHEN is_new_user = 1 THEN 1 ELSE 0 END) as new_users
      FROM (
        SELECT recipient, MAX(is_new_user) as is_new_user
        FROM recipient_paths
        WHERE merchant_id = ?
        GROUP BY recipient
      )
    `);

    const result = stmt.get(merchantId) as { total: number; new_users: number };
    const total = result.total || 0;
    const newUsers = result.new_users || 0;
    const oldUsers = total - newUsers;

    return {
      merchantId,
      totalRecipients: total,
      newUsers,
      oldUsers,
      newUserPercentage: total > 0 ? (newUsers / total) * 100 : 0,
    };
  }

  /**
   * Get campaign coverage statistics
   * 
   * @param merchantId - Merchant ID
   * @param workerNames - Optional array of worker names for multi-worker filtering. Empty array or undefined includes all workers.
   * @returns Array of CampaignCoverage
   */
  getCampaignCoverage(merchantId: string, workerNames?: string[]): CampaignCoverage[] {
    const userStats = this.getUserTypeStats(merchantId, workerNames);
    const levels = this.calculateDAGLevels(merchantId);

    if (workerNames && workerNames.length > 0) {
      // Filter by workers - only count recipients who have emails from these workers
      const placeholders = workerNames.map(() => '?').join(', ');
      const stmt = this.db.prepare(`
        SELECT 
          c.id,
          c.subject,
          c.tag,
          c.is_valuable,
          COUNT(DISTINCT CASE WHEN rp.is_new_user = 1 AND ce.worker_name IN (${placeholders}) THEN rp.recipient END) as new_user_count,
          COUNT(DISTINCT CASE WHEN (rp.is_new_user = 0 OR rp.is_new_user IS NULL) AND ce.worker_name IN (${placeholders}) THEN rp.recipient END) as old_user_count,
          COUNT(DISTINCT CASE WHEN ce.worker_name IN (${placeholders}) THEN rp.recipient END) as total_count
        FROM campaigns c
        LEFT JOIN recipient_paths rp ON c.id = rp.campaign_id
        LEFT JOIN campaign_emails ce ON c.id = ce.campaign_id AND rp.recipient = ce.recipient
        WHERE c.merchant_id = ?
        GROUP BY c.id
        HAVING total_count > 0
        ORDER BY new_user_count DESC
      `);

      const rows = stmt.all(...workerNames, ...workerNames, ...workerNames, merchantId) as Array<{
        id: string;
        subject: string;
        tag: number;
        is_valuable: number;
        new_user_count: number;
        old_user_count: number;
        total_count: number;
      }>;

      return rows.map(row => {
        const tag = (row.tag ?? 0) as CampaignTag;
        return {
          campaignId: row.id,
          subject: row.subject,
          tag,
          isValuable: tag === 1 || tag === 2,
          level: levels.get(row.id) || 1,
          newUserCount: row.new_user_count,
          newUserCoverage: userStats.newUsers > 0 
            ? (row.new_user_count / userStats.newUsers) * 100 
            : 0,
          oldUserCount: row.old_user_count,
          oldUserCoverage: userStats.oldUsers > 0 
            ? (row.old_user_count / userStats.oldUsers) * 100 
            : 0,
          totalCount: row.total_count,
        };
      });
    }

    // Original logic without worker filter
    const stmt = this.db.prepare(`
      SELECT 
        c.id,
        c.subject,
        c.tag,
        c.is_valuable,
        COUNT(DISTINCT CASE WHEN rp.is_new_user = 1 THEN rp.recipient END) as new_user_count,
        COUNT(DISTINCT CASE WHEN rp.is_new_user = 0 OR rp.is_new_user IS NULL THEN rp.recipient END) as old_user_count,
        COUNT(DISTINCT rp.recipient) as total_count
      FROM campaigns c
      LEFT JOIN recipient_paths rp ON c.id = rp.campaign_id
      WHERE c.merchant_id = ?
      GROUP BY c.id
      ORDER BY new_user_count DESC
    `);

    const rows = stmt.all(merchantId) as Array<{
      id: string;
      subject: string;
      tag: number;
      is_valuable: number;
      new_user_count: number;
      old_user_count: number;
      total_count: number;
    }>;

    return rows.map(row => {
      const tag = (row.tag ?? 0) as CampaignTag;
      return {
        campaignId: row.id,
        subject: row.subject,
        tag,
        isValuable: tag === 1 || tag === 2,
        level: levels.get(row.id) || 1,
        newUserCount: row.new_user_count,
        newUserCoverage: userStats.newUsers > 0 
          ? (row.new_user_count / userStats.newUsers) * 100 
          : 0,
        oldUserCount: row.old_user_count,
        oldUserCoverage: userStats.oldUsers > 0 
          ? (row.old_user_count / userStats.oldUsers) * 100 
          : 0,
        totalCount: row.total_count,
      };
    });
  }

  // ============================================
  // New User Path Analysis (新用户路径分析)
  // ============================================

  /**
   * Get campaign transitions for new users only
   * 
   * @param merchantId - Merchant ID
   * @param workerNames - Optional array of worker names for multi-worker filtering. Empty array or undefined includes all workers.
   * @returns CampaignTransitionsResult
   */
  getNewUserTransitions(merchantId: string, workerNames?: string[]): CampaignTransitionsResult {
    // Get paths for new users only
    let pathsStmt;
    let rows;

    if (workerNames && workerNames.length > 0) {
      // Filter by workers - only include recipients who have emails from these workers
      const placeholders = workerNames.map(() => '?').join(', ');
      pathsStmt = this.db.prepare(`
        SELECT DISTINCT
          rp.recipient,
          rp.campaign_id,
          rp.sequence_order,
          c.subject,
          c.is_valuable
        FROM recipient_paths rp
        JOIN campaigns c ON rp.campaign_id = c.id
        JOIN campaign_emails ce ON c.id = ce.campaign_id AND rp.recipient = ce.recipient
        WHERE rp.merchant_id = ? AND rp.is_new_user = 1 AND ce.worker_name IN (${placeholders})
        ORDER BY rp.recipient, rp.sequence_order ASC
      `);
      rows = pathsStmt.all(merchantId, ...workerNames) as Array<{
        recipient: string;
        campaign_id: string;
        sequence_order: number;
        subject: string;
        is_valuable: number;
      }>;
    } else {
      pathsStmt = this.db.prepare(`
        SELECT 
          rp.recipient,
          rp.campaign_id,
          rp.sequence_order,
          c.subject,
          c.is_valuable
        FROM recipient_paths rp
        JOIN campaigns c ON rp.campaign_id = c.id
        WHERE rp.merchant_id = ? AND rp.is_new_user = 1
        ORDER BY rp.recipient, rp.sequence_order ASC
      `);
      rows = pathsStmt.all(merchantId) as Array<{
        recipient: string;
        campaign_id: string;
        sequence_order: number;
        subject: string;
        is_valuable: number;
      }>;
    }

    // Group by recipient
    const recipientPaths = new Map<string, Array<{
      campaignId: string;
      subject: string;
      isValuable: boolean;
    }>>();

    for (const row of rows) {
      if (!recipientPaths.has(row.recipient)) {
        recipientPaths.set(row.recipient, []);
      }
      recipientPaths.get(row.recipient)!.push({
        campaignId: row.campaign_id,
        subject: row.subject,
        isValuable: row.is_valuable === 1,
      });
    }

    const totalRecipients = recipientPaths.size;

    // Extract transitions
    const transitionMap = new Map<string, {
      fromCampaignId: string;
      fromSubject: string;
      fromIsValuable: boolean;
      toCampaignId: string;
      toSubject: string;
      toIsValuable: boolean;
      users: Set<string>;
    }>();

    for (const [recipient, path] of recipientPaths) {
      for (let i = 0; i < path.length - 1; i++) {
        const from = path[i];
        const to = path[i + 1];
        const key = `${from.campaignId}:${to.campaignId}`;

        if (!transitionMap.has(key)) {
          transitionMap.set(key, {
            fromCampaignId: from.campaignId,
            fromSubject: from.subject,
            fromIsValuable: from.isValuable,
            toCampaignId: to.campaignId,
            toSubject: to.subject,
            toIsValuable: to.isValuable,
            users: new Set(),
          });
        }
        transitionMap.get(key)!.users.add(recipient);
      }
    }

    // Convert to result array
    const transitions: CampaignTransition[] = Array.from(transitionMap.values())
      .map(t => ({
        fromCampaignId: t.fromCampaignId,
        fromSubject: t.fromSubject,
        fromIsValuable: t.fromIsValuable,
        toCampaignId: t.toCampaignId,
        toSubject: t.toSubject,
        toIsValuable: t.toIsValuable,
        userCount: t.users.size,
        transitionRatio: totalRecipients > 0 ? (t.users.size / totalRecipients) * 100 : 0,
      }))
      .sort((a, b) => b.userCount - a.userCount);

    return {
      merchantId,
      totalRecipients,
      transitions,
    };
  }

  /**
   * Get complete path analysis result
   * Combines all analysis methods into a single comprehensive result
   * 
   * @param merchantId - Merchant ID
   * @param workerNames - Optional array of worker names for multi-worker filtering. Empty array or undefined includes all workers.
   * @returns PathAnalysisResult
   */
  getPathAnalysis(merchantId: string, workerNames?: string[]): PathAnalysisResult {
    const rootCampaigns = this.getRootCampaigns(merchantId, workerNames);
    const userStats = this.getUserTypeStats(merchantId, workerNames);
    const coverage = this.getCampaignCoverage(merchantId, workerNames);
    
    // Get transitions for new users - this determines the actual path graph
    const newUserTransitions = this.getNewUserTransitions(merchantId, workerNames);
    
    // Calculate levels based on new user transitions only
    const newUserLevels = this.calculateNewUserDAGLevels(merchantId, workerNames);
    
    // Get valuable campaigns analysis
    const valuableAnalysis = this.getValuableCampaignsAnalysis(merchantId, workerNames);

    // Build level stats - ONLY include campaigns that new users actually received
    // Filter out campaigns with 0 new users (these are only received by old users)
    const levelStats: CampaignLevelStats[] = coverage
      .filter(c => c.newUserCount > 0) // Only campaigns received by new users
      .map(c => ({
        campaignId: c.campaignId,
        subject: c.subject,
        tag: c.tag,
        isValuable: c.isValuable,
        level: newUserLevels.get(c.campaignId) || 1,
        isRoot: rootCampaigns.some(r => r.campaignId === c.campaignId && r.isConfirmed),
        userCount: c.newUserCount,
        coverage: c.newUserCoverage,
      }));

    // Sort by level, then by coverage
    levelStats.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return b.coverage - a.coverage;
    });

    // Old user stats (campaigns with old users)
    const oldUserStats = coverage
      .filter(c => c.oldUserCount > 0)
      .sort((a, b) => b.oldUserCount - a.oldUserCount);

    return {
      merchantId,
      rootCampaigns,
      userStats,
      levelStats,
      transitions: newUserTransitions.transitions,
      valuableAnalysis: valuableAnalysis.valuableCampaigns,
      oldUserStats,
    };
  }

  /**
   * Calculate DAG levels based on new user transitions only
   * Root campaigns (confirmed) are always Level 1
   * Other campaigns get levels based on their position in new user paths
   * 
   * @param merchantId - Merchant ID
   * @param workerNames - Optional array of worker names for multi-worker filtering. Empty array or undefined includes all workers.
   * @returns Map of campaignId to level
   */
  private calculateNewUserDAGLevels(merchantId: string, workerNames?: string[]): Map<string, number> {
    // Get confirmed root campaigns - these are always Level 1
    const rootCampaigns = this.db.prepare(`
      SELECT id FROM campaigns WHERE merchant_id = ? AND is_root = 1
    `).all(merchantId) as Array<{ id: string }>;
    const rootIds = new Set(rootCampaigns.map(r => r.id));

    // Get new user transitions
    const transitions = this.getNewUserTransitions(merchantId, workerNames);
    
    // Build adjacency list
    const outEdges = new Map<string, string[]>();
    const allCampaigns = new Set<string>();

    for (const t of transitions.transitions) {
      allCampaigns.add(t.fromCampaignId);
      allCampaigns.add(t.toCampaignId);

      if (!outEdges.has(t.fromCampaignId)) outEdges.set(t.fromCampaignId, []);
      outEdges.get(t.fromCampaignId)!.push(t.toCampaignId);
    }

    // BFS from root campaigns
    const levels = new Map<string, number>();
    const queue: string[] = [];

    // Start with root campaigns at Level 1
    for (const rootId of rootIds) {
      if (allCampaigns.has(rootId)) {
        levels.set(rootId, 1);
        queue.push(rootId);
      }
    }

    // If no root campaigns, find campaigns with no incoming edges
    if (queue.length === 0) {
      const hasIncoming = new Set<string>();
      for (const t of transitions.transitions) {
        hasIncoming.add(t.toCampaignId);
      }
      for (const campaignId of allCampaigns) {
        if (!hasIncoming.has(campaignId)) {
          levels.set(campaignId, 1);
          queue.push(campaignId);
        }
      }
    }

    // BFS to assign levels
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentLevel = levels.get(current) || 1;
      const neighbors = outEdges.get(current) || [];

      for (const neighbor of neighbors) {
        const existingLevel = levels.get(neighbor);
        const newLevel = currentLevel + 1;
        
        // Only update if we haven't visited or found a shorter path
        if (existingLevel === undefined || newLevel < existingLevel) {
          levels.set(neighbor, newLevel);
          queue.push(neighbor);
        }
      }
    }

    return levels;
  }

  // ============================================
  // Data Management Methods (数据管理)
  // ============================================

  /**
   * Get data statistics for all merchants
   * 统计各类数据占用情况
   * 
   * @param workerName - Optional worker name filter for instance-based filtering (Requirements: 4.5)
   */
  getDataStatistics(workerName?: string): {
    totalMerchants: number;
    activeMerchants: number;
    pendingMerchants: number;
    ignoredMerchants: number;
    totalCampaigns: number;
    totalEmails: number;
    totalPaths: number;
    byStatus: {
      status: string;
      merchants: number;
      campaigns: number;
      emails: number;
      paths: number;
    }[];
  } {
    // Build worker filter condition for campaign_emails
    const workerFilter = workerName ? 'AND ce.worker_name = ?' : '';
    const workerParams = workerName ? [workerName] : [];

    if (workerName) {
      // When filtering by worker, we need to find merchants that have emails from this worker
      const merchantsWithWorker = this.db.prepare(`
        SELECT DISTINCT m.id, COALESCE(m.analysis_status, 'pending') as status
        FROM merchants m
        JOIN campaigns c ON m.id = c.merchant_id
        JOIN campaign_emails ce ON c.id = ce.campaign_id
        WHERE ce.worker_name = ?
      `).all(workerName) as Array<{ id: string; status: string }>;

      const statusCounts = { active: 0, pending: 0, ignored: 0 };
      merchantsWithWorker.forEach(m => {
        if (m.status in statusCounts) {
          statusCounts[m.status as keyof typeof statusCounts]++;
        }
      });

      // Get totals filtered by worker
      const totals = this.db.prepare(`
        SELECT 
          COUNT(DISTINCT m.id) as total_merchants,
          COUNT(DISTINCT c.id) as total_campaigns,
          COUNT(ce.id) as total_emails,
          (SELECT COUNT(*) FROM recipient_paths rp 
           JOIN campaigns c2 ON rp.campaign_id = c2.id 
           JOIN campaign_emails ce2 ON c2.id = ce2.campaign_id
           WHERE ce2.worker_name = ?) as total_paths
        FROM merchants m
        JOIN campaigns c ON m.id = c.merchant_id
        JOIN campaign_emails ce ON c.id = ce.campaign_id
        WHERE ce.worker_name = ?
      `).get(workerName, workerName) as { total_merchants: number; total_campaigns: number; total_emails: number; total_paths: number };

      // Get detailed stats by status for this worker
      const detailedStats = this.db.prepare(`
        SELECT 
          COALESCE(m.analysis_status, 'pending') as status,
          COUNT(DISTINCT m.id) as merchants,
          COUNT(DISTINCT c.id) as campaigns,
          COUNT(ce.id) as emails,
          0 as paths
        FROM merchants m
        JOIN campaigns c ON m.id = c.merchant_id
        JOIN campaign_emails ce ON c.id = ce.campaign_id
        WHERE ce.worker_name = ?
        GROUP BY COALESCE(m.analysis_status, 'pending')
      `).all(workerName) as Array<{ status: string; merchants: number; campaigns: number; emails: number; paths: number }>;

      return {
        totalMerchants: totals.total_merchants,
        activeMerchants: statusCounts.active,
        pendingMerchants: statusCounts.pending,
        ignoredMerchants: statusCounts.ignored,
        totalCampaigns: totals.total_campaigns,
        totalEmails: totals.total_emails,
        totalPaths: totals.total_paths,
        byStatus: detailedStats,
      };
    }

    // Original logic for no worker filter
    // Get merchant counts by status
    const merchantStats = this.db.prepare(`
      SELECT 
        COALESCE(analysis_status, 'pending') as status,
        COUNT(*) as merchant_count
      FROM merchants
      GROUP BY COALESCE(analysis_status, 'pending')
    `).all() as Array<{ status: string; merchant_count: number }>;

    // Get detailed stats by status
    const detailedStats = this.db.prepare(`
      SELECT 
        COALESCE(m.analysis_status, 'pending') as status,
        COUNT(DISTINCT m.id) as merchants,
        COUNT(DISTINCT c.id) as campaigns,
        COALESCE(SUM(c.total_emails), 0) as emails,
        (SELECT COUNT(*) FROM recipient_paths rp 
         JOIN campaigns c2 ON rp.campaign_id = c2.id 
         WHERE c2.merchant_id IN (
           SELECT id FROM merchants WHERE COALESCE(analysis_status, 'pending') = COALESCE(m.analysis_status, 'pending')
         )) as paths
      FROM merchants m
      LEFT JOIN campaigns c ON m.id = c.merchant_id
      GROUP BY COALESCE(m.analysis_status, 'pending')
    `).all() as Array<{ status: string; merchants: number; campaigns: number; emails: number; paths: number }>;

    // Get totals
    const totals = this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM merchants) as total_merchants,
        (SELECT COUNT(*) FROM campaigns) as total_campaigns,
        (SELECT COUNT(*) FROM campaign_emails) as total_emails,
        (SELECT COUNT(*) FROM recipient_paths) as total_paths
    `).get() as { total_merchants: number; total_campaigns: number; total_emails: number; total_paths: number };

    const statusCounts = {
      active: 0,
      pending: 0,
      ignored: 0,
    };
    merchantStats.forEach(s => {
      if (s.status in statusCounts) {
        statusCounts[s.status as keyof typeof statusCounts] = s.merchant_count;
      }
    });

    return {
      totalMerchants: totals.total_merchants,
      activeMerchants: statusCounts.active,
      pendingMerchants: statusCounts.pending,
      ignoredMerchants: statusCounts.ignored,
      totalCampaigns: totals.total_campaigns,
      totalEmails: totals.total_emails,
      totalPaths: totals.total_paths,
      byStatus: detailedStats,
    };
  }

  /**
   * Clean up data for ignored merchants
   * 清理已忽略商户的营销数据
   * 
   * @param workerName - Optional worker name filter for instance-based cleanup (Requirements: 4.5)
   * @returns Number of records deleted
   */
  cleanupIgnoredMerchantData(workerName?: string): {
    merchantsDeleted: number;
    campaignsDeleted: number;
    emailsDeleted: number;
    pathsDeleted: number;
  } {
    // Check if merchant_worker_status table exists
    const workerStatusTableExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_worker_status'
    `).get();

    // Get ignored merchant IDs based on workerName
    let ignoredMerchants: Array<{ id: string }>;

    if (workerName && workerName !== 'global' && workerStatusTableExists) {
      // Get merchants ignored for this specific worker instance
      ignoredMerchants = this.db.prepare(`
        SELECT merchant_id as id FROM merchant_worker_status 
        WHERE worker_name = ? AND analysis_status = 'ignored'
      `).all(workerName) as Array<{ id: string }>;
    } else {
      // Get globally ignored merchants (from merchants table OR from any worker status)
      if (workerStatusTableExists) {
        // Include merchants ignored globally OR ignored in any worker instance
        ignoredMerchants = this.db.prepare(`
          SELECT DISTINCT id FROM (
            SELECT id FROM merchants WHERE analysis_status = 'ignored'
            UNION
            SELECT merchant_id as id FROM merchant_worker_status WHERE analysis_status = 'ignored'
          )
        `).all() as Array<{ id: string }>;
      } else {
        ignoredMerchants = this.db.prepare(`
          SELECT id FROM merchants WHERE analysis_status = 'ignored'
        `).all() as Array<{ id: string }>;
      }
    }

    if (ignoredMerchants.length === 0) {
      return { merchantsDeleted: 0, campaignsDeleted: 0, emailsDeleted: 0, pathsDeleted: 0 };
    }

    const merchantIds = ignoredMerchants.map(m => m.id);
    const placeholders = merchantIds.map(() => '?').join(',');

    // If workerName is specified (not global), only delete emails from that worker
    // Otherwise delete all data for ignored merchants
    if (workerName && workerName !== 'global') {
      // Get campaign IDs for these merchants
      const campaigns = this.db.prepare(`
        SELECT id FROM campaigns WHERE merchant_id IN (${placeholders})
      `).all(...merchantIds) as Array<{ id: string }>;

      let emailsDeleted = 0;
      if (campaigns.length > 0) {
        const campaignIds = campaigns.map(c => c.id);
        const campaignPlaceholders = campaignIds.map(() => '?').join(',');

        // Delete campaign emails only for the specified worker
        const emailsResult = this.db.prepare(`
          DELETE FROM campaign_emails 
          WHERE campaign_id IN (${campaignPlaceholders}) AND worker_name = ?
        `).run(...campaignIds, workerName);
        emailsDeleted = emailsResult.changes;
      }

      // Delete the worker-specific status records for these merchants
      if (workerStatusTableExists) {
        for (const merchantId of merchantIds) {
          this.db.prepare(`
            DELETE FROM merchant_worker_status 
            WHERE merchant_id = ? AND worker_name = ?
          `).run(merchantId, workerName);
        }
      }

      // Don't delete merchants, campaigns, or paths when filtering by worker
      // Only delete the emails from that specific worker
      return {
        merchantsDeleted: 0,
        campaignsDeleted: 0,
        emailsDeleted,
        pathsDeleted: 0,
      };
    }

    // Original logic: delete all data for ignored merchants
    // Delete recipient paths
    const pathsResult = this.db.prepare(`
      DELETE FROM recipient_paths WHERE merchant_id IN (${placeholders})
    `).run(...merchantIds);

    // Get campaign IDs for these merchants
    const campaigns = this.db.prepare(`
      SELECT id FROM campaigns WHERE merchant_id IN (${placeholders})
    `).all(...merchantIds) as Array<{ id: string }>;

    let emailsDeleted = 0;
    if (campaigns.length > 0) {
      const campaignIds = campaigns.map(c => c.id);
      const campaignPlaceholders = campaignIds.map(() => '?').join(',');

      // Delete campaign emails
      const emailsResult = this.db.prepare(`
        DELETE FROM campaign_emails WHERE campaign_id IN (${campaignPlaceholders})
      `).run(...campaignIds);
      emailsDeleted = emailsResult.changes;
    }

    // Delete campaigns
    const campaignsResult = this.db.prepare(`
      DELETE FROM campaigns WHERE merchant_id IN (${placeholders})
    `).run(...merchantIds);

    // Delete worker status records for these merchants (global cleanup)
    if (workerStatusTableExists) {
      this.db.prepare(`
        DELETE FROM merchant_worker_status WHERE merchant_id IN (${placeholders})
      `).run(...merchantIds);
    }

    // Delete merchants
    const merchantsResult = this.db.prepare(`
      DELETE FROM merchants WHERE id IN (${placeholders})
    `).run(...merchantIds);

    return {
      merchantsDeleted: merchantsResult.changes,
      campaignsDeleted: campaignsResult.changes,
      emailsDeleted,
      pathsDeleted: pathsResult.changes,
    };
  }

  /**
   * Clean up data for pending merchants older than specified days
   * 清理超过指定天数的待分析商户数据
   * 
   * @param days - Number of days to keep pending data
   * @param workerName - Optional worker name filter for instance-based cleanup (Requirements: 4.5)
   * @returns Number of records deleted
   */
  cleanupOldPendingData(days: number, workerName?: string): {
    merchantsDeleted: number;
    campaignsDeleted: number;
    emailsDeleted: number;
    pathsDeleted: number;
  } {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString();

    // Get old pending merchant IDs
    const oldPendingMerchants = this.db.prepare(`
      SELECT id FROM merchants 
      WHERE (analysis_status = 'pending' OR analysis_status IS NULL)
      AND created_at < ?
    `).all(cutoffStr) as Array<{ id: string }>;

    if (oldPendingMerchants.length === 0) {
      return { merchantsDeleted: 0, campaignsDeleted: 0, emailsDeleted: 0, pathsDeleted: 0 };
    }

    const merchantIds = oldPendingMerchants.map(m => m.id);
    const placeholders = merchantIds.map(() => '?').join(',');

    // If workerName is specified, only delete emails from that worker
    if (workerName) {
      // Get campaign IDs for these merchants
      const campaigns = this.db.prepare(`
        SELECT id FROM campaigns WHERE merchant_id IN (${placeholders})
      `).all(...merchantIds) as Array<{ id: string }>;

      let emailsDeleted = 0;
      if (campaigns.length > 0) {
        const campaignIds = campaigns.map(c => c.id);
        const campaignPlaceholders = campaignIds.map(() => '?').join(',');
        
        // Delete campaign emails only for the specified worker and older than cutoff
        const emailsResult = this.db.prepare(`
          DELETE FROM campaign_emails 
          WHERE campaign_id IN (${campaignPlaceholders}) 
          AND worker_name = ?
          AND received_at < ?
        `).run(...campaignIds, workerName, cutoffStr);
        emailsDeleted = emailsResult.changes;
      }

      // Don't delete merchants, campaigns, or paths when filtering by worker
      return {
        merchantsDeleted: 0,
        campaignsDeleted: 0,
        emailsDeleted,
        pathsDeleted: 0,
      };
    }

    // Original logic: delete all data for old pending merchants
    // Delete recipient paths
    const pathsResult = this.db.prepare(`
      DELETE FROM recipient_paths WHERE merchant_id IN (${placeholders})
    `).run(...merchantIds);

    // Get campaign IDs for these merchants
    const campaigns = this.db.prepare(`
      SELECT id FROM campaigns WHERE merchant_id IN (${placeholders})
    `).all(...merchantIds) as Array<{ id: string }>;

    let emailsDeleted = 0;
    if (campaigns.length > 0) {
      const campaignIds = campaigns.map(c => c.id);
      const campaignPlaceholders = campaignIds.map(() => '?').join(',');
      
      // Delete campaign emails
      const emailsResult = this.db.prepare(`
        DELETE FROM campaign_emails WHERE campaign_id IN (${campaignPlaceholders})
      `).run(...campaignIds);
      emailsDeleted = emailsResult.changes;
    }

    // Delete campaigns
    const campaignsResult = this.db.prepare(`
      DELETE FROM campaigns WHERE merchant_id IN (${placeholders})
    `).run(...merchantIds);

    // Delete merchants
    const merchantsResult = this.db.prepare(`
      DELETE FROM merchants WHERE id IN (${placeholders})
    `).run(...merchantIds);

    return {
      merchantsDeleted: merchantsResult.changes,
      campaignsDeleted: campaignsResult.changes,
      emailsDeleted,
      pathsDeleted: pathsResult.changes,
    };
  }

  /**
   * Clean up old user path data for a merchant
   * 清理商户的老用户路径数据（保留统计信息）
   * 
   * @param merchantId - Merchant ID
   * @returns Number of paths deleted
   */
  cleanupOldUserPaths(merchantId: string): {
    pathsDeleted: number;
    oldUsersAffected: number;
  } {
    // Get count of old users before cleanup
    const oldUserCount = this.db.prepare(`
      SELECT COUNT(DISTINCT recipient) as count
      FROM recipient_paths
      WHERE merchant_id = ? AND (is_new_user = 0 OR is_new_user IS NULL)
    `).get(merchantId) as { count: number };

    // Delete paths for old users (is_new_user = 0 or NULL)
    // Keep the first entry for each old user to maintain basic stats
    const result = this.db.prepare(`
      DELETE FROM recipient_paths
      WHERE merchant_id = ? 
        AND (is_new_user = 0 OR is_new_user IS NULL)
        AND sequence_order > 0
    `).run(merchantId);

    return {
      pathsDeleted: result.changes,
      oldUsersAffected: oldUserCount.count,
    };
  }

  /**
   * Clean up all old user path data for a merchant (complete cleanup)
   * 完全清理商户的老用户路径数据
   * 
   * @param merchantId - Merchant ID
   * @returns Number of paths deleted
   */
  cleanupAllOldUserPaths(merchantId: string): {
    pathsDeleted: number;
    oldUsersAffected: number;
  } {
    // Find old users: recipients with sequence_order > 1 (have received multiple campaigns)
    const oldUsers = this.db
      .prepare(
        `
      SELECT DISTINCT recipient
      FROM recipient_paths
      WHERE merchant_id = ? AND sequence_order > 1
    `
      )
      .all(merchantId) as { recipient: string }[];

    if (oldUsers.length === 0) {
      return {
        pathsDeleted: 0,
        oldUsersAffected: 0,
      };
    }

    // Delete all paths for old users (including their first campaign)
    const oldUserRecipients = oldUsers.map((u) => u.recipient);

    let totalDeleted = 0;
    for (const recipient of oldUserRecipients) {
      const result = this.db
        .prepare(
          `
        DELETE FROM recipient_paths
        WHERE merchant_id = ? AND recipient = ?
      `
        )
        .run(merchantId, recipient);
      totalDeleted += result.changes;
    }

    return {
      pathsDeleted: totalDeleted,
      oldUsersAffected: oldUsers.length,
    };
  }

  /**
   * Check if merchant should record data (selective recording)
   * 检查商户是否应该记录数据
   * 
   * @param merchantId - Merchant ID
   * @returns true if data should be recorded
   */
  shouldRecordData(merchantId: string): boolean {
    const merchant = this.db.prepare(`
      SELECT analysis_status FROM merchants WHERE id = ?
    `).get(merchantId) as { analysis_status: string | null } | undefined;

    if (!merchant) return true; // New merchant, record by default
    
    // Don't record for ignored merchants
    return merchant.analysis_status !== 'ignored';
  }

  /**
   * Track email with selective recording
   * 选择性记录邮件（忽略的商户不记录详细数据）
   * 
   * @param data - Email tracking data
   * @param skipIgnored - If true, skip recording for ignored merchants
   * @returns TrackResult or null if skipped
   */
  trackEmailSelective(data: TrackEmailDTO, skipIgnored: boolean = true): TrackResult | null {
    const domain = extractDomain(data.sender);
    if (!domain) {
      throw new Error('Invalid sender email address');
    }

    // Check if merchant exists and is ignored
    const existingMerchant = this.getMerchantByDomain(domain);
    if (existingMerchant && skipIgnored && existingMerchant.analysisStatus === 'ignored') {
      // Only update email count, don't record detailed data
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE merchants SET total_emails = total_emails + 1, updated_at = ? WHERE id = ?
      `).run(now, existingMerchant.id);
      
      return null; // Indicate data was not fully recorded
    }

    // Use normal tracking for non-ignored merchants
    return this.trackEmail(data);
  }

  // ============================================
  // Analysis Project Methods
  // ============================================

  /**
   * Get all analysis projects with optional filtering
   * 
   * @param filter - Optional filter (workerName, status)
   * @returns Array of AnalysisProject objects
   */
  getAnalysisProjects(filter?: { workerName?: string; status?: AnalysisProjectStatus }): AnalysisProject[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter?.workerName) {
      conditions.push('ap.worker_name = ?');
      params.push(filter.workerName);
    }

    if (filter?.status) {
      conditions.push('ap.status = ?');
      params.push(filter.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const stmt = this.db.prepare(`
      SELECT 
        ap.*,
        m.domain as merchant_domain,
        COALESCE(wc.campaign_count, 0) as total_campaigns,
        COALESCE(wc.email_count, 0) as total_emails
      FROM analysis_projects ap
      LEFT JOIN merchants m ON ap.merchant_id = m.id
      LEFT JOIN (
        SELECT 
          c.merchant_id,
          ce.worker_name,
          COUNT(DISTINCT c.id) as campaign_count,
          COUNT(ce.id) as email_count
        FROM campaigns c
        JOIN campaign_emails ce ON c.id = ce.campaign_id
        GROUP BY c.merchant_id, ce.worker_name
      ) wc ON ap.merchant_id = wc.merchant_id AND ap.worker_name = wc.worker_name
      ${whereClause}
      ORDER BY ap.created_at DESC
    `);

    const rows = stmt.all(...params) as AnalysisProjectRow[];
    return rows.map(toAnalysisProject);
  }

  /**
   * Get analysis project by ID
   * 
   * @param id - Project ID
   * @returns AnalysisProject or null
   */
  getAnalysisProjectById(id: string): AnalysisProject | null {
    const stmt = this.db.prepare(`
      SELECT 
        ap.*,
        m.domain as merchant_domain,
        COALESCE(wc.campaign_count, 0) as total_campaigns,
        COALESCE(wc.email_count, 0) as total_emails
      FROM analysis_projects ap
      LEFT JOIN merchants m ON ap.merchant_id = m.id
      LEFT JOIN (
        SELECT 
          c.merchant_id,
          ce.worker_name,
          COUNT(DISTINCT c.id) as campaign_count,
          COUNT(ce.id) as email_count
        FROM campaigns c
        JOIN campaign_emails ce ON c.id = ce.campaign_id
        GROUP BY c.merchant_id, ce.worker_name
      ) wc ON ap.merchant_id = wc.merchant_id AND ap.worker_name = wc.worker_name
      WHERE ap.id = ?
    `);

    const row = stmt.get(id) as AnalysisProjectRow | undefined;
    return row ? toAnalysisProject(row) : null;
  }

  /**
   * Create a new analysis project
   * 
   * @param data - Project creation data
   * @returns Created AnalysisProject
   */
  createAnalysisProject(data: CreateAnalysisProjectDTO): AnalysisProject {
    const id = uuidv4();
    const now = new Date().toISOString();

    // Check if merchant exists
    const merchant = this.getMerchantById(data.merchantId);
    if (!merchant) {
      throw new Error('Merchant not found');
    }

    // Serialize workerNames to JSON if provided
    const workerNamesJson = data.workerNames && data.workerNames.length > 0 
      ? JSON.stringify(data.workerNames) 
      : null;

    const stmt = this.db.prepare(`
      INSERT INTO analysis_projects (id, name, merchant_id, worker_name, worker_names, status, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `);

    stmt.run(id, data.name, data.merchantId, data.workerName, workerNamesJson, data.note || null, now, now);

    return this.getAnalysisProjectById(id)!;
  }

  /**
   * Update an analysis project
   * 
   * @param id - Project ID
   * @param data - Update data
   * @returns Updated AnalysisProject or null
   */
  updateAnalysisProject(id: string, data: UpdateAnalysisProjectDTO): AnalysisProject | null {
    const now = new Date().toISOString();

    // Check if project exists
    const existing = this.getAnalysisProjectById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = ['updated_at = ?'];
    const params: (string | null)[] = [now];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }

    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
    }

    if (data.workerNames !== undefined) {
      updates.push('worker_names = ?');
      params.push(data.workerNames.length > 0 ? JSON.stringify(data.workerNames) : null);
    }

    if (data.note !== undefined) {
      updates.push('note = ?');
      params.push(data.note || null);
    }

    params.push(id);

    this.db.prepare(`
      UPDATE analysis_projects SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    return this.getAnalysisProjectById(id);
  }

  /**
   * Delete an analysis project
   * 
   * @param id - Project ID
   * @returns true if deleted, false if not found
   */
  deleteAnalysisProject(id: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM analysis_projects WHERE id = ?
    `).run(id);

    return result.changes > 0;
  }

  /**
   * Get merchants for a specific worker (for project creation)
   * Only returns merchants that have emails from this worker
   * 
   * @param workerName - Worker name
   * @returns Array of Merchant objects
   */
  getMerchantsForWorker(workerName: string): Merchant[] {
    const stmt = this.db.prepare(`
      SELECT 
        m.*,
        COALESCE(wc.campaign_count, 0) as total_campaigns,
        COALESCE(wc.email_count, 0) as total_emails,
        COALESCE(wc.valuable_count, 0) as valuable_campaigns
      FROM merchants m
      INNER JOIN (
        SELECT 
          c.merchant_id,
          COUNT(DISTINCT c.id) as campaign_count,
          COUNT(ce.id) as email_count,
          COUNT(DISTINCT CASE WHEN c.is_valuable = 1 THEN c.id END) as valuable_count
        FROM campaigns c
        JOIN campaign_emails ce ON c.id = ce.campaign_id
        WHERE ce.worker_name = ?
        GROUP BY c.merchant_id
      ) wc ON m.id = wc.merchant_id
      ORDER BY wc.email_count DESC
    `);

    const rows = stmt.all(workerName) as MerchantRow[];
    return rows.map(toMerchant);
  }

  /**
   * Get all merchants grouped by Worker instance
   * Returns separate entries for each merchant-worker combination
   * 
   * @param workerName - Optional worker name to filter by
   * @returns Array of MerchantByWorker objects
   * 
   * Requirements: 1.1, 1.2, 1.3, 3.2, 3.3
   */
  getMerchantsByWorker(workerName?: string): MerchantByWorker[] {
    let query: string;
    let params: string[];

    if (workerName) {
      // Filter by specific worker
      query = `
        SELECT 
          m.id,
          m.domain,
          m.display_name,
          m.note,
          ce.worker_name,
          COUNT(DISTINCT c.id) as total_campaigns,
          COUNT(ce.id) as total_emails
        FROM merchants m
        JOIN campaigns c ON m.id = c.merchant_id
        JOIN campaign_emails ce ON c.id = ce.campaign_id
        WHERE ce.worker_name = ?
        GROUP BY m.id, ce.worker_name
        ORDER BY total_emails DESC
      `;
      params = [workerName];
    } else {
      // Get all merchants grouped by worker
      query = `
        SELECT 
          m.id,
          m.domain,
          m.display_name,
          m.note,
          ce.worker_name,
          COUNT(DISTINCT c.id) as total_campaigns,
          COUNT(ce.id) as total_emails
        FROM merchants m
        JOIN campaigns c ON m.id = c.merchant_id
        JOIN campaign_emails ce ON c.id = ce.campaign_id
        GROUP BY m.id, ce.worker_name
        ORDER BY ce.worker_name, total_emails DESC
      `;
      params = [];
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      id: string;
      domain: string;
      display_name: string | null;
      note: string | null;
      worker_name: string;
      total_campaigns: number;
      total_emails: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      domain: row.domain,
      displayName: row.display_name || undefined,
      note: row.note || undefined,
      workerName: row.worker_name,
      totalCampaigns: row.total_campaigns,
      totalEmails: row.total_emails,
    }));
  }

  // ============================================
  // Merchant Data Deletion Methods
  // ============================================

  /**
   * Delete merchant data for a specific worker
   * Removes all emails and paths associated with the merchant for the given worker.
   * If the merchant has no remaining data in any worker, the merchant record is also deleted.
   * 
   * Uses transaction to ensure atomicity of the operation.
   * 
   * @param data - DeleteMerchantDataDTO containing merchantId and workerName
   * @returns DeleteMerchantDataResult with deletion statistics
   * @throws Error if merchant not found
   * 
   * Requirements: 3.2, 3.3, 3.5, 3.6
   */
  deleteMerchantData(data: DeleteMerchantDataDTO): DeleteMerchantDataResult {
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

    // Use transaction to ensure atomicity
    const transaction = this.db.transaction(() => {
      // Step 1: Get all campaign IDs for this merchant
      const campaignIds = this.db.prepare(`
        SELECT id FROM campaigns WHERE merchant_id = ?
      `).all(merchantId) as Array<{ id: string }>;

      const campaignIdList = campaignIds.map(c => c.id);

      if (campaignIdList.length > 0) {
        // Step 2: Get recipients that had emails from this worker for this merchant BEFORE deleting
        // We need to delete paths for recipients whose emails were all from this worker
        const recipientsWithWorkerEmails = this.db.prepare(`
          SELECT DISTINCT recipient FROM campaign_emails 
          WHERE campaign_id IN (${campaignIdList.map(() => '?').join(',')}) 
          AND worker_name = ?
        `).all(...campaignIdList, workerName) as Array<{ recipient: string }>;

        // Step 3: Count and delete campaign_emails for this worker
        const emailCountResult = this.db.prepare(`
          SELECT COUNT(*) as count FROM campaign_emails 
          WHERE campaign_id IN (${campaignIdList.map(() => '?').join(',')}) 
          AND worker_name = ?
        `).get(...campaignIdList, workerName) as { count: number };
        emailsDeleted = emailCountResult.count;

        // Delete the emails
        if (emailsDeleted > 0) {
          this.db.prepare(`
            DELETE FROM campaign_emails 
            WHERE campaign_id IN (${campaignIdList.map(() => '?').join(',')}) 
            AND worker_name = ?
          `).run(...campaignIdList, workerName);
        }

        // For each recipient, check if they still have emails from other workers
        // If not, delete their paths for this merchant
        for (const { recipient } of recipientsWithWorkerEmails) {
          const remainingEmails = this.db.prepare(`
            SELECT COUNT(*) as count FROM campaign_emails 
            WHERE campaign_id IN (${campaignIdList.map(() => '?').join(',')}) 
            AND recipient = ?
            AND worker_name != ?
          `).get(...campaignIdList, recipient, workerName) as { count: number };

          if (remainingEmails.count === 0) {
            // Delete all paths for this recipient and merchant
            const pathDeleteResult = this.db.prepare(`
              DELETE FROM recipient_paths 
              WHERE merchant_id = ? AND recipient = ?
            `).run(merchantId, recipient);
            pathsDeleted += pathDeleteResult.changes;
          }
        }

        // Step 4: Count affected campaigns (based on emails we already counted before deletion)
        // Since we deleted emails, we count campaigns that had emails from this worker
        // by checking which campaigns had recipients in our recipientsWithWorkerEmails list
        campaignsAffected = emailsDeleted > 0 ? campaignIdList.length : 0;

        // Step 5: Update campaign statistics (total_emails, unique_recipients)
        for (const campaignId of campaignIdList) {
          // Recalculate total_emails
          const emailCount = this.db.prepare(`
            SELECT COUNT(*) as count FROM campaign_emails WHERE campaign_id = ?
          `).get(campaignId) as { count: number };

          // Recalculate unique_recipients
          const recipientCount = this.db.prepare(`
            SELECT COUNT(DISTINCT recipient) as count FROM campaign_emails WHERE campaign_id = ?
          `).get(campaignId) as { count: number };

          this.db.prepare(`
            UPDATE campaigns 
            SET total_emails = ?, unique_recipients = ?, updated_at = ?
            WHERE id = ?
          `).run(emailCount.count, recipientCount.count, new Date().toISOString(), campaignId);
        }
      }

      // Step 6: Check if merchant has any remaining data in any worker
      const remainingEmailsResult = this.db.prepare(`
        SELECT COUNT(*) as count FROM campaign_emails 
        WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?)
      `).get(merchantId) as { count: number };

      if (remainingEmailsResult.count === 0) {
        // No remaining emails, delete the merchant and related data
        
        // Delete all campaigns for this merchant
        this.db.prepare(`
          DELETE FROM campaigns WHERE merchant_id = ?
        `).run(merchantId);

        // Delete all remaining paths for this merchant
        this.db.prepare(`
          DELETE FROM recipient_paths WHERE merchant_id = ?
        `).run(merchantId);

        // Delete merchant_worker_status if exists
        const workerStatusTableExists = this.db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_worker_status'
        `).get();
        if (workerStatusTableExists) {
          this.db.prepare(`
            DELETE FROM merchant_worker_status WHERE merchant_id = ?
          `).run(merchantId);
        }

        // Delete the merchant record
        this.db.prepare(`
          DELETE FROM merchants WHERE id = ?
        `).run(merchantId);

        merchantDeleted = true;
      } else {
        // Update merchant statistics
        const now = new Date().toISOString();

        // Recalculate total_emails
        const totalEmails = this.db.prepare(`
          SELECT COUNT(*) as count FROM campaign_emails 
          WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?)
        `).get(merchantId) as { count: number };

        // Recalculate total_campaigns (campaigns with at least one email)
        const totalCampaigns = this.db.prepare(`
          SELECT COUNT(DISTINCT c.id) as count 
          FROM campaigns c
          JOIN campaign_emails ce ON c.id = ce.campaign_id
          WHERE c.merchant_id = ?
        `).get(merchantId) as { count: number };

        this.db.prepare(`
          UPDATE merchants 
          SET total_emails = ?, total_campaigns = ?, updated_at = ?
          WHERE id = ?
        `).run(totalEmails.count, totalCampaigns.count, now, merchantId);
      }
    });

    // Execute the transaction
    transaction();

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
   * Get list of worker names that exist in campaign_emails but may be orphaned
   * Returns all unique worker names from the database
   */
  getOrphanedWorkers(): Array<{ workerName: string; emailCount: number; merchantCount: number }> {
    const stmt = this.db.prepare(`
      SELECT 
        ce.worker_name,
        COUNT(ce.id) as email_count,
        COUNT(DISTINCT c.merchant_id) as merchant_count
      FROM campaign_emails ce
      JOIN campaigns c ON ce.campaign_id = c.id
      GROUP BY ce.worker_name
      ORDER BY email_count DESC
    `);

    const rows = stmt.all() as Array<{
      worker_name: string;
      email_count: number;
      merchant_count: number;
    }>;

    return rows.map(row => ({
      workerName: row.worker_name,
      emailCount: row.email_count,
      merchantCount: row.merchant_count,
    }));
  }

  /**
   * Delete all data for a specific worker (used for cleaning up orphaned worker data)
   * This is a more aggressive delete that removes all emails for a worker across all merchants
   */
  deleteOrphanedWorkerData(workerName: string): {
    emailsDeleted: number;
    pathsDeleted: number;
    merchantsAffected: number;
    merchantsDeleted: number;
  } {
    let emailsDeleted = 0;
    let pathsDeleted = 0;
    let merchantsAffected = 0;
    let merchantsDeleted = 0;

    const transaction = this.db.transaction(() => {
      // Step 1: Get all merchants that have data from this worker
      const affectedMerchants = this.db.prepare(`
        SELECT DISTINCT c.merchant_id
        FROM campaigns c
        JOIN campaign_emails ce ON c.id = ce.campaign_id
        WHERE ce.worker_name = ?
      `).all(workerName) as Array<{ merchant_id: string }>;

      merchantsAffected = affectedMerchants.length;

      // Step 2: For each merchant, get recipients that only have emails from this worker
      for (const { merchant_id: merchantId } of affectedMerchants) {
        const campaignIds = this.db.prepare(`
          SELECT id FROM campaigns WHERE merchant_id = ?
        `).all(merchantId) as Array<{ id: string }>;

        const campaignIdList = campaignIds.map(c => c.id);

        if (campaignIdList.length > 0) {
          // Get recipients that had emails from this worker
          const recipientsWithWorkerEmails = this.db.prepare(`
            SELECT DISTINCT recipient FROM campaign_emails 
            WHERE campaign_id IN (${campaignIdList.map(() => '?').join(',')}) 
            AND worker_name = ?
          `).all(...campaignIdList, workerName) as Array<{ recipient: string }>;

          // Delete emails for this worker
          const deleteResult = this.db.prepare(`
            DELETE FROM campaign_emails 
            WHERE campaign_id IN (${campaignIdList.map(() => '?').join(',')}) 
            AND worker_name = ?
          `).run(...campaignIdList, workerName);
          emailsDeleted += deleteResult.changes;

          // For each recipient, check if they still have emails from other workers
          for (const { recipient } of recipientsWithWorkerEmails) {
            const remainingEmails = this.db.prepare(`
              SELECT COUNT(*) as count FROM campaign_emails 
              WHERE campaign_id IN (${campaignIdList.map(() => '?').join(',')}) 
              AND recipient = ?
            `).get(...campaignIdList, recipient) as { count: number };

            if (remainingEmails.count === 0) {
              const pathDeleteResult = this.db.prepare(`
                DELETE FROM recipient_paths 
                WHERE merchant_id = ? AND recipient = ?
              `).run(merchantId, recipient);
              pathsDeleted += pathDeleteResult.changes;
            }
          }

          // Update campaign statistics
          for (const campaignId of campaignIdList) {
            const emailCount = this.db.prepare(`
              SELECT COUNT(*) as count FROM campaign_emails WHERE campaign_id = ?
            `).get(campaignId) as { count: number };

            const recipientCount = this.db.prepare(`
              SELECT COUNT(DISTINCT recipient) as count FROM campaign_emails WHERE campaign_id = ?
            `).get(campaignId) as { count: number };

            this.db.prepare(`
              UPDATE campaigns 
              SET total_emails = ?, unique_recipients = ?, updated_at = ?
              WHERE id = ?
            `).run(emailCount.count, recipientCount.count, new Date().toISOString(), campaignId);
          }
        }

        // Check if merchant has any remaining emails
        const remainingEmails = this.db.prepare(`
          SELECT COUNT(*) as count FROM campaign_emails 
          WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?)
        `).get(merchantId) as { count: number };

        if (remainingEmails.count === 0) {
          // Delete merchant and all related data
          this.db.prepare(`DELETE FROM campaigns WHERE merchant_id = ?`).run(merchantId);
          this.db.prepare(`DELETE FROM recipient_paths WHERE merchant_id = ?`).run(merchantId);
          
          const workerStatusTableExists = this.db.prepare(`
            SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_worker_status'
          `).get();
          if (workerStatusTableExists) {
            this.db.prepare(`DELETE FROM merchant_worker_status WHERE merchant_id = ?`).run(merchantId);
          }
          
          this.db.prepare(`DELETE FROM merchants WHERE id = ?`).run(merchantId);
          merchantsDeleted++;
        } else {
          // Update merchant statistics
          const now = new Date().toISOString();
          const totalEmails = this.db.prepare(`
            SELECT COUNT(*) as count FROM campaign_emails 
            WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?)
          `).get(merchantId) as { count: number };

          const totalCampaigns = this.db.prepare(`
            SELECT COUNT(DISTINCT c.id) as count 
            FROM campaigns c
            JOIN campaign_emails ce ON c.id = ce.campaign_id
            WHERE c.merchant_id = ?
          `).get(merchantId) as { count: number };

          this.db.prepare(`
            UPDATE merchants 
            SET total_emails = ?, total_campaigns = ?, updated_at = ?
            WHERE id = ?
          `).run(totalEmails.count, totalCampaigns.count, now, merchantId);
        }
      }
    });

    transaction();

    return {
      emailsDeleted,
      pathsDeleted,
      merchantsAffected,
      merchantsDeleted,
    };
  }
}
