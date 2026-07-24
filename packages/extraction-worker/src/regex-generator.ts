/**
 * Regex Generator — generates candidate regex patterns from a sample code.
 *
 * Adapted from yahoo-mail-extractor's regex-generator.ts suggestPatterns().
 * Pure functions, no I/O — isolated for unit testing.
 *
 * Usage flow:
 *   1. User selects a real code sample from an email preview (e.g. "SAVE20")
 *   2. generateFromTarget(sample) returns ranked candidate patterns
 *   3. User picks one, optionally tests it with testRegexMatch()
 *   4. Chosen pattern is saved as the rule's code_pattern
 *
 * Each detected form yields 3 candidates:
 *   - Exact length (highest confidence)
 *   - Flexible length ±2 (medium)
 *   - Generic any-length (lowest, highest recall but false-positive risk)
 */

export interface PatternSuggestion {
  pattern: string;
  description: string;
  confidence: number; // 0-1
}

export interface GeneratedPattern {
  literal: string; // escaped literal match (fallback)
  suggestions: PatternSuggestion[]; // ranked by confidence desc
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface MatchResult {
  matches: string[];
  positions: number[];
}

// ============================================
// Helpers
// ============================================

const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/** Escape special regex characters in a string for literal matching. */
export function escapeSpecialChars(input: string): string {
  return input.replace(REGEX_SPECIAL_CHARS, '\\$&');
}

// ============================================
// Prefix detection (English + Chinese)
// ============================================

interface PrefixEntry {
  regex: RegExp;
  prefix: string;
  name: string;
}

const PREFIX_ENTRIES: PrefixEntry[] = [
  // English
  { regex: /^(?:use\s+)?code[:\s]+(.+)$/i, prefix: '(?:use\\s+)?code[:\\s]+', name: 'Use code' },
  { regex: /^promo(?:\s+code)?[:\s]+(.+)$/i, prefix: 'promo(?:\\s+code)?[:\\s]+', name: 'Promo code' },
  { regex: /^coupon(?:\s+code)?[:\s]+(.+)$/i, prefix: 'coupon(?:\\s+code)?[:\\s]+', name: 'Coupon code' },
  { regex: /^discount(?:\s+code)?[:\s]+(.+)$/i, prefix: 'discount(?:\\s+code)?[:\\s]+', name: 'Discount code' },
  { regex: /^voucher(?:\s+code)?[:\s]+(.+)$/i, prefix: 'voucher(?:\\s+code)?[:\\s]+', name: 'Voucher code' },
  { regex: /^your\s+code[:\s]+(.+)$/i, prefix: 'your\\s+code[:\\s]+', name: 'Your code' },
  { regex: /^redemption\s+code[:\s]+(.+)$/i, prefix: 'redemption\\s+code[:\\s]+', name: 'Redemption code' },
  { regex: /^gift\s+code[:\s]+(.+)$/i, prefix: 'gift\\s+code[:\\s]+', name: 'Gift code' },
  { regex: /^activation\s+code[:\s]+(.+)$/i, prefix: 'activation\\s+code[:\\s]+', name: 'Activation code' },
  { regex: /^offer\s+code[:\s]+(.+)$/i, prefix: 'offer\\s+code[:\\s]+', name: 'Offer code' },
  { regex: /^refer(?:ral)?\s+code[:\s]+(.+)$/i, prefix: 'refer(?:ral)?\\s+code[:\\s]+', name: 'Referral code' },
  // Chinese
  { regex: /^(?:优惠码|折扣码|优惠代码|折扣代码|兑换码|激活码|礼品码|代码)[：:\s]+(.+)$/i, prefix: '(?:优惠码|折扣码|优惠代码|折扣代码|兑换码|激活码|礼品码|代码)[：:\\s]+', name: '中文优惠码' },
];

/** Marketing keyword prefixes that start discount codes. */
const MARKETING_KEYWORDS = 'SAVE|OFF|GET|CODE|PROMO|DISCOUNT|FREE|DEAL|SALE|VIP|NEW|FIRST|WELCOME|SHIP|SUMMER|WINTER|SPRING|FALL|BLACK|CYBER|HOLIDAY|CHRISTMAS';

// ============================================
// Core: suggestPatterns
// ============================================

/**
 * Analyze a sample code string and generate candidate regex patterns.
 * Returns suggestions sorted by confidence (highest first), max 6.
 */
export function suggestPatterns(target: string): PatternSuggestion[] {
  const suggestions: PatternSuggestion[] = [];
  const trimmed = target.trim();

  // ========== 1. Prefix detection (highest confidence) ==========
  for (const { regex, prefix, name } of PREFIX_ENTRIES) {
    const match = trimmed.match(regex);
    if (match?.[1]) {
      const codeValue = match[1].trim();
      const codeLen = codeValue.length;
      if (/^[A-Za-z0-9]+$/.test(codeValue)) {
        suggestions.push({
          pattern: `${prefix}(?<code>[A-Z0-9]{${codeLen}})`,
          description: `${name} 格式，精确 ${codeLen} 位代码`,
          confidence: 0.98,
        });
        const minLen = Math.max(codeLen - 2, 4);
        const maxLen = codeLen + 4;
        suggestions.push({
          pattern: `${prefix}(?<code>[A-Z0-9]{${minLen},${maxLen}})`,
          description: `${name} 格式，${minLen}-${maxLen} 位代码`,
          confidence: 0.95,
        });
        suggestions.push({
          pattern: `${prefix}(?<code>[A-Z0-9]+)`,
          description: `${name} 格式，任意长度代码`,
          confidence: 0.85,
        });
      }
      if (suggestions.length > 0) {
        suggestions.sort((a, b) => b.confidence - a.confidence);
        return suggestions.slice(0, 6);
      }
    }
  }

  // ========== 2. Universal prefix fallback (always added) ==========
  suggestions.push({
    pattern: `(?:code|代码|优惠码|折扣码|兑换码|promo|coupon)[：:\\s]+(?<code>[A-Z0-9]{4,20})`,
    description: '通用优惠码格式 (中英文前缀)',
    confidence: 0.92,
  });

  // ========== 3. Pure alphanumeric ==========
  if (/^[A-Za-z0-9]+$/.test(trimmed)) {
    const len = trimmed.length;
    suggestions.push({
      pattern: `(?<code>[A-Z0-9]{${len}})`,
      description: `精确 ${len} 位字母数字代码`,
      confidence: 0.90,
    });
    // Sub-form: letters then numbers (ABC123)
    if (/^[A-Za-z]+[0-9]+$/.test(trimmed)) {
      const lm = trimmed.match(/^[A-Za-z]+/);
      const nm = trimmed.match(/[0-9]+$/);
      if (lm && nm) {
        suggestions.push({
          pattern: `(?<code>[A-Z]{${lm[0].length}}[0-9]{${nm[0].length}})`,
          description: `${lm[0].length} 个字母后跟 ${nm[0].length} 个数字`,
          confidence: 0.85,
        });
      }
    }
    // Sub-form: numbers then letters (123ABC)
    if (/^[0-9]+[A-Za-z]+$/.test(trimmed)) {
      const nm = trimmed.match(/^[0-9]+/);
      const lm = trimmed.match(/[A-Za-z]+$/);
      if (nm && lm) {
        suggestions.push({
          pattern: `(?<code>[0-9]{${nm[0].length}}[A-Z]{${lm[0].length}})`,
          description: `${nm[0].length} 个数字后跟 ${lm[0].length} 个字母`,
          confidence: 0.85,
        });
      }
    }
    // Sub-form: letters-numbers-letters (AB123CD)
    if (/^[A-Za-z]+[0-9]+[A-Za-z]+$/.test(trimmed)) {
      suggestions.push({
        pattern: `(?<code>[A-Z]+[0-9]+[A-Z]+)`,
        description: '字母-数字-字母 格式',
        confidence: 0.80,
      });
    }
    // Flexible length
    const minLen = Math.max(len - 2, 4);
    const maxLen = len + 4;
    suggestions.push({
      pattern: `(?<code>[A-Z0-9]{${minLen},${maxLen}})`,
      description: `${minLen}-${maxLen} 位代码`,
      confidence: 0.80,
    });
  }

  // ========== 4. Pure numeric ==========
  if (/^\d+$/.test(trimmed)) {
    const len = trimmed.length;
    suggestions.push({
      pattern: `(?<code>\\d{${len}})`,
      description: `精确 ${len} 位数字`,
      confidence: 0.90,
    });
  }

  // ========== 5. Hyphenated (ABC-123-XYZ) ==========
  if (/^[A-Za-z0-9]+-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/.test(trimmed)) {
    const parts = trimmed.split('-');
    const partPatterns = parts.map((p) => `[A-Z0-9]{${p.length}}`);
    suggestions.push({
      pattern: `(?<code>${partPatterns.join('-')})`,
      description: `连字符分隔 (${parts.length} 段)`,
      confidence: 0.90,
    });
  }

  // ========== 6. Marketing keyword prefix (SAVE20, FREESHIP) ==========
  const kwRe = new RegExp(`^(${MARKETING_KEYWORDS})[A-Z0-9]+$`, 'i');
  if (kwRe.test(trimmed)) {
    const kwMatch = trimmed.match(new RegExp(`^(${MARKETING_KEYWORDS})`, 'i'));
    if (kwMatch) {
      const kw = kwMatch[1].toUpperCase();
      suggestions.push({
        pattern: `(?<code>${kw}[A-Z0-9]+)`,
        description: `以 '${kw}' 开头的优惠码`,
        confidence: 0.90,
      });
    }
  }

  // ========== 7. UUID ==========
  if (/^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}$/.test(trimmed)) {
    suggestions.push({
      pattern: `(?<code>[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12})`,
      description: 'UUID 格式',
      confidence: 0.95,
    });
  }

  // Sort + limit
  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions.slice(0, 6);
}

// ============================================
// Public API
// ============================================

/**
 * Generate patterns from a target sample string.
 * Returns literal match + ranked suggestions.
 */
export function generateFromTarget(target: string, emailContent?: string): GeneratedPattern {
  const literal = escapeSpecialChars(target);
  const suggestions = suggestPatterns(target);

  const result: GeneratedPattern = { literal, suggestions };

  if (emailContent) {
    // Find context around the target in the email
    let index = emailContent.indexOf(target);
    if (index === -1) {
      index = emailContent.toLowerCase().indexOf(target.toLowerCase());
    }
    if (index !== -1) {
      const start = Math.max(0, index - 100);
      const end = Math.min(emailContent.length, index + target.length + 100);
      (result as GeneratedPattern & { context?: string; foundAt?: number }).context = emailContent.slice(start, end);
      (result as GeneratedPattern & { foundAt?: number }).foundAt = index;
    }
  }

  return result;
}

/**
 * Validate a regex pattern string.
 */
export function validateRegex(pattern: string, flags: string = ''): ValidationResult {
  if (!pattern || pattern.trim() === '') {
    return { valid: false, error: 'Pattern cannot be empty' };
  }
  if (pattern.length > 200) {
    return { valid: false, error: 'Pattern too long (max 200 chars)' };
  }
  const validFlags = /^[gimsuy]*$/;
  if (flags && !validFlags.test(flags)) {
    return { valid: false, error: `Invalid flags: ${flags}` };
  }
  try {
    new RegExp(pattern, flags);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Invalid regex' };
  }
}

/**
 * Test a regex pattern against content and return all matches.
 * Includes safety limits (maxMatches, maxContentLength, zero-width protection).
 */
export function testRegexMatch(pattern: string, flags: string, content: string): MatchResult {
  const validation = validateRegex(pattern, flags);
  if (!validation.valid) {
    return { matches: [], positions: [] };
  }

  const maxMatches = 1000;
  const maxContentLength = 500_000;
  const safeContent = content.length > maxContentLength ? content.slice(0, maxContentLength) : content;

  const matches: string[] = [];
  const positions: number[] = [];
  const seen = new Set<string>();
  const caseInsensitive = flags.includes('i');

  try {
    const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(safeContent)) !== null && count < maxMatches) {
      const value = m[1] ?? m[0]; // capture group or full match
      const key = caseInsensitive ? value.toLowerCase() : value;
      if (value && !seen.has(key)) {
        seen.add(key);
        matches.push(value);
        positions.push(m.index);
      }
      count++;
      if (m[0].length === 0) re.lastIndex++; // zero-width protection
    }
  } catch {
    return { matches: [], positions: [] };
  }

  return { matches, positions };
}
