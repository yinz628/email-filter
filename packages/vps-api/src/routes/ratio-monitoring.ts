/**
 * Ratio Monitoring Routes
 * API endpoints for ratio-based monitoring (comparing email counts between rules)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type {
  CreateRatioMonitorDTO,
  UpdateRatioMonitorDTO,
  RatioTimeWindow,
} from '@email-filter/shared';
import { getDatabase } from '../db/index.js';
import { RatioMonitorService } from '../services/monitoring/ratio-monitor.service.js';
import { authMiddleware } from '../middleware/auth.js';

interface RatioMonitorParams {
  id: string;
}

interface RatioMonitorQuery {
  tag?: string;
  enabled?: string;
}

/**
 * Helper to get service instance (lazy initialization)
 */
function getService(): RatioMonitorService {
  const db = getDatabase();
  return new RatioMonitorService(db);
}

/**
 * Register ratio monitoring routes
 */
export async function ratioMonitoringRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authMiddleware);

  // Get all ratio monitors
  fastify.get(
    '/',
    async (request: FastifyRequest<{ Querystring: RatioMonitorQuery }>, reply: FastifyReply) => {
      try {
        const service = getService();
        const { tag, enabled } = request.query;
        const filter: { tag?: string; enabled?: boolean } = {};

        if (tag) filter.tag = tag;
        if (enabled !== undefined) filter.enabled = enabled === 'true';

        const monitors = service.getAll(filter);
        return reply.send({ monitors, total: monitors.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({ error: message });
      }
    }
  );


  // Get ratio monitor status
  fastify.get(
    '/status',
    async (request: FastifyRequest<{ Querystring: RatioMonitorQuery }>, reply: FastifyReply) => {
      try {
        const service = getService();
        const { tag, enabled } = request.query;
        const filter: { tag?: string; enabled?: boolean } = {};

        if (tag) filter.tag = tag;
        if (enabled !== undefined) filter.enabled = enabled === 'true';

        const statuses = service.getAllStatus(filter);
        return reply.send({ statuses, total: statuses.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({ error: message });
      }
    }
  );

  // Get all tags
  fastify.get('/tags', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const service = getService();
      const tags = service.getAllTags();
      return reply.send({ tags });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });

  // Get single ratio monitor
  fastify.get(
    '/:id',
    async (request: FastifyRequest<{ Params: RatioMonitorParams }>, reply: FastifyReply) => {
      try {
        const service = getService();
        const monitor = service.getById(request.params.id);
        if (!monitor) {
          return reply.status(404).send({ error: 'Ratio monitor not found' });
        }
        return reply.send(monitor);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({ error: message });
      }
    }
  );

  // Create ratio monitor
  fastify.post(
    '/',
    async (request: FastifyRequest<{ Body: CreateRatioMonitorDTO }>, reply: FastifyReply) => {
      try {
        const service = getService();
        const body = request.body;

        // Validate required fields
        if (!body.name || !body.tag || !body.firstRuleId || !body.secondRuleId) {
          return reply.status(400).send({ error: 'Missing required fields: name, tag, firstRuleId, secondRuleId' });
        }

        if (body.thresholdPercent === undefined || body.thresholdPercent < 0 || body.thresholdPercent > 100) {
          return reply.status(400).send({ error: 'thresholdPercent must be between 0 and 100' });
        }

        const validTimeWindows: RatioTimeWindow[] = ['1h', '12h', '24h'];
        if (!validTimeWindows.includes(body.timeWindow)) {
          return reply.status(400).send({ error: 'timeWindow must be one of: 1h, 12h, 24h' });
        }

        const monitor = service.create(body);
        return reply.status(201).send(monitor);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(400).send({ error: message });
      }
    }
  );

  // Update ratio monitor
  fastify.put(
    '/:id',
    async (
      request: FastifyRequest<{ Params: RatioMonitorParams; Body: UpdateRatioMonitorDTO }>,
      reply: FastifyReply
    ) => {
      try {
        const service = getService();
        const body = request.body;

        if (body.thresholdPercent !== undefined && (body.thresholdPercent < 0 || body.thresholdPercent > 100)) {
          return reply.status(400).send({ error: 'thresholdPercent must be between 0 and 100' });
        }

        const validTimeWindows: RatioTimeWindow[] = ['1h', '12h', '24h'];
        if (body.timeWindow && !validTimeWindows.includes(body.timeWindow)) {
          return reply.status(400).send({ error: 'timeWindow must be one of: 1h, 12h, 24h' });
        }

        const monitor = service.update(request.params.id, body);
        if (!monitor) {
          return reply.status(404).send({ error: 'Ratio monitor not found' });
        }
        return reply.send(monitor);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(400).send({ error: message });
      }
    }
  );

  // Delete ratio monitor
  fastify.delete(
    '/:id',
    async (request: FastifyRequest<{ Params: RatioMonitorParams }>, reply: FastifyReply) => {
      try {
        const service = getService();
        const deleted = service.delete(request.params.id);
        if (!deleted) {
          return reply.status(404).send({ error: 'Ratio monitor not found' });
        }
        return reply.send({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({ error: message });
      }
    }
  );

  // Check all ratio monitors (manual trigger)
  fastify.post('/check', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const service = getService();
      const result = service.checkAll();
      return reply.send(result);
    } catch (error) {
      console.error('[Ratio Check Error]', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });

  // Get ratio alerts
  fastify.get(
    '/alerts',
    async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
      try {
        const service = getService();
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        const alerts = service.getAlerts(limit);
        return reply.send({ alerts, total: alerts.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({ error: message });
      }
    }
  );

  // Delete ratio alert
  fastify.delete(
    '/alerts/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const db = getDatabase();
        const stmt = db.prepare('DELETE FROM ratio_alerts WHERE id = ?');
        const result = stmt.run(request.params.id);
        
        if (result.changes === 0) {
          return reply.status(404).send({ error: 'Alert not found' });
        }
        return reply.send({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({ error: message });
      }
    }
  );
}
