/**
 * Heartbeat Service for Monitoring Module
 *
 * Performs periodic health checks on all enabled monitoring rules.
 * Detects state changes and triggers alerts when signals degrade.
 *
 * Requirements: 4.1, 4.2, 4.3
 */

import type { Database } from 'better-sqlite3';
import type {
  HeartbeatResult,
  StateChange,
  SignalState,
  MonitoringRule,
} from '@email-filter/shared';
import { calculateGapMinutes, calculateSignalState, determineAlertType } from '@email-filter/shared';
import { MonitoringRuleRepository } from '../../db/monitoring-rule-repository.js';
import { SignalStateRepository } from '../../db/signal-state-repository.js';
import { AlertService } from './alert.service.js';

/**
 * Heartbeat Service
 *
 * Performs periodic checks on all enabled monitoring rules to detect
 * state changes and trigger alerts.
 */
export class HeartbeatService {
  private ruleRepo: MonitoringRuleRepository;
  private stateRepo: SignalStateRepository;
  private alertService: AlertService;

  constructor(private db: Database) {
    this.ruleRepo = new MonitoringRuleRepository(db);
    this.stateRepo = new SignalStateRepository(db);
    this.alertService = new AlertService(db);
  }

  /**
   * Run heartbeat check on all enabled monitoring rules
   *
   * This method:
   * 1. Gets all enabled monitoring rules
   * 2. For each rule, recalculates the current state based on lastSeenAt
   * 3. Compares with stored state and detects changes
   * 4. Triggers alerts for state changes
   * 5. Records the heartbeat check result
   *
   * Requirements: 4.1, 4.2, 4.3
   *
   * @param now - Current time (defaults to new Date())
   * @returns HeartbeatResult with check summary
   */
  runCheck(now: Date = new Date()): HeartbeatResult {
    const startTime = Date.now();
    const stateChanges: StateChange[] = [];
    let alertsTriggered = 0;

    // Get all enabled rules (Requirement 4.1)
    const enabledRules = this.ruleRepo.getEnabled();

    // Check each enabled rule
    for (const rule of enabledRules) {
      const stateChange = this.checkRule(rule, now);
      if (stateChange) {
        stateChanges.push(stateChange);
        if (stateChange.alertTriggered) {
          alertsTriggered++;
        }
      }
    }

    const durationMs = Date.now() - startTime;

    // Record heartbeat log (Requirement 4.3)
    this.recordHeartbeatLog(now, enabledRules.length, stateChanges.length, alertsTriggered, durationMs);

    return {
      checkedAt: now,
      rulesChecked: enabledRules.length,
      stateChanges,
      alertsTriggered,
      durationMs,
    };
  }

  /**
   * Check a single rule and detect state changes
   *
   * @param rule - The monitoring rule to check
   * @param now - Current time
   * @returns StateChange if state changed, null otherwise
   */
  private checkRule(rule: MonitoringRule, now: Date): StateChange | null {
    // Get current stored state
    const stateRecord = this.stateRepo.getRawState(rule.id);
    if (!stateRecord) {
      return null;
    }

    const previousState = stateRecord.state as SignalState;
    const lastSeenAt = stateRecord.last_seen_at ? new Date(stateRecord.last_seen_at) : null;

    // Calculate current state based on gap
    const gapMinutes = calculateGapMinutes(lastSeenAt, now);
    const currentState = calculateSignalState(
      gapMinutes,
      rule.expectedIntervalMinutes,
      rule.deadAfterMinutes
    );

    // Check if state changed
    if (previousState === currentState) {
      return null;
    }

    // Update stored state
    this.stateRepo.updateState(rule.id, currentState);

    // Determine if alert should be triggered (Requirement 4.2)
    const alertType = determineAlertType(previousState, currentState);
    const alertTriggered = alertType !== null;

    // Create alert if needed
    if (alertTriggered) {
      this.createAlert(rule, previousState, currentState, gapMinutes);
    }

    return {
      ruleId: rule.id,
      previousState,
      currentState,
      alertTriggered,
    };
  }

  /**
   * Create an alert for a state change
   *
   * @param rule - The monitoring rule
   * @param previousState - Previous signal state
   * @param currentState - Current signal state
   * @param gapMinutes - Minutes since last signal
   */
  private createAlert(
    rule: MonitoringRule,
    previousState: SignalState,
    currentState: SignalState,
    gapMinutes: number
  ): void {
    // Get current counters
    const stateRecord = this.stateRepo.getRawState(rule.id);
    const count1h = stateRecord?.count_1h ?? 0;
    const count12h = stateRecord?.count_12h ?? 0;
    const count24h = stateRecord?.count_24h ?? 0;

    this.alertService.createAlertFromStateChange(
      rule,
      previousState,
      currentState,
      gapMinutes,
      count1h,
      count12h,
      count24h
    );
  }

  /**
   * Record heartbeat check log
   *
   * Requirements: 4.3
   *
   * @param checkedAt - Time of check
   * @param rulesChecked - Number of rules checked
   * @param stateChanges - Number of state changes detected
   * @param alertsTriggered - Number of alerts triggered
   * @param durationMs - Duration of check in milliseconds
   */
  private recordHeartbeatLog(
    checkedAt: Date,
    rulesChecked: number,
    stateChanges: number,
    alertsTriggered: number,
    durationMs: number
  ): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO heartbeat_logs (checked_at, rules_checked, state_changes, alerts_triggered, duration_ms)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(checkedAt.toISOString(), rulesChecked, stateChanges, alertsTriggered, durationMs);
    } catch (error) {
      // Log error but don't fail the heartbeat check
      console.error('Failed to record heartbeat log:', error);
    }
  }

  /**
   * Get the list of enabled rule IDs that would be checked
   *
   * Useful for testing Property 9: ensuring all enabled rules are covered
   *
   * @returns Array of enabled rule IDs
   */
  getEnabledRuleIds(): string[] {
    const enabledRules = this.ruleRepo.getEnabled();
    return enabledRules.map((r) => r.id);
  }
}
