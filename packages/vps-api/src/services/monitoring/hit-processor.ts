/**
 * Hit Processor Service for Monitoring Module
 *
 * Processes incoming emails and matches them against monitoring rules.
 * Updates signal states and triggers alerts on state changes.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 8.2
 */

import type { Database } from 'better-sqlite3';
import type {
  EmailMetadata,
  HitResult,
  StateChange,
  MonitoringRule,
  EmailHit,
} from '@email-filter/shared';
import { MonitoringRuleRepository } from '../../db/monitoring-rule-repository.js';
import { SignalStateService } from './signal-state.service.js';
import { AlertService } from './alert.service.js';
import { matchSubject } from './pattern-matcher.js';

/**
 * Hit Processor Service
 *
 * Processes emails against monitoring rules and manages state updates.
 */
export class HitProcessor {
  private ruleRepo: MonitoringRuleRepository;
  private stateService: SignalStateService;
  private alertService: AlertService;

  constructor(private db: Database) {
    this.ruleRepo = new MonitoringRuleRepository(db);
    this.stateService = new SignalStateService(db);
    this.alertService = new AlertService(db);
  }

  /**
   * Process an email against all enabled monitoring rules
   *
   * This method:
   * 1. Matches the email against all enabled rules
   * 2. For each matched rule, updates the signal state
   * 3. Triggers alerts for state changes (especially recovery events)
   * 4. Records hits in the hit log
   *
   * Requirements: 3.1, 3.2, 3.3, 3.4, 8.2
   *
   * @param email - Email metadata (sender, subject, recipient, receivedAt)
   * @returns HitResult with matched rules and state changes
   */
  processEmail(email: EmailMetadata): HitResult {
    // Validate email metadata - only use required fields (Requirement 8.2)
    this.validateEmailMetadata(email);

    // Match against all enabled rules
    const matchedRules = this.matchRules(email);

    if (matchedRules.length === 0) {
      return {
        matched: false,
        matchedRules: [],
        stateChanges: [],
      };
    }

    const stateChanges: StateChange[] = [];

    // Process each matched rule
    for (const rule of matchedRules) {
      const stateChange = this.recordHit(rule.id, email);
      if (stateChange) {
        stateChanges.push(stateChange);

        // Create alert if state changed (especially for recovery - Requirement 3.3)
        if (stateChange.alertTriggered) {
          this.createAlertForStateChange(rule, stateChange);
        }
      }
    }

    return {
      matched: true,
      matchedRules: matchedRules.map((r) => r.id),
      stateChanges,
    };
  }


  /**
   * Match an email against all enabled monitoring rules
   *
   * Matches based on:
   * - Worker scope (global rules match all, specific rules only match their worker)
   * - Subject pattern (contains or regex match based on rule's matchMode)
   *
   * Requirements: 1.5, 3.1
   *
   * @param email - Email metadata (including optional workerName)
   * @returns Array of matched monitoring rules
   */
  matchRules(email: EmailMetadata): MonitoringRule[] {
    const enabledRules = this.ruleRepo.getEnabled();
    const matchedRules: MonitoringRule[] = [];

    for (const rule of enabledRules) {
      // Check worker scope - rule must be global or match the email's worker
      // If email has no workerName, only match global rules
      const workerMatches = rule.workerScope === 'global' || 
        (email.workerName && rule.workerScope === email.workerName);
      
      if (!workerMatches) {
        continue;
      }

      // Match subject against the rule's pattern using the rule's matchMode
      const matchResult = matchSubject(rule.subjectPattern, email.subject, rule.matchMode || 'contains');

      if (matchResult.matched) {
        matchedRules.push(rule);
      }
    }

    return matchedRules;
  }

  /**
   * Record a hit for a specific rule
   *
   * This method:
   * 1. Updates lastSeenAt to the email's receivedAt time
   * 2. Increments time window counters
   * 3. Updates state to ACTIVE
   * 4. Records the hit in hit_logs for audit
   *
   * Requirements: 3.1, 3.2, 3.3, 3.4
   *
   * @param ruleId - The rule ID that was hit
   * @param email - Email metadata
   * @returns StateChange or null if rule not found
   */
  recordHit(ruleId: string, email: EmailMetadata): StateChange | null {
    // Use the email's receivedAt time for the hit
    return this.stateService.updateOnHit(ruleId, email.receivedAt, email);
  }

  /**
   * Create an alert for a state change
   *
   * @param rule - The monitoring rule
   * @param stateChange - The state change that occurred
   */
  private createAlertForStateChange(rule: MonitoringRule, stateChange: StateChange): void {
    // Get current status for counter values
    const status = this.stateService.getStatus(rule.id);
    if (!status) {
      return;
    }

    this.alertService.createAlertFromStateChange(
      rule,
      stateChange.previousState,
      stateChange.currentState,
      status.gapMinutes,
      status.count1h,
      status.count12h,
      status.count24h,
      status.lastSeenAt
    );
  }

  /**
   * Validate email metadata contains only required fields
   *
   * Requirements: 8.2 - Only use sender, subject, recipient, receivedAt
   *
   * @param email - Email metadata to validate
   * @throws Error if required fields are missing
   */
  private validateEmailMetadata(email: EmailMetadata): void {
    if (!email.sender || typeof email.sender !== 'string') {
      throw new Error('Email metadata must include sender');
    }
    if (!email.subject || typeof email.subject !== 'string') {
      throw new Error('Email metadata must include subject');
    }
    if (!email.recipient || typeof email.recipient !== 'string') {
      throw new Error('Email metadata must include recipient');
    }
    if (!email.receivedAt || !(email.receivedAt instanceof Date)) {
      throw new Error('Email metadata must include receivedAt as Date');
    }
  }

  /**
   * Process multiple emails in batch
   *
   * @param emails - Array of email metadata
   * @returns Array of HitResults
   */
  processEmails(emails: EmailMetadata[]): HitResult[] {
    return emails.map((email) => this.processEmail(email));
  }

  /**
   * Check if an email matches any enabled rule (without recording)
   *
   * Useful for testing or preview purposes.
   *
   * @param email - Email metadata
   * @returns Array of matched rule IDs
   */
  previewMatch(email: EmailMetadata): string[] {
    const matchedRules = this.matchRules(email);
    return matchedRules.map((r) => r.id);
  }
}
