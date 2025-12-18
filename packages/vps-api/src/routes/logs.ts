/**
 * Logs Routes
 * View and manage system logs
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LogRepository, type LogCategory, type LogLevel } from '../db/log-repository.js';
import { RuleRepository } from '../db/rule-repository.js';
import { DynamicRuleService } from '../services/dynamic-rule.service.js';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

interface GetLogsQuery {
  category?: string;
  level?: string;
  workerName?: string;
  limit?: string;
  offset?: string;
  search?: string;
}

const VALID_CATEGORIES: LogCategory[] = ['email_forward', 'email_drop', 'admin_action', 'system'];
const VALID_LEVELS: LogLevel[] = ['info', 'warn', 'error'];

export async function logsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /api/logs
   * Get logs with optional filtering and search
   */
  fastify.get('/', async (request: FastifyRequest<{ Querystring: GetLogsQuery }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const logRepository = new LogRepository(db);

      const { category, level, workerName, limit, offset, search } = request.query;
      const filter: { category?: LogCategory; level?: LogLevel; workerName?: string; limit?: number; offset?: number; search?: string } = {};

      if (category && VALID_CATEGORIES.includes(category as LogCategory)) {
        filter.category = category as LogCategory;
      }
      if (level && VALID_LEVELS.includes(level as LogLevel)) {
        filter.level = level as LogLevel;
      }
      if (workerName && workerName.trim()) {
        filter.workerName = workerName.trim();
      }
      if (limit) {
        filter.limit = Math.min(parseInt(limit, 10) || 100, 500);
      } else {
        filter.limit = 100;
      }
      if (offset) {
        filter.offset = parseInt(offset, 10) || 0;
      }
      if (search && search.trim()) {
        filter.search = search.trim();
      }

      const logs = logRepository.findAll(filter);
      const counts = logRepository.countByCategory();

      return reply.send({ logs, counts });
    } catch (error) {
      request.log.error(error, 'Error fetching logs');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * DELETE /api/logs/cleanup
   * Delete old logs and subject tracker records
   */
  fastify.delete('/cleanup', async (request: FastifyRequest<{ Querystring: { days?: string } }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const logRepository = new LogRepository(db);
      const ruleRepository = new RuleRepository(db);
      const dynamicService = new DynamicRuleService(db, ruleRepository);
      
      const days = parseInt(request.query.days || '7', 10) || 7;
      const deletedLogs = logRepository.cleanup(days);
      
      // Also cleanup subject tracker records (keep only 1 day for dynamic rules)
      const trackerDays = Math.min(days, 1); // Subject tracker only needs recent data
      const deletedTracker = dynamicService.cleanupSubjectTrackerByDays(trackerDays);
      
      return reply.send({ 
        deletedLogs, 
        deletedTracker,
        message: `Deleted ${deletedLogs} log entries and ${deletedTracker} tracker records` 
      });
    } catch (error) {
      request.log.error(error, 'Error cleaning up logs');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * DELETE /api/logs/batch
   * Delete logs by IDs
   */
  fastify.delete('/batch', async (request: FastifyRequest<{ Body: { ids: number[] } }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const logRepository = new LogRepository(db);
      const body = request.body as { ids?: number[] };
      
      if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
        return reply.status(400).send({ error: 'ids array is required' });
      }
      
      const deleted = logRepository.deleteByIds(body.ids);
      return reply.send({ deleted, message: `Deleted ${deleted} log entries` });
    } catch (error) {
      request.log.error(error, 'Error deleting logs');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * DELETE /api/logs/search
   * Delete logs matching search criteria
   */
  fastify.delete('/search', async (request: FastifyRequest<{ Querystring: { search: string; category?: string } }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const logRepository = new LogRepository(db);
      const { search, category } = request.query;
      
      if (!search || !search.trim()) {
        return reply.status(400).send({ error: 'search parameter is required' });
      }
      
      const cat = category && VALID_CATEGORIES.includes(category as LogCategory) ? category as LogCategory : undefined;
      const deleted = logRepository.deleteBySearch(search.trim(), cat);
      
      return reply.send({ deleted, message: `Deleted ${deleted} log entries matching "${search}"` });
    } catch (error) {
      request.log.error(error, 'Error deleting logs by search');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
