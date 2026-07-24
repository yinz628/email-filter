/**
 * Tests for the verification code/link extraction logic.
 *
 * Covers: prefix-anchored capture (EN + ZH), filtered fallback, noise
 * exclusion, verification-link filtering, multi-representation search, and
 * the precision edge cases that the previous generic-regex approach failed.
 */

import { describe, it, expect } from 'vitest';
import {
  extractVerification,
  htmlToPlainText,
  extractHrefUrls,
  buildSearchableText,
  findCodeByPrefix,
  findStandaloneCode,
} from './extract.js';

// isNoise is not exported by design; test it indirectly via findStandaloneCode.

describe('htmlToPlainText', () => {
  it('strips tags and decodes entities', () => {
    const html = '<p>Your code is <strong>123456</strong>&nbsp;expires soon</p>';
    expect(htmlToPlainText(html)).toBe('Your code is 123456 expires soon');
  });

  it('removes script and style blocks', () => {
    const html = '<style>.x{color:red}</style><script>var x=999999</script><div>code 4242</div>';
    const text = htmlToPlainText(html);
    expect(text).toContain('4242');
    expect(text).not.toContain('999999');
    expect(text).not.toContain('color');
  });

  it('decodes numeric and hex entities', () => {
    expect(htmlToPlainText('&#65;&#66;')).toBe('AB');
    expect(htmlToPlainText('&#x41;')).toBe('A');
  });
});

describe('extractHrefUrls', () => {
  it('extracts hrefs and skips javascript/cid', () => {
    const html = '<a href="https://verify.example.com/x">v</a><a href="javascript:void(0)">j</a><a href="cid:img1">c</a>';
    const urls = extractHrefUrls(html);
    expect(urls).toEqual(['https://verify.example.com/x']);
  });
});

describe('buildSearchableText', () => {
  it('merges subject + text + stripped html, dedupes; excludes href URLs', () => {
    const t = buildSearchableText('S', 'plain text 452017', '<a href="https://v.io/verify?t=1">link</a>');
    expect(t).toContain('S');
    expect(t).toContain('plain text 452017');
    expect(t).toContain('link'); // stripped html visible text
    // href URLs must NOT leak into code-search text (their tokens cause false codes)
    expect(t).not.toContain('https://v.io/verify');
  });
});

describe('findCodeByPrefix (Layer 1)', () => {
  it('captures code after "verification code:"', () => {
    expect(findCodeByPrefix('Your verification code: 452017')).toBe('452017');
  });
  it('captures code after Chinese "验证码："', () => {
    expect(findCodeByPrefix('您的验证码：663241，5分钟内有效')).toBe('663241');
  });
  it('captures code after "code is"', () => {
    expect(findCodeByPrefix('Your code is AB7C9X')).toBe('AB7C9X');
  });
  it('captures "XXX is your code" form', () => {
    expect(findCodeByPrefix('9921 is your verification code')).toBe('9921');
  });
  it('captures OTP statement', () => {
    expect(findCodeByPrefix('OTP: 482913')).toBe('482913');
  });
  it('captures Chinese 动态密码', () => {
    expect(findCodeByPrefix('您的动态密码为553201，请勿泄露')).toBe('553201');
  });
  it('returns undefined when no prefix phrase present', () => {
    expect(findCodeByPrefix('Welcome to our service')).toBeUndefined();
  });
});

describe('findStandaloneCode (Layer 2 — filtered fallback)', () => {
  it('finds a code token when no prefix exists', () => {
    // The email is known to be a verification email; code exists but no phrase.
    expect(findStandaloneCode('Here is what you need: 778899. Thanks.')).toBe('778899');
  });
  it('excludes order numbers prefixed with #', () => {
    expect(findStandaloneCode('Order #482913 shipped today')).toBeUndefined();
  });
  it('excludes prices', () => {
    expect(findStandaloneCode('Total $29.99 paid')).toBeUndefined();
  });
  it('excludes dates', () => {
    expect(findStandaloneCode('Expires 2026-07-23')).toBeUndefined();
  });
  it('excludes phone numbers', () => {
    expect(findStandaloneCode('Call 13800138000 for help')).toBeUndefined();
  });
  it('returns undefined for pure noise', () => {
    expect(findStandaloneCode('Invoice $48.99 due 07/23/2026')).toBeUndefined();
  });
});

describe('extractVerification — precision edge cases', () => {
  // Cases that the previous generic-regex approach FAILED; must now pass.
  it('does NOT extract order number from a non-code email body', () => {
    const r = extractVerification('Verify your email', 'Your order #482913 shipped. Tracking 1Z999AA1.', undefined);
    // Layer 1 has no prefix; Layer 2 fallback skips #482913 (order), so either
    // finds a non-noise token or nothing. #482913 must NOT be the result.
    expect(r.code?.value).not.toBe('482913');
  });

  it('extracts the right code when order number and code both present', () => {
    const r = extractVerification('Verify', 'Order #482913. Your verification code is 678901.', undefined);
    expect(r.code?.value).toBe('678901');
  });

  it('extracts from subject first when present', () => {
    const r = extractVerification('Code 778899', 'fallback 111111', undefined);
    expect(r.code?.value).toBe('778899');
  });

  it('extracts from HTML body when text absent', () => {
    const html = '<p>验证码：<b>314790</b></p>';
    const r = extractVerification('注册确认', undefined, html);
    expect(r.code?.value).toBe('314790');
  });

  it('returns empty when truly nothing matches', () => {
    const r = extractVerification('Newsletter', 'Check out our deals!', '<p>Sale 50% off $19.99</p>');
    expect(r.code).toBeUndefined();
    expect(r.link).toBeUndefined();
  });

  it('avoids false positive from HTML attribute numbers', () => {
    const html = '<img src="x.png" width="640" height="480"><p>Thanks</p>';
    const r = extractVerification('Welcome', undefined, html);
    expect(r.code).toBeUndefined();
  });

  it('handles alphanumeric codes', () => {
    const r = extractVerification('Code', 'Your activation code is AB7C9X', undefined);
    expect(r.code?.value).toBe('AB7C9X');
  });
});

describe('extractVerification — links', () => {
  it('extracts verification link from text body', () => {
    const r = extractVerification('Activate', 'Click https://app.foo.com/confirm?u=42 to confirm', undefined);
    expect(r.link).toBe('https://app.foo.com/confirm?u=42');
  });

  it('extracts link from HTML href', () => {
    const html = '<a href="https://x.io/verify?t=1">verify</a>';
    const r = extractVerification('Verify', undefined, html);
    expect(r.link).toBe('https://x.io/verify?t=1');
  });

  it('extracts reset/unlock action links', () => {
    expect(extractVerification('Reset', 'https://app.io/reset?token=abc', undefined).link).toBeTruthy();
    expect(extractVerification('Unlock', 'https://app.io/unlock?u=1', undefined).link).toBeTruthy();
  });

  it('ignores unsubscribe/social/footer links', () => {
    const text = 'https://x.io/unsubscribe https://facebook.com/x https://x.io/verify?t=1';
    const r = extractVerification('Verify', text, undefined);
    expect(r.link).toBe('https://x.io/verify?t=1');
  });

  it('ignores plain URLs without action verb', () => {
    expect(extractVerification('Newsletter', 'See https://example.com/blog/post-1', undefined).link).toBeUndefined();
  });

  it('extracts both code and link when both present', () => {
    const r = extractVerification('Verify', 'Your code 456789. Or https://x.io/verify?t=1', undefined);
    expect(r.code?.value).toBe('456789');
    expect(r.link).toBe('https://x.io/verify?t=1');
  });

  it('does NOT extract URL query token as a code', () => {
    const html = '<a href="https://app.io/verify?token=abc123">verify</a>';
    const r = extractVerification('Verify your email', undefined, html);
    expect(r.link).toBe('https://app.io/verify?token=abc123');
    expect(r.code).toBeUndefined();
  });
});

describe('extractVerification — anchor-text link detection', () => {
  it('extracts link by anchor text even when URL has no action verb', () => {
    const html = '<a href="https://app.io/auth?t=abc123">立即验证</a>';
    const r = extractVerification('Confirm', undefined, html);
    expect(r.link).toBe('https://app.io/auth?t=abc123');
  });

  it('extracts link by English anchor text', () => {
    const html = '<a href="https://app.io/x?t=1">Verify your email</a>';
    const r = extractVerification('Confirm', undefined, html);
    expect(r.link).toBe('https://app.io/x?t=1');
  });

  it('extracts link from "click here" style anchor', () => {
    const html = '<p>To confirm, <a href="https://app.io/c?u=9">click here</a>.</p>';
    const r = extractVerification('Confirm', undefined, html);
    expect(r.link).toBe('https://app.io/c?u=9');
  });

  it('ignores unsubscribe anchor even if it looks clickable', () => {
    const html = '<a href="https://x.io/unsub">退订</a><a href="https://x.io/v?t=1">立即验证</a>';
    const r = extractVerification('Confirm', undefined, html);
    expect(r.link).toBe('https://x.io/v?t=1');
  });

  it('still finds URL-verb link when no anchor text matches', () => {
    // Anchor text is generic "link", URL has the verb
    const html = '<a href="https://x.io/verify?t=1">link</a>';
    const r = extractVerification('Confirm', undefined, html);
    expect(r.link).toBe('https://x.io/verify?t=1');
  });

  it('link-only email does NOT extract a false code via fallback', () => {
    // A confirmation-by-link email has no code; body text like "34th street"
    // must not be extracted as a code when a link is present.
    const html = '<p>Visit our 34th street store.</p><a href="https://app.io/confirm?t=x">I\'M IN!</a>';
    const r = extractVerification('confirm your email', undefined, html);
    expect(r.link).toBe('https://app.io/confirm?t=x');
    expect(r.code).toBeUndefined();
  });

  it('link + real code (prefix) extracts both', () => {
    // When a real code exists (prefix-anchored), it's still found even with a link.
    const text = 'Your code is 482913. Or https://app.io/verify?t=1';
    const r = extractVerification('Verify', text, undefined);
    expect(r.code?.value).toBe('482913');
    expect(r.link).toBe('https://app.io/verify?t=1');
  });
});
