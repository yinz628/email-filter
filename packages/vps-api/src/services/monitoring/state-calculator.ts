/**
 * State Calculator Service for Monitoring Module
 * 
 * Provides state calculation functions for monitoring signals.
 * Wraps the shared utility functions with service-level abstractions.
 * 
 * Requirements: 2.1
 */

import {
  calculateSignalState,
  calculateGapMinutes,
  determineAlertType as determineAlertTypeFromShared,
  type SignalState,
  type AlertType,
  type MonitoringRule,
} from '@email-filter/shared';

// Re-export the shared functions
export { calculateSignalState, calculateGapMinutes };
export { determineAlertTypeFromShared as determineAlertType };
export type { SignalState, AlertType };

/**
 * Calculate the current state of a signal based on last seen time and rule configuration
 * 
 * State calculation formula (Requirements 2.1):
 * - gap <= expectedInterval * 1.5 → ACTIVE
 * - expectedInterval * 1.5 < gap <= deadAfter → WEAK
 * - gap > deadAfter → DEAD
 * 
 * @param lastSeenAt - Last time the signal was seen (null if never seen)
 * @param expectedIntervalMinutes - Expected interval between signals
 * @param deadAfterMinutes - Threshold after which signal is considered dead
 * @param now - Current time (defaults to new Date())
 * @returns The calculated signal state
 */
export function calculateStateFromLastSeen(
  lastSeenAt: Date | null,
  expectedIntervalMinutes: number,
  deadAfterMinutes: number,
  now: Date = new Date()
): SignalState {
  const gapMinutes = calculateGapMinutes(lastSeenAt, now);
  return calculateSignalState(gapMinutes, expectedIntervalMinutes, deadAfterMinutes);
}

/**
 * Calculate state using a monitoring rule's configuration
 * 
 * @param lastSeenAt - Last time the signal was seen
 * @param rule - The monitoring rule with interval configuration
 * @param now - Current time (defaults to new Date())
 * @returns The calculated signal state
 */
export function calculateStateForRule(
  lastSeenAt: Date | null,
  rule: MonitoringRule,
  now: Date = new Date()
): SignalState {
  return calculateStateFromLastSeen(
    lastSeenAt,
    rule.expectedIntervalMinutes,
    rule.deadAfterMinutes,
    now
  );
}

/**
 * State Calculator Service class for dependency injection
 */
export class StateCalculatorService {
  /**
   * Calculate gap in minutes from last seen time
   */
  getGapMinutes(lastSeenAt: Date | null, now: Date = new Date()): number {
    return calculateGapMinutes(lastSeenAt, now);
  }

  /**
   * Calculate signal state based on gap and thresholds
   */
  getState(
    gapMinutes: number,
    expectedIntervalMinutes: number,
    deadAfterMinutes: number
  ): SignalState {
    return calculateSignalState(gapMinutes, expectedIntervalMinutes, deadAfterMinutes);
  }

  /**
   * Calculate state from last seen time and rule configuration
   */
  getStateFromLastSeen(
    lastSeenAt: Date | null,
    expectedIntervalMinutes: number,
    deadAfterMinutes: number,
    now: Date = new Date()
  ): SignalState {
    return calculateStateFromLastSeen(lastSeenAt, expectedIntervalMinutes, deadAfterMinutes, now);
  }

  /**
   * Calculate state using a monitoring rule
   */
  getStateForRule(
    lastSeenAt: Date | null,
    rule: MonitoringRule,
    now: Date = new Date()
  ): SignalState {
    return calculateStateForRule(lastSeenAt, rule, now);
  }

  /**
   * Determine alert type based on state transition
   */
  getAlertType(previousState: SignalState, currentState: SignalState): AlertType | null {
    return determineAlertTypeFromShared(previousState, currentState);
  }
}
