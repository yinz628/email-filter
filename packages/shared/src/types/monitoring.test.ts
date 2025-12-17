import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateSignalState,
  calculateGapMinutes,
  determineAlertType,
  type SignalState,
} from './monitoring.js';

/**
 * **Feature: email-realtime-monitoring, Property 5: 状态计算公式正确性**
 * *For any* gap、expectedInterval、deadAfter 值组合，状态计算应满足：
 * - gap <= expectedInterval * 1.5 → ACTIVE
 * - expectedInterval * 1.5 < gap <= deadAfter → WEAK
 * - gap > deadAfter → DEAD
 * **Validates: Requirements 2.1**
 */
describe('Property 5: 状态计算公式正确性', () => {
  // Arbitrary for positive interval values (in minutes)
  const positiveIntervalArbitrary = fc.integer({ min: 1, max: 10000 });
  
  // Arbitrary for gap values (in minutes, can be 0 or positive)
  const gapArbitrary = fc.integer({ min: 0, max: 100000 });

  describe('calculateSignalState', () => {
    it('should return ACTIVE when gap <= expectedInterval * 1.5', () => {
      fc.assert(
        fc.property(
          positiveIntervalArbitrary,
          positiveIntervalArbitrary,
          (expectedInterval, deadAfter) => {
            // Ensure deadAfter >= expectedInterval * 1.5 for valid configuration
            const validDeadAfter = Math.max(deadAfter, Math.ceil(expectedInterval * 1.5) + 1);
            const activeThreshold = expectedInterval * 1.5;
            
            // Test gap at exactly the threshold
            const gapAtThreshold = Math.floor(activeThreshold);
            const state = calculateSignalState(gapAtThreshold, expectedInterval, validDeadAfter);
            expect(state).toBe('ACTIVE');
            
            // Test gap below threshold
            if (gapAtThreshold > 0) {
              const gapBelowThreshold = Math.floor(activeThreshold / 2);
              const stateBelowThreshold = calculateSignalState(gapBelowThreshold, expectedInterval, validDeadAfter);
              expect(stateBelowThreshold).toBe('ACTIVE');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return WEAK when expectedInterval * 1.5 < gap <= deadAfter', () => {
      fc.assert(
        fc.property(
          positiveIntervalArbitrary,
          (expectedInterval) => {
            const activeThreshold = expectedInterval * 1.5;
            // Ensure deadAfter is greater than activeThreshold to have a valid WEAK range
            const deadAfter = Math.ceil(activeThreshold) + 100;
            
            // Test gap just above active threshold
            const gapJustAboveActive = Math.ceil(activeThreshold) + 1;
            if (gapJustAboveActive <= deadAfter) {
              const state = calculateSignalState(gapJustAboveActive, expectedInterval, deadAfter);
              expect(state).toBe('WEAK');
            }
            
            // Test gap at exactly deadAfter
            const stateAtDeadAfter = calculateSignalState(deadAfter, expectedInterval, deadAfter);
            expect(stateAtDeadAfter).toBe('WEAK');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return DEAD when gap > deadAfter', () => {
      fc.assert(
        fc.property(
          positiveIntervalArbitrary,
          positiveIntervalArbitrary,
          (expectedInterval, deadAfter) => {
            // Ensure deadAfter is valid (>= expectedInterval * 1.5)
            const validDeadAfter = Math.max(deadAfter, Math.ceil(expectedInterval * 1.5) + 1);
            
            // Test gap above deadAfter
            const gapAboveDeadAfter = validDeadAfter + 1;
            const state = calculateSignalState(gapAboveDeadAfter, expectedInterval, validDeadAfter);
            expect(state).toBe('DEAD');
            
            // Test gap significantly above deadAfter
            const gapFarAboveDeadAfter = validDeadAfter + 1000;
            const stateFarAbove = calculateSignalState(gapFarAboveDeadAfter, expectedInterval, validDeadAfter);
            expect(stateFarAbove).toBe('DEAD');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly classify any valid gap/interval/deadAfter combination', () => {
      fc.assert(
        fc.property(
          gapArbitrary,
          positiveIntervalArbitrary,
          positiveIntervalArbitrary,
          (gap, expectedInterval, deadAfterBase) => {
            // Ensure deadAfter >= expectedInterval * 1.5 for valid configuration
            const activeThreshold = expectedInterval * 1.5;
            const deadAfter = Math.max(deadAfterBase, Math.ceil(activeThreshold) + 1);
            
            const state = calculateSignalState(gap, expectedInterval, deadAfter);
            
            // Verify the state matches the formula
            if (gap <= activeThreshold) {
              expect(state).toBe('ACTIVE');
            } else if (gap <= deadAfter) {
              expect(state).toBe('WEAK');
            } else {
              expect(state).toBe('DEAD');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case: gap = 0 should always be ACTIVE', () => {
      fc.assert(
        fc.property(
          positiveIntervalArbitrary,
          positiveIntervalArbitrary,
          (expectedInterval, deadAfter) => {
            const state = calculateSignalState(0, expectedInterval, deadAfter);
            expect(state).toBe('ACTIVE');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case: Infinity gap should always be DEAD', () => {
      fc.assert(
        fc.property(
          positiveIntervalArbitrary,
          positiveIntervalArbitrary,
          (expectedInterval, deadAfter) => {
            const state = calculateSignalState(Infinity, expectedInterval, deadAfter);
            expect(state).toBe('DEAD');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('calculateGapMinutes', () => {
    it('should return Infinity when lastSeenAt is null', () => {
      const gap = calculateGapMinutes(null);
      expect(gap).toBe(Infinity);
    });

    it('should return correct gap in minutes for any valid date', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000000 }), // gap in minutes
          (expectedGapMinutes) => {
            const now = new Date();
            const lastSeenAt = new Date(now.getTime() - expectedGapMinutes * 60 * 1000);
            const calculatedGap = calculateGapMinutes(lastSeenAt, now);
            expect(calculatedGap).toBe(expectedGapMinutes);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 when lastSeenAt equals now', () => {
      const now = new Date();
      const gap = calculateGapMinutes(now, now);
      expect(gap).toBe(0);
    });

    it('should floor the gap to whole minutes', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 59 }), // extra seconds
          fc.integer({ min: 1, max: 1000 }), // base minutes
          (extraSeconds, baseMinutes) => {
            const now = new Date();
            const lastSeenAt = new Date(now.getTime() - (baseMinutes * 60 * 1000 + extraSeconds * 1000));
            const calculatedGap = calculateGapMinutes(lastSeenAt, now);
            expect(calculatedGap).toBe(baseMinutes);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('determineAlertType', () => {
    const allStates: SignalState[] = ['ACTIVE', 'WEAK', 'DEAD'];

    it('should return null when state does not change', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<SignalState>(...allStates),
          (state) => {
            const alertType = determineAlertType(state, state);
            expect(alertType).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return FREQUENCY_DOWN when ACTIVE → WEAK', () => {
      const alertType = determineAlertType('ACTIVE', 'WEAK');
      expect(alertType).toBe('FREQUENCY_DOWN');
    });

    it('should return SIGNAL_DEAD when WEAK → DEAD', () => {
      const alertType = determineAlertType('WEAK', 'DEAD');
      expect(alertType).toBe('SIGNAL_DEAD');
    });

    it('should return SIGNAL_DEAD when ACTIVE → DEAD', () => {
      const alertType = determineAlertType('ACTIVE', 'DEAD');
      expect(alertType).toBe('SIGNAL_DEAD');
    });

    it('should return SIGNAL_RECOVERED when DEAD → ACTIVE', () => {
      const alertType = determineAlertType('DEAD', 'ACTIVE');
      expect(alertType).toBe('SIGNAL_RECOVERED');
    });

    it('should return SIGNAL_RECOVERED when WEAK → ACTIVE', () => {
      const alertType = determineAlertType('WEAK', 'ACTIVE');
      expect(alertType).toBe('SIGNAL_RECOVERED');
    });

    it('should return null when DEAD → WEAK (no direct alert for this transition)', () => {
      const alertType = determineAlertType('DEAD', 'WEAK');
      expect(alertType).toBeNull();
    });
  });
});
