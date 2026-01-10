/**
 * Worker Instance Routes
 * Manages multiple Email Worker configurations
 * 
 * Requirements: 5.4, 5.5 - Admin action logging for Worker operations
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WorkerRepository, type CreateWorkerInput, type UpdateWorkerInput } from '../db/worker-repository.js';
import { LogRepository } from '../db/log-repository.js';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { config } from '../config.js';

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
  const getLogRepository = () => new LogRepository(getDatabase());

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
   * 
   * Requirements: 5.4 - Log admin action when creating a Worker
   */
  fastify.post<{ Body: CreateWorkerInput }>('/', async (request, reply) => {
    const { name, domain, defaultForwardTo, workerUrl } = request.body;

    if (!name || !defaultForwardTo) {
      return reply.status(400).send({
        error: 'Invalid request',
        message: 'name and defaultForwardTo are required',
      });
    }

    try {
      const worker = getRepository().create({ name, domain, defaultForwardTo, workerUrl });
      
      // Log admin action (Requirement 5.4)
      getLogRepository().createAdminLog('创建Worker', {
        action: 'create',
        entityType: 'worker',
        entityId: worker.id,
        worker: {
          name: worker.name,
          domain: worker.domain,
          defaultForwardTo: worker.defaultForwardTo,
          workerUrl: worker.workerUrl,
          enabled: worker.enabled,
        },
      }, worker.name);
      
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
   * 
   * Requirements: 5.4 - Log admin action when updating a Worker
   */
  fastify.put<{ Params: WorkerParams; Body: UpdateWorkerInput }>('/:id', async (request, reply) => {
    const repository = getRepository();
    
    // Get existing worker to log before/after changes
    const existingWorker = repository.findById(request.params.id);
    if (!existingWorker) {
      return reply.status(404).send({ error: 'Worker not found' });
    }
    
    const worker = repository.update(request.params.id, request.body);
    
    if (!worker) {
      return reply.status(404).send({ error: 'Worker not found' });
    }
    
    // Log admin action (Requirement 5.4)
    getLogRepository().createAdminLog('更新Worker', {
      action: 'update',
      entityType: 'worker',
      entityId: worker.id,
      before: {
        name: existingWorker.name,
        domain: existingWorker.domain,
        defaultForwardTo: existingWorker.defaultForwardTo,
        workerUrl: existingWorker.workerUrl,
        enabled: existingWorker.enabled,
      },
      after: {
        name: worker.name,
        domain: worker.domain,
        defaultForwardTo: worker.defaultForwardTo,
        workerUrl: worker.workerUrl,
        enabled: worker.enabled,
      },
    }, worker.name);
    
    return { worker };
  });

  /**
   * DELETE /api/workers/:id
   * Delete a worker instance (cascades to rules)
   * 
   * Requirements: 5.5 - Log admin action when deleting a Worker
   */
  fastify.delete<{ Params: WorkerParams }>('/:id', async (request, reply) => {
    const repository = getRepository();
    
    // Get worker before deletion to log its details
    const worker = repository.findById(request.params.id);
    if (!worker) {
      return reply.status(404).send({ error: 'Worker not found' });
    }
    
    const deleted = repository.delete(request.params.id);
    
    if (!deleted) {
      return reply.status(404).send({ error: 'Worker not found' });
    }
    
    // Log admin action (Requirement 5.5)
    getLogRepository().createAdminLog('删除Worker', {
      action: 'delete',
      entityType: 'worker',
      entityId: worker.id,
      deletedWorker: {
        name: worker.name,
        domain: worker.domain,
        defaultForwardTo: worker.defaultForwardTo,
        workerUrl: worker.workerUrl,
        enabled: worker.enabled,
      },
    }, worker.name);
    
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

    const health = await getRepository().checkWorkerHealth(worker.workerUrl, config.vpsPublicUrl);
    return health;
  });

  /**
   * GET /api/workers/health/all
   * Check health of all workers
   */
  fastify.get('/health/all', async () => {
    const workers = getRepository().findAll();
    const results: Record<string, { online: boolean; latency?: number; error?: string; connectedToMe?: boolean; workerVpsUrl?: string }> = {};

    await Promise.all(
      workers.map(async (worker) => {
        if (worker.workerUrl) {
          results[worker.id] = await getRepository().checkWorkerHealth(worker.workerUrl, config.vpsPublicUrl);
        } else {
          results[worker.id] = { online: false, error: 'No URL' };
        }
      })
    );

    return { health: results };
  });
}
