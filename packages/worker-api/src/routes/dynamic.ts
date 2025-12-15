/**
 * Dynamic Config Routes
 * API endpoints for dynamic rule configuration
 * 
 * Requirements: 6.1, 6.2
 */

import { Hono } from 'hono';
import type { DynamicConfig } from '@email-filter/shared';
import { RuleRepository } from '../db/rule-repository.js';
import { DynamicRuleService } from '../services/dynamic-rule.service.js';
import { errorResponse, successResponse } from '../utils/response.js';

export type DynamicBindings = {
  DB: D1Database;
};

const dynamicRouter = new Hono<{ Bindings: DynamicBindings }>();

/**
 * GET /api/dynamic/config - Get dynamic rule configuration
 */
dynamicRouter.get('/config', async (c) => {
  try {
    const ruleRepository = new RuleRepository(c.env.DB);
    const dynamicRuleService = new DynamicRuleService(c.env.DB, ruleRepository);

    const config = await dynamicRuleService.getConfig();
    return c.json(successResponse(config));
  } catch (error) {
    console.error('Dynamic config fetch error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch dynamic configuration'), 500);
  }
});

/**
 * PUT /api/dynamic/config - Update dynamic rule configuration
 */
dynamicRouter.put('/config', async (c) => {
  try {
    const body = await c.req.json<Partial<DynamicConfig>>();
    
    // Validate configuration values
    const details: Record<string, string> = {};
    
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      details.enabled = 'Enabled must be a boolean';
    }
    
    if (body.timeWindowMinutes !== undefined) {
      if (typeof body.timeWindowMinutes !== 'number' || body.timeWindowMinutes < 1) {
        details.timeWindowMinutes = 'Time window must be a positive number';
      }
    }
    
    if (body.thresholdCount !== undefined) {
      if (typeof body.thresholdCount !== 'number' || body.thresholdCount < 1) {
        details.thresholdCount = 'Threshold count must be a positive number';
      }
    }
    
    if (body.expirationHours !== undefined) {
      if (typeof body.expirationHours !== 'number' || body.expirationHours < 1) {
        details.expirationHours = 'Expiration hours must be a positive number';
      }
    }
    
    if (Object.keys(details).length > 0) {
      return c.json(errorResponse('VALIDATION_ERROR', 'Validation failed', details), 400);
    }

    const ruleRepository = new RuleRepository(c.env.DB);
    const dynamicRuleService = new DynamicRuleService(c.env.DB, ruleRepository);

    const config = await dynamicRuleService.updateConfig(body);
    return c.json(successResponse(config));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json(errorResponse('INVALID_JSON', 'Invalid JSON in request body'), 400);
    }
    console.error('Dynamic config update error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to update dynamic configuration'), 500);
  }
});


/**
 * POST /api/dynamic/cleanup - Trigger cleanup of expired dynamic rules
 */
dynamicRouter.post('/cleanup', async (c) => {
  try {
    const ruleRepository = new RuleRepository(c.env.DB);
    const dynamicRuleService = new DynamicRuleService(c.env.DB, ruleRepository);

    const deletedIds = await dynamicRuleService.cleanupExpiredRules();
    return c.json(successResponse({ 
      deletedCount: deletedIds.length,
      deletedIds 
    }));
  } catch (error) {
    console.error('Dynamic cleanup error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to cleanup expired rules'), 500);
  }
});

/**
 * GET /api/dynamic/subjects - Get current subject tracking counts
 */
dynamicRouter.get('/subjects', async (c) => {
  try {
    const ruleRepository = new RuleRepository(c.env.DB);
    const dynamicRuleService = new DynamicRuleService(c.env.DB, ruleRepository);

    const counts = await dynamicRuleService.getSubjectCounts();
    return c.json(successResponse(counts));
  } catch (error) {
    console.error('Subject counts fetch error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch subject counts'), 500);
  }
});

export { dynamicRouter };
