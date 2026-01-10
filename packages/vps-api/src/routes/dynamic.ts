/**
 * Dynamic Rules Configuration Routes
 * Manage dynamic rule generation settings
 * 
 * Requirements: 5.6, 6.4
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DynamicConfig } from '@email-filter/shared';
import { DynamicRuleService } from '../services/dynamic-rule.service.js';
import { RuleRepository } from '../db/rule-repository.js';
import { LogRepository } from '../db/log-repository.js';
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
    if (isNaN(value) || value < 5 || value > 120) {
      return { valid: false, error: 'timeWindowMinutes must be between 5 and 120' };
    }
    config.timeWindowMinutes = value;
  }

  // Requirements 3.2: timeSpanThresholdMinutes must be between 0.5 and 30 minutes
  if (data.timeSpanThresholdMinutes !== undefined) {
    const value = Number(data.timeSpanThresholdMinutes);
    if (isNaN(value) || value < 0.5 || value > 30) {
      return { valid: false, error: 'timeSpanThresholdMinutes must be between 0.5 and 30' };
    }
    config.timeSpanThresholdMinutes = value;
  }

  // Requirements 3.1: thresholdCount must be at least 5
  if (data.thresholdCount !== undefined) {
    const value = Number(data.thresholdCount);
    if (isNaN(value) || value < 5) {
      return { valid: false, error: 'thresholdCount must be at least 5' };
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

  if (data.lastHitThresholdHours !== undefined) {
    const value = Number(data.lastHitThresholdHours);
    if (isNaN(value) || value < 1) {
      return { valid: false, error: 'lastHitThresholdHours must be a positive number' };
    }
    config.lastHitThresholdHours = value;
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
   * Requirements: 5.6, 6.4
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
      const logRepository = new LogRepository(db);

      // Get current config before update for logging
      const oldConfig = dynamicService.getConfig();
      
      const updatedConfig = dynamicService.updateConfig(validation.data || {});
      
      // Log admin action (Requirement 5.6)
      logRepository.createAdminLog('更新动态规则配置', {
        action: 'update',
        entityType: 'dynamic_config',
        changes: validation.data,
        oldConfig: {
          enabled: oldConfig.enabled,
          timeWindowMinutes: oldConfig.timeWindowMinutes,
          thresholdCount: oldConfig.thresholdCount,
          timeSpanThresholdMinutes: oldConfig.timeSpanThresholdMinutes,
          expirationHours: oldConfig.expirationHours,
          lastHitThresholdHours: oldConfig.lastHitThresholdHours,
        },
        newConfig: {
          enabled: updatedConfig.enabled,
          timeWindowMinutes: updatedConfig.timeWindowMinutes,
          thresholdCount: updatedConfig.thresholdCount,
          timeSpanThresholdMinutes: updatedConfig.timeSpanThresholdMinutes,
          expirationHours: updatedConfig.expirationHours,
          lastHitThresholdHours: updatedConfig.lastHitThresholdHours,
        },
      });
      
      return reply.send(updatedConfig);
    } catch (error) {
      request.log.error(error, 'Error updating dynamic config');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/dynamic/cleanup
   * Manually trigger cleanup of expired dynamic rules
   */
  fastify.post('/cleanup', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const ruleRepository = new RuleRepository(db);
      const dynamicService = new DynamicRuleService(db, ruleRepository);

      const deletedIds = dynamicService.cleanupExpiredRules();
      return reply.send({ 
        deletedCount: deletedIds.length, 
        deletedIds,
        message: `Cleaned up ${deletedIds.length} expired dynamic rules` 
      });
    } catch (error) {
      request.log.error(error, 'Error cleaning up dynamic rules');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * DELETE /api/dynamic/tracker
   * Clean up subject tracker records to free disk space
   * Query params: hours (default: 1) - keep records from last N hours
   */
  fastify.delete('/tracker', async (request: FastifyRequest<{ Querystring: { hours?: string } }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const ruleRepository = new RuleRepository(db);
      const dynamicService = new DynamicRuleService(db, ruleRepository);

      const hours = parseFloat(request.query.hours || '1') || 1;
      const deleted = dynamicService.cleanupSubjectTrackerByHours(hours);
      
      return reply.send({ 
        deleted, 
        message: `Deleted ${deleted} subject tracker records older than ${hours} hour(s)` 
      });
    } catch (error) {
      request.log.error(error, 'Error cleaning up subject tracker');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/dynamic/tracker/stats
   * Get subject tracker statistics
   */
  fastify.get('/tracker/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const ruleRepository = new RuleRepository(db);
      const dynamicService = new DynamicRuleService(db, ruleRepository);

      const stats = dynamicService.getSubjectTrackerStats();
      return reply.send(stats);
    } catch (error) {
      request.log.error(error, 'Error fetching subject tracker stats');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
