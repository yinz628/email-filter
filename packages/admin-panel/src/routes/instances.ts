/**
 * Instances Routes
 * API endpoints for Worker instance management
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { Hono } from 'hono';
import type { CreateInstanceDTO, UpdateInstanceDTO, InstanceStatus } from '@email-filter/shared';
import { InstanceService } from '../services/instance.service.js';
import { errorResponse, successResponse } from '../utils/response.js';

export type InstancesBindings = {
  DB: D1Database;
};

const instancesRouter = new Hono<{ Bindings: InstancesBindings }>();

/**
 * GET /api/instances - Get all worker instances
 * Requirements: 1.4
 */
instancesRouter.get('/', async (c) => {
  try {
    const instanceService = new InstanceService(c.env.DB);
    const status = c.req.query('status') as InstanceStatus | undefined;

    const instances = status
      ? await instanceService.getInstancesByStatus(status)
      : await instanceService.getAllInstances();

    return c.json(successResponse(instances));
  } catch (error) {
    console.error('Get instances error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch instances'), 500);
  }
});

/**
 * GET /api/instances/:id - Get a single worker instance
 */
instancesRouter.get('/:id', async (c) => {
  try {
    const instanceService = new InstanceService(c.env.DB);
    const id = c.req.param('id');

    const instance = await instanceService.getInstanceById(id);
    if (!instance) {
      return c.json(errorResponse('NOT_FOUND', 'Instance not found'), 404);
    }

    return c.json(successResponse(instance));
  } catch (error) {
    console.error('Get instance error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch instance'), 500);
  }
});

/**
 * POST /api/instances - Create a new worker instance
 * Requirements: 1.1
 */
instancesRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<CreateInstanceDTO>();
    const instanceService = new InstanceService(c.env.DB);

    const instance = await instanceService.createInstance(body);
    return c.json(successResponse(instance), 201);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json(errorResponse('INVALID_JSON', 'Invalid JSON in request body'), 400);
    }
    if (error instanceof Error) {
      // Validation errors from service
      if (error.message.includes('required') || error.message.includes('Invalid')) {
        return c.json(errorResponse('VALIDATION_ERROR', error.message), 400);
      }
    }
    console.error('Create instance error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to create instance'), 500);
  }
});

/**
 * PUT /api/instances/:id - Update a worker instance
 * Requirements: 1.3
 */
instancesRouter.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<UpdateInstanceDTO>();
    const instanceService = new InstanceService(c.env.DB);

    const instance = await instanceService.updateInstance(id, body);
    if (!instance) {
      return c.json(errorResponse('NOT_FOUND', 'Instance not found'), 404);
    }

    return c.json(successResponse(instance));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json(errorResponse('INVALID_JSON', 'Invalid JSON in request body'), 400);
    }
    if (error instanceof Error) {
      // Validation errors from service
      if (error.message.includes('cannot be empty') || error.message.includes('Invalid')) {
        return c.json(errorResponse('VALIDATION_ERROR', error.message), 400);
      }
    }
    console.error('Update instance error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to update instance'), 500);
  }
});

/**
 * DELETE /api/instances/:id - Delete a worker instance
 * Requirements: 1.2
 */
instancesRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const instanceService = new InstanceService(c.env.DB);

    const deleted = await instanceService.deleteInstance(id);
    if (!deleted) {
      return c.json(errorResponse('NOT_FOUND', 'Instance not found'), 404);
    }

    return c.json(successResponse({ deleted: true }));
  } catch (error) {
    console.error('Delete instance error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to delete instance'), 500);
  }
});

/**
 * POST /api/instances/:id/health - Check instance health
 */
instancesRouter.post('/:id/health', async (c) => {
  try {
    const id = c.req.param('id');
    const instanceService = new InstanceService(c.env.DB);

    const status = await instanceService.checkInstanceHealth(id);
    return c.json(successResponse({ status }));
  } catch (error) {
    if (error instanceof Error && error.message === 'Instance not found') {
      return c.json(errorResponse('NOT_FOUND', 'Instance not found'), 404);
    }
    console.error('Health check error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to check instance health'), 500);
  }
});

/**
 * PATCH /api/instances/:id/status - Update instance status manually
 */
instancesRouter.patch('/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ status: InstanceStatus }>();
    const instanceService = new InstanceService(c.env.DB);

    if (!body.status || !['active', 'inactive', 'error'].includes(body.status)) {
      return c.json(errorResponse('VALIDATION_ERROR', 'Invalid status value'), 400);
    }

    const instance = await instanceService.setInstanceStatus(id, body.status);
    if (!instance) {
      return c.json(errorResponse('NOT_FOUND', 'Instance not found'), 404);
    }

    return c.json(successResponse(instance));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json(errorResponse('INVALID_JSON', 'Invalid JSON in request body'), 400);
    }
    console.error('Update status error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to update instance status'), 500);
  }
});

export { instancesRouter };
