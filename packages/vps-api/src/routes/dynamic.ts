/**
 * Dynamic Rules Configuration Routes
 * Manage dynamic rule generation settings
 * 
 * Requirements: 6.4
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DynamicConfig } from '@email-filter/shared';
import { DynamicRuleService } from '../services/dynamic-rule.service.js';
import { RuleRepository } from '../db/rule-repository.js';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

/**
 * Validate DynamicConfig update
 */
function validateDynamicConfig(body: unknown): { valid: boolean; error?: string; data?: Partial<DynamicConfig> } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;
  const config: Partial<DynamicConfig> = {};

  if (data.enabled !== undefined) {
    if (typeof data.enabled !== 'boolean') {
      return { valid: false, error: 'enabled must be a boolean' };
    }
    config.enabled = data.enabled;
  }

  if (data.timeWindowMinutes !== undefined) {
    const value = Number(data.timeWindowMinutes);
    if (isNaN(value) || value < 1) {
      return { valid: false, error: 'timeWindowMinutes must be a positive number' };
    }
    config.timeWindowMinutes = value;
  }

  if (data.thresholdCount !== undefined) {
    const value = Number(data.thresholdCount);
    if (isNaN(value) || value < 1) {
      return { valid: false, error: 'thresholdCount must be a positive number' };
    }
    config.thresholdCount = value;
  }

  if (data.expirationHours !== undefined) {
    const value = Number(data.expirationHours);
    if (isNaN(value) || value < 1) {
      return { valid: false, error: 'expirationHours must be a positive number' };
    }
    config.expirationHours = value;
  }

  return { valid: true, data: config };
}

/**
 * Register dynamic config routes
 */
export async function dynamicRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /api/dynamic/config
   * Get current dynamic rule configuration
   * 
   * Requirements: 6.4
   */
  fastify.get('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const ruleRepository = new RuleRepository(db);
      const dynamicService = new DynamicRuleService(db, ruleRepository);

      const config = dynamicService.getConfig();
      return reply.send(config);
    } catch (error) {
      request.log.error(error, 'Error fetching dynamic config');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * PUT /api/dynamic/config
   * Update dynamic rule configuration
   * 
   * Requirements: 6.4
   */
  fastify.put('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const validation = validateDynamicConfig(request.body);
    if (!validation.valid) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const ruleRepository = new RuleRepository(db);
      const dynamicService = new DynamicRuleService(db, ruleRepository);

      const updatedConfig = dynamicService.updateConfig(validation.data || {});
      return reply.send(updatedConfig);
    } catch (error) {
      request.log.error(error, 'Error updating dynamic config');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
