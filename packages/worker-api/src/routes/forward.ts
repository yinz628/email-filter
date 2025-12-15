/**
 * Forward Routes
 * API endpoints for email forwarding configuration
 */

import { Hono } from 'hono';
import type { ForwardConfig } from '@email-filter/shared';
import { ForwardRepository, CreateForwardRuleDTO, UpdateForwardRuleDTO } from '../db/forward-repository.js';
import { errorResponse, successResponse } from '../utils/response.js';

export type ForwardBindings = {
  DB: D1Database;
};

const forwardRouter = new Hono<{ Bindings: ForwardBindings }>();

/**
 * GET /api/forward/config - Get forwarding configuration
 */
forwardRouter.get('/config', async (c) => {
  try {
    const forwardRepository = new ForwardRepository(c.env.DB);
    const config = await forwardRepository.getConfig();
    return c.json(successResponse(config));
  } catch (error) {
    console.error('Get forward config error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to get forward config'), 500);
  }
});

/**
 * PUT /api/forward/config - Update forwarding configuration
 */
forwardRouter.put('/config', async (c) => {
  try {
    const body = await c.req.json<Partial<ForwardConfig>>();
    const forwardRepository = new ForwardRepository(c.env.DB);
    
    await forwardRepository.updateConfig(body);
    const config = await forwardRepository.getConfig();
    
    return c.json(successResponse(config));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json(errorResponse('INVALID_JSON', 'Invalid JSON in request body'), 400);
    }
    console.error('Update forward config error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to update forward config'), 500);
  }
});


/**
 * GET /api/forward/rules - Get all forward rules
 */
forwardRouter.get('/rules', async (c) => {
  try {
    const forwardRepository = new ForwardRepository(c.env.DB);
    const rules = await forwardRepository.findAllRules();
    return c.json(successResponse(rules));
  } catch (error) {
    console.error('Get forward rules error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to get forward rules'), 500);
  }
});

/**
 * POST /api/forward/rules - Create a new forward rule
 */
forwardRouter.post('/rules', async (c) => {
  try {
    const body = await c.req.json<CreateForwardRuleDTO>();
    
    // Validate required fields
    if (!body.recipientPattern || !body.matchMode || !body.forwardTo) {
      return c.json(errorResponse('VALIDATION_ERROR', 'Missing required fields: recipientPattern, matchMode, forwardTo'), 400);
    }
    
    // Validate matchMode
    if (!['exact', 'contains', 'regex'].includes(body.matchMode)) {
      return c.json(errorResponse('VALIDATION_ERROR', 'Invalid matchMode. Must be: exact, contains, or regex'), 400);
    }
    
    // Validate email format for forwardTo
    if (!body.forwardTo.includes('@')) {
      return c.json(errorResponse('VALIDATION_ERROR', 'forwardTo must be a valid email address'), 400);
    }
    
    // Validate regex pattern if matchMode is regex
    if (body.matchMode === 'regex') {
      try {
        new RegExp(body.recipientPattern);
      } catch {
        return c.json(errorResponse('VALIDATION_ERROR', 'Invalid regex pattern'), 400);
      }
    }
    
    const forwardRepository = new ForwardRepository(c.env.DB);
    const rule = await forwardRepository.createRule(body);
    
    return c.json(successResponse(rule), 201);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json(errorResponse('INVALID_JSON', 'Invalid JSON in request body'), 400);
    }
    console.error('Create forward rule error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to create forward rule'), 500);
  }
});

/**
 * PUT /api/forward/rules/:id - Update a forward rule
 */
forwardRouter.put('/rules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<UpdateForwardRuleDTO>();
    
    // Validate matchMode if provided
    if (body.matchMode && !['exact', 'contains', 'regex'].includes(body.matchMode)) {
      return c.json(errorResponse('VALIDATION_ERROR', 'Invalid matchMode. Must be: exact, contains, or regex'), 400);
    }
    
    // Validate email format for forwardTo if provided
    if (body.forwardTo && !body.forwardTo.includes('@')) {
      return c.json(errorResponse('VALIDATION_ERROR', 'forwardTo must be a valid email address'), 400);
    }
    
    // Validate regex pattern if matchMode is regex
    if (body.matchMode === 'regex' && body.recipientPattern) {
      try {
        new RegExp(body.recipientPattern);
      } catch {
        return c.json(errorResponse('VALIDATION_ERROR', 'Invalid regex pattern'), 400);
      }
    }
    
    const forwardRepository = new ForwardRepository(c.env.DB);
    const rule = await forwardRepository.updateRule(id, body);
    
    if (!rule) {
      return c.json(errorResponse('NOT_FOUND', 'Forward rule not found'), 404);
    }
    
    return c.json(successResponse(rule));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json(errorResponse('INVALID_JSON', 'Invalid JSON in request body'), 400);
    }
    console.error('Update forward rule error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to update forward rule'), 500);
  }
});

/**
 * DELETE /api/forward/rules/:id - Delete a forward rule
 */
forwardRouter.delete('/rules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const forwardRepository = new ForwardRepository(c.env.DB);
    
    const deleted = await forwardRepository.deleteRule(id);
    
    if (!deleted) {
      return c.json(errorResponse('NOT_FOUND', 'Forward rule not found'), 404);
    }
    
    return c.json(successResponse({ success: true }));
  } catch (error) {
    console.error('Delete forward rule error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to delete forward rule'), 500);
  }
});

export { forwardRouter };
