/**
 * Webhook Routes
 * Handles email webhook requests from Cloudflare Worker
 * Supports multiple workers with different configurations
 *
 * Requirements: 2.2, 2.3
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { EmailWebhookPayload } from '@email-filter/shared';
import { EmailService } from '../services/email.service.js';
import { RuleRepository } from '../db/rule-repository.js';
import { StatsRepository } from '../db/stats-repository.js';
import { WorkerRepository } from '../db/worker-repository.js';
import { LogRepository } from '../db/log-repository.js';
import { getDatabase } from '../db/index.js';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';

/**
 * Validate email webhook payload
 */
function isValidWebhookPayload(body: unknown): body is EmailWebhookPayload {
  if (!body || typeof body !== 'object') return false;
  const payload = body as Record<string, unknown>;
  return (
    typeof payload.from === 'string' &&
    typeof payload.to === 'string' &&
    typeof payload.subject === 'string' &&
    typeof payload.messageId === 'string' &&
    typeof payload.timestamp === 'number'
  );
}

/**
 * Register webhook routes
 */
export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  /**
   * POST /api/webhook/email
   * Process incoming email webhook from Cloudflare Worker
   * Routes to the correct worker configuration based on workerName in payload
   *
   * Requirements: 2.2, 2.3
   */
  fastify.post('/email', async (request: FastifyRequest, reply: FastifyReply) => {
    // Validate request body
    if (!isValidWebhookPayload(request.body)) {
      return reply.status(400).send({
        error: 'Invalid request',
        message: 'Request body must include from, to, subject, messageId, and timestamp',
      });
    }

    const payload = request.body;

    try {
      const db = getDatabase();
      const workerRepository = new WorkerRepository(db);
      const ruleRepository = new RuleRepository(db);
      const statsRepository = new StatsRepository(db);
      const logRepository = new LogRepository(db);

      // Find worker configuration by name (if provided)
      const worker = payload.workerName
        ? workerRepository.findByName(payload.workerName)
        : null;

      // Determine forward address and worker ID
      const defaultForwardTo = worker?.defaultForwardTo || config.defaultForwardTo;
      const workerId = worker?.id;

      const emailService = new EmailService(
        ruleRepository,
        statsRepository,
        defaultForwardTo,
        workerId,
        logRepository
      );

      // Process the email
      const result = await emailService.processEmail(payload);

      // Return the filter decision
      return reply.send(result.decision);
    } catch (error) {
      request.log.error(error, 'Error processing email webhook');
      return reply.status(500).send({
        error: 'Internal error',
        message: 'Failed to process email',
      });
    }
  });
}
