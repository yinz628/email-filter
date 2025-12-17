/**
 * Monitoring Routes
 * API endpoints for real-time email signal monitoring and alerting
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.5, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.5, 6.1, 6.2, 8.1
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type {
  CreateMonitoringRuleDTO,
  UpdateMonitoringRuleDTO,
  AlertFilter,
  EmailMetadata,
} from '@email-filter/shared';
import { getDatabase } from '../db/index.js';
import { MonitoringRuleRepository } from '../db/monitoring-rule-repository.js';
import { AlertRepository } from '../db/alert-repository.js';
import {
  MonitoringRuleService,
  RuleValidationError,
  SignalStateService,
  AlertService,
  HitProcessor,
  HeartbeatService,
} from '../services/monitoring/index.js';
import { authMiddleware } from '../middleware/auth.js';

// ============================================================================
// Request Type Definitions
// ============================================================================

interface RuleParams {
  id: string;
}

interface StatusParams {
  ruleId: string;
}

interface AlertParams {
  id: string;
}

interface GetRulesQuery {
  merchant?: string;
  tag?: string;
  enabled?: string;
}

interface GetAlertsQuery {
  ruleId?: string;
  alertType?: string;
  startDate?: string;
  endDate?: string;
  limit?: string;
}

// ============================================================================
// Validation Helpers
// ============================================================================

function validateCreateRuleBody(body: unknown): { valid: boolean; error?: string; data?: CreateMonitoringRuleDTO } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;

  if (!data.merchant || typeof data.merchant !== 'string' || data.merchant.trim() === '') {
    return { valid: false, error: 'merchant is required and must be a non-empty string' };
  }
  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    return { valid: false, error: 'name is required and must be a non-empty string' };
  }
  if (!data.subjectPattern || typeof data.subjectPattern !== 'string' || data.subjectPattern.trim() === '') {
    return { valid: false, error: 'subjectPattern is required and must be a non-empty string' };
  }
  if (typeof data.expectedIntervalMinutes !== 'number' || !Number.isFinite(data.expectedIntervalMinutes) || data.expectedIntervalMinutes <= 0) {
    return { valid: false, error: 'expectedIntervalMinutes must be a positive number' };
  }
  if (typeof data.deadAfterMinutes !== 'number' || !Number.isFinite(data.deadAfterMinutes) || data.deadAfterMinutes <= 0) {
    return { valid: false, error: 'deadAfterMinutes must be a positive number' };
  }

  // Parse tags
  let tags: string[] = [];
  if (data.tags !== undefined) {
    if (Array.isArray(data.tags)) {
      tags = data.tags.filter((t): t is string => typeof t === 'string');
    } else if (typeof data.tags === 'string') {
      tags = data.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
    }
  }

  return {
    valid: true,
    data: {
      merchant: data.merchant as string,
      name: data.name as string,
      subjectPattern: data.subjectPattern as string,
      expectedIntervalMinutes: data.expectedIntervalMinutes as number,
      deadAfterMinutes: data.deadAfterMinutes as number,
      tags,
      enabled: data.enabled !== undefined ? Boolean(data.enabled) : true,
    },
  };
}

function validateUpdateRuleBody(body: unknown): { valid: boolean; error?: string; data?: UpdateMonitoringRuleDTO } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;
  const updateData: UpdateMonitoringRuleDTO = {};

  if (data.merchant !== undefined) {
    if (typeof data.merchant !== 'string' || data.merchant.trim() === '') {
      return { valid: false, error: 'merchant must be a non-empty string' };
    }
    updateData.merchant = data.merchant;
  }
  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim() === '') {
      return { valid: false, error: 'name must be a non-empty string' };
    }
    updateData.name = data.name;
  }
  if (data.subjectPattern !== undefined) {
    if (typeof data.subjectPattern !== 'string' || data.subjectPattern.trim() === '') {
      return { valid: false, error: 'subjectPattern must be a non-empty string' };
    }
    updateData.subjectPattern = data.subjectPattern;
  }
  if (data.expectedIntervalMinutes !== undefined) {
    if (typeof data.expectedIntervalMinutes !== 'number' || !Number.isFinite(data.expectedIntervalMinutes) || data.expectedIntervalMinutes <= 0) {
      return { valid: false, error: 'expectedIntervalMinutes must be a positive number' };
    }
    updateData.expectedIntervalMinutes = data.expectedIntervalMinutes;
  }
  if (data.deadAfterMinutes !== undefined) {
    if (typeof data.deadAfterMinutes !== 'number' || !Number.isFinite(data.deadAfterMinutes) || data.deadAfterMinutes <= 0) {
      return { valid: false, error: 'deadAfterMinutes must be a positive number' };
    }
    updateData.deadAfterMinutes = data.deadAfterMinutes;
  }
  if (data.tags !== undefined) {
    if (Array.isArray(data.tags)) {
      updateData.tags = data.tags.filter((t): t is string => typeof t === 'string');
    } else if (typeof data.tags === 'string') {
      updateData.tags = data.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
    }
  }
  if (data.enabled !== undefined) {
    updateData.enabled = Boolean(data.enabled);
  }

  return { valid: true, data: updateData };
}

function validateEmailHitBody(body: unknown): { valid: boolean; error?: string; data?: EmailMetadata } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;

  if (!data.sender || typeof data.sender !== 'string') {
    return { valid: false, error: 'sender is required and must be a string' };
  }
  if (!data.subject || typeof data.subject !== 'string') {
    return { valid: false, error: 'subject is required and must be a string' };
  }
  if (!data.recipient || typeof data.recipient !== 'string') {
    return { valid: false, error: 'recipient is required and must be a string' };
  }
  if (!data.receivedAt) {
    return { valid: false, error: 'receivedAt is required' };
  }

  let receivedAt: Date;
  if (data.receivedAt instanceof Date) {
    receivedAt = data.receivedAt;
  } else if (typeof data.receivedAt === 'string') {
    receivedAt = new Date(data.receivedAt);
    if (isNaN(receivedAt.getTime())) {
      return { valid: false, error: 'receivedAt must be a valid date' };
    }
  } else {
    return { valid: false, error: 'receivedAt must be a valid date string or Date object' };
  }

  return {
    valid: true,
    data: {
      sender: data.sender as string,
      subject: data.subject as string,
      recipient: data.recipient as string,
      receivedAt,
    },
  };
}


// ============================================================================
// Route Registration
// ============================================================================

/**
 * Register monitoring routes
 */
export async function monitoringRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authMiddleware);

  // ============================================================================
  // Rule Management API (Requirements: 1.1, 1.2, 1.3, 1.4)
  // ============================================================================

  /**
   * POST /api/monitoring/rules
   * Create a new monitoring rule
   *
   * Requirements: 1.1
   */
  fastify.post('/rules', async (request: FastifyRequest, reply: FastifyReply) => {
    const validation = validateCreateRuleBody(request.body);
    if (!validation.valid || !validation.data) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const ruleRepo = new MonitoringRuleRepository(db);
      const ruleService = new MonitoringRuleService(ruleRepo);

      const rule = ruleService.createRule(validation.data);
      return reply.status(201).send(rule);
    } catch (error) {
      if (error instanceof RuleValidationError) {
        return reply.status(400).send({
          error: 'Validation error',
          message: error.message,
          field: error.field,
          code: error.code,
        });
      }
      request.log.error(error, 'Error creating monitoring rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/monitoring/rules
   * Get all monitoring rules with optional filtering
   *
   * Requirements: 1.4
   */
  fastify.get('/rules', async (request: FastifyRequest<{ Querystring: GetRulesQuery }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const ruleRepo = new MonitoringRuleRepository(db);
      const ruleService = new MonitoringRuleService(ruleRepo);

      const { merchant, tag, enabled } = request.query;
      const filter: { merchant?: string; tag?: string; enabled?: boolean } = {};

      if (merchant) {
        filter.merchant = merchant;
      }
      if (tag) {
        filter.tag = tag;
      }
      if (enabled !== undefined) {
        filter.enabled = enabled === 'true';
      }

      const rules = ruleService.getRules(Object.keys(filter).length > 0 ? filter : undefined);
      return reply.send({ rules, total: rules.length });
    } catch (error) {
      request.log.error(error, 'Error fetching monitoring rules');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/monitoring/rules/:id
   * Get a single monitoring rule by ID
   *
   * Requirements: 1.4
   */
  fastify.get('/rules/:id', async (request: FastifyRequest<{ Params: RuleParams }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const ruleRepo = new MonitoringRuleRepository(db);
      const ruleService = new MonitoringRuleService(ruleRepo);

      const rule = ruleService.getRule(request.params.id);
      if (!rule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.send(rule);
    } catch (error) {
      request.log.error(error, 'Error fetching monitoring rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * PUT /api/monitoring/rules/:id
   * Update an existing monitoring rule
   *
   * Requirements: 1.2
   */
  fastify.put('/rules/:id', async (request: FastifyRequest<{ Params: RuleParams }>, reply: FastifyReply) => {
    const validation = validateUpdateRuleBody(request.body);
    if (!validation.valid) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const ruleRepo = new MonitoringRuleRepository(db);
      const ruleService = new MonitoringRuleService(ruleRepo);

      const rule = ruleService.updateRule(request.params.id, validation.data!);
      if (!rule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.send(rule);
    } catch (error) {
      if (error instanceof RuleValidationError) {
        return reply.status(400).send({
          error: 'Validation error',
          message: error.message,
          field: error.field,
          code: error.code,
        });
      }
      request.log.error(error, 'Error updating monitoring rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * DELETE /api/monitoring/rules/:id
   * Delete a monitoring rule
   *
   * Requirements: 1.1
   */
  fastify.delete('/rules/:id', async (request: FastifyRequest<{ Params: RuleParams }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const ruleRepo = new MonitoringRuleRepository(db);
      const ruleService = new MonitoringRuleService(ruleRepo);

      const deleted = ruleService.deleteRule(request.params.id);
      if (!deleted) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.status(204).send();
    } catch (error) {
      request.log.error(error, 'Error deleting monitoring rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * PATCH /api/monitoring/rules/:id/toggle
   * Toggle rule enabled status
   *
   * Requirements: 1.3
   */
  fastify.patch('/rules/:id/toggle', async (request: FastifyRequest<{ Params: RuleParams }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const ruleRepo = new MonitoringRuleRepository(db);
      const ruleService = new MonitoringRuleService(ruleRepo);

      const rule = ruleService.toggleRule(request.params.id);
      if (!rule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.send(rule);
    } catch (error) {
      request.log.error(error, 'Error toggling monitoring rule');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });


  // ============================================================================
  // Status Query API (Requirements: 2.5, 6.1, 6.2)
  // ============================================================================

  /**
   * GET /api/monitoring/status
   * Get all signal statuses sorted by state priority (DEAD > WEAK > ACTIVE)
   *
   * Requirements: 2.5, 6.1, 6.2
   */
  fastify.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const stateService = new SignalStateService(db);

      const statuses = stateService.getAllStatuses();
      return reply.send({ statuses, total: statuses.length });
    } catch (error) {
      request.log.error(error, 'Error fetching signal statuses');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/monitoring/status/:ruleId
   * Get signal status for a specific rule
   *
   * Requirements: 2.5
   */
  fastify.get('/status/:ruleId', async (request: FastifyRequest<{ Params: StatusParams }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const stateService = new SignalStateService(db);

      const status = stateService.getStatus(request.params.ruleId);
      if (!status) {
        return reply.status(404).send({ error: 'Status not found for rule' });
      }

      return reply.send(status);
    } catch (error) {
      request.log.error(error, 'Error fetching signal status');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ============================================================================
  // Alert Query API (Requirements: 5.5)
  // ============================================================================

  /**
   * GET /api/monitoring/alerts
   * Get alert history with optional filtering
   *
   * Requirements: 5.5
   */
  fastify.get('/alerts', async (request: FastifyRequest<{ Querystring: GetAlertsQuery }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const alertService = new AlertService(db);

      const { ruleId, alertType, startDate, endDate, limit } = request.query;
      const filter: AlertFilter = {};

      if (ruleId) {
        filter.ruleId = ruleId;
      }
      if (alertType && ['FREQUENCY_DOWN', 'SIGNAL_DEAD', 'SIGNAL_RECOVERED', 'RATIO_LOW', 'RATIO_RECOVERED'].includes(alertType)) {
        filter.alertType = alertType as AlertFilter['alertType'];
      }
      if (startDate) {
        const date = new Date(startDate);
        if (!isNaN(date.getTime())) {
          filter.startDate = date;
        }
      }
      if (endDate) {
        const date = new Date(endDate);
        if (!isNaN(date.getTime())) {
          filter.endDate = date;
        }
      }
      if (limit) {
        const limitNum = parseInt(limit, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          filter.limit = limitNum;
        }
      }

      const alerts = alertService.getAlerts(Object.keys(filter).length > 0 ? filter : undefined);
      return reply.send({ alerts, total: alerts.length });
    } catch (error) {
      request.log.error(error, 'Error fetching alerts');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/monitoring/alerts/:id
   * Get a single alert by ID
   *
   * Requirements: 5.5
   */
  fastify.get('/alerts/:id', async (request: FastifyRequest<{ Params: AlertParams }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const alertService = new AlertService(db);

      const alert = alertService.getAlert(request.params.id);
      if (!alert) {
        return reply.status(404).send({ error: 'Alert not found' });
      }

      return reply.send(alert);
    } catch (error) {
      request.log.error(error, 'Error fetching alert');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * DELETE /api/monitoring/alerts/:id
   * Delete a single alert by ID
   */
  fastify.delete('/alerts/:id', async (request: FastifyRequest<{ Params: AlertParams }>, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const stmt = db.prepare('DELETE FROM alerts WHERE id = ?');
      const result = stmt.run(request.params.id);
      
      if (result.changes === 0) {
        return reply.status(404).send({ error: 'Alert not found' });
      }

      return reply.send({ success: true });
    } catch (error) {
      request.log.error(error, 'Error deleting alert');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ============================================================================
  // Email Hit API (Requirements: 3.1, 3.2, 3.3, 3.4)
  // ============================================================================

  /**
   * POST /api/monitoring/hit
   * Record an email hit for monitoring
   *
   * Requirements: 3.1, 3.2, 3.3, 3.4
   */
  fastify.post('/hit', async (request: FastifyRequest, reply: FastifyReply) => {
    const validation = validateEmailHitBody(request.body);
    if (!validation.valid || !validation.data) {
      return reply.status(400).send({ error: 'Invalid request', message: validation.error });
    }

    try {
      const db = getDatabase();
      const hitProcessor = new HitProcessor(db);

      const result = hitProcessor.processEmail(validation.data);
      return reply.send(result);
    } catch (error) {
      request.log.error(error, 'Error processing email hit');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ============================================================================
  // Heartbeat Check API (Requirements: 4.1, 4.2, 4.3)
  // ============================================================================

  /**
   * POST /api/monitoring/heartbeat
   * Trigger a heartbeat check on all enabled rules
   *
   * Requirements: 4.1, 4.2, 4.3
   */
  fastify.post('/heartbeat', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const db = getDatabase();
      const heartbeatService = new HeartbeatService(db);

      const result = heartbeatService.runCheck();
      return reply.send(result);
    } catch (error) {
      request.log.error(error, 'Error running heartbeat check');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
