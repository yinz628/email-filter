/**
 * Tests for regex generator.
 */

import { describe, it, expect } from 'vitest';
import {
  generateFromTarget,
  suggestPatterns,
  suggestUrlPatterns,
  validateRegex,
  testRegexMatch,
  escapeSpecialChars,
} from './regex-generator.js';

describe('escapeSpecialChars', () => {
  it('escapes regex special chars', () => {
    expect(escapeSpecialChars('a.b*c+d')).toBe('a\\.b\\*c\\+d');
    expect(escapeSpecialChars('test')).toBe('test');
  });
});

describe('suggestPatterns', () => {
  it('detects prefix pattern (promo code: XXX)', () => {
    const suggestions = suggestPatterns('promo code: SUMMER2024');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].confidence).toBeGreaterThanOrEqual(0.95);
    expect(suggestions.some((s) => s.pattern.includes('promo'))).toBe(true);
  });

  it('detects pure alphanumeric', () => {
    const suggestions = suggestPatterns('Z78J2DM2G5B6');
    expect(suggestions.some((s) => s.pattern.includes('{12}'))).toBe(true);
  });

  it('detects letters-then-numbers (ABC123)', () => {
    const suggestions = suggestPatterns('ABC123');
    expect(suggestions.some((s) => s.pattern.includes('[A-Z]{3}[0-9]{3}'))).toBe(true);
  });

  it('detects marketing keyword prefix (SAVE20)', () => {
    const suggestions = suggestPatterns('SAVE20');
    expect(suggestions.some((s) => s.pattern.includes('SAVE'))).toBe(true);
  });

  it('detects hyphenated code', () => {
    const suggestions = suggestPatterns('ABC-123-XYZ');
    expect(suggestions.some((s) => s.description.includes('连字符'))).toBe(true);
  });

  it('detects UUID', () => {
    const suggestions = suggestPatterns('A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
    expect(suggestions.some((s) => s.description.includes('UUID'))).toBe(true);
  });

  it('detects pure numeric', () => {
    const suggestions = suggestPatterns('482913');
    expect(suggestions.some((s) => s.description.includes('位数字'))).toBe(true);
  });

  it('returns max 6 suggestions sorted by confidence', () => {
    const suggestions = suggestPatterns('SAVE20');
    expect(suggestions.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].confidence).toBeGreaterThanOrEqual(suggestions[i].confidence);
    }
  });
});

describe('suggestUrlPatterns', () => {
  it('generates candidates for a verification URL with path + query', () => {
    const url = 'https://www.neimanmarcus.com/manage-accounts/v1/confirm-user-email?code=385946&id=abc&def=123';
    const suggestions = suggestUrlPatterns(url);
    expect(suggestions.length).toBeGreaterThan(0);
    // Candidate 1 should be exact domain + path (highest confidence)
    expect(suggestions[0].confidence).toBeGreaterThanOrEqual(0.90);
    // Should contain the escaped domain
    expect(suggestions.some((s) => s.pattern.includes('neimanmarcus\\.com'))).toBe(true);
  });

  it('includes a query-param candidate when URL has code=/token=', () => {
    const url = 'https://app.io/verify?code=482913';
    const suggestions = suggestUrlPatterns(url);
    expect(suggestions.some((s) => s.pattern.includes('code='))).toBe(true);
  });

  it('includes a path-keyword candidate using the meaningful segment', () => {
    const url = 'https://app.io/auth/confirm-email?t=abc';
    const suggestions = suggestUrlPatterns(url);
    expect(suggestions.some((s) => s.pattern.includes('confirm-email'))).toBe(true);
  });

  it('includes a domain-only candidate', () => {
    const url = 'https://app.io/verify?t=1';
    const suggestions = suggestUrlPatterns(url);
    expect(suggestions.some((s) => s.pattern.includes('app\\.io\\b'))).toBe(true);
  });

  it('includes a literal-escaped fallback candidate', () => {
    const url = 'https://app.io/verify?t=1';
    const suggestions = suggestUrlPatterns(url);
    // escapeSpecialChars escapes / and . but NOT ? (not in its char class).
    // The literal candidate should contain the escaped domain.
    expect(suggestions.some((s) => s.pattern.includes('app\\.io'))).toBe(true);
  });

  it('returns suggestions sorted by confidence descending', () => {
    const url = 'https://app.io/verify?code=482913';
    const suggestions = suggestUrlPatterns(url);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].confidence).toBeGreaterThanOrEqual(suggestions[i].confidence);
    }
  });

  it('returns empty for malformed URL', () => {
    expect(suggestUrlPatterns('not a url')).toEqual([]);
    expect(suggestUrlPatterns('https://')).toEqual([]);
  });

  it('handles URLs without query params', () => {
    const url = 'https://app.io/verify';
    const suggestions = suggestUrlPatterns(url);
    expect(suggestions.length).toBeGreaterThan(0);
    // Should not include a query-param candidate
    expect(suggestions.some((s) => s.description.includes('参数'))).toBe(false);
  });
});

describe('suggestPatterns — URL integration', () => {
  it('suggestPatterns detects URL and delegates to URL branch', () => {
    const url = 'https://app.io/verify?code=482913';
    const suggestions = suggestPatterns(url);
    // URL patterns should be present
    expect(suggestions.some((s) => s.pattern.includes('app\\.io'))).toBe(true);
    // Top suggestion should be URL-specific (highest confidence), not a generic code pattern
    const topPattern = suggestions[0].pattern;
    expect(topPattern.includes('app\\.io') || topPattern.includes('code=')).toBe(true);
  });
});

describe('generateFromTarget', () => {
  it('returns literal + suggestions', () => {
    const result = generateFromTarget('SAVE20');
    expect(result.literal).toBe('SAVE20');
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('finds context when emailContent provided', () => {
    const result = generateFromTarget('SAVE20', 'Use code SAVE20 for 20% off your order today');
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});

describe('validateRegex', () => {
  it('accepts valid pattern', () => {
    expect(validateRegex('\\d{6}', 'g').valid).toBe(true);
  });
  it('rejects empty pattern', () => {
    expect(validateRegex('').valid).toBe(false);
  });
  it('rejects invalid pattern', () => {
    expect(validateRegex('[').valid).toBe(false);
  });
  it('rejects too-long pattern', () => {
    expect(validateRegex('a'.repeat(201)).valid).toBe(false);
  });
  it('rejects invalid flags', () => {
    expect(validateRegex('test', 'xyz').valid).toBe(false);
  });
});

describe('testRegexMatch', () => {
  it('finds all matches with global flag', () => {
    const result = testRegexMatch('SAVE\\d+', 'g', 'SAVE20 and SAVE50 and SAVE100');
    expect(result.matches).toEqual(['SAVE20', 'SAVE50', 'SAVE100']);
  });

  it('deduplicates case-insensitive', () => {
    const result = testRegexMatch('save\\d+', 'gi', 'SAVE20 save20');
    expect(result.matches).toEqual(['SAVE20']);
  });

  it('uses capture group when present', () => {
    const result = testRegexMatch('code: ([A-Z0-9]+)', 'gi', 'code: ABC123 code: XYZ789');
    expect(result.matches).toEqual(['ABC123', 'XYZ789']);
  });

  it('returns empty for invalid regex', () => {
    const result = testRegexMatch('[', 'g', 'test');
    expect(result.matches).toEqual([]);
  });

  it('handles zero-width matches safely', () => {
    const result = testRegexMatch('a*', 'g', 'xxx');
    expect(result.matches.length).toBeLessThanOrEqual(1);
  });
});
