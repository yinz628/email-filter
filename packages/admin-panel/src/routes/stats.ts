/**
 * Stats Routes
 * API endpoints for aggregated statistics from Worker instances
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import { Hono } from 'hono';
import { StatsAggregatorService } from '../services/stats-aggregator.service.js';
import { errorResponse, successResponse } from '../utils/response.js';

export type StatsBindings = {
  DB: D1Database;
};

const statsRouter = new Hono<{ Bindings: StatsBindings }>();

/**
 * GET /api/stats - Get aggregated statistics from all worker instances
 * Requirements: 3.1, 3.2, 3.3
 */
statsRouter.get('/', async (c) => {
  try {
    const statsService = new StatsAggregatorService(c.env.DB);
    const stats = await statsService.getAggregatedStats();

    return c.json(successResponse(stats));
  } catch (error) {
    console.error('Get aggregated stats error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch aggregated statistics'), 500);
  }
});

/**
 * GET /api/stats/:instanceId - Get statistics for a specific worker instance
 * Requirements: 3.1
 */
statsRouter.get('/:instanceId', async (c) => {
  try {
    const instanceId = c.req.param('instanceId');
    const statsService = new StatsAggregatorService(c.env.DB);

    const stats = await statsService.getInstanceStats(instanceId);
    if (!stats) {
      return c.json(errorResponse('NOT_FOUND', 'Instance not found or statistics unavailable'), 404);
    }

    return c.json(successResponse(stats));
  } catch (error) {
    console.error('Get instance stats error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch instance statistics'), 500);
  }
});

/**
 * POST /api/stats/refresh - Refresh statistics from all worker instances
 * Requirements: 3.4
 */
statsRouter.post('/refresh', async (c) => {
  try {
    const statsService = new StatsAggregatorService(c.env.DB);
    const stats = await statsService.refreshAllStats();

    return c.json(successResponse(stats));
  } catch (error) {
    console.error('Refresh stats error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to refresh statistics'), 500);
  }
});

export { statsRouter };
