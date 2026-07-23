import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { FilterRule, RuleCategory } from '@email-filter/shared';
import { isOverrideAddress, applyWorkerForwardPolicy } from './forward-resolver.js';

// ---- Helpers --------------------------------------------------------------

const baseRule = (overrides: Partial<FilterRule> = {}): FilterRule => ({
  id: 'rule-1',
  category: 'whitelist',
  matchType: 'sender',
  matchMode: 'contains',
  pattern: 'example.com',
  enabled: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  lastHitAt: undefined,
  ...overrides,
});

const forwardRule = (forwardTo: string): FilterRule =>
  baseRule({
    id: 'rule-fwd',
    category: 'forward',
    forwardTo,
  });

const whitelistRule = (forwardTo?: string): FilterRule =>
  baseRule({
    id: 'rule-wl',
    category: 'whitelist',
    forwardTo,
  });

// ---- isOverrideAddress ----------------------------------------------------

describe('isOverrideAddress', () => {
  it('returns false for forward rules (core address, never gated)', () => {
    expect(isOverrideAddress(forwardRule('dest@example.com'))).toBe(false);
  });

  it('returns true for whitelist rules with an override address', () => {
    expect(isOverrideAddress(whitelistRule('dest@example.com'))).toBe(true);
  });

  it('returns true for blacklist and dynamic rules', () => {
    for (const category of ['blacklist', 'dynamic'] as RuleCategory[]) {
      expect(isOverrideAddress(baseRule({ category }))).toBe(true);
    }
  });
});

// ---- applyWorkerForwardPolicy --------------------------------------------

describe('applyWorkerForwardPolicy', () => {
  describe('when the toggle is ON', () => {
    it('preserves forwardTo on every rule category', () => {
      const rules = [
        forwardRule('fwd@example.com'),
        whitelistRule('wl@example.com'),
      ];
      const result = applyWorkerForwardPolicy(rules, true);
      expect(result[0].forwardTo).toBe('fwd@example.com');
      expect(result[1].forwardTo).toBe('wl@example.com');
    });
  });

  describe('when the toggle is OFF', () => {
    // Regression test for the core bug: a forward rule's core address must NOT
    // be stripped even when the Worker toggle is off.
    it('PRESERVES forwardTo on forward rules (core address, not an override)', () => {
      const rules = [forwardRule('critical@example.com')];
      const result = applyWorkerForwardPolicy(rules, false);
      expect(result[0].forwardTo).toBe('critical@example.com');
    });

    it('STRIPS forwardTo on whitelist rules (override address)', () => {
      const rules = [whitelistRule('override@example.com')];
      const result = applyWorkerForwardPolicy(rules, false);
      expect(result[0].forwardTo).toBeUndefined();
    });

    it('STRIPS forwardTo on blacklist/dynamic rules (override address)', () => {
      const rules = (['blacklist', 'dynamic'] as RuleCategory[]).map((category, i) =>
        baseRule({ id: `r-${i}`, category, forwardTo: 'x@example.com' })
      );
      const result = applyWorkerForwardPolicy(rules, false);
      expect(result.every((r) => r.forwardTo === undefined)).toBe(true);
    });

    it('handles a mixed rule set correctly', () => {
      const rules = [
        forwardRule('fwd@example.com'),
        whitelistRule('wl@example.com'),
        baseRule({ id: 'r-bl', category: 'blacklist', forwardTo: 'bl@example.com' }),
      ];
      const result = applyWorkerForwardPolicy(rules, false);
      expect(result[0].forwardTo).toBe('fwd@example.com');
      expect(result[1].forwardTo).toBeUndefined();
      expect(result[2].forwardTo).toBeUndefined();
    });
  });

  // Regression for point 3: the input array and its elements must not be mutated,
  // so the shared rule cache is never polluted regardless of toggle state.
  describe('input immutability (cache safety)', () => {
    it('does not mutate the input rules when stripping', () => {
      const original = [whitelistRule('keep@example.com')];
      applyWorkerForwardPolicy(original, false);
      expect(original[0].forwardTo).toBe('keep@example.com');
    });

    it('returns a new array (not the same reference)', () => {
      const original = [forwardRule('a@example.com')];
      const result = applyWorkerForwardPolicy(original, true);
      expect(result).not.toBe(original);
    });

    it('returns new rule objects (not the same element references)', () => {
      const original = [forwardRule('a@example.com'), whitelistRule('b@example.com')];
      const result = applyWorkerForwardPolicy(original, false);
      expect(result[0]).not.toBe(original[0]);
      expect(result[1]).not.toBe(original[1]);
    });
  });

  // Property-based: forward rules ALWAYS keep forwardTo regardless of toggle;
  // the toggle only ever affects non-forward rules.
  describe('properties', () => {
    const categoryArb = fc.constantFrom<RuleCategory>('whitelist', 'blacklist', 'dynamic', 'forward');

    it('forward rules never lose forwardTo, regardless of toggle state', () => {
      fc.assert(
        fc.property(
          fc.record({
            forwardTo: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            enabled: fc.boolean(),
          }),
          ({ forwardTo, enabled }) => {
            const rules = [forwardRule(forwardTo)];
            const result = applyWorkerForwardPolicy(rules, enabled);
            return result[0].forwardTo === forwardTo;
          }
        )
      );
    });

    it('non-forward rules keep forwardTo only when toggle is ON', () => {
      fc.assert(
        fc.property(
          fc.record({
            category: fc.constantFrom<RuleCategory>('whitelist', 'blacklist', 'dynamic'),
            toggle: fc.boolean(),
            hasForwardTo: fc.boolean(),
          }),
          ({ category, toggle, hasForwardTo }) => {
            const fwd = hasForwardTo ? 'dest@example.com' : undefined;
            const rules = [baseRule({ category, forwardTo: fwd })];
            const result = applyWorkerForwardPolicy(rules, toggle);
            if (toggle) {
              return result[0].forwardTo === fwd;
            }
            return result[0].forwardTo === undefined;
          }
        )
      );
    });

    it('every category is classified consistently', () => {
      fc.assert(
        fc.property(categoryArb, (category) => {
          const rule = baseRule({ category });
          const override = isOverrideAddress(rule);
          // Only forward is a core address; everything else is an override.
          return override === (category !== 'forward');
        })
      );
    });
  });
});
