/**
 * Rules Routes
 * CRUD operations for filter rules
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.4
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { CreateRuleDTO, UpdateRuleDTO, RuleCategory } from '@email-filter/shared';
import { RuleRepository } from '../db/rule-repository.js';
import { StatsRepository } from '../db/stats-repository.js';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { getRuleCache } from '../services/rule-cache.instance.js';

// Valid values for validation
const VALID_CATEGORIES: RuleCategory[] = ['whitelist', 'blacklist', 'dynamic'];
const VALID_MATCH_TYPES = ['sender', 'subject', 'domain'];
const VALID_MATCH_MODES = ['exact', 'contains', 'startsWith', 'endsWith', 'regex'];

/**
 * Validate CreateRuleDTO
 */
function validateCreateRule(body: unknown): { valid: boolean; error?: string; data?: CreateRuleDTO } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;

  if (!data.category || !VALID_CATEGORIES.includes(data.category as RuleCategory)) {
    return { valid: false, error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` };
  }
  if (!data.matchType || !VALID_MATCH_TYPES.includes(data.matchType as string)) {
    return { valid: false, error: `matchType must be one of: ${VALID_MATCH_TYPES.join(', ')}` };
  }
  if (!data.matchMode || !VALID_MATCH_MODES.includes(data.matchMode as string)) {
    return { valid: false, error: `matchMode must be one of: ${VALID_MATCH_MODES.join(', ')}` };
  }
  if (typeof data.pattern !== 'string' || data.pattern.trim() === '') {
    return { valid: false, error: 'pattern is required and must be a non-empty string' };
  }

  return {
    valid: true,
    data: {
      category: data.category as RuleCategory,
      matchType: data.matchType as CreateRuleDTO['matchType'],
      matchMode: data.matchMode as CreateRuleDTO['matchMode'],
      pattern: data.pattern as string,
      enabled: data.enabled !== undefined ? Boolean(data.enabled) : true,
    },
  };
}

/**
 * Validate UpdateRuleDTO
 */
function validateUpdateRule(body: unknown): { valid: boolean; error?: string; data?: UpdateRuleDTO } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;
  const updateData: UpdateRuleDTO = {};

  if (data.category !== undefined) {
    if (!VALID_CATEGORIES.includes(data.category as RuleCategory)) {
      return { valid: false, error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` };
    }
    updateData.category = data.category as RuleCategory;
  }
  if (data.matchType !== undefined) {
    if (!VALID_MATCH_TYPES.includes(data.matchType as string)) {
      return { valid: false, error: `matchType must be one of: ${VALID_MATCH_TYPES.join(', ')}` };
    }
    updateData.matchType = data.matchType as UpdateRuleDTO['matchType'];
  }
  if (data.matchMode !== undefined) {
    if (!VALID_MATCH_MODES.includes(data.matchMode as string)) {
      return { valid: false, error: `matchMode must be one of: ${VALID_MATCH_MODES.join(', ')}` };
    }
    updateData.matchMode = data.matchMode as UpdateRuleDTO['matchMode'];
  }
  if (data.pattern !== undefined) {
    if (typeof data.pattern !== 'string' || data.pattern.trim() === '') {
      return { valid: false, error: 'pattern must be a non-empty string' };
    }
    updateData.pattern = data.pattern as string;
  }
  if (data.enabled !== undefined) {
    updateData.enabled = Boolean(data.enabled);
  }
  if (data.tags !== undefined) {
    if (Array.isArray(data.tags)) {
      updateData.tags = data.tags.filter((t): t is string => typeof t === 'string');
    } else {
      updateData.tags = [];
    }
  }

  return { valid: true, data: updateData };
}

// Request type definitions
interface GetRulesQuery {
  limit?: string;
  offset?: string;
  category?: string;
  workerId?: string;
  global?: string;
}

interface RuleParams {
  id: string;
}

/**
 * Register rules routes
 */
export async function rulesRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /api/rules
   * Get all rules with optional pagination and filtering
   *
   * Requirements: 3.2
   */
  fastify.get('/', async (request: FastifyRequest<{ Querystring: GetRulesQuery }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const ruleRepository = new RuleRepository(db);

      const { limit, offset, category, workerId } = request.query;
      const isGlobal = request.query.global === 'true';
      const options: { limit?: number; offset?: number; category?: RuleCategory; workerId?: string } = {};

      if (limit) {
        const limitNum = parseInt(limit, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          options.limit = limitNum;
        }
      }
      if (offset) {
        const offsetNum = parseInt(offset, 10);
        if (!isNaN(offsetNum) && offsetNum >= 0) {
          options.offset = offsetNum;
        }
      }
      if (category && VALID_CATEGORIES.includes(category as RuleCategory)) {
        options.category = category as RuleCategory;
      }
      if (workerId) {
        options.workerId = workerId;
      }

      let rules;
      if (isGlobal) {
        // Get only global rules (worker_id IS NULL)
        rules = ruleRepository.findGlobal();
        if (options.category) {
          rules = rules.filter((r) => r.category === options.category);
        }
      } else {
        rules = ruleRepository.findAll(options);
      }

      const total = rules.length;

      return reply.send({
        rules,
        pagination: {
          total,
          limit: options.limit,
          offset: options.offset || 0,
        },
      });
    } catch (error) {
      request.log.error(error, 'Error fetching rules');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/rules/:id
   * Get a single rule by ID
   * 
   * Requirements: 3.2
   */
  fastify.get('/:id', async (request: FastifyRequest<{ Params: RuleParams }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const ruleRepository = new RuleRepository(db);

      const rule = ruleRepository.findById(request.params.id);
      if (!rule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.send(rule);
    } catch (error) {
      request.log.error(error, 'Error fetching rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/rules
   * Create a new rule
   *
   * Requirements: 3.1, 4.4
   */
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const validation = validateCreateRule(request.body);
    if (!validation.valid || !validation.data) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const ruleRepository = new RuleRepository(db);

      // Extract workerId and tags from request body
      const body = request.body as Record<string, unknown>;
      const workerId = typeof body.workerId === 'string' ? body.workerId : undefined;
      
      // Add tags to validation data if provided
      if (Array.isArray(body.tags)) {
        validation.data.tags = body.tags.filter((t): t is string => typeof t === 'string');
      }

      const rule = ruleRepository.create(validation.data, workerId);
      
      // Invalidate cache for this worker (Requirement 4.4)
      const ruleCache = getRuleCache();
      ruleCache.invalidate(workerId);
      // Also invalidate global cache if this is a global rule
      if (!workerId) {
        ruleCache.invalidate(undefined);
      }
      
      return reply.status(201).send(rule);
    } catch (error: any) {
      if (error.message === 'DUPLICATE_RULE') {
        return reply.status(409).send({ error: 'Duplicate rule', message: '相同的规则已存在' });
      }
      request.log.error(error, 'Error creating rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * PUT /api/rules/:id
   * Update an existing rule
   * 
   * Requirements: 3.3, 4.4
   */
  fastify.put('/:id', async (request: FastifyRequest<{ Params: RuleParams }>, reply: FastifyReply) => {
    const validation = validateUpdateRule(request.body);
    if (!validation.valid) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const ruleRepository = new RuleRepository(db);

      // Get existing rule to know which worker's cache to invalidate
      const existingRule = ruleRepository.findById(request.params.id);
      
      // Extract workerId from request body
      const body = request.body as Record<string, unknown>;
      const updateData = { ...validation.data } as any;
      if (body.workerId !== undefined) {
        updateData.workerId = body.workerId || null;
      }

      const rule = ruleRepository.update(request.params.id, updateData);
      if (!rule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      // Invalidate cache for affected workers (Requirement 4.4)
      const ruleCache = getRuleCache();
      // Invalidate old worker's cache
      if (existingRule) {
        ruleCache.invalidate(existingRule.workerId);
      }
      // Invalidate new worker's cache (in case workerId changed)
      ruleCache.invalidate(rule.workerId);
      // Also invalidate global cache if either is a global rule
      if (!existingRule?.workerId || !rule.workerId) {
        ruleCache.invalidate(undefined);
      }

      return reply.send(rule);
    } catch (error) {
      request.log.error(error, 'Error updating rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * DELETE /api/rules/:id
   * Delete a rule and its associated statistics
   * 
   * Requirements: 3.4, 4.4
   */
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: RuleParams }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const ruleRepository = new RuleRepository(db);
      const statsRepository = new StatsRepository(db);

      // Get rule before deletion to know which worker's cache to invalidate
      const rule = ruleRepository.findById(request.params.id);
      
      // Delete stats first (cascade)
      statsRepository.delete(request.params.id);

      // Delete the rule
      const deleted = ruleRepository.delete(request.params.id);
      if (!deleted) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      // Invalidate cache for this worker (Requirement 4.4)
      if (rule) {
        const ruleCache = getRuleCache();
        ruleCache.invalidate(rule.workerId);
        // Also invalidate global cache if this was a global rule
        if (!rule.workerId) {
          ruleCache.invalidate(undefined);
        }
      }

      return reply.status(204).send();
    } catch (error) {
      request.log.error(error, 'Error deleting rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/rules/:id/toggle
   * Toggle rule enabled status
   * 
   * Requirements: 3.5, 4.4
   */
  fastify.post('/:id/toggle', async (request: FastifyRequest<{ Params: RuleParams }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const ruleRepository = new RuleRepository(db);

      const rule = ruleRepository.toggle(request.params.id);
      if (!rule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      // Invalidate cache for this worker (Requirement 4.4)
      const ruleCache = getRuleCache();
      ruleCache.invalidate(rule.workerId);
      // Also invalidate global cache if this is a global rule
      if (!rule.workerId) {
        ruleCache.invalidate(undefined);
      }

      return reply.send(rule);
    } catch (error) {
      request.log.error(error, 'Error toggling rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
