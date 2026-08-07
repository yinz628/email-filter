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

describe('validateCreateRule — extraction exclusive to extract_* categories', () => {
  it('REJECTS extractVerification on a non-extract category (whitelist)', () => {
    const r = validateCreateRule({ ...baseCreate, extractVerification: true });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/extract_verification \/ extract_discount categories/);
  });

  it('REJECTS extractDiscount on a blacklist rule', () => {
    const r = validateCreateRule({
      category: 'blacklist',
      matchType: 'sender',
      matchMode: 'contains',
      pattern: 'spam.com',
      extractDiscount: true,
    });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/extract_verification \/ extract_discount categories/);
  });

  it('REJECTS extractVerification on a dynamic rule', () => {
    const r = validateCreateRule({
      category: 'dynamic',
      matchType: 'subject',
      matchMode: 'contains',
      pattern: 'verify',
      extractVerification: true,
    });
    expect(r.valid).toBe(false);
  });

  it('non-extract categories produce no extraction flags', () => {
    const r = validateCreateRule({ ...baseCreate });
    expect(r.valid).toBe(true);
    expect(r.data?.extractVerification).toBe(false);
    expect(r.data?.extractDiscount).toBe(false);
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

describe('validateCreateRule — extract_* first-class categories', () => {
  it('extract_verification forces extractVerification=true (ignores body flags)', () => {
    // Body tries to set extractDiscount=true; category must win (single source).
    const r = validateCreateRule({
      category: 'extract_verification',
      matchType: 'sender',
      matchMode: 'contains',
      pattern: 'svc.com',
      extractDiscount: true, // should be ignored
    });
    expect(r.valid).toBe(true);
    expect(r.data?.extractVerification).toBe(true);
    expect(r.data?.extractDiscount).toBe(false);
  });

  it('extract_discount forces extractDiscount=true', () => {
    const r = validateCreateRule({
      category: 'extract_discount',
      matchType: 'sender',
      matchMode: 'contains',
      pattern: 'deals.com',
    });
    expect(r.valid).toBe(true);
    expect(r.data?.extractDiscount).toBe(true);
    expect(r.data?.extractVerification).toBe(false);
  });

  it('extract_* does not require forwardTo (defaults applied at decision time)', () => {
    const r = validateCreateRule({
      category: 'extract_verification',
      matchType: 'subject',
      matchMode: 'contains',
      pattern: 'code',
    });
    expect(r.valid).toBe(true);
    expect(r.data?.forwardTo).toBeUndefined();
  });
});
