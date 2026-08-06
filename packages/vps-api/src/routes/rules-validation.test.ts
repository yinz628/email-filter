/**
 * Unit tests for rule validation (validateCreateRule / validateUpdateRule).
 *
 * Focus: extraction-independence + optional forwardTo (Requirements 2 & 3).
 * Extraction flags (extractVerification / extractDiscount) must be accepted on
 * ANY category (not just 'forward'), and forwardTo must be optional for every
 * category. The two extraction flags remain mutually exclusive.
 */
import { describe, it, expect } from 'vitest';
import { validateCreateRule, validateUpdateRule } from './rules.js';

const baseCreate = {
  category: 'whitelist',
  matchType: 'sender',
  matchMode: 'contains',
  pattern: 'svc.com',
};

describe('validateCreateRule — extraction independence', () => {
  it('accepts extractVerification on a non-forward category (whitelist)', () => {
    const r = validateCreateRule({ ...baseCreate, extractVerification: true });
    expect(r.valid).toBe(true);
    expect(r.data?.extractVerification).toBe(true);
  });

  it('accepts extractDiscount on a blacklist rule', () => {
    const r = validateCreateRule({
      category: 'blacklist',
      matchType: 'sender',
      matchMode: 'contains',
      pattern: 'spam.com',
      extractDiscount: true,
    });
    expect(r.valid).toBe(true);
    expect(r.data?.extractDiscount).toBe(true);
  });

  it('accepts extractVerification on a dynamic rule', () => {
    const r = validateCreateRule({
      category: 'dynamic',
      matchType: 'subject',
      matchMode: 'contains',
      pattern: 'verify',
      extractVerification: true,
    });
    expect(r.valid).toBe(true);
    expect(r.data?.extractVerification).toBe(true);
  });

  it('still rejects extractVerification AND extractDiscount together', () => {
    const r = validateCreateRule({ ...baseCreate, extractVerification: true, extractDiscount: true });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/mutually exclusive/i);
  });

  it('does NOT require forwardTo for a forward rule anymore', () => {
    const r = validateCreateRule({
      category: 'forward',
      matchType: 'sender',
      matchMode: 'contains',
      pattern: 'svc.com',
      // no forwardTo
    });
    expect(r.valid).toBe(true);
    expect(r.data?.forwardTo).toBeUndefined();
  });

  it('accepts forwardTo on any category (optional override)', () => {
    const r = validateCreateRule({ ...baseCreate, forwardTo: 'bucket@example.com' });
    expect(r.valid).toBe(true);
    expect(r.data?.forwardTo).toBe('bucket@example.com');
  });
});

describe('validateUpdateRule — mutual exclusivity on update', () => {
  it('rejects setting both extraction flags to true in one update', () => {
    const r = validateUpdateRule({ extractVerification: true, extractDiscount: true });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/mutually exclusive/i);
  });

  it('accepts updating extractVerification alone on a rule', () => {
    const r = validateUpdateRule({ extractVerification: true });
    expect(r.valid).toBe(true);
    expect(r.data?.extractVerification).toBe(true);
  });

  it('clears forwardTo when an empty string is provided', () => {
    const r = validateUpdateRule({ forwardTo: '   ' });
    expect(r.valid).toBe(true);
    expect(r.data?.forwardTo).toBeUndefined();
  });
});
