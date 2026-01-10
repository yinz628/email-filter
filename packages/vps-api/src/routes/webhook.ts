/**
 * Webhook Routes
 * Handles email webhook requests from Cloudflare Worker
 * Supports multiple workers with different configurations
 *
 * Two-Phase Processing Architecture:
 * - Phase 1 (Synchronous): Worker config lookup, rule retrieval, filter matching, dynamic rule tracking - returns response immediately
 * - Phase 2 (Asynchronous): Stats update, log recording, watch tracking, campaign analytics, signal monitoring
 *
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { EmailWebhookPayload, FilterDecision, FilterRule } from '@email-filter/shared';
import { FilterService, type FilterResult, filterEmail } from '../services/filter.service.js';
import { RuleRepository, type FilterRuleWithWorker } from '../db/rule-repository.js';
import { WorkerRepository } from '../db/worker-repository.js';
import { getDatabase } from '../db/index.js';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { getRuleCache } from '../services/rule-cache.instance.js';
import { getAsyncTaskProcessor } from '../services/async-task-processor.instance.js';
import { DynamicRuleService } from '../services/dynamic-rule.service.js';

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
 * Phase 1 Processing Result
 * Contains the filter decision and data needed for Phase 2 async processing
 * 
 * Requirements: 4.1, 4.2 - Includes dynamic rule creation metrics
 */
export interface Phase1Result {
  decision: FilterDecision;
  filterResult: FilterResult;
  workerId?: string;
  defaultForwardTo: string;
  /** The dynamic rule created during this request, if any */
  dynamicRuleCreated?: FilterRule;
  /** Time in ms from first email to rule creation */
  detectionLatencyMs?: number;
  /** Number of emails forwarded before blocking started */
  emailsForwardedBeforeBlock?: number;
}

/**
 * Phase 1: Fast Response Processing
 * 
 * Performs only critical path operations:
 * 1. Worker config lookup
 * 2. Rule retrieval (with optional caching)
 * 3. Filter matching
 * 4. Dynamic rule tracking (synchronous) - NEW
 * 
 * Requirements: 1.1, 1.2, 1.3 - Response time < 100ms (relaxed from 50ms to accommodate dynamic tracking)
 * 
 * @param payload - The email webhook payload
 * @returns Phase1Result with decision and data for Phase 2
 */
export function processPhase1(payload: EmailWebhookPayload): Phase1Result {
  const db = getDatabase();
  const workerRepository = new WorkerRepository(db);
  const ruleRepository = new RuleRepository(db);
  const ruleCache = getRuleCache();

  // Step 1: Find worker configuration by name (if provided)
  const worker = payload.workerName
    ? workerRepository.findByName(payload.workerName)
    : null;

  // Determine forward address and worker ID
  const defaultForwardTo = worker?.defaultForwardTo || config.defaultForwardTo;
  const workerId = worker?.id;

  // Step 2: Get rules (check cache first - Requirement 4.1, 4.2)
  let rules: FilterRuleWithWorker[] | null = ruleCache.get(workerId);
  
  if (!rules) {
    // Cache miss - fetch from database
    rules = ruleRepository.findEnabled(workerId);
    // Populate cache for future requests
    ruleCache.set(workerId, rules);
  }

  // Step 3: Execute filter matching
  const filterService = new FilterService(defaultForwardTo);
  let filterResult = filterService.processEmail(payload, rules);
  let decision = filterService.toApiResponse(filterResult);

  // Initialize dynamic rule tracking result
  let dynamicRuleCreated: FilterRule | undefined;
  let detectionLatencyMs: number | undefined;
  let emailsForwardedBeforeBlock: number | undefined;

  // Step 4: Dynamic rule tracking (synchronous) - Requirements 1.1, 1.3
  // Only track emails that have no matched rule (forwarded by default)
  if (filterResult.matchedCategory === undefined) {
    const dynamicRuleService = new DynamicRuleService(db, ruleRepository);
    
    // Track the subject and potentially create a dynamic rule
    const trackingResult = dynamicRuleService.trackSubjectWithMetrics(
      payload.subject,
      new Date(payload.timestamp)
    );

    if (trackingResult.rule) {
      dynamicRuleCreated = trackingResult.rule;
      detectionLatencyMs = trackingResult.detectionLatencyMs;
      emailsForwardedBeforeBlock = trackingResult.emailsForwardedBeforeBlock;

      // Re-evaluate the email with the new rule - Requirements 1.3
      // Get fresh rules from cache (which was invalidated when rule was created)
      const updatedRules = ruleCache.get(workerId) || ruleRepository.findEnabled(workerId);
      if (!ruleCache.get(workerId)) {
        ruleCache.set(workerId, updatedRules);
      }
      
      filterResult = filterService.processEmail(payload, updatedRules);
      decision = filterService.toApiResponse(filterResult);
    }
  }

  return {
    decision,
    filterResult,
    workerId,
    defaultForwardTo,
    dynamicRuleCreated,
    detectionLatencyMs,
    emailsForwardedBeforeBlock,
  };
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
   * Two-Phase Processing:
   * - Phase 1: Synchronous - Worker config, rule retrieval, filter matching (< 50ms)
   * - Phase 2: Asynchronous - Stats, logs, watch, dynamic rules, campaign, monitoring
   *
   * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
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
      // ============================================
      // Phase 1: Fast Response (< 100ms target)
      // ============================================
      // Only performs critical path operations:
      // - Worker config lookup
      // - Rule retrieval (with caching)
      // - Filter matching
      // - Dynamic rule tracking (synchronous)
      // Requirements: 1.1, 1.2, 1.3
      const phase1StartTime = Date.now();
      const phase1Result = processPhase1(payload);
      const phase1Duration = Date.now() - phase1StartTime;
      
      // Log Phase 1 processing time (Requirement 1.1)
      request.log.info({
        phase: 'phase1',
        durationMs: phase1Duration,
        action: phase1Result.decision.action,
        workerName: payload.workerName || 'default',
        target: phase1Duration < 100 ? 'met' : 'exceeded',
        dynamicRuleCreated: !!phase1Result.dynamicRuleCreated,
      }, `Phase 1 completed in ${phase1Duration}ms`);

      // Log dynamic rule creation metrics if a rule was created
      if (phase1Result.dynamicRuleCreated) {
        request.log.info({
          event: 'dynamic_rule_created',
          ruleId: phase1Result.dynamicRuleCreated.id,
          pattern: phase1Result.dynamicRuleCreated.pattern,
          detectionLatencyMs: phase1Result.detectionLatencyMs,
          emailsForwardedBeforeBlock: phase1Result.emailsForwardedBeforeBlock,
        }, `Dynamic rule created: ${phase1Result.dynamicRuleCreated.pattern}`);
      }

      // ============================================
      // Phase 2: Async Processing (after response)
      // ============================================
      // Enqueue non-critical operations to be processed asynchronously:
      // - Statistics updates
      // - Log recording
      // - Watch rule tracking
      // - Campaign analytics
      // - Signal monitoring
      // Note: Dynamic rule tracking is now in Phase 1 (synchronous)
      // Requirements: 1.3, 2.1, 2.2
      setImmediate(() => {
        const asyncProcessor = getAsyncTaskProcessor();
        asyncProcessor.enqueueAll({
          payload,
          filterResult: phase1Result.filterResult,
          workerId: phase1Result.workerId,
          defaultForwardTo: phase1Result.defaultForwardTo,
        });
      });

      // Return the filter decision immediately (Requirement 1.3)
      return reply.send(phase1Result.decision);
    } catch (error) {
      request.log.error(error, 'Error processing email webhook');
      return reply.status(500).send({
        error: 'Internal error',
        message: 'Failed to process email',
      });
    }
  });
}
