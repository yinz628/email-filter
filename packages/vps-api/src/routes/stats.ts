/**
 * Stats Routes
 * Statistics querying endpoints
 * 
 * Requirements: 5.2
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StatsService } from '../services/stats.service.js';
import { StatsRepository } from '../db/stats-repository.js';
import { LogRepository } from '../db/log-repository.js';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

/**
 * Register stats routes
 */
export async function statsRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /api/stats
   * Get overall statistics summary
   * 
   * Requirements: 5.2
   */
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const statsRepository = new StatsRepository(db);
      const statsService = new StatsService(statsRepository);

      const summary = statsService.getStatsSummary();
      return reply.send(summary);
    } catch (error) {
      request.log.error(error, 'Error fetching stats');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/stats/rules
   * Get per-rule statistics
   * 
   * Requirements: 5.2
   */
  fastify.get('/rules', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const statsRepository = new StatsRepository(db);
      const statsService = new StatsService(statsRepository);

      const ruleStats = statsService.getAllRuleStats();
      return reply.send({ ruleStats });
    } catch (error) {
      request.log.error(error, 'Error fetching rule stats');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/stats/trending
   * Get top blocked rules in recent time period (auto-monitoring)
   * Query params: hours (default: 24), limit (default: 5)
   */
  fastify.get('/trending', async (request: FastifyRequest<{ Querystring: { hours?: string; limit?: string } }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const logRepository = new LogRepository(db);

      const hours = Math.min(parseInt(request.query.hours || '24', 10) || 24, 168); // Max 7 days
      const limit = Math.min(parseInt(request.query.limit || '5', 10) || 5, 20); // Max 20

      const trending = logRepository.getTopBlockedRules(hours, limit);
      return reply.send({ trending, hours, limit });
    } catch (error) {
      request.log.error(error, 'Error fetching trending stats');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
