/**
 * Stats Routes
 * API endpoints for rule statistics
 * 
 * Requirements: 8.1, 8.2
 */

import { Hono } from 'hono';
import type { RuleCategory } from '@email-filter/shared';
import { RuleRepository } from '../db/rule-repository.js';
import { StatsRepository } from '../db/stats-repository.js';
import { StatsService } from '../services/stats.service.js';
import { errorResponse, successResponse } from '../utils/response.js';

export type StatsBindings = {
  DB: D1Database;
};

const statsRouter = new Hono<{ Bindings: StatsBindings }>();

/**
 * GET /api/stats/rules - Get all rule statistics
 */
statsRouter.get('/rules', async (c) => {
  try {
    const ruleRepository = new RuleRepository(c.env.DB);
    const statsRepository = new StatsRepository(c.env.DB);
    const statsService = new StatsService(statsRepository, ruleRepository);

    const category = c.req.query('category') as RuleCategory | undefined;
    
    const stats = category
      ? await statsService.getStatsByCategory(category)
      : await statsService.getStatsWithRuleInfo();
    
    return c.json(successResponse(stats));
  } catch (error) {
    console.error('Stats fetch error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch statistics'), 500);
  }
});

/**
 * GET /api/stats/rules/:ruleId - Get statistics for a specific rule
 */
statsRouter.get('/rules/:ruleId', async (c) => {
  try {
    const ruleRepository = new RuleRepository(c.env.DB);
    const statsRepository = new StatsRepository(c.env.DB);
    const statsService = new StatsService(statsRepository, ruleRepository);
    const ruleId = c.req.param('ruleId');

    const stats = await statsService.getStatsByRuleId(ruleId);
    if (!stats) {
      return c.json(errorResponse('NOT_FOUND', 'Statistics not found for this rule'), 404);
    }
    
    return c.json(successResponse(stats));
  } catch (error) {
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch statistics'), 500);
  }
});


/**
 * GET /api/stats/summary - Get summary statistics
 */
statsRouter.get('/summary', async (c) => {
  try {
    const ruleRepository = new RuleRepository(c.env.DB);
    const statsRepository = new StatsRepository(c.env.DB);
    const statsService = new StatsService(statsRepository, ruleRepository);

    const summary = await statsService.getSummary();
    
    return c.json(successResponse(summary));
  } catch (error) {
    console.error('Summary fetch error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch summary'), 500);
  }
});

/**
 * GET /api/stats/watch - Get all watch statistics
 * This endpoint is added for frontend compatibility
 */
statsRouter.get('/watch', async (c) => {
  try {
    const { WatchRepository } = await import('../db/watch-repository.js');
    const { WatchService } = await import('../services/watch.service.js');
    
    const watchRepository = new WatchRepository(c.env.DB);
    const watchService = new WatchService(watchRepository);

    const stats = await watchService.getAllWatchStats();
    return c.json(successResponse(stats));
  } catch (error) {
    console.error('Watch stats fetch error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch watch statistics'), 500);
  }
});

export { statsRouter };
