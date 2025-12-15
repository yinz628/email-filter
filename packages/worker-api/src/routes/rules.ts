/**
 * Rules Routes
 * API endpoints for filter rule management
 * 
 * Requirements: 4.1, 5.4, 10.1, 10.2
 */

import { Hono } from 'hono';
import type { RuleCategory, MatchType, MatchMode, CreateRuleDTO, UpdateRuleDTO } from '@email-filter/shared';
import { RuleRepository } from '../db/rule-repository.js';
import { validateCreateRule, validateUpdateRule, ValidationError } from '../validation/rule-validation.js';
import { errorResponse, successResponse } from '../utils/response.js';

export type RulesBindings = {
  DB: D1Database;
};

const rulesRouter = new Hono<{ Bindings: RulesBindings }>();

/**
 * GET /api/rules - Get all rules or filter by category
 */
rulesRouter.get('/', async (c) => {
  const ruleRepository = new RuleRepository(c.env.DB);
  const category = c.req.query('category') as RuleCategory | undefined;

  try {
    const rules = category
      ? await ruleRepository.findByCategory(category)
      : await ruleRepository.findAll();
    
    return c.json(successResponse(rules));
  } catch (error) {
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch rules'), 500);
  }
});

/**
 * GET /api/rules/:id - Get a single rule by ID
 */
rulesRouter.get('/:id', async (c) => {
  const ruleRepository = new RuleRepository(c.env.DB);
  const id = c.req.param('id');

  try {
    const rule = await ruleRepository.findById(id);
    if (!rule) {
      return c.json(errorResponse('NOT_FOUND', 'Rule not found'), 404);
    }
    return c.json(successResponse(rule));
  } catch (error) {
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch rule'), 500);
  }
});


/**
 * POST /api/rules - Create a new rule
 */
rulesRouter.post('/', async (c) => {
  const ruleRepository = new RuleRepository(c.env.DB);

  try {
    const body = await c.req.json<CreateRuleDTO>();
    
    // Validate the rule
    const validation = validateCreateRule(body);
    if (!validation.valid) {
      return c.json(errorResponse('VALIDATION_ERROR', validation.message!, validation.details), 400);
    }

    const rule = await ruleRepository.create(body);
    return c.json(successResponse(rule), 201);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json(errorResponse('INVALID_JSON', 'Invalid JSON in request body'), 400);
    }
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to create rule'), 500);
  }
});

/**
 * PUT /api/rules/:id - Update an existing rule
 */
rulesRouter.put('/:id', async (c) => {
  const ruleRepository = new RuleRepository(c.env.DB);
  const id = c.req.param('id');

  try {
    const body = await c.req.json<UpdateRuleDTO>();
    
    // Validate the update
    const validation = validateUpdateRule(body);
    if (!validation.valid) {
      return c.json(errorResponse('VALIDATION_ERROR', validation.message!, validation.details), 400);
    }

    const rule = await ruleRepository.update(id, body);
    if (!rule) {
      return c.json(errorResponse('NOT_FOUND', 'Rule not found'), 404);
    }
    return c.json(successResponse(rule));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json(errorResponse('INVALID_JSON', 'Invalid JSON in request body'), 400);
    }
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to update rule'), 500);
  }
});

/**
 * DELETE /api/rules/:id - Delete a rule
 */
rulesRouter.delete('/:id', async (c) => {
  const ruleRepository = new RuleRepository(c.env.DB);
  const id = c.req.param('id');

  try {
    const deleted = await ruleRepository.delete(id);
    if (!deleted) {
      return c.json(errorResponse('NOT_FOUND', 'Rule not found'), 404);
    }
    return c.json(successResponse({ deleted: true }));
  } catch (error) {
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to delete rule'), 500);
  }
});

/**
 * PATCH /api/rules/:id/toggle - Toggle rule enabled status
 */
rulesRouter.patch('/:id/toggle', async (c) => {
  const ruleRepository = new RuleRepository(c.env.DB);
  const id = c.req.param('id');

  try {
    const rule = await ruleRepository.toggleEnabled(id);
    if (!rule) {
      return c.json(errorResponse('NOT_FOUND', 'Rule not found'), 404);
    }
    return c.json(successResponse(rule));
  } catch (error) {
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to toggle rule'), 500);
  }
});

export { rulesRouter };
