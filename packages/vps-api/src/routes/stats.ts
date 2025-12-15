/**
 * Stats Routes
 * Statistics querying endpoints
 * 
 * Requirements: 5.2
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StatsService } from '../services/stats.service.js';
import { StatsRepository } from '../db/stats-repository.js';
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
}
