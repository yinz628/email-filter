/**
 * State Calculator Service Tests
 * 
 * **Feature: email-realtime-monitoring, Property 5: 状态计算公式正确性**
 * **Validates: Requirements 2.1**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  StateCalculatorService,
  calculateStateFromLastSeen,
  calculateStateForRule,
} from './state-calculator.js';
import type { MonitoringRule } from '@email-filter/shared';

describe('StateCalculatorService', () => {
  const service = new StateCalculatorService();

  /**
   * **Feature: email-realtime-monitoring, Property 5: 状态计算公式正确性**
   * *For any* gap、expectedInterval、deadAfter 值组合，状态计算应满足：
   * - gap <= expectedInterval * 1.5 → ACTIVE
   * - expectedInterval * 1.5 < gap <= deadAfter → WEAK
   * - gap > deadAfter → DEAD
   * **Validates: Requirements 2.1**
   */
  describe('calculateStateFromLastSeen', () => {
    const positiveIntervalArbitrary = fc.integer({ min: 1, max: 10000 });

    it('should calculate ACTIVE state when gap is within expected interval * 1.5', () => {
      fc.assert(
        fc.property(
          positiveIntervalArbitrary,
          positiveIntervalArbitrary,
          (expectedInterval, deadAfterBase) => {
            const activeThreshold = expectedInterval * 1.5;
            const deadAfter = Math.max(deadAfterBase, Math.ceil(activeThreshold) + 1);
            
            const now = new Date();
            // Set lastSeenAt to be within active threshold
            const gapMinutes = Math.floor(activeThreshold / 2);
            const lastSeenAt = new Date(now.getTime() - gapMinutes * 60 * 1000);
            
            const state = calculateStateFromLastSeen(lastSeenAt, expectedInterval, deadAfter, now);
            expect(state).toBe('ACTIVE');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate WEAK state when gap is between active threshold and deadAfter', () => {
      fc.assert(
        fc.property(
          positiveIntervalArbitrary,
          (expectedInterval) => {
            const activeThreshold = expectedInterval * 1.5;
            const deadAfter = Math.ceil(activeThreshold) + 100;
            
            const now = new Date();
            // Set lastSeenAt to be in WEAK range
            const gapMinutes = Math.ceil(activeThreshold) + 10;
            const lastSeenAt = new Date(now.getTime() - gapMinutes * 60 * 1000);
            
            const state = calculateStateFromLastSeen(lastSeenAt, expectedInterval, deadAfter, now);
            expect(state).toBe('WEAK');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate DEAD state when gap exceeds deadAfter', () => {
      fc.assert(
        fc.property(
          positiveIntervalArbitrary,
          positiveIntervalArbitrary,
          (expectedInterval, deadAfterBase) => {
            const activeThreshold = expectedInterval * 1.5;
            const deadAfter = Math.max(deadAfterBase, Math.ceil(activeThreshold) + 1);
            
            const now = new Date();
            // Set lastSeenAt to be beyond deadAfter
            const gapMinutes = deadAfter + 10;
            const lastSeenAt = new Date(now.getTime() - gapMinutes * 60 * 1000);
            
            const state = calculateStateFromLastSeen(lastSeenAt, expectedInterval, deadAfter, now);
            expect(state).toBe('DEAD');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return DEAD when lastSeenAt is null (never seen)', () => {
      fc.assert(
        fc.property(
          positiveIntervalArbitrary,
          positiveIntervalArbitrary,
          (expectedInterval, deadAfter) => {
            const state = calculateStateFromLastSeen(null, expectedInterval, deadAfter);
            expect(state).toBe('DEAD');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('calculateStateForRule', () => {
    it('should use rule configuration for state calculation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 1000 }),
          (expectedInterval, deadAfterBase) => {
            const activeThreshold = expectedInterval * 1.5;
            const deadAfter = Math.max(deadAfterBase, Math.ceil(activeThreshold) + 1);
            
            const rule: MonitoringRule = {
              id: 'test-rule',
              merchant: 'test-merchant',
              name: 'Test Rule',
              subjectPattern: '.*',
              expectedIntervalMinutes: expectedInterval,
              deadAfterMinutes: deadAfter,
              enabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            
            const now = new Date();
            // Test ACTIVE state
            const activeGap = Math.floor(activeThreshold / 2);
            const activeLastSeen = new Date(now.getTime() - activeGap * 60 * 1000);
            expect(calculateStateForRule(activeLastSeen, rule, now)).toBe('ACTIVE');
            
            // Test DEAD state
            const deadGap = deadAfter + 10;
            const deadLastSeen = new Date(now.getTime() - deadGap * 60 * 1000);
            expect(calculateStateForRule(deadLastSeen, rule, now)).toBe('DEAD');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('StateCalculatorService class methods', () => {
    it('getGapMinutes should return correct gap', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          (gapMinutes) => {
            const now = new Date();
            const lastSeenAt = new Date(now.getTime() - gapMinutes * 60 * 1000);
            const calculated = service.getGapMinutes(lastSeenAt, now);
            expect(calculated).toBe(gapMinutes);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getGapMinutes should return Infinity for null lastSeenAt', () => {
      const gap = service.getGapMinutes(null);
      expect(gap).toBe(Infinity);
    });
  });
});
