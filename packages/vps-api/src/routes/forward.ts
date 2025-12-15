/**
 * Forward Configuration Routes
 * Manage email forwarding settings
 * 
 * Requirements: 4.4
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { config } from '../config.js';

/**
 * Forward configuration interface
 */
interface ForwardConfigData {
  defaultForwardTo: string;
  updatedAt: string;
}

/**
 * Get forward config from database or return default
 */
function getForwardConfig(): ForwardConfigData {
  const db = getDatabase();
  const stmt = db.prepare('SELECT default_forward_to, updated_at FROM forward_config WHERE id = 1');
  const row = stmt.get() as { default_forward_to: string; updated_at: string } | undefined;

  if (row) {
    return {
      defaultForwardTo: row.default_forward_to,
      updatedAt: row.updated_at,
    };
  }

  // Return default from config
  return {
    defaultForwardTo: config.defaultForwardTo,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update forward config in database
 */
function updateForwardConfig(defaultForwardTo: string): ForwardConfigData {
  const db = getDatabase();
  const now = new Date().toISOString();

  const upsertStmt = db.prepare(`
    INSERT INTO forward_config (id, default_forward_to, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      default_forward_to = excluded.default_forward_to,
      updated_at = excluded.updated_at
  `);
  upsertStmt.run(defaultForwardTo, now);

  return {
    defaultForwardTo,
    updatedAt: now,
  };
}

/**
 * Validate forward config update
 */
function validateForwardConfig(body: unknown): { valid: boolean; error?: string; data?: { defaultForwardTo: string } } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;

  if (data.defaultForwardTo === undefined) {
    return { valid: false, error: 'defaultForwardTo is required' };
  }

  if (typeof data.defaultForwardTo !== 'string') {
    return { valid: false, error: 'defaultForwardTo must be a string' };
  }

  // Basic email validation
  const email = data.defaultForwardTo.trim();
  if (email && !email.includes('@')) {
    return { valid: false, error: 'defaultForwardTo must be a valid email address' };
  }

  return { valid: true, data: { defaultForwardTo: email } };
}

/**
 * Register forward config routes
 */
export async function forwardRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /api/forward/config
   * Get current forward configuration
   * 
   * Requirements: 4.4
   */
  fastify.get('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const forwardConfig = getForwardConfig();
      return reply.send(forwardConfig);
    } catch (error) {
      request.log.error(error, 'Error fetching forward config');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * PUT /api/forward/config
   * Update forward configuration
   * 
   * Requirements: 4.4
   */
  fastify.put('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const validation = validateForwardConfig(request.body);
    if (!validation.valid || !validation.data) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const updatedConfig = updateForwardConfig(validation.data.defaultForwardTo);
      return reply.send(updatedConfig);
    } catch (error) {
      request.log.error(error, 'Error updating forward config');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
