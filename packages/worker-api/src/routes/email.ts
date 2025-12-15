/**
 * Email Routes
 * API endpoints for email processing and log queries
 * 
 * Requirements: 7.1, 7.2, 7.3
 */

import { Hono } from 'hono';
import type { IncomingEmail, LogFilter, ProcessAction, RuleCategory } from '@email-filter/shared';
import { RuleRepository } from '../db/rule-repository.js';
import { ProcessLogRepository } from '../db/process-log-repository.js';
import { EmailService } from '../services/email.service.js';
import { LogService } from '../services/log.service.js';
import { WatchService } from '../services/watch.service.js';
import { WatchRepository } from '../db/watch-repository.js';
import { DynamicRuleService } from '../services/dynamic-rule.service.js';
import { StatsService } from '../services/stats.service.js';
import { StatsRepository } from '../db/stats-repository.js';
import { ForwardRepository } from '../db/forward-repository.js';
import { errorResponse, successResponse } from '../utils/response.js';

export type EmailBindings = {
  DB: D1Database;
};

const emailRouter = new Hono<{ Bindings: EmailBindings }>();

/**
 * POST /api/email/process - Process an incoming email
 */
emailRouter.post('/process', async (c) => {
  try {
    const body = await c.req.json<IncomingEmail>();
    
    // Validate required fields
    if (!body.recipient || !body.sender || !body.senderEmail || !body.subject) {
      return c.json(errorResponse('VALIDATION_ERROR', 'Missing required fields: recipient, sender, senderEmail, subject'), 400);
    }

    // Parse receivedAt if provided as string
    const email: IncomingEmail = {
      ...body,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
    };

    // Initialize services
    const ruleRepository = new RuleRepository(c.env.DB);
    const processLogRepository = new ProcessLogRepository(c.env.DB);
    const watchRepository = new WatchRepository(c.env.DB);
    const statsRepository = new StatsRepository(c.env.DB);
    const forwardRepository = new ForwardRepository(c.env.DB);
    
    const emailService = new EmailService(processLogRepository, ruleRepository, forwardRepository);
    const watchService = new WatchService(watchRepository);
    const dynamicRuleService = new DynamicRuleService(c.env.DB, ruleRepository);
    const statsService = new StatsService(statsRepository, ruleRepository);


    // Process the email
    const result = await emailService.processEmail(email);

    // Track subject for dynamic rule detection
    await dynamicRuleService.trackSubject(email.subject, email.receivedAt);

    // Check and record watch item matches
    await watchService.checkAndRecordMatches(email);

    // Update rule statistics if a rule was matched
    if (result.processResult.matchedRule) {
      await statsService.recordRuleHit(
        result.processResult.matchedRule.id,
        result.log.action
      );
    }

    return c.json(successResponse(result.processResult));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json(errorResponse('INVALID_JSON', 'Invalid JSON in request body'), 400);
    }
    console.error('Email processing error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to process email'), 500);
  }
});

/**
 * GET /api/email/logs - Query email processing logs
 */
emailRouter.get('/logs', async (c) => {
  try {
    const processLogRepository = new ProcessLogRepository(c.env.DB);
    const logService = new LogService(processLogRepository);

    // Parse query parameters
    const filter: LogFilter = {};
    
    const startDate = c.req.query('startDate');
    if (startDate) {
      filter.startDate = new Date(startDate);
    }
    
    const endDate = c.req.query('endDate');
    if (endDate) {
      filter.endDate = new Date(endDate);
    }
    
    const action = c.req.query('action') as ProcessAction | undefined;
    if (action) {
      filter.action = action;
    }
    
    const ruleCategory = c.req.query('ruleCategory') as RuleCategory | undefined;
    if (ruleCategory) {
      filter.ruleCategory = ruleCategory;
    }
    
    const limit = c.req.query('limit');
    if (limit) {
      filter.limit = parseInt(limit, 10);
    }
    
    const offset = c.req.query('offset');
    if (offset) {
      filter.offset = parseInt(offset, 10);
    }

    const result = await logService.queryLogs(filter);
    
    return c.json({
      data: result.logs,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('Log query error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch logs'), 500);
  }
});

/**
 * GET /api/email/logs/:id - Get a single log entry
 */
emailRouter.get('/logs/:id', async (c) => {
  try {
    const processLogRepository = new ProcessLogRepository(c.env.DB);
    const logService = new LogService(processLogRepository);
    const id = c.req.param('id');

    const log = await logService.getLogById(id);
    if (!log) {
      return c.json(errorResponse('NOT_FOUND', 'Log entry not found'), 404);
    }
    
    return c.json(successResponse(log));
  } catch (error) {
    return c.json(errorResponse('INTERNAL_ERROR', 'Failed to fetch log'), 500);
  }
});

export { emailRouter };
