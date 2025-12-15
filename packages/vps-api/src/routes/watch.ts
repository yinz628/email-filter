/**
 * Watch Rules Routes
 * Manage statistics tracking rules
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WatchRepository, type CreateWatchRuleDTO } from '../db/watch-repository.js';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

const VALID_MATCH_TYPES = ['sender', 'subject', 'domain'];
const VALID_MATCH_MODES = ['exact', 'contains', 'startsWith', 'endsWith', 'regex'];

function validateCreateDTO(body: unknown): { valid: boolean; error?: string; data?: CreateWatchRuleDTO } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }
  const data = body as Record<string, unknown>;

  if (!data.name || typeof data.name !== 'string') {
    return { valid: false, error: 'name is required' };
  }
  if (!data.matchType || !VALID_MATCH_TYPES.includes(data.matchType as string)) {
    return { valid: false, error: 'matchType must be sender, subject, or domain' };
  }
  if (!data.matchMode || !VALID_MATCH_MODES.includes(data.matchMode as string)) {
    return { valid: false, error: 'matchMode must be exact, contains, startsWith, endsWith, or regex' };
  }
  if (!data.pattern || typeof data.pattern !== 'string') {
    return { valid: false, error: 'pattern is required' };
  }

  return {
    valid: true,
    data: {
      name: data.name as string,
      matchType: data.matchType as CreateWatchRuleDTO['matchType'],
      matchMode: data.matchMode as CreateWatchRuleDTO['matchMode'],
      pattern: data.pattern as string,
    },
  };
}

export async function watchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authMiddleware);

  // GET /api/watch - Get all watch rules with stats
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const repo = new WatchRepository(db);
      const rules = repo.findAllWithStats();
      return reply.send({ rules });
    } catch (error) {
      request.log.error(error, 'Error fetching watch rules');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });


  // POST /api/watch - Create watch rule
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const validation = validateCreateDTO(request.body);
    if (!validation.valid) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const repo = new WatchRepository(db);
      const rule = repo.create(validation.data!);
      return reply.status(201).send(rule);
    } catch (error) {
      request.log.error(error, 'Error creating watch rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // POST /api/watch/:id/toggle - Toggle enabled
  fastify.post('/:id/toggle', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const repo = new WatchRepository(db);
      const rule = repo.toggleEnabled(request.params.id);
      if (!rule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }
      return reply.send(rule);
    } catch (error) {
      request.log.error(error, 'Error toggling watch rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // POST /api/watch/:id/reset - Reset hit count
  fastify.post('/:id/reset', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const repo = new WatchRepository(db);
      repo.resetHitCount(request.params.id);
      return reply.send({ success: true });
    } catch (error) {
      request.log.error(error, 'Error resetting watch rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // DELETE /api/watch/:id - Delete watch rule
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const repo = new WatchRepository(db);
      const deleted = repo.delete(request.params.id);
      if (!deleted) {
        return reply.status(404).send({ error: 'Rule not found' });
      }
      return reply.send({ success: true });
    } catch (error) {
      request.log.error(error, 'Error deleting watch rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
