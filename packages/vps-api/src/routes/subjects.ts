/**
 * Subject Stats Routes
 * API endpoints for email subject statistics display
 * 
 * Requirements: 2.1, 2.4, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.2, 7.1
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SubjectStatsFilter } from '@email-filter/shared';
import { SubjectStatsService } from '../services/subject-stats.service.js';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

// ============================================
// Request Type Definitions
// ============================================

interface SubjectParams {
  id: string;
}

interface GetSubjectsQuery {
  workerName?: string;
  merchantDomain?: string;
  isFocused?: string;
  sortBy?: string;
  sortOrder?: string;
  limit?: string;
  offset?: string;
}

interface BatchDeleteBody {
  ids: string[];
}

interface SetFocusBody {
  focused: boolean;
}

// ============================================
// Validation Functions
// ============================================

/**
 * Validate batch delete request body
 */
function validateBatchDelete(body: unknown): { valid: boolean; error?: string; data?: BatchDeleteBody } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;

  if (!Array.isArray(data.ids)) {
    return { valid: false, error: 'ids must be an array' };
  }

  if (data.ids.length === 0) {
    return { valid: false, error: 'ids array cannot be empty' };
  }

  for (let i = 0; i < data.ids.length; i++) {
    if (typeof data.ids[i] !== 'string') {
      return { valid: false, error: `ids[${i}] must be a string` };
    }
  }

  return { valid: true, data: { ids: data.ids as string[] } };
}

/**
 * Validate set focus request body
 */
function validateSetFocus(body: unknown): { valid: boolean; error?: string; data?: SetFocusBody } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;

  if (typeof data.focused !== 'boolean') {
    return { valid: false, error: 'focused must be a boolean' };
  }

  return { valid: true, data: { focused: data.focused } };
}

// ============================================
// Route Registration
// ============================================

/**
 * Register subject stats routes
 * 
 * Requirements: 7.1
 */
export async function subjectRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /api/subjects
   * Get subject statistics list with filtering and pagination
   * 
   * Requirements: 2.1, 2.4, 3.2, 3.3, 5.2
   */
  fastify.get('/', async (
    request: FastifyRequest<{ Querystring: GetSubjectsQuery }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new SubjectStatsService(db);

      const { workerName, merchantDomain, isFocused, sortBy, sortOrder, limit, offset } = request.query;
      const filter: SubjectStatsFilter = {};

      // Worker name filter (Requirements: 3.2)
      if (workerName) {
        filter.workerName = workerName;
      }

      // Merchant domain filter
      if (merchantDomain) {
        filter.merchantDomain = merchantDomain;
      }

      // Focus filter (Requirements: 5.2)
      if (isFocused !== undefined) {
        filter.isFocused = isFocused === 'true';
      }

      // Sort options (Requirements: 3.3)
      if (sortBy && ['emailCount', 'lastSeenAt', 'firstSeenAt'].includes(sortBy)) {
        filter.sortBy = sortBy as SubjectStatsFilter['sortBy'];
      }
      if (sortOrder && ['asc', 'desc'].includes(sortOrder)) {
        filter.sortOrder = sortOrder as 'asc' | 'desc';
      }

      // Pagination (Requirements: 2.4)
      if (limit) {
        const limitNum = parseInt(limit, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          filter.limit = limitNum;
        }
      }
      if (offset) {
        const offsetNum = parseInt(offset, 10);
        if (!isNaN(offsetNum) && offsetNum >= 0) {
          filter.offset = offsetNum;
        }
      }

      const result = service.getSubjectStats(filter);

      return reply.send(result);
    } catch (error) {
      request.log.error(error, 'Error fetching subject stats');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/subjects/merchant-domains
   * Get list of all unique merchant domains
   */
  fastify.get('/merchant-domains', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new SubjectStatsService(db);

      const domains = service.getMerchantDomains();

      return reply.send({ domains });
    } catch (error) {
      request.log.error(error, 'Error fetching merchant domains');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/subjects/:id
   * Get a single subject stat with worker breakdown
   * 
   * Requirements: 2.1
   */
  fastify.get('/:id', async (
    request: FastifyRequest<{ Params: SubjectParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new SubjectStatsService(db);

      const subject = service.getSubjectById(request.params.id);
      if (!subject) {
        return reply.status(404).send({ error: 'Subject not found' });
      }

      return reply.send(subject);
    } catch (error) {
      request.log.error(error, 'Error fetching subject');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * DELETE /api/subjects/:id
   * Delete a single subject stat
   * 
   * Requirements: 4.1
   */
  fastify.delete('/:id', async (
    request: FastifyRequest<{ Params: SubjectParams }>,
    reply: FastifyReply
  ) => {
    try {
      const db = getDatabase();
      const service = new SubjectStatsService(db);

      const deleted = service.deleteSubject(request.params.id);
      if (!deleted) {
        return reply.status(404).send({ error: 'Subject not found' });
      }

      return reply.send({ success: true, deleted: request.params.id });
    } catch (error) {
      request.log.error(error, 'Error deleting subject');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/subjects/batch-delete
   * Delete multiple subject stats by IDs
   * 
   * Requirements: 4.4
   */
  fastify.post('/batch-delete', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const validation = validateBatchDelete(request.body);
    if (!validation.valid || !validation.data) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const service = new SubjectStatsService(db);

      const deletedCount = service.deleteSubjects(validation.data.ids);

      return reply.send({
        success: true,
        deletedCount,
        requestedCount: validation.data.ids.length,
      });
    } catch (error) {
      request.log.error(error, 'Error batch deleting subjects');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/subjects/:id/focus
   * Toggle focus status for a subject stat
   * 
   * Requirements: 4.2, 4.3
   */
  fastify.post('/:id/focus', async (
    request: FastifyRequest<{ Params: SubjectParams }>,
    reply: FastifyReply
  ) => {
    const validation = validateSetFocus(request.body);
    if (!validation.valid || !validation.data) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const service = new SubjectStatsService(db);

      const subject = service.setFocused(request.params.id, validation.data.focused);
      if (!subject) {
        return reply.status(404).send({ error: 'Subject not found' });
      }

      return reply.send(subject);
    } catch (error) {
      request.log.error(error, 'Error setting subject focus');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /api/subjects/:id/ignore
   * Toggle ignore status for a subject stat
   */
  fastify.post('/:id/ignore', async (
    request: FastifyRequest<{ Params: SubjectParams }>,
    reply: FastifyReply
  ) => {
    const validation = validateSetFocus(request.body); // Reuse the same validation (focused/ignored have same structure)
    if (!validation.valid || !validation.data) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const service = new SubjectStatsService(db);

      const subject = service.setIgnored(request.params.id, validation.data.focused); // Use 'focused' field as 'ignored'
      if (!subject) {
        return reply.status(404).send({ error: 'Subject not found' });
      }

      return reply.send(subject);
    } catch (error) {
      request.log.error(error, 'Error setting subject ignore status');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
