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
} from '@email-filter/shared';
import { CampaignAnalyticsService } from '../services/campaign-analytics.service.js';
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
 * Requirements: 8.2
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

  const result: TrackEmailDTO = {
    sender: data.sender.trim(),
    subject: data.subject.trim(),
    recipient: data.recipient.trim(),
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
  sortBy?: string;
  sortOrder?: string;
  limit?: string;
  offset?: string;
}

interface GetCampaignsQuery {
  merchantId?: string;
  isValuable?: string;
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

      const { sortBy, sortOrder, limit, offset } = request.query;
      const filter: MerchantFilter = {};

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

      const merchant = service.updateMerchant(request.params.id, validation.data);
      if (!merchant) {
        return reply.status(404).send({ error: 'Merchant not found' });
      }

      return reply.send(merchant);
    } catch (error) {
      request.log.error(error, 'Error updating merchant');
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

      const { merchantId, isValuable, sortBy, sortOrder, limit, offset } = request.query;
      const filter: CampaignFilter = {};

      if (merchantId) {
        filter.merchantId = merchantId;
      }
      if (isValuable !== undefined) {
        filter.isValuable = isValuable === 'true';
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
   */
  fastify.get('/merchants/:id/root-campaigns', async (
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

      const rootCampaigns = service.getRootCampaigns(request.params.id);

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

  // ============================================
  // User Statistics Routes (新老用户统计)
  // ============================================

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
   */
  fastify.get('/merchants/:id/path-analysis', async (
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

      const analysis = service.getPathAnalysis(request.params.id);

      return reply.send(analysis);
    } catch (error) {
      request.log.error(error, 'Error fetching path analysis');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
