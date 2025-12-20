/**
 * Campaign Analytics Routes
 * API endpoints for campaign analytics functionality
 * 
 * Requirements: 1.3, 1.4, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.4, 5.1, 6.1, 8.1, 8.2, 8.4
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type {
  UpdateMerchantDTO,
  MarkValuableDTO,
  SetCampaignTagDTO,
  CampaignTag,
  TrackEmailDTO,
  TrackEmailBatchDTO,
  CampaignFilter,
  MerchantFilter,
  MerchantAnalysisStatus,
  SetMerchantAnalysisStatusDTO,
  AnalysisProjectStatus,
  CreateAnalysisProjectDTO,
  UpdateAnalysisProjectDTO,
} from '@email-filter/shared';
import { CampaignAnalyticsService } from '../services/campaign-analytics.service.js';
import { ProjectPathAnalysisService, type ProjectRootCampaign, type ProjectPathEdge, type AnalysisProgress } from '../services/project-path-analysis.service.js';
import { analysisQueue } from '../services/analysis-queue.service.js';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

// ============================================
// Validation Functions
// ============================================

/**
 * Validate UpdateMerchantDTO
 */
function validateUpdateMerchant(body: unknown): { valid: boolean; error?: string; data?: UpdateMerchantDTO } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;
  const updateData: UpdateMerchantDTO = {};

  if (data.displayName !== undefined) {
    if (typeof data.displayName !== 'string') {
      return { valid: false, error: 'displayName must be a string' };
    }
    updateData.displayName = data.displayName;
  }

  if (data.note !== undefined) {
    if (typeof data.note !== 'string') {
      return { valid: false, error: 'note must be a string' };
    }
    updateData.note = data.note;
  }

  return { valid: true, data: updateData };
}


/**
 * Validate MarkValuableDTO (legacy)
 */
function validateMarkValuable(body: unknown): { valid: boolean; error?: string; data?: MarkValuableDTO } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;

  if (typeof data.valuable !== 'boolean') {
    return { valid: false, error: 'valuable must be a boolean' };
  }

  const result: MarkValuableDTO = {
    valuable: data.valuable,
  };

  if (data.note !== undefined) {
    if (typeof data.note !== 'string') {
      return { valid: false, error: 'note must be a string' };
    }
    result.note = data.note;
  }

  return { valid: true, data: result };
}

/**
 * Validate SetCampaignTagDTO
 */
function validateSetCampaignTag(body: unknown): { valid: boolean; error?: string; data?: SetCampaignTagDTO } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;

  if (typeof data.tag !== 'number' || data.tag < 0 || data.tag > 4) {
    return { valid: false, error: 'tag must be a number between 0 and 4' };
  }

  const result: SetCampaignTagDTO = {
    tag: data.tag as CampaignTag,
  };

  if (data.note !== undefined) {
    if (typeof data.note !== 'string') {
      return { valid: false, error: 'note must be a string' };
    }
    result.note = data.note;
  }

  return { valid: true, data: result };
}

/**
 * Validate TrackEmailDTO
 * Requirements: 8.2, 7.2
 */
export function validateTrackEmail(body: unknown): { valid: boolean; error?: string; data?: TrackEmailDTO } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;

  // Validate required fields
  if (typeof data.sender !== 'string' || data.sender.trim() === '') {
    return { valid: false, error: 'sender is required and must be a non-empty string' };
  }

  if (typeof data.subject !== 'string' || data.subject.trim() === '') {
    return { valid: false, error: 'subject is required and must be a non-empty string' };
  }

  if (typeof data.recipient !== 'string' || data.recipient.trim() === '') {
    return { valid: false, error: 'recipient is required and must be a non-empty string' };
  }

  // Required workerName for worker instance data separation (Requirements: 7.2)
  if (typeof data.workerName !== 'string' || data.workerName.trim() === '') {
    return { valid: false, error: 'workerName is required and must be a non-empty string' };
  }

  const result: TrackEmailDTO = {
    sender: data.sender.trim(),
    subject: data.subject.trim(),
    recipient: data.recipient.trim(),
    workerName: data.workerName.trim(),
  };

  // Optional receivedAt
  if (data.receivedAt !== undefined) {
    if (typeof data.receivedAt !== 'string') {
      return { valid: false, error: 'receivedAt must be a string (ISO date format)' };
    }
    result.receivedAt = data.receivedAt;
  }

  return { valid: true, data: result };
}

/**
 * Validate TrackEmailBatchDTO
 * Requirements: 8.4
 */
function validateTrackEmailBatch(body: unknown): { valid: boolean; error?: string; data?: TrackEmailBatchDTO } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;

  if (!Array.isArray(data.emails)) {
    return { valid: false, error: 'emails must be an array' };
  }

  if (data.emails.length === 0) {
    return { valid: false, error: 'emails array cannot be empty' };
  }

  const validatedEmails: TrackEmailDTO[] = [];

  for (let i = 0; i < data.emails.length; i++) {
    const emailValidation = validateTrackEmail(data.emails[i]);
    if (!emailValidation.valid || !emailValidation.data) {
      return { valid: false, error: `emails[${i}]: ${emailValidation.error}` };
    }
    validatedEmails.push(emailValidation.data);
  }

  return { valid: true, data: { emails: validatedEmails } };
}

/**
 * Build level stats from root campaigns and path edges
 * Used for project-level path analysis
 */
interface CampaignLevelStat {
  campaignId: string;
  subject: string;
  level: number;
  userCount: number;
  coverage: number;
  isRoot: boolean;
}

function buildLevelStats(
  rootCampaigns: ProjectRootCampaign[],
  pathEdges: ProjectPathEdge[],
  totalNewUsers: number
): CampaignLevelStat[] {
  const levelStats: CampaignLevelStat[] = [];
  const campaignLevels = new Map<string, number>();
  const campaignSubjects = new Map<string, string>();
  const campaignUserCounts = new Map<string, number>();
  const rootCampaignIds = new Set<string>();

  // Root campaigns are level 1
  for (const root of rootCampaigns) {
    if (root.isConfirmed) {
      campaignLevels.set(root.campaignId, 1);
      campaignSubjects.set(root.campaignId, root.subject);
      campaignUserCounts.set(root.campaignId, 0);
      rootCampaignIds.add(root.campaignId);
    }
  }

  // Build adjacency list from path edges
  const adjacency = new Map<string, { toCampaignId: string; toSubject: string; userCount: number }[]>();
  // Also track incoming edges for each campaign
  const incomingUserCounts = new Map<string, number>();
  
  for (const edge of pathEdges) {
    if (!adjacency.has(edge.fromCampaignId)) {
      adjacency.set(edge.fromCampaignId, []);
    }
    adjacency.get(edge.fromCampaignId)!.push({
      toCampaignId: edge.toCampaignId,
      toSubject: edge.toSubject,
      userCount: edge.userCount,
    });
    campaignSubjects.set(edge.fromCampaignId, edge.fromSubject);
    campaignSubjects.set(edge.toCampaignId, edge.toSubject);
    
    // Track incoming user counts for each campaign
    const currentIncoming = incomingUserCounts.get(edge.toCampaignId) || 0;
    incomingUserCounts.set(edge.toCampaignId, currentIncoming + edge.userCount);
  }

  // BFS to assign levels
  const queue = [...campaignLevels.keys()];
  while (queue.length > 0) {
    const campaignId = queue.shift()!;
    const currentLevel = campaignLevels.get(campaignId)!;
    const edges = adjacency.get(campaignId) || [];

    for (const edge of edges) {
      if (!campaignLevels.has(edge.toCampaignId)) {
        campaignLevels.set(edge.toCampaignId, currentLevel + 1);
        queue.push(edge.toCampaignId);
      }
    }
  }

  // Calculate user counts for each campaign
  // For Root campaigns: sum of all outgoing edges (users who received Root and then other campaigns)
  // For non-Root campaigns: sum of all incoming edges
  for (const edge of pathEdges) {
    const fromLevel = campaignLevels.get(edge.fromCampaignId);
    if (fromLevel === 1) {
      // This is a root campaign, count users from it
      const currentCount = campaignUserCounts.get(edge.fromCampaignId) || 0;
      campaignUserCounts.set(edge.fromCampaignId, currentCount + edge.userCount);
    }
  }
  
  // For non-root campaigns, use incoming user counts
  for (const [campaignId, incomingCount] of incomingUserCounts) {
    if (!rootCampaignIds.has(campaignId)) {
      campaignUserCounts.set(campaignId, incomingCount);
    }
  }
  
  // For root campaigns with no outgoing edges, use totalNewUsers as estimate
  for (const rootId of rootCampaignIds) {
    if ((campaignUserCounts.get(rootId) || 0) === 0) {
      // If root has no outgoing edges, it means all new users started from this root
      // but didn't receive any subsequent campaigns yet
      campaignUserCounts.set(rootId, totalNewUsers);
    }
  }

  // Build level stats array with coverage calculation
  for (const [campaignId, level] of campaignLevels) {
    const userCount = campaignUserCounts.get(campaignId) || 0;
    const coverage = totalNewUsers > 0 ? (userCount / totalNewUsers) * 100 : 0;
    
    levelStats.push({
      campaignId,
      subject: campaignSubjects.get(campaignId) || '',
      level,
      userCount,
      coverage,
      isRoot: rootCampaignIds.has(campaignId),
    });
  }

  // Sort by level, then by user count descending
  levelStats.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return b.userCount - a.userCount;
  });

  return levelStats;
}


// ============================================
// Request Type Definitions
// ============================================

interface MerchantParams {
  id: string;
}

interface CampaignParams {
  id: string;
}

interface RecipientParams {
  email: string;
}

interface GetMerchantsQuery {
  analysisStatus?: string;
  workerName?: string;
  sortBy?: string;
  sortOrder?: string;
  limit?: string;
  offset?: string;
}

interface GetCampaignsQuery {
  merchantId?: string;
  isValuable?: string;
  workerName?: string;
  workerNames?: string; // Comma-separated list of worker names
  sortBy?: string;
  sortOrder?: string;
  limit?: string;
  offset?: string;
}

interface GetFlowQuery {
  startCampaignId?: string;
}

interface GetRecipientPathQuery {
  merchantId?: string;
}

// ============================================
// Route Registration
// ============================================

/**
 * Register campaign analytics routes
 */
export async function campaignRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  // ============================================
  // Merchant Routes (Task 10.1)
  // ============================================

  /**
   * GET /api/campaign/merchants
   * Get all merchants with optional filtering
   * 
   * Requirements: 1.3
   */
  fastify.get('/merchants', async (
    request: FastifyRequest<{ Querystring: GetMerchantsQuery }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const { analysisStatus, workerName, sortBy, sortOrder, limit, offset } = request.query;
      const filter: MerchantFilter = {};

      if (analysisStatus && ['pending', 'active', 'ignored'].includes(analysisStatus)) {
        filter.analysisStatus = analysisStatus as MerchantAnalysisStatus;
      }
      // Add workerName filter for instance-based filtering (Requirements: 4.3)
      if (workerName) {
        filter.workerName = workerName;
      }
      if (sortBy && ['domain', 'totalCampaigns', 'totalEmails', 'createdAt'].includes(sortBy)) {
        filter.sortBy = sortBy as MerchantFilter['sortBy'];
      }
      if (sortOrder && ['asc', 'desc'].includes(sortOrder)) {
        filter.sortOrder = sortOrder as 'asc' | 'desc';
      }
      if (limit) {
        const limitNum = parseInt(limit, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          filter.limit = limitNum;
        }
      }
      if (offset) {
        const offsetNum = parseInt(offset, 10);
        if (!isNaN(offsetNum) && offsetNum >= 0) {
          filter.offset = offsetNum;
        }
      }

      const merchants = service.getMerchants(filter);

      return reply.send({
        merchants,
        pagination: {
          total: merchants.length,
          limit: filter.limit || 100,
          offset: filter.offset || 0,
        },
      });
    } catch (error) {
      request.log.error(error, 'Error fetching merchants');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/merchants-by-worker
   * Get all merchants grouped by Worker instance
   * Returns separate entries for each merchant-worker combination
   * 
   * Query params:
   * - workerName (optional): Filter by specific worker instance
   * 
   * Requirements: 1.1, 1.2, 1.3, 3.2, 3.3
   */
  fastify.get('/merchants-by-worker', async (
    request: FastifyRequest<{ Querystring: { workerName?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const { workerName } = request.query;
      const merchants = service.getMerchantsByWorker(workerName);

      return reply.send({
        merchants,
        pagination: {
          total: merchants.length,
        },
      });
    } catch (error) {
      request.log.error(error, 'Error fetching merchants by worker');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/merchants/:id
   * Get a single merchant by ID
   * 
   * Requirements: 1.3
   */
  fastify.get('/merchants/:id', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      return reply.send(merchant);
    } catch (error) {
      request.log.error(error, 'Error fetching merchant');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * PUT /api/campaign/merchants/:id
   * Update merchant information
   * Supports per-worker-instance display name via workerName parameter
   * 
   * Requirements: 1.4
   */
  fastify.put('/merchants/:id', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    const validation = validateUpdateMerchant(request.body);
    if (!validation.valid || !validation.data) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      // Get workerName from body (optional, defaults to 'global')
      const body = request.body as Record<string, unknown>;
      const workerName = typeof body.workerName === 'string' ? body.workerName : 'global';

      const merchant = service.updateMerchant(request.params.id, {
        ...validation.data,
        workerName,
      });
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      return reply.send(merchant);
    } catch (error) {
      request.log.error(error, 'Error updating merchant');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/merchants/:id/status
   * Set merchant analysis status (pending, active, ignored)
   * Supports per-worker-instance status via workerName parameter
   */
  fastify.post('/merchants/:id/status', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    const body = request.body as Record<string, unknown>;

    if (!body?.status || !['pending', 'active', 'ignored'].includes(body.status as string)) {
      return reply.status(400).send({
        error: 'Invalid request',
        message: 'status must be one of: pending, active, ignored',
      });
    }

    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      // Get workerName from body (optional, defaults to 'global')
      const workerName = typeof body.workerName === 'string' ? body.workerName : 'global';

      const merchant = service.setMerchantAnalysisStatus(request.params.id, {
        status: body.status as MerchantAnalysisStatus,
        workerName,
      });

      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      return reply.send(merchant);
    } catch (error) {
      request.log.error(error, 'Error setting merchant status');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });


  // ============================================
  // Campaign Routes (Task 10.2)
  // ============================================

  /**
   * GET /api/campaign/campaigns
   * Get all campaigns with optional filtering
   * 
   * Requirements: 2.5, 3.3, 3.4
   */
  fastify.get('/campaigns', async (
    request: FastifyRequest<{ Querystring: GetCampaignsQuery }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const { merchantId, isValuable, workerName, workerNames, sortBy, sortOrder, limit, offset } = request.query;
      const filter: CampaignFilter = {};

      if (merchantId) {
        filter.merchantId = merchantId;
      }
      if (isValuable !== undefined) {
        filter.isValuable = isValuable === 'true';
      }
      // Support both single workerName and multiple workerNames (comma-separated)
      if (workerNames) {
        filter.workerNames = workerNames.split(',').map(w => w.trim()).filter(w => w);
      } else if (workerName) {
        filter.workerName = workerName;
      }
      if (sortBy && ['firstSeenAt', 'lastSeenAt', 'totalEmails', 'uniqueRecipients'].includes(sortBy)) {
        filter.sortBy = sortBy as CampaignFilter['sortBy'];
      }
      if (sortOrder && ['asc', 'desc'].includes(sortOrder)) {
        filter.sortOrder = sortOrder as 'asc' | 'desc';
      }
      if (limit) {
        const limitNum = parseInt(limit, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          filter.limit = limitNum;
        }
      }
      if (offset) {
        const offsetNum = parseInt(offset, 10);
        if (!isNaN(offsetNum) && offsetNum >= 0) {
          filter.offset = offsetNum;
        }
      }

      const campaigns = service.getCampaigns(filter);

      return reply.send({
        campaigns,
        pagination: {
          total: campaigns.length,
          limit: filter.limit || 100,
          offset: filter.offset || 0,
        },
      });
    } catch (error) {
      request.log.error(error, 'Error fetching campaigns');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/campaigns/:id
   * Get a single campaign by ID with details
   * 
   * Requirements: 2.3, 2.4
   */
  fastify.get('/campaigns/:id', async (
    request: FastifyRequest<{ Params: CampaignParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const campaign = service.getCampaignById(request.params.id);
      if (!campaign) {
        return reply.status(404).send({ error: 'Campaign not found' });
      }

      return reply.send(campaign);
    } catch (error) {
      request.log.error(error, 'Error fetching campaign');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/campaigns/:id/valuable
   * Mark or unmark a campaign as valuable (legacy endpoint)
   * 
   * Requirements: 3.1, 3.2, 3.5
   */
  fastify.post('/campaigns/:id/valuable', async (
    request: FastifyRequest<{ Params: CampaignParams }>,
    reply: FastifyReply
  ) => {
    const validation = validateMarkValuable(request.body);
    if (!validation.valid || !validation.data) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const campaign = service.markCampaignValuable(request.params.id, validation.data);
      if (!campaign) {
        return reply.status(404).send({ error: 'Campaign not found' });
      }

      return reply.send(campaign);
    } catch (error) {
      request.log.error(error, 'Error marking campaign as valuable');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/campaigns/:id/tag
   * Set campaign tag (0-4)
   * 
   * Tag values:
   * 0 = 未标记
   * 1 = 高价值（含折扣码）
   * 2 = 重要营销
   * 3 = 一般营销
   * 4 = 可忽略
   */
  fastify.post('/campaigns/:id/tag', async (
    request: FastifyRequest<{ Params: CampaignParams }>,
    reply: FastifyReply
  ) => {
    const validation = validateSetCampaignTag(request.body);
    if (!validation.valid || !validation.data) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const campaign = service.setCampaignTag(request.params.id, validation.data);
      if (!campaign) {
        return reply.status(404).send({ error: 'Campaign not found' });
      }

      return reply.send(campaign);
    } catch (error: any) {
      if (error.message?.includes('Invalid tag')) {
        return reply.status(400).send({ error: 'Invalid request', message: error.message });
      }
      request.log.error(error, 'Error setting campaign tag');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });


  // ============================================
  // Track Routes (Task 10.3)
  // ============================================

  /**
   * POST /api/campaign/track
   * Track a single email
   * 
   * Requirements: 8.1, 8.2
   */
  fastify.post('/track', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const validation = validateTrackEmail(request.body);
    if (!validation.valid || !validation.data) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const result = service.trackEmail(validation.data);
      return reply.status(201).send(result);
    } catch (error: any) {
      if (error.message === 'Invalid sender email address') {
        return reply.status(400).send({ error: 'Invalid request', message: error.message });
      }
      request.log.error(error, 'Error tracking email');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/track/batch
   * Track multiple emails in batch
   * 
   * Requirements: 8.4
   */
  fastify.post('/track/batch', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const validation = validateTrackEmailBatch(request.body);
    if (!validation.valid || !validation.data) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const results = validation.data.emails.map(email => {
        try {
          return {
            success: true,
            result: service.trackEmail(email),
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            email,
          };
        }
      });

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      return reply.status(201).send({
        processed: results.length,
        success: successCount,
        failed: failureCount,
        results,
      });
    } catch (error) {
      request.log.error(error, 'Error tracking emails in batch');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });


  // ============================================
  // Analysis Routes (Task 10.5)
  // ============================================

  /**
   * GET /api/campaign/merchants/:id/levels
   * Get campaign levels for a merchant
   * 
   * Requirements: 5.1
   */
  fastify.get('/merchants/:id/levels', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      // Check if merchant exists
      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      const levels = service.getCampaignLevels(request.params.id);

      return reply.send({
        merchantId: request.params.id,
        levels,
      });
    } catch (error) {
      request.log.error(error, 'Error fetching campaign levels');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/merchants/:id/flow
   * Get campaign flow analysis for a merchant
   * 
   * Requirements: 6.1
   */
  fastify.get('/merchants/:id/flow', async (
    request: FastifyRequest<{ Params: MerchantParams; Querystring: GetFlowQuery }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      // Check if merchant exists
      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      const { startCampaignId } = request.query;
      const flow = service.getCampaignFlow(request.params.id, startCampaignId);

      return reply.send(flow);
    } catch (error) {
      request.log.error(error, 'Error fetching campaign flow');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/recipients/:email/path
   * Get recipient path for a specific email address
   * 
   * Requirements: 4.4
   */
  fastify.get('/recipients/:email/path', async (
    request: FastifyRequest<{ Params: RecipientParams; Querystring: GetRecipientPathQuery }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const { merchantId } = request.query;
      const email = decodeURIComponent(request.params.email);

      if (!merchantId) {
        return reply.status(400).send({ error: 'Invalid request', message: 'merchantId query parameter is required' });
      }

      // Check if merchant exists
      const merchant = service.getMerchantById(merchantId);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      const path = service.getRecipientPath(merchantId, email);

      return reply.send(path);
    } catch (error) {
      request.log.error(error, 'Error fetching recipient path');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ============================================
  // Enhanced Analysis Routes (活动转移路径分析)
  // ============================================

  /**
   * GET /api/campaign/merchants/:id/transitions
   * Get campaign transitions (活动转移路径表)
   * Returns: From | To | User_Count | Transition_Ratio
   */
  fastify.get('/merchants/:id/transitions', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      // Check if merchant exists
      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      const transitions = service.getCampaignTransitions(request.params.id);

      return reply.send(transitions);
    } catch (error) {
      request.log.error(error, 'Error fetching campaign transitions');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/merchants/:id/branches
   * Get path branch analysis (路径分支分析)
   * Identifies main paths and secondary paths
   */
  fastify.get('/merchants/:id/branches', async (
    request: FastifyRequest<{ Params: MerchantParams; Querystring: { minPathLength?: string; mainPathThreshold?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      // Check if merchant exists
      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      const { minPathLength, mainPathThreshold } = request.query;
      const minLen = minPathLength ? parseInt(minPathLength, 10) : 2;
      const threshold = mainPathThreshold ? parseFloat(mainPathThreshold) : 5;

      const branches = service.getPathBranchAnalysis(request.params.id, minLen, threshold);

      return reply.send(branches);
    } catch (error) {
      request.log.error(error, 'Error fetching path branches');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/merchants/:id/valuable-analysis
   * Get valuable campaigns analysis (有价值活动路径视图)
   * Shows common predecessors and successors for valuable campaigns
   */
  fastify.get('/merchants/:id/valuable-analysis', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      // Check if merchant exists
      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      const analysis = service.getValuableCampaignsAnalysis(request.params.id);

      return reply.send(analysis);
    } catch (error) {
      request.log.error(error, 'Error fetching valuable campaigns analysis');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ============================================
  // Root Campaign Routes (第一层级活动管理)
  // ============================================

  /**
   * GET /api/campaign/merchants/:id/root-campaigns
   * Get root campaigns for a merchant
   * Query params: workerName (optional) - filter by worker instance
   */
  fastify.get('/merchants/:id/root-campaigns', async (
    request: FastifyRequest<{ Params: MerchantParams; Querystring: { workerName?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);
      const { workerName } = request.query;

      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      const workerNames = workerName ? [workerName] : undefined;
      const rootCampaigns = service.getRootCampaigns(request.params.id, workerNames);

      return reply.send({
        merchantId: request.params.id,
        rootCampaigns,
      });
    } catch (error) {
      request.log.error(error, 'Error fetching root campaigns');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/merchants/:id/detect-root-candidates
   * Auto-detect root campaign candidates based on keywords
   */
  fastify.post('/merchants/:id/detect-root-candidates', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      const count = service.detectRootCampaignCandidates(request.params.id);

      return reply.send({
        merchantId: request.params.id,
        candidatesDetected: count,
      });
    } catch (error) {
      request.log.error(error, 'Error detecting root campaign candidates');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/campaigns/:id/root
   * Set or unset a campaign as root campaign
   */
  fastify.post('/campaigns/:id/root', async (
    request: FastifyRequest<{ Params: CampaignParams }>,
    reply: FastifyReply
  ) => {
    const body = request.body as Record<string, unknown>;
    
    if (typeof body?.isRoot !== 'boolean') {
      return reply.status(400).send({ error: 'Invalid request', message: 'isRoot must be a boolean' });
    }

    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const campaign = service.setRootCampaign({
        campaignId: request.params.id,
        isRoot: body.isRoot,
      });

      if (!campaign) {
        return reply.status(404).send({ error: 'Campaign not found' });
      }

      return reply.send(campaign);
    } catch (error) {
      request.log.error(error, 'Error setting root campaign');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/merchants/:id/recalculate-users
   * Recalculate new/old users based on confirmed root campaigns
   */
  fastify.post('/merchants/:id/recalculate-users', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      service.recalculateAllNewUsers(request.params.id);
      const userStats = service.getUserTypeStats(request.params.id);

      return reply.send({
        merchantId: request.params.id,
        message: 'User types recalculated',
        userStats,
      });
    } catch (error) {
      request.log.error(error, 'Error recalculating users');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/merchants/:id/rebuild-paths
   * Rebuild recipient paths from campaign_emails data
   * 
   * Requirements: 3.1, 3.4
   */
  fastify.post('/merchants/:id/rebuild-paths', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      // Get workerNames from request body (optional array)
      const body = request.body as { workerNames?: string[] } | undefined;
      const workerNames = Array.isArray(body?.workerNames) ? body.workerNames : undefined;

      const result = service.rebuildRecipientPaths(request.params.id, workerNames);

      return reply.send({
        merchantId: request.params.id,
        pathsDeleted: result.pathsDeleted,
        pathsCreated: result.pathsCreated,
        recipientsProcessed: result.recipientsProcessed,
      });
    } catch (error) {
      request.log.error(error, 'Error rebuilding recipient paths');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/merchants/:id/cleanup-old-customers
   * Clean up old customer path data (recipients whose first email was not from a Root campaign)
   * Preserves campaign_emails records, only removes recipient_paths entries
   * 
   * Requirements: 7.4, 7.6
   */
  fastify.post('/merchants/:id/cleanup-old-customers', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      // Get workerNames from request body (optional array)
      const body = request.body as { workerNames?: string[] } | undefined;
      const workerNames = Array.isArray(body?.workerNames) ? body.workerNames : undefined;

      const result = service.cleanupOldCustomerPaths(request.params.id, workerNames);

      return reply.send({
        merchantId: request.params.id,
        pathsDeleted: result.pathsDeleted,
        recipientsAffected: result.recipientsAffected,
      });
    } catch (error) {
      request.log.error(error, 'Error cleaning up old customer paths');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/merchants/:id/user-stats
   * Get new/old user statistics
   */
  fastify.get('/merchants/:id/user-stats', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      const userStats = service.getUserTypeStats(request.params.id);

      return reply.send(userStats);
    } catch (error) {
      request.log.error(error, 'Error fetching user stats');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/merchants/:id/coverage
   * Get campaign coverage statistics
   */
  fastify.get('/merchants/:id/coverage', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      const coverage = service.getCampaignCoverage(request.params.id);

      return reply.send({
        merchantId: request.params.id,
        coverage,
      });
    } catch (error) {
      request.log.error(error, 'Error fetching campaign coverage');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/merchants/:id/new-user-transitions
   * Get campaign transitions for new users only
   */
  fastify.get('/merchants/:id/new-user-transitions', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      const transitions = service.getNewUserTransitions(request.params.id);

      return reply.send(transitions);
    } catch (error) {
      request.log.error(error, 'Error fetching new user transitions');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/merchants/:id/path-analysis
   * Get complete path analysis (综合路径分析)
   * Returns all analysis data in one request
   * Query params: 
   *   - workerNames (optional) - comma-separated list of worker names for multi-worker filtering
   *   - workerName (optional, deprecated) - single worker name for backward compatibility
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
   */
  fastify.get('/merchants/:id/path-analysis', async (
    request: FastifyRequest<{ Params: MerchantParams; Querystring: { workerName?: string; workerNames?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);
      const { workerName, workerNames: workerNamesParam } = request.query;

      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      // Parse workerNames from comma-separated string, or use single workerName for backward compatibility
      let workerNames: string[] | undefined;
      if (workerNamesParam) {
        workerNames = workerNamesParam.split(',').map(w => w.trim()).filter(w => w.length > 0);
      } else if (workerName) {
        workerNames = [workerName];
      }

      const analysis = service.getPathAnalysis(request.params.id, workerNames);

      return reply.send(analysis);
    } catch (error) {
      request.log.error(error, 'Error fetching path analysis');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ============================================
  // Data Management Routes (数据管理)
  // ============================================

  /**
   * DELETE /api/campaign/merchants/:id/data
   * Delete merchant data for a specific worker
   * Query params: workerName (required) - the worker whose data should be deleted
   * 
   * Requirements: 3.2, 3.3, 3.4
   */
  fastify.delete('/merchants/:id/data', async (
    request: FastifyRequest<{ Params: MerchantParams; Querystring: { workerName?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { id } = request.params;
      const { workerName } = request.query;

      // Validate workerName parameter
      if (!workerName || typeof workerName !== 'string' || workerName.trim() === '') {
        return reply.status(400).send({
          error: 'Invalid request',
          message: 'workerName query parameter is required',
        });
      }

      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      // Check if merchant exists
      const merchant = service.getMerchantById(id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      // Delete merchant data for the specified worker
      const result = service.deleteMerchantData({
        merchantId: id,
        workerName: workerName.trim(),
      });

      return reply.send({
        success: true,
        result,
      });
    } catch (error: any) {
      if (error.message?.includes('Merchant not found')) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }
      request.log.error(error, 'Error deleting merchant data');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/orphaned-workers
   * Get list of worker names that exist in data but not in current worker list
   */
  fastify.get('/orphaned-workers', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);
      const orphanedWorkers = service.getOrphanedWorkers();
      return reply.send({ orphanedWorkers });
    } catch (error) {
      request.log.error(error, 'Error fetching orphaned workers');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * DELETE /api/campaign/orphaned-worker-data
   * Delete all data for a specific orphaned worker
   * Query params: workerName (required) - the orphaned worker name to delete
   */
  fastify.delete('/orphaned-worker-data', async (
    request: FastifyRequest<{ Querystring: { workerName?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { workerName } = request.query;

      if (!workerName || typeof workerName !== 'string' || workerName.trim() === '') {
        return reply.status(400).send({
          error: 'Invalid request',
          message: 'workerName query parameter is required',
        });
      }

      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);
      const result = service.deleteOrphanedWorkerData(workerName.trim());

      return reply.send({
        success: true,
        result,
      });
    } catch (error) {
      request.log.error(error, 'Error deleting orphaned worker data');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/data-stats
   * Get data statistics for all merchants
   * Query params: workerName (optional) - filter by worker instance (Requirements: 4.5)
   */
  fastify.get('/data-stats', async (
    request: FastifyRequest<{ Querystring: { workerName?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { workerName } = request.query;
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const stats = service.getDataStatistics(workerName);

      return reply.send(stats);
    } catch (error) {
      request.log.error(error, 'Error fetching data statistics');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/cleanup-ignored
   * Clean up data for ignored merchants
   * Body params: workerName (optional) - filter by worker instance (Requirements: 4.5)
   */
  fastify.post('/cleanup-ignored', async (
    request: FastifyRequest<{ Body: { workerName?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const body = request.body as { workerName?: string } | undefined;
      const workerName = body?.workerName;
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const result = service.cleanupIgnoredMerchantData(workerName);

      return reply.send({
        message: 'Cleanup completed',
        ...result,
      });
    } catch (error) {
      request.log.error(error, 'Error cleaning up ignored merchant data');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/cleanup-pending
   * Clean up old pending merchant data
   * Body params: days (optional), workerName (optional) - filter by worker instance (Requirements: 4.5)
   */
  fastify.post('/cleanup-pending', async (
    request: FastifyRequest<{ Body: { days?: number; workerName?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const body = request.body as { days?: number; workerName?: string } | undefined;
      const days = body?.days || 30; // Default 30 days
      const workerName = body?.workerName;

      if (days < 1) {
        return reply.status(400).send({ error: 'Invalid request', message: 'days must be at least 1' });
      }

      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const result = service.cleanupOldPendingData(days, workerName);

      return reply.send({
        message: `Cleaned up pending data older than ${days} days`,
        ...result,
      });
    } catch (error) {
      request.log.error(error, 'Error cleaning up pending merchant data');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/merchants/:id/cleanup-old-user-paths
   * Clean up old user path data for a merchant (keeps first entry for stats)
   * 清理商户的老用户详细路径数据（保留统计）
   */
  fastify.post('/merchants/:id/cleanup-old-user-paths', async (
    request: FastifyRequest<{ Params: MerchantParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const merchant = service.getMerchantById(request.params.id);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      const result = service.cleanupAllOldUserPaths(request.params.id);

      return reply.send({
        message: 'Old user path data cleaned up',
        merchantId: request.params.id,
        ...result,
      });
    } catch (error) {
      request.log.error(error, 'Error cleaning up old user paths');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ============================================
  // Analysis Project Routes
  // ============================================

  /**
   * GET /api/campaign/projects
   * Get all analysis projects with optional filtering
   */
  fastify.get('/projects', async (
    request: FastifyRequest<{ Querystring: { workerName?: string; status?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const { workerName, status } = request.query;
      const filter: { workerName?: string; status?: AnalysisProjectStatus } = {};

      if (workerName) filter.workerName = workerName;
      if (status && ['active', 'completed', 'archived'].includes(status)) {
        filter.status = status as AnalysisProjectStatus;
      }

      const projects = service.getAnalysisProjects(filter);

      return reply.send({ projects });
    } catch (error) {
      request.log.error(error, 'Error fetching analysis projects');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/projects/:id
   * Get a single analysis project by ID
   */
  fastify.get('/projects/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const project = service.getAnalysisProjectById(request.params.id);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      return reply.send(project);
    } catch (error) {
      request.log.error(error, 'Error fetching analysis project');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/projects
   * Create a new analysis project
   * 
   * Requirements: 5.2, 5.3, 5.4
   */
  fastify.post('/projects', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const body = request.body as Record<string, unknown>;

    // Log incoming request for debugging
    request.log.info({ body }, 'Creating analysis project - request received');

    // Validate required fields
    if (!body?.name || typeof body.name !== 'string' || body.name.trim() === '') {
      request.log.warn({ body }, 'Project creation failed: name is required');
      return reply.status(400).send({ error: 'Invalid request', message: 'name is required' });
    }
    if (!body?.merchantId || typeof body.merchantId !== 'string') {
      request.log.warn({ body }, 'Project creation failed: merchantId is required');
      return reply.status(400).send({ error: 'Invalid request', message: 'merchantId is required' });
    }
    if (!body?.workerName || typeof body.workerName !== 'string') {
      request.log.warn({ body }, 'Project creation failed: workerName is required');
      return reply.status(400).send({ error: 'Invalid request', message: 'workerName is required' });
    }

    // Validate workerNames if provided
    let workerNames: string[] | undefined;
    if (body.workerNames !== undefined) {
      if (!Array.isArray(body.workerNames) || !body.workerNames.every((w: unknown) => typeof w === 'string')) {
        request.log.warn({ workerNames: body.workerNames }, 'Project creation failed: workerNames must be an array of strings');
        return reply.status(400).send({ error: 'Invalid request', message: 'workerNames must be an array of strings' });
      }
      workerNames = body.workerNames as string[];
    }

    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const data: CreateAnalysisProjectDTO = {
        name: body.name.trim(),
        merchantId: body.merchantId,
        workerName: body.workerName,
        workerNames,
        note: typeof body.note === 'string' ? body.note : undefined,
      };

      request.log.info({ data }, 'Creating analysis project with data');
      const project = service.createAnalysisProject(data);
      request.log.info({ projectId: project.id }, 'Analysis project created successfully');

      return reply.status(201).send(project);
    } catch (error: any) {
      if (error.message === 'Merchant not found') {
        request.log.warn({ merchantId: body.merchantId }, 'Project creation failed: Merchant not found');
        return reply.status(404).send({ error: 'Merchant not found', message: `Merchant with ID ${body.merchantId} not found` });
      }
      request.log.error({ error: error.message, stack: error.stack }, 'Error creating analysis project');
      return reply.status(500).send({ error: 'Internal error', message: error.message || 'Unknown error occurred' });
    }
  });

  /**
   * PUT /api/campaign/projects/:id
   * Update an analysis project
   */
  fastify.put('/projects/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const body = request.body as Record<string, unknown>;

    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const data: UpdateAnalysisProjectDTO = {};

      if (body?.name !== undefined) {
        if (typeof body.name !== 'string' || body.name.trim() === '') {
          return reply.status(400).send({ error: 'Invalid request', message: 'name cannot be empty' });
        }
        data.name = body.name.trim();
      }

      if (body?.status !== undefined) {
        if (!['active', 'completed', 'archived'].includes(body.status as string)) {
          return reply.status(400).send({ error: 'Invalid request', message: 'status must be active, completed, or archived' });
        }
        data.status = body.status as AnalysisProjectStatus;
      }

      if (body?.note !== undefined) {
        data.note = typeof body.note === 'string' ? body.note : undefined;
      }

      if (body?.workerNames !== undefined) {
        if (!Array.isArray(body.workerNames) || !body.workerNames.every((w: unknown) => typeof w === 'string')) {
          return reply.status(400).send({ error: 'Invalid request', message: 'workerNames must be an array of strings' });
        }
        data.workerNames = body.workerNames as string[];
      }

      const project = service.updateAnalysisProject(request.params.id, data);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      return reply.send(project);
    } catch (error) {
      request.log.error(error, 'Error updating analysis project');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * DELETE /api/campaign/projects/:id
   * Delete an analysis project
   */
  fastify.delete('/projects/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const deleted = service.deleteAnalysisProject(request.params.id);
      if (!deleted) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      return reply.send({ message: 'Project deleted' });
    } catch (error) {
      request.log.error(error, 'Error deleting analysis project');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/workers/:workerName/merchants
   * Get merchants for a specific worker (for project creation)
   */
  fastify.get('/workers/:workerName/merchants', async (
    request: FastifyRequest<{ Params: { workerName: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new CampaignAnalyticsService(db);

      const merchants = service.getMerchantsForWorker(request.params.workerName);

      return reply.send({ merchants });
    } catch (error) {
      request.log.error(error, 'Error fetching merchants for worker');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ============================================
  // Project Path Analysis Routes (项目级路径分析)
  // Requirements: 2.1, 2.2, 2.4, 2.5, 6.1, 7.1, 9.1-9.5
  // ============================================

  /**
   * GET /api/campaign/projects/:id/root-campaigns
   * Get Root campaigns for a project
   * 
   * Requirements: 2.2, 2.5
   */
  fastify.get('/projects/:id/root-campaigns', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const analyticsService = new CampaignAnalyticsService(db);
      const pathService = new ProjectPathAnalysisService(db);

      // Check if project exists
      const project = analyticsService.getAnalysisProjectById(request.params.id);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const rootCampaigns = pathService.getProjectRootCampaigns(request.params.id);

      return reply.send({
        projectId: request.params.id,
        rootCampaigns,
      });
    } catch (error) {
      request.log.error(error, 'Error fetching project root campaigns');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/projects/:id/root-campaigns
   * Set a Root campaign for a project
   * 
   * Requirements: 2.1, 2.4
   */
  fastify.post('/projects/:id/root-campaigns', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const body = request.body as Record<string, unknown>;

    // Validate required fields
    if (!body?.campaignId || typeof body.campaignId !== 'string') {
      return reply.status(400).send({ error: 'Invalid request', message: 'campaignId is required' });
    }

    const isConfirmed = body.isConfirmed === true;

    try {
      const db = getDatabase();
      const analyticsService = new CampaignAnalyticsService(db);
      const pathService = new ProjectPathAnalysisService(db);

      // Check if project exists
      const project = analyticsService.getAnalysisProjectById(request.params.id);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      // Check if campaign exists
      const campaign = analyticsService.getCampaignById(body.campaignId);
      if (!campaign) {
        return reply.status(404).send({ error: 'Campaign not found' });
      }

      pathService.setProjectRootCampaign(request.params.id, body.campaignId, isConfirmed);

      const rootCampaigns = pathService.getProjectRootCampaigns(request.params.id);

      return reply.status(201).send({
        projectId: request.params.id,
        rootCampaigns,
      });
    } catch (error) {
      request.log.error(error, 'Error setting project root campaign');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * DELETE /api/campaign/projects/:id/root-campaigns/:campaignId
   * Remove a Root campaign from a project
   * 
   * Requirements: 2.4
   */
  fastify.delete('/projects/:id/root-campaigns/:campaignId', async (
    request: FastifyRequest<{ Params: { id: string; campaignId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const analyticsService = new CampaignAnalyticsService(db);
      const pathService = new ProjectPathAnalysisService(db);

      // Check if project exists
      const project = analyticsService.getAnalysisProjectById(request.params.id);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      pathService.removeProjectRootCampaign(request.params.id, request.params.campaignId);

      return reply.send({ message: 'Root campaign removed' });
    } catch (error) {
      request.log.error(error, 'Error removing project root campaign');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/projects/:id/analyze
   * Trigger path analysis for a project (SSE for progress)
   * 
   * Requirements: 6.1, 7.1, 9.1, 9.2, 9.3, 9.4
   */
  fastify.post('/projects/:id/analyze', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const analyticsService = new CampaignAnalyticsService(db);
      const pathService = new ProjectPathAnalysisService(db);

      // Check if project exists
      const project = analyticsService.getAnalysisProjectById(request.params.id);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      // Check if analysis is already running for this project
      if (analysisQueue.isProjectInQueue(request.params.id)) {
        return reply.status(409).send({ 
          error: 'Conflict', 
          message: 'Analysis is already in progress or queued for this project' 
        });
      }

      // Set up SSE response
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      });

      // Set up the analyze function for the queue
      analysisQueue.setAnalyzeFunction(async (projectId, onProgress) => {
        return pathService.analyzeProject(projectId, onProgress);
      });

      // Send progress updates via SSE
      const sendProgress = (progress: AnalysisProgress) => {
        reply.raw.write(`event: progress\ndata: ${JSON.stringify(progress)}\n\n`);
      };

      try {
        // Enqueue the analysis
        const result = await analysisQueue.enqueue(request.params.id, sendProgress);

        // Send completion event
        reply.raw.write(`event: complete\ndata: ${JSON.stringify(result)}\n\n`);
      } catch (error: any) {
        // Send error event
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
      }

      reply.raw.end();
    } catch (error) {
      request.log.error(error, 'Error starting project analysis');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/projects/:id/path-analysis
   * Get path analysis results for a project
   * 
   * Requirements: 4.3, 5.2, 5.3
   */
  fastify.get('/projects/:id/path-analysis', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const analyticsService = new CampaignAnalyticsService(db);
      const pathService = new ProjectPathAnalysisService(db);

      // Check if project exists
      const project = analyticsService.getAnalysisProjectById(request.params.id);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      // Get analysis data
      const userStats = pathService.getProjectUserStats(request.params.id);
      const pathEdges = pathService.getProjectPathEdges(request.params.id);
      const rootCampaigns = pathService.getProjectRootCampaigns(request.params.id);
      const lastAnalysisTime = pathService.getLastAnalysisTime(request.params.id);

      // Build transitions from path edges (similar to merchant-level analysis)
      const transitions = pathEdges.map(edge => ({
        fromCampaignId: edge.fromCampaignId,
        fromSubject: edge.fromSubject,
        toCampaignId: edge.toCampaignId,
        toSubject: edge.toSubject,
        userCount: edge.userCount,
      }));

      // Build level stats from root campaigns and path edges
      const levelStats = buildLevelStats(rootCampaigns, pathEdges, userStats.totalNewUsers);

      return reply.send({
        projectId: request.params.id,
        userStats,
        levelStats,
        transitions,
        rootCampaigns,
        lastAnalysisTime: lastAnalysisTime?.toISOString() || null,
      });
    } catch (error) {
      request.log.error(error, 'Error fetching project path analysis');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/campaign/projects/:id/analysis-status
   * Get analysis queue status for a project
   * 
   * Requirements: 8.4
   */
  fastify.get('/projects/:id/analysis-status', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const analyticsService = new CampaignAnalyticsService(db);
      const pathService = new ProjectPathAnalysisService(db);

      // Check if project exists
      const project = analyticsService.getAnalysisProjectById(request.params.id);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const queueStatus = analysisQueue.getStatus();
      const lastAnalysisTime = pathService.getLastAnalysisTime(request.params.id);

      return reply.send({
        projectId: request.params.id,
        isAnalyzing: queueStatus.currentProjectId === request.params.id,
        isQueued: queueStatus.queuedProjectIds.includes(request.params.id),
        queuePosition: queueStatus.queuedProjectIds.indexOf(request.params.id) + 1,
        lastAnalysisTime: lastAnalysisTime?.toISOString() || null,
        globalQueueStatus: queueStatus,
      });
    } catch (error) {
      request.log.error(error, 'Error fetching analysis status');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ============================================
  // Project Campaign Tag Routes (项目级活动标记)
  // ============================================

  /**
   * GET /api/campaign/projects/:id/campaigns
   * Get campaigns for a project with project-level tags merged
   * 
   * This endpoint returns campaigns with project-specific tag overrides,
   * ensuring data isolation between projects.
   */
  fastify.get('/projects/:id/campaigns', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const analyticsService = new CampaignAnalyticsService(db);
      const pathService = new ProjectPathAnalysisService(db);

      // Check if project exists
      const project = analyticsService.getAnalysisProjectById(request.params.id);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      // Get campaigns with project-level tags
      const campaigns = pathService.getProjectCampaignsWithTags(
        request.params.id,
        project.merchantId,
        project.workerNames
      );

      return reply.send({
        projectId: request.params.id,
        campaigns,
      });
    } catch (error) {
      request.log.error(error, 'Error fetching project campaigns');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/campaign/projects/:id/campaigns/:campaignId/tag
   * Set campaign tag for a project (project-level isolation)
   * 
   * This creates a project-specific tag override, ensuring that
   * tagging a campaign in one project doesn't affect other projects.
   */
  fastify.post('/projects/:id/campaigns/:campaignId/tag', async (
    request: FastifyRequest<{ Params: { id: string; campaignId: string } }>,
    reply: FastifyReply
  ) => {
    const body = request.body as Record<string, unknown>;
    
    if (typeof body?.tag !== 'number' || body.tag < 0 || body.tag > 4) {
      return reply.status(400).send({ 
        error: 'Invalid request', 
        message: 'tag must be a number between 0 and 4' 
      });
    }

    try {
      const db = getDatabase();
      const pathService = new ProjectPathAnalysisService(db);

      const result = pathService.setProjectCampaignTag(
        request.params.id,
        request.params.campaignId,
        body.tag,
        typeof body.note === 'string' ? body.note : undefined
      );

      if (!result) {
        return reply.status(404).send({ error: 'Project or campaign not found' });
      }

      return reply.send(result);
    } catch (error: any) {
      if (error.message?.includes('Invalid tag')) {
        return reply.status(400).send({ error: 'Invalid request', message: error.message });
      }
      request.log.error(error, 'Error setting project campaign tag');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * DELETE /api/campaign/projects/:id/campaigns/:campaignId/tag
   * Remove campaign tag for a project
   * 
   * This removes the project-specific tag override, reverting to
   * the campaign's default tag (or no tag).
   */
  fastify.delete('/projects/:id/campaigns/:campaignId/tag', async (
    request: FastifyRequest<{ Params: { id: string; campaignId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const pathService = new ProjectPathAnalysisService(db);

      const deleted = pathService.removeProjectCampaignTag(
        request.params.id,
        request.params.campaignId
      );

      if (!deleted) {
        return reply.status(404).send({ error: 'Project campaign tag not found' });
      }

      return reply.send({ success: true });
    } catch (error) {
      request.log.error(error, 'Error removing project campaign tag');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
