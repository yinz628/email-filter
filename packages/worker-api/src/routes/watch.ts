/**
 * Watch Routes
 * API endpoints for watch item management
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { Hono } from 'hono';
import type { CreateWatchDTO, MatchMode } from '@email-filter/shared';
import { WatchRepository } from '../db/watch-repository.js';
import { WatchService } from '../services/watch.service.js';
import { errorResponse, successResponse } from '../utils/response.js';

export type WatchBindings = {
  DB: D1Database;
};

const watchRouter = new Hono<{ Bindings: WatchBindings }>();

const VALID_MATCH_MODES: MatchMode[] = ['regex', 'contains'];

/**
 * Validate a regex pattern
 */
function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/watch - Get all watch items
 */
watchRouter.get('/', async (c) => {
  try {
    const watchRepository = new WatchRepository(c.env.DB);
    const watchService = new WatchService(watchRepository);

    const items = await watchService.getAllWatchItems();
    return c.json(successResponse(items));
  } catch (error) {
    console.error('Watch items fetch error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch watch items'), 500);
  }
});

/**
 * GET /api/watch/:id - Get a single watch item
 */
watchRouter.get('/:id', async (c) => {
  try {
    const watchRepository = new WatchRepository(c.env.DB);
    const watchService = new WatchService(watchRepository);
    const id = c.req.param('id');

    const item = await watchService.getWatchItem(id);
    if (!item) {
      return c.json(errorResponse('NOT_FOUND', 'Watch item not found'), 404);
    }
    return c.json(successResponse(item));
  } catch (error) {
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch watch item'), 500);
  }
});


/**
 * POST /api/watch - Create a new watch item
 */
watchRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<CreateWatchDTO>();
    
    // Validate required fields
    const details: Record<string, string> = {};
    
    if (!body.subjectPattern) {
      details.subjectPattern = 'Subject pattern is required';
    } else if (typeof body.subjectPattern !== 'string') {
      details.subjectPattern = 'Subject pattern must be a string';
    } else if (body.subjectPattern.trim() === '') {
      details.subjectPattern = 'Subject pattern cannot be empty';
    }
    
    if (!body.matchMode) {
      details.matchMode = 'Match mode is required';
    } else if (!VALID_MATCH_MODES.includes(body.matchMode)) {
      details.matchMode = `Invalid match mode. Must be one of: ${VALID_MATCH_MODES.join(', ')}`;
    }
    
    // Validate regex if matchMode is regex
    if (body.matchMode === 'regex' && body.subjectPattern && !isValidRegex(body.subjectPattern)) {
      details.subjectPattern = 'Invalid regex pattern';
    }
    
    if (Object.keys(details).length > 0) {
      return c.json(errorResponse('VALIDATION_ERROR', 'Validation failed', details), 400);
    }

    const watchRepository = new WatchRepository(c.env.DB);
    const watchService = new WatchService(watchRepository);

    const item = await watchService.addWatchItem(body);
    return c.json(successResponse(item), 201);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json(errorResponse('INVALID_JSON', 'Invalid JSON in request body'), 400);
    }
    console.error('Watch item create error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to create watch item'), 500);
  }
});

/**
 * DELETE /api/watch/:id - Delete a watch item
 */
watchRouter.delete('/:id', async (c) => {
  try {
    const watchRepository = new WatchRepository(c.env.DB);
    const watchService = new WatchService(watchRepository);
    const id = c.req.param('id');

    const deleted = await watchService.deleteWatchItem(id);
    if (!deleted) {
      return c.json(errorResponse('NOT_FOUND', 'Watch item not found'), 404);
    }
    return c.json(successResponse({ deleted: true }));
  } catch (error) {
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to delete watch item'), 500);
  }
});

/**
 * GET /api/watch/stats - Get all watch statistics
 */
watchRouter.get('/stats/all', async (c) => {
  try {
    const watchRepository = new WatchRepository(c.env.DB);
    const watchService = new WatchService(watchRepository);

    const stats = await watchService.getAllWatchStats();
    return c.json(successResponse(stats));
  } catch (error) {
    console.error('Watch stats fetch error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch watch statistics'), 500);
  }
});

/**
 * GET /api/watch/:id/stats - Get statistics for a specific watch item
 */
watchRouter.get('/:id/stats', async (c) => {
  try {
    const watchRepository = new WatchRepository(c.env.DB);
    const watchService = new WatchService(watchRepository);
    const id = c.req.param('id');

    const stats = await watchService.getWatchStats(id);
    if (!stats) {
      return c.json(errorResponse('NOT_FOUND', 'Watch item not found'), 404);
    }
    return c.json(successResponse(stats));
  } catch (error) {
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch watch statistics'), 500);
  }
});

export { watchRouter };
