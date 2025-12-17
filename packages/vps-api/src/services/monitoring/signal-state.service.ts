/**
 * Signal State Service for Monitoring Module
 *
 * Manages signal state queries and updates for monitoring rules.
 * Implements time window counter rolling updates.
 *
 * Requirements: 2.1, 2.5, 3.1, 3.2
 */

import type { Database } from 'better-sqlite3';
import type {
  SignalState,
  SignalStatus,
  StateChange,
  EmailMetadata,
} from '@email-filter/shared';
import { SignalStateRepository } from '../../db/signal-state-repository.js';
import { HitLogRepository } from '../../db/hit-log-repository.js';
import { MonitoringRuleRepository } from '../../db/monitoring-rule-repository.js';
import { calculateGapMinutes, calculateSignalState, determineAlertType } from '@email-filter/shared';

/**
 * State priority for sorting (DEAD > WEAK > ACTIVE)
 */
const STATE_PRIORITY: Record<SignalState, number> = {
  DEAD: 1,
  WEAK: 2,
  ACTIVE: 3,
};

/**
 * Signal State Service
 *
 * Provides methods for querying and updating signal states.
 */
export class SignalStateService {
  private stateRepo: SignalStateRepository;
  private hitLogRepo: HitLogRepository;
  private ruleRepo: MonitoringRuleRepository;

  constructor(private db: Database) {
    this.stateRepo = new SignalStateRepository(db);
    this.hitLogRepo = new HitLogRepository(db);
    this.ruleRepo = new MonitoringRuleRepository(db);
  }

  /**
   * Get signal status for a specific rule
   *
   * Returns the current status including state, lastSeenAt, gapMinutes,
   * and time window counters (count1h, count12h, count24h).
   *
   * Requirements: 2.5
   *
   * @param ruleId - The rule ID to get status for
   * @returns SignalStatus or null if rule not found
   */
  getStatus(ruleId: string): SignalStatus | null {
    const status = this.stateRepo.getByRuleId(ruleId);
    if (!status) {
      return null;
    }

    // Recalculate state based on current time
    const now = new Date();
    const gapMinutes = calculateGapMinutes(status.lastSeenAt, now);
    const currentState = calculateSignalState(
      gapMinutes,
      status.rule.expectedIntervalMinutes,
      status.rule.deadAfterMinutes
    );

    return {
      ...status,
      gapMinutes,
      state: currentState,
    };
  }

  /**
   * Get all signal statuses sorted by state priority (DEAD > WEAK > ACTIVE)
   *
   * Requirements: 2.5, 6.2
   *
   * @returns Array of SignalStatus sorted by state priority
   */
  getAllStatuses(): SignalStatus[] {
    const statuses = this.stateRepo.getAll();
    const now = new Date();

    // Recalculate states and sort
    const updatedStatuses = statuses.map((status) => {
      const gapMinutes = calculateGapMinutes(status.lastSeenAt, now);
      const currentState = calculateSignalState(
        gapMinutes,
        status.rule.expectedIntervalMinutes,
        status.rule.deadAfterMinutes
      );

      return {
        ...status,
        gapMinutes,
        state: currentState,
      };
    });

    // Sort by state priority: DEAD > WEAK > ACTIVE
    return updatedStatuses.sort((a, b) => {
      const priorityDiff = STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      // Secondary sort by rule creation date (newest first)
      return b.rule.createdAt.getTime() - a.rule.createdAt.getTime();
    });
  }

  /**
   * Get all signal statuses for enabled rules only
   *
   * @returns Array of SignalStatus for enabled rules, sorted by state priority
   */
  getEnabledStatuses(): SignalStatus[] {
    const statuses = this.stateRepo.getEnabled();
    const now = new Date();

    const updatedStatuses = statuses.map((status) => {
      const gapMinutes = calculateGapMinutes(status.lastSeenAt, now);
      const currentState = calculateSignalState(
        gapMinutes,
        status.rule.expectedIntervalMinutes,
        status.rule.deadAfterMinutes
      );

      return {
        ...status,
        gapMinutes,
        state: currentState,
      };
    });

    return updatedStatuses.sort((a, b) => {
      const priorityDiff = STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return b.rule.createdAt.getTime() - a.rule.createdAt.getTime();
    });
  }

  /**
   * Update signal state on email hit
   *
   * This method:
   * 1. Updates lastSeenAt to the hit time
   * 2. Increments time window counters
   * 3. Updates state to ACTIVE
   * 4. Records the hit in hit_logs
   * 5. Returns state change information
   *
   * Requirements: 3.1, 3.2
   *
   * @param ruleId - The rule ID that was hit
   * @param hitTime - The time the email was received
   * @param email - Optional email metadata for hit logging
   * @returns StateChange indicating previous and current state
   */
  updateOnHit(ruleId: string, hitTime: Date, email?: EmailMetadata): StateChange | null {
    // Get current status before update
    const currentStatus = this.getStatus(ruleId);
    if (!currentStatus) {
      return null;
    }

    const previousState = currentStatus.state;

    // Update last_seen_at and set state to ACTIVE
    this.stateRepo.updateOnHit(ruleId, hitTime);

    // Increment time window counters
    this.stateRepo.incrementCounters(ruleId);

    // Record hit in hit_logs if email metadata provided
    if (email) {
      this.hitLogRepo.create(ruleId, email);
    }

    const currentState: SignalState = 'ACTIVE';
    const alertType = determineAlertType(previousState, currentState);

    return {
      ruleId,
      previousState,
      currentState,
      alertTriggered: alertType !== null,
    };
  }

  /**
   * Recalculate time window counters based on hit_logs
   *
   * This method recalculates the count_1h, count_12h, count_24h counters
   * by counting actual hits in the hit_logs table within each time window.
   *
   * This is useful for:
   * - Rolling window updates (called periodically)
   * - Recovering accurate counts after system restart
   *
   * @param ruleId - The rule ID to recalculate counters for
   * @param now - Current time (defaults to new Date())
   */
  recalculateCounters(ruleId: string, now: Date = new Date()): void {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const count1h = this.hitLogRepo.countByTimeWindow(ruleId, oneHourAgo, now);
    const count12h = this.hitLogRepo.countByTimeWindow(ruleId, twelveHoursAgo, now);
    const count24h = this.hitLogRepo.countByTimeWindow(ruleId, twentyFourHoursAgo, now);

    this.stateRepo.setCounter(ruleId, '1h', count1h);
    this.stateRepo.setCounter(ruleId, '12h', count12h);
    this.stateRepo.setCounter(ruleId, '24h', count24h);
  }

  /**
   * Recalculate counters for all rules
   *
   * @param now - Current time (defaults to new Date())
   */
  recalculateAllCounters(now: Date = new Date()): void {
    const rules = this.ruleRepo.getAll();
    for (const rule of rules) {
      this.recalculateCounters(rule.id, now);
    }
  }

  /**
   * Update state for a rule (used by heartbeat check)
   *
   * @param ruleId - The rule ID to update
   * @param newState - The new state to set
   * @returns true if update was successful
   */
  updateState(ruleId: string, newState: SignalState): boolean {
    return this.stateRepo.updateState(ruleId, newState);
  }

  /**
   * Get raw state record (for testing/debugging)
   *
   * @param ruleId - The rule ID
   * @returns Raw state record or null
   */
  getRawState(ruleId: string) {
    return this.stateRepo.getRawState(ruleId);
  }
}
