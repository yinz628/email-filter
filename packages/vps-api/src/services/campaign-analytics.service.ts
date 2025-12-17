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
} from '@email-filter/shared';
import { toMerchant, toCampaign, ROOT_CAMPAIGN_KEYWORDS } from '@email-filter/shared';

/**
 * Extract domain from email address
 * Returns the portion after the @ symbol in lowercase
 * 
 * @param email - Email address to extract domain from
 * @returns Domain string in lowercase, or null if invalid
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

  const domain = trimmed.substring(atIndex + 1).toLowerCase();
  
  // Basic validation: domain should have at least one dot and no spaces
  if (!domain || domain.includes(' ') || !domain.includes('.')) {
    return null;
  }

  return domain;
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
   * @param filter - Optional filter options
   * @returns Array of Merchant objects
   * 
   * Requirements: 1.3, 7.1
   */
  getMerchants(filter?: MerchantFilter): Merchant[] {
    const sortBy = filter?.sortBy || 'created_at';
    const sortOrder = filter?.sortOrder || 'desc';
    const limit = filter?.limit || 100;
    const offset = filter?.offset || 0;

    // Map sortBy to database column names
    const columnMap: Record<string, string> = {
      domain: 'm.domain',
      totalCampaigns: 'm.total_campaigns',
      totalEmails: 'm.total_emails',
      createdAt: 'm.created_at',
    };

    const column = columnMap[sortBy] || 'm.created_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Build WHERE clause for analysis status filter
    let whereClause = '';
    const params: (string | number)[] = [];
    
    if (filter?.analysisStatus) {
      whereClause = 'WHERE m.analysis_status = ?';
      params.push(filter.analysisStatus);
    }

    // Query merchants with valuable campaigns count calculated from campaigns table
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
   * Set merchant analysis status
   * 
   * @param id - Merchant ID
   * @param data - Status data
   * @returns Updated Merchant or null
   */
  setMerchantAnalysisStatus(id: string, data: SetMerchantAnalysisStatusDTO): Merchant | null {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      UPDATE merchants
      SET analysis_status = ?, updated_at = ?
      WHERE id = ?
    `);

    const result = stmt.run(data.status, now, id);
    
    if (result.changes === 0) {
      return null;
    }

    return this.getMerchantById(id);
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
   * @returns Merchant or null if not found
   */
  getMerchantById(id: string): Merchant | null {
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
    return row ? toMerchant(row) : null;
  }

  /**
   * Update merchant information
   * 
   * @param id - Merchant ID to update
   * @param data - Update data
   * @returns Updated Merchant or null if not found
   * 
   * Requirements: 1.4
   */
  updateMerchant(id: string, data: UpdateMerchantDTO): Merchant | null {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      UPDATE merchants
      SET display_name = COALESCE(?, display_name),
          note = COALESCE(?, note),
          updated_at = ?
      WHERE id = ?
    `);

    const result = stmt.run(
      data.displayName ?? null,
      data.note ?? null,
      now,
      id
    );

    if (result.changes === 0) {
      return null;
    }

    return this.getMerchantById(id);
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
   * @param filter - Optional filter options
   * @returns Array of Campaign objects
   * 
   * Requirements: 2.5, 3.3, 3.4
   */
  getCampaigns(filter?: CampaignFilter): Campaign[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter?.merchantId) {
      conditions.push('merchant_id = ?');
      params.push(filter.merchantId);
    }

    // Filter by specific tag
    if (filter?.tag !== undefined) {
      conditions.push('tag = ?');
      params.push(filter.tag);
    }

    // Exclude campaigns with specific tag (e.g., 4 for ignorable)
    if (filter?.excludeTag !== undefined) {
      conditions.push('(tag IS NULL OR tag != ?)');
      params.push(filter.excludeTag);
    }

    // Legacy isValuable filter (tag 1 or 2)
    if (filter?.isValuable !== undefined) {
      if (filter.isValuable) {
        conditions.push('(tag = 1 OR tag = 2)');
      } else {
        conditions.push('(tag IS NULL OR tag = 0 OR tag = 3 OR tag = 4)');
      }
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';

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
   * @param data - Email tracking data (sender, subject, recipient, receivedAt)
   * @returns TrackResult with merchant and campaign IDs
   * 
   * Requirements: 4.1, 4.2, 4.3
   */
  trackEmail(data: TrackEmailDTO): TrackResult {
    const domain = extractDomain(data.sender);
    if (!domain) {
      throw new Error('Invalid sender email address');
    }

    const receivedAt = data.receivedAt ? new Date(data.receivedAt) : new Date();
    const receivedAtStr = receivedAt.toISOString();
    const now = new Date().toISOString();

    // Get or create merchant
    const { merchant, isNew: isNewMerchant } = this.getOrCreateMerchant(domain);

    // Create or update campaign
    const { campaign, isNew: isNewCampaign } = this.createOrUpdateCampaign(
      merchant.id,
      data.subject,
      receivedAt
    );

    // Record the email in campaign_emails
    this.db.prepare(`
      INSERT INTO campaign_emails (campaign_id, recipient, received_at)
      VALUES (?, ?, ?)
    `).run(campaign.id, data.recipient, receivedAtStr);

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
   * @returns ValuableCampaignsAnalysis with detailed path info for valuable campaigns
   */
  getValuableCampaignsAnalysis(merchantId: string): ValuableCampaignsAnalysis {
    // Get all valuable campaigns for this merchant
    const valuableCampaignsStmt = this.db.prepare(`
      SELECT id, subject, unique_recipients
      FROM campaigns
      WHERE merchant_id = ? AND is_valuable = 1
      ORDER BY unique_recipients DESC
    `);

    const valuableCampaigns = valuableCampaignsStmt.all(merchantId) as Array<{
      id: string;
      subject: string;
      unique_recipients: number;
    }>;

    if (valuableCampaigns.length === 0) {
      return {
        merchantId,
        totalValuableCampaigns: 0,
        valuableCampaigns: [],
      };
    }

    // Get total recipients for percentage calculation
    const totalRecipientsStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT recipient) as total
      FROM recipient_paths
      WHERE merchant_id = ?
    `);
    const totalResult = totalRecipientsStmt.get(merchantId) as { total: number };
    const totalRecipients = totalResult.total;

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
   * @returns Array of RootCampaign
   */
  getRootCampaigns(merchantId: string): RootCampaign[] {
    // Get campaigns marked as root or candidate
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

  // ============================================
  // New/Old User Statistics (新老用户统计)
  // ============================================

  /**
   * Get user type statistics for a merchant
   * 
   * @param merchantId - Merchant ID
   * @returns UserTypeStats
   */
  getUserTypeStats(merchantId: string): UserTypeStats {
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
   * @returns Array of CampaignCoverage
   */
  getCampaignCoverage(merchantId: string): CampaignCoverage[] {
    const userStats = this.getUserTypeStats(merchantId);
    const levels = this.calculateDAGLevels(merchantId);

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
   * @returns CampaignTransitionsResult
   */
  getNewUserTransitions(merchantId: string): CampaignTransitionsResult {
    // Get paths for new users only
    const pathsStmt = this.db.prepare(`
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

  /**
   * Get complete path analysis result
   * Combines all analysis methods into a single comprehensive result
   * 
   * @param merchantId - Merchant ID
   * @returns PathAnalysisResult
   */
  getPathAnalysis(merchantId: string): PathAnalysisResult {
    const rootCampaigns = this.getRootCampaigns(merchantId);
    const userStats = this.getUserTypeStats(merchantId);
    const coverage = this.getCampaignCoverage(merchantId);
    
    // Get transitions for new users - this determines the actual path graph
    const newUserTransitions = this.getNewUserTransitions(merchantId);
    
    // Calculate levels based on new user transitions only
    const newUserLevels = this.calculateNewUserDAGLevels(merchantId);
    
    // Get valuable campaigns analysis
    const valuableAnalysis = this.getValuableCampaignsAnalysis(merchantId);

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
   * @returns Map of campaignId to level
   */
  private calculateNewUserDAGLevels(merchantId: string): Map<string, number> {
    // Get confirmed root campaigns - these are always Level 1
    const rootCampaigns = this.db.prepare(`
      SELECT id FROM campaigns WHERE merchant_id = ? AND is_root = 1
    `).all(merchantId) as Array<{ id: string }>;
    const rootIds = new Set(rootCampaigns.map(r => r.id));

    // Get new user transitions
    const transitions = this.getNewUserTransitions(merchantId);
    
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
}
