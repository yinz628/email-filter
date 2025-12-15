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
    private workerId?: string
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

    // Step 3 & 4: Update statistics and lastHitAt if a rule matched
    if (filterResult.matchedRule) {
      this.updateRuleStats(filterResult);
    }

    const processingTimeMs = Date.now() - startTime;

    return {
      decision: this.filterService.toApiResponse(filterResult),
      matchedRuleId: filterResult.matchedRule?.id,
      processingTimeMs,
      workerId: this.workerId,
    };
  }

  /**
   * Update statistics for a matched rule
   * - Increment appropriate counter based on action
   * - Update lastHitAt timestamp
   */
  private updateRuleStats(filterResult: FilterResult): void {
    const ruleId = filterResult.matchedRule?.id;
    if (!ruleId) return;

    // Update lastHitAt on the rule
    this.ruleRepository.updateLastHit(ruleId);

    // Update statistics based on action
    if (filterResult.action === 'drop') {
      // Email was dropped/deleted
      this.statsRepository.incrementDeleted(ruleId);
    } else {
      // Email was forwarded (whitelist match)
      this.statsRepository.incrementProcessed(ruleId);
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
