/**
 * Email Service for VPS API
 * Handles webhook requests, processes emails through FilterService,
 * and updates statistics
 * Supports multiple workers with different configurations
 * 
 * Requirements: 4.1, 5.1
 */

import type { EmailWebhookPayload, FilterDecision, FilterRule } from '@email-filter/shared';
import { FilterService, type FilterResult } from './filter.service.js';
import type { RuleRepository } from '../db/rule-repository.js';
import type { StatsRepository } from '../db/stats-repository.js';
import type { LogRepository } from '../db/log-repository.js';

/**
 * Result of email processing with additional metadata
 */
export interface EmailProcessingResult {
  decision: FilterDecision;
  matchedRuleId?: string;
  processingTimeMs: number;
  workerId?: string;
}

/**
 * Email Service class
 * Orchestrates email processing through filter rules and statistics tracking
 */
export class EmailService {
  private filterService: FilterService;

  constructor(
    private ruleRepository: RuleRepository,
    private statsRepository: StatsRepository,
    defaultForwardTo: string,
    private workerId?: string,
    private logRepository?: LogRepository
  ) {
    this.filterService = new FilterService(defaultForwardTo);
  }

  /**
   * Process an incoming email webhook request
   * 
   * 1. Fetch all enabled rules from database (filtered by worker if specified)
   * 2. Run email through filter service
   * 3. Update statistics for matched rule
   * 4. Update lastHitAt for matched rule
   * 5. Return filter decision
   * 
   * @param payload - The email webhook payload
   * @returns EmailProcessingResult with decision and metadata
   */
  async processEmail(payload: EmailWebhookPayload): Promise<EmailProcessingResult> {
    const startTime = Date.now();

    // Step 1: Get enabled rules for this worker (includes global rules)
    const rules = this.ruleRepository.findEnabled(this.workerId);

    // Step 2: Process through filter service
    const filterResult = this.filterService.processEmail(payload, rules);

    // Step 3 & 4: Update statistics (global and rule-specific)
    this.updateStats(filterResult);

    // Step 5: Log the email processing
    this.logEmailProcessing(payload, filterResult);

    const processingTimeMs = Date.now() - startTime;

    return {
      decision: this.filterService.toApiResponse(filterResult),
      matchedRuleId: filterResult.matchedRule?.id,
      processingTimeMs,
      workerId: this.workerId,
    };
  }

  /**
   * Log email processing result
   */
  private logEmailProcessing(payload: EmailWebhookPayload, filterResult: FilterResult): void {
    if (!this.logRepository) return;

    const category = filterResult.action === 'drop' ? 'email_drop' : 'email_forward';
    const message = filterResult.action === 'drop' 
      ? `拦截邮件: ${payload.subject}`
      : `转发邮件: ${payload.subject}`;
    
    // Include workerName from payload (defaults to 'global' if not provided)
    const workerName = payload.workerName || 'global';
    
    this.logRepository.create(category, message, {
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      action: filterResult.action,
      forwardTo: filterResult.forwardTo,
      matchedRule: filterResult.matchedRule?.pattern,
      reason: filterResult.reason,
    }, 'info', workerName);
  }

  /**
   * Update statistics for email processing
   * - Increment global stats
   * - Increment rule-specific stats if a rule matched
   * - Update lastHitAt timestamp for matched rule
   */
  private updateStats(filterResult: FilterResult): void {
    // Always update global stats
    if (filterResult.action === 'drop') {
      this.statsRepository.incrementGlobalDeleted();
    } else {
      this.statsRepository.incrementGlobalForwarded();
    }

    // Update rule-specific stats if a rule matched
    const ruleId = filterResult.matchedRule?.id;
    if (ruleId) {
      // Update lastHitAt on the rule
      this.ruleRepository.updateLastHit(ruleId);

      // Update rule statistics based on action
      if (filterResult.action === 'drop') {
        this.statsRepository.incrementDeleted(ruleId);
      } else {
        this.statsRepository.incrementProcessed(ruleId);
      }
    }
  }

  /**
   * Update the default forward address
   */
  setDefaultForwardTo(address: string): void {
    this.filterService.setDefaultForwardTo(address);
  }

  /**
   * Get the current filter service instance (for testing)
   */
  getFilterService(): FilterService {
    return this.filterService;
  }
}
