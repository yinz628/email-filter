/**
 * Tests for discount code extraction logic.
 */

import { describe, it, expect } from 'vitest';
import {
  extract,
  extractCodeWithPattern,
  findLinkByAnchorPattern,
  isValidDiscountCode,
  extractDiscountValue,
} from './extract.js';

describe('isValidDiscountCode', () => {
  it('accepts mixed alphanumeric', () => {
    expect(isValidDiscountCode('SAVE20')).toBe(true);
    expect(isValidDiscountCode('ABC123')).toBe(true);
    expect(isValidDiscountCode('SUMMER2024')).toBe(true);
  });
  it('rejects pure numbers (order/price)', () => {
    expect(isValidDiscountCode('482913')).toBe(false);
    expect(isValidDiscountCode('100')).toBe(false);
  });
  it('rejects pure letters (dictionary words)', () => {
    expect(isValidDiscountCode('HELLO')).toBe(false);
    expect(isValidDiscountCode('WELCOME')).toBe(false);
  });
  it('rejects too short / too long', () => {
    expect(isValidDiscountCode('AB1')).toBe(false);
    expect(isValidDiscountCode('ABCDEFGHIJ1234567890X')).toBe(false);
  });
  it('accepts hyphenated', () => {
    expect(isValidDiscountCode('ABC-123')).toBe(true);
  });
});

describe('extractCodeWithPattern', () => {
  it('extracts using named group', () => {
    expect(extractCodeWithPattern('Your code SAVE20', '(?<code>SAVE\\d+)')).toBe('SAVE20');
  });
  it('extracts using capture group 1', () => {
    expect(extractCodeWithPattern('code: ABC123', 'code: ([A-Z0-9]+)')).toBe('ABC123');
  });
  it('extracts using full match when no groups', () => {
    expect(extractCodeWithPattern('SUMMER2024', 'SUMMER\\d+')).toBe('SUMMER2024');
  });
  it('returns undefined for invalid regex', () => {
    expect(extractCodeWithPattern('test', '[')).toBeUndefined();
  });
  it('returns undefined when no match', () => {
    expect(extractCodeWithPattern('hello world', '\\d{6}')).toBeUndefined();
  });
});

describe('findLinkByAnchorPattern', () => {
  it('finds link by custom anchor pattern', () => {
    const html = '<a href="https://shop.io/buy?c=1">Shop now</a>';
    expect(findLinkByAnchorPattern(html, 'Shop now|立即购买')).toBe('https://shop.io/buy?c=1');
  });
  it('returns undefined when no anchor matches', () => {
    const html = '<a href="https://x.io">click here</a>';
    expect(findLinkByAnchorPattern(html, 'Shop now')).toBeUndefined();
  });
});

describe('extractDiscountValue', () => {
  it('extracts percentage', () => {
    expect(extractDiscountValue('20% OFF', 'Get 20% OFF today')).toBe('20% OFF');
  });
  it('extracts dollar amount', () => {
    expect(extractDiscountValue(undefined, 'Save $10 on your order')).toBe('$10');
  });
  it('extracts FREE SHIPPING', () => {
    expect(extractDiscountValue(undefined, 'Get FREE SHIPPING now')).toBe('FREE SHIPPING');
  });
  it('returns undefined when no value', () => {
    expect(extractDiscountValue('Newsletter', 'Check our deals')).toBeUndefined();
  });
});

describe('extract (discount type)', () => {
  it('extracts discount code with prefix', () => {
    const r = extract('Your discount', 'Use promo code SAVE20 for 20% off', undefined, 'discount');
    expect(r.code?.value).toBe('SAVE20');
    expect(r.discountValue).toBeTruthy();
  });

  it('extracts discount code by custom pattern', () => {
    const r = extract('Promo', 'Your code: XYZ123ABC', undefined, 'discount', '[A-Z0-9]{6,12}');
    expect(r.code?.value).toBe('XYZ123ABC');
  });

  it('extracts discount link by anchor', () => {
    const html = '<a href="https://shop.io/claim?c=1">Claim offer</a>';
    const r = extract('Offer', undefined, html, 'discount', undefined, 'Claim offer|领取');
    expect(r.link).toBe('https://shop.io/claim?c=1');
  });

  it('does not extract pure-number code as discount', () => {
    const r = extract('Discount', 'Your code 482913 expires soon', undefined, 'discount');
    // 482913 is pure number → rejected by discount validator
    expect(r.code?.value).not.toBe('482913');
  });
});
