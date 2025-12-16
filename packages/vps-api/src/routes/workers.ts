/**
 * Worker Instance Routes
 * Manages multiple Email Worker configurations
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WorkerRepository, type CreateWorkerInput, type UpdateWorkerInput } from '../db/worker-repository.js';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

interface WorkerParams {
  id: string;
}

/**
 * Register worker routes
 */
export async function workerRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authMiddleware);

  const getRepository = () => new WorkerRepository(getDatabase());

  /**
   * GET /api/workers
   * Get all worker instances
   */
  fastify.get('/', async () => {
    const workers = getRepository().findAll();
    return { workers };
  });

  /**
   * GET /api/workers/:id
   * Get a worker instance by ID
   */
  fastify.get<{ Params: WorkerParams }>('/:id', async (request, reply) => {
    const worker = getRepository().findById(request.params.id);
    
    if (!worker) {
      return reply.status(404).send({ error: 'Worker not found' });
    }
    
    return { worker };
  });

  /**
   * POST /api/workers
   * Create a new worker instance
   */
  fastify.post<{ Body: CreateWorkerInput }>('/', async (request, reply) => {
    const { name, domain, defaultForwardTo } = request.body;

    if (!name || !defaultForwardTo) {
      return reply.status(400).send({
        error: 'Invalid request',
        message: 'name and defaultForwardTo are required',
      });
    }

    try {
      const worker = getRepository().create({ name, domain, defaultForwardTo });
      return reply.status(201).send({ worker });
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint failed')) {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'A worker with this name already exists',
        });
      }
      throw error;
    }
  });

  /**
   * PUT /api/workers/:id
   * Update a worker instance
   */
  fastify.put<{ Params: WorkerParams; Body: UpdateWorkerInput }>('/:id', async (request, reply) => {
    const worker = getRepository().update(request.params.id, request.body);
    
    if (!worker) {
      return reply.status(404).send({ error: 'Worker not found' });
    }
    
    return { worker };
  });

  /**
   * DELETE /api/workers/:id
   * Delete a worker instance (cascades to rules)
   */
  fastify.delete<{ Params: WorkerParams }>('/:id', async (request, reply) => {
    const deleted = getRepository().delete(request.params.id);
    
    if (!deleted) {
      return reply.status(404).send({ error: 'Worker not found' });
    }
    
    return { success: true };
  });

  /**
   * POST /api/workers/:id/toggle
   * Toggle worker enabled status
   */
  fastify.post<{ Params: WorkerParams }>('/:id/toggle', async (request, reply) => {
    const worker = getRepository().toggle(request.params.id);
    
    if (!worker) {
      return reply.status(404).send({ error: 'Worker not found' });
    }
    
    return { worker };
  });

  /**
   * GET /api/workers/:id/health
   * Check if a worker is online
   */
  fastify.get<{ Params: WorkerParams }>('/:id/health', async (request, reply) => {
    const worker = getRepository().findById(request.params.id);
    
    if (!worker) {
      return reply.status(404).send({ error: 'Worker not found' });
    }

    if (!worker.workerUrl) {
      return { online: false, error: 'No worker URL configured' };
    }

    const health = await getRepository().checkWorkerHealth(worker.workerUrl);
    return health;
  });

  /**
   * GET /api/workers/health/all
   * Check health of all workers
   */
  fastify.get('/health/all', async () => {
    const workers = getRepository().findAll();
    const results: Record<string, { online: boolean; latency?: number; error?: string }> = {};

    await Promise.all(
      workers.map(async (worker) => {
        if (worker.workerUrl) {
          results[worker.id] = await getRepository().checkWorkerHealth(worker.workerUrl);
        } else {
          results[worker.id] = { online: false, error: 'No URL' };
        }
      })
    );

    return { health: results };
  });
}
