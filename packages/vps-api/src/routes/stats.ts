/**
 * Stats Routes
 * Statistics querying endpoints
 * 
 * Requirements: 2.1, 2.2, 2.3, 5.2
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StatsService } from '../services/stats.service.js';
import { StatsRepository } from '../db/stats-repository.js';
import { LogRepository } from '../db/log-repository.js';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

interface StatsQuerystring {
  workerName?: string;
}

/**
 * Register stats routes
 */
export async function statsRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /api/stats
   * Get overall statistics summary
   * Query params: workerName (optional) - filter by worker instance
   * 
   * Requirements: 2.1, 2.2, 5.2
   */
  fastify.get<{ Querystring: StatsQuerystring }>('/', async (request, reply) => {
    try {
      const db = getDatabase();
      const statsRepository = new StatsRepository(db);
      const statsService = new StatsService(statsRepository);

      const { workerName } = request.query;
      const summary = statsService.getStatsSummary(workerName);
      return reply.send(summary);
    } catch (error) {
      request.log.error(error, 'Error fetching stats');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/stats/by-worker
   * Get statistics breakdown by worker instance
   * 
   * Requirements: 2.2, 2.3
   */
  fastify.get('/by-worker', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const statsRepository = new StatsRepository(db);
      const statsService = new StatsService(statsRepository);

      const byWorker = statsService.getStatsByWorker();
      const workerNames = statsService.getWorkerNames();
      return reply.send({ byWorker, workerNames });
    } catch (error) {
      request.log.error(error, 'Error fetching stats by worker');
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
   * Query params: hours (default: 24), limit (default: 5), workerName (optional)
   * 
   * Requirements: 3.1, 3.2, 3.3
   */
  fastify.get('/trending', async (request: FastifyRequest<{ Querystring: { hours?: string; limit?: string; workerName?: string } }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const logRepository = new LogRepository(db);

      const hours = Math.min(parseInt(request.query.hours || '24', 10) || 24, 168); // Max 7 days
      const limit = Math.min(parseInt(request.query.limit || '5', 10) || 5, 20); // Max 20
      const { workerName } = request.query;

      const trending = logRepository.getTopBlockedRules(hours, limit, workerName);
      return reply.send({ trending, hours, limit, workerName: workerName || null });
    } catch (error) {
      request.log.error(error, 'Error fetching trending stats');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/stats/workers
   * Get list of distinct worker names
   */
  fastify.get('/workers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const statsRepository = new StatsRepository(db);
      const statsService = new StatsService(statsRepository);

      const workerNames = statsService.getWorkerNames();
      return reply.send({ workerNames });
    } catch (error) {
      request.log.error(error, 'Error fetching worker names');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
