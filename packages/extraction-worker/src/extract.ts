/**
 * Verification code/link extraction logic.
 *
 * Design premise: the email's subject has ALREADY confirmed this is a
 * verification email (a forward rule with extractVerification=true matched).
 * So we do NOT guess "is this a verification email?" — we focus on precisely
 * locating the code/link within a known verification email.
 *
 * Strategy (three layers, highest confidence first):
 *   Layer 1 — Prefix-anchored capture: the code follows a standard phrase
 *             ("verification code: 452017", "验证码：AB7C9X", "OTP is 1234").
 *             A named capture group grabs the code directly. Zero ambiguity.
 *   Layer 2 — Filtered fallback: no prefix found, so find standalone code-like
 *             tokens but strictly EXCLUDE noise (order #, prices, dates, years,
 *             phone numbers, version numbers, long tracking IDs). Because the
 *             email IS a verification email, a code exists; the fallback is
 *             legitimate but must filter aggressively.
 *
 * Search scope: build a merged searchable text (plain text + stripped HTML +
 * href URLs) so a code hidden in only one representation is not missed.
 *
 * Reference: F:\tools\yahoo imap (discount-code extractor) — buildSearchableText
 * and prefix-anchored regex generation are directly adapted from there.
 *
 * Pure functions, no I/O — isolated for unit testing.
 */

import type { ExtractedCode, ExtractionResult, ExtractionSource } from './types.js';
import { unwrapTrackingUrl } from './regex-generator.js';

// ============================================
// Prefix patterns (Layer 1 — strong signal)
// ============================================

/**
 * The character set a code is made of: alphanumerics, optionally with dashes
 * (e.g. "ABC-123"). Spaces are NOT allowed inside a code — allowing them
 * causes the regex to swallow ordinary English phrases ("Here is what").
 */
const CODE_CHARSET = '[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*';

const PREFIX_PATTERNS: RegExp[] = [
  // English — "code is/are XXX", "code: XXX", "your XXX code is YYY"
  // Order matters: more specific (two-word) phrases before generic "code".
  new RegExp(`(?:verification|verify|security|access|login|authentication|auth|activation|activate|one[- ]time|otp|pin|pass)\\s+code\\s*(?:is|:|\\.)?\\s*(?<code>${CODE_CHARSET})`, 'i'),
  new RegExp(`\\bcode\\s*(?:is|:|\\.)?\\s*(?<code>${CODE_CHARSET})`, 'i'),
  // "XXX is your code" / "use XXX as your code"
  new RegExp(`(?<code>${CODE_CHARSET})\\s+is\\s+your\\s+(?:verification\\s+|security\\s+|access\\s+|login\\s+)?code`, 'i'),
  new RegExp(`use\\s+(?<code>${CODE_CHARSET})\\s+as\\s+your\\s+code`, 'i'),
  // Bare OTP/PIN statement: "OTP: 1234", "PIN 5678", "OTP 123456"
  new RegExp(`\\b(?:otp|pin)\\s*(?:is|:|\\.)?\\s*(?<code>${CODE_CHARSET})`, 'i'),
  // Chinese — "验证码：XXX", "您的验证码是XXX", "动态码为XXX"
  new RegExp(`(?:验证码|动态码|动态密码|校验码|登录码|安全码|验证代码)[：:\\s是为]*\\s*(?<code>${CODE_CHARSET})`, 'i'),
  new RegExp(`(?:确认码|激活码|验证)[：:\\s是为]*\\s*(?<code>${CODE_CHARSET})`, 'i'),
];

// ============================================
// Link patterns (verification links)
// ============================================

/**
 * Action verbs in a URL path that signal a verification link.
 * Matches the verb stem so "verify/verified/verification" all match "verif".
 */
const LINK_ACTION_RE = /(?:verif|confirm|activat|reset|unlock|complete|validat|approve|click|验证|确认|激活|重置|解锁)/i;

/**
 * Anchor-text phrases that signal the link is a verification action.
 * These are the visible "提示词" the user clicks — far more reliable than
 * URL-path verbs, because marketing emails often use short opaque paths
 * (/auth, /c, /x) while the anchor text says "Verify your email" / "立即验证".
 */
const ANCHOR_ACTION_RE = /(?:verif|confirm|activat|reset|unlock|complete|validat|approve|click\s+(?:here|the|below|this)|verify your|confirm your|activate your|reset your|unlock your|complete your|点击|立即验证|点击验证|点击确认|立即激活|点击激活|立即注册|确认邮箱|验证邮箱|验证邮箱|验证邮件|激活账号|激活账户|重置密码|找回密码|完成验证|确认注册)/i;

/**
 * Anchor-text phrases that signal a NON-action link (navigation/social/footer).
 */
const ANCHOR_NOISE_RE = /(?:unsubscribe|unsub|opt[- ]?out|preferences|newsletter|manage|privacy|terms|contact|support|help|faq|about|home|back|facebook|twitter|instagram|linkedin|youtube|tiktok|view in browser|退订|取消订阅|联系|帮助|首页|管理)/i;

/**
 * URL substrings that indicate a NON-verification link (noise).
 */
const LINK_NOISE_RE = /(?:unsubscribe|unsub|opt[- ]?out|preferences|newsletter|manage|privacy|terms|facebook|twitter|instagram|linkedin|youtube|tiktok|mailto:|tel:|\.css|\.png|\.jpg|\.svg|\.ico|favicon|logo|footer|header|social|share)/i;

// ============================================
// Noise filters (Layer 2 — exclude non-codes)
// ============================================

/**
 * Determine if a candidate token is NOT a verification code (i.e., noise).
 * Returns true if the token should be EXCLUDED.
 *
 * Because the email is confirmed to be a verification email, a real code
 * exists; we just need to skip obvious non-codes in the fallback layer.
 */
function isNoise(token: string): boolean {
  const t = token.trim();
  if (!t) return true;
  const digitsOnly = t.replace(/[-\s]/g, '');

  // Order/tracking/reference numbers prefixed with #
  if (/^#/.test(t)) return true;
  // Prices ($, €, £, ¥, USD, CNY, etc.)
  if (/^[$€£¥]\d/.test(t) || /\b(?:usd|cny|eur|gbp)\b/i.test(t)) return true;
  // Dates: 2026-07-23, 07/23/2026, 23.07.2026, 2026/07
  if (/\b\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?\b/.test(t)) return true;
  if (/\b\d{1,2}[-/.]\d{1,2}([-/.]\d{2,4})?\b/.test(t)) return true;
  // Years (1900-2099 standalone)
  if (/^(19|20)\d{2}$/.test(digitsOnly)) return true;
  // Times: 12:30, 09:15:00
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return true;
  // Phone numbers (10+ digits, or with +/parentheses)
  if (/^[+（(]/.test(t) || digitsOnly.length >= 10 && /^\d+$/.test(digitsOnly)) return true;
  // Long tracking/shipping IDs (15+ alphanumerics)
  if (digitsOnly.length >= 15) return true;
  // Version numbers: v1.2.3, 1.0.0
  if (/^v?\d+\.\d+\.\d+/i.test(t)) return true;
  // Too short after stripping separators (< 4 chars)
  if (digitsOnly.length < 4) return true;
  // Pure letters (no digits) — ordinary dictionary words like "Welcome",
  // "Newsletter", "Order", "Total". A real verification code virtually always
  // contains at least one digit. (Pure-letter codes are vanishingly rare and
  // accepting them causes false positives on common words.)
  if (/^[A-Za-z]+$/.test(digitsOnly)) return true;

  return false;
}

// ============================================
// HTML handling
// ============================================

/**
 * Strip HTML tags and decode common entities to plain text.
 * Adapted from yahoo-mail-extractor stripHtml.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  let result = html;
  // Remove script/style blocks entirely (including content)
  result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  // Remove HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, ' ');
  // Block-level tags -> space (prevents words merging across elements)
  result = result.replace(/<\/?(?:p|div|br|tr|td|th|li|h[1-6]|hr|ul|ol|table|tbody|thead)\b[^>]*>/gi, ' ');
  // Remove all remaining tags
  result = result.replace(/<[^>]+>/g, ' ');
  // Decode common entities
  result = result
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  // Collapse whitespace
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Extract href URLs from HTML anchor tags, skipping javascript:/cid: noise.
 * Adapted from yahoo-mail-extractor extractHrefUrls.
 */
export function extractHrefUrls(html: string): string[] {
  if (!html) return [];
  const urls: string[] = [];
  const hrefRegex = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const match of html.matchAll(hrefRegex)) {
    const rawUrl = (match[1] || match[2] || match[3] || '').trim();
    const lower = rawUrl.toLowerCase();
    if (!rawUrl || lower.startsWith('javascript:') || lower.startsWith('cid:')) continue;
    urls.push(rawUrl);
  }
  return urls;
}

/**
 * Extract (anchorText, href) pairs from HTML <a> tags.
 *
 * The anchor text (提示词) is what the user sees and clicks. It reliably
 * signals the link's intent even when the URL path is opaque (/auth, /c).
 * Returns pairs of [visibleText, url].
 */
export function extractAnchorPairs(html: string): Array<{ text: string; href: string }> {
  if (!html) return [];
  const pairs: Array<{ text: string; href: string }> = [];
  // Match <a ...href="url"...>visible text</a>, tolerant of attributes order.
  const aTagRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(aTagRe)) {
    const attrs = match[1] || '';
    const innerHtml = match[2] || '';
    // Extract href from attributes
    const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = (hrefMatch?.[1] || hrefMatch?.[2] || hrefMatch?.[3] || '').trim();
    if (!href) continue;
    const lower = href.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('cid:') || lower.startsWith('mailto:')) continue;
    // Strip tags from anchor inner text, collapse whitespace
    const text = innerHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    pairs.push({ text, href });
  }
  return pairs;
}

// ============================================
// Layer 1: prefix-anchored code capture
// ============================================

/**
 * Try each prefix pattern against the text; return the first code captured.
 * Patterns are ordered most-specific to least-specific.
 */
export function findCodeByPrefix(text: string): string | undefined {
  for (const re of PREFIX_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m?.groups?.code) {
      // Normalize: trim, remove internal spaces but keep alphanumerics (and dashes)
      const code = m.groups.code.trim();
      if (!isNoise(code)) return code;
    }
  }
  return undefined;
}

// ============================================
// Layer 2: filtered fallback — standalone code tokens
// ============================================

/**
 * Find standalone code-like tokens, excluding noise.
 * Scans for alphanumeric tokens (with optional dash separators), 4-12 chars,
 * and filters out noise (order #, prices, dates, etc.).
 */
export function findStandaloneCode(text: string): string | undefined {
  // Candidate tokens: alphanumerics with optional dash, 4-12 chars.
  // Spaces NOT allowed (they'd match ordinary phrases).
  const tokenRe = /\b([A-Za-z0-9]{4,12}(?:-[A-Za-z0-9]{2,8})*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text)) !== null) {
    const candidate = m[1];
    // Check context around the match for non-code indicators that \b strips:
    const before = text.slice(Math.max(0, m.index - 6), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 4);
    // Order/reference numbers (#, No., order/ref keyword)
    if (/#/.test(before) || /\b(?:order|ref|no\.?)\s*$/i.test(before)) continue;
    // URL query-param value (token=..., or =token) or URL host/path fragment
    // (//token, token/) — these are not codes, they're parts of a URL.
    if (/(?:=|\/\/|https?:)\s*$/i.test(before) || /^(?:[/?=&]|$)/.test(after)) continue;
    if (!isNoise(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

// ============================================
// Verification link extraction
// ============================================

/**
 * Find the verification link, preferring anchor-text (提示词) detection.
 *
 * Priority (most reliable first):
 *   1. HTML <a> tag whose visible anchor text is an action phrase
 *      ("Verify your email", "立即验证") — the text is human-oriented intent.
 *   2. URL (plain text or href) containing an action verb in the path
 *      (https://x.io/verify?t=1) — works when there's no HTML anchor or the
 *      anchor text is generic ("click here").
 *
 * In both layers, noise links (unsubscribe/social/footer) are excluded.
 */
export function findVerificationLink(textBody: string, htmlBody: string | undefined): string | undefined {
  // Layer 1: anchor-text detection from HTML
  if (htmlBody) {
    for (const { text, href } of extractAnchorPairs(htmlBody)) {
      if (!text) continue;
      if (ANCHOR_NOISE_RE.test(text)) continue;
      if (ANCHOR_ACTION_RE.test(text)) {
        // Double-check the URL itself isn't a noise URL
        if (!LINK_NOISE_RE.test(href)) return href;
      }
    }
  }

  // Layer 2: URL-path verb detection from collected URLs
  const urls = collectAllUrls(textBody, htmlBody);
  for (const u of urls) {
    if (LINK_NOISE_RE.test(u)) continue;
    if (LINK_ACTION_RE.test(u)) return u;
  }
  return undefined;
}

// ============================================
// Searchable text builder (multi-representation merge)
// ============================================

/**
 * Build a single searchable text for CODE extraction from all representations
 * so a code hidden in only the HTML (not the plain text) is still found.
 *
 * NOTE: href URLs are deliberately EXCLUDED here. A URL's query params
 * (e.g. ?token=abc123) look like codes and would be falsely extracted.
 * Verification LINKS are handled separately by findVerificationLink.
 */
export function buildSearchableText(
  subject: string | undefined,
  textBody: string | undefined,
  htmlBody: string | undefined
): string {
  const segments: string[] = [];
  const seen = new Set<string>();
  const add = (val: string | undefined) => {
    if (!val) return;
    const norm = val.replace(/\s+/g, ' ').trim();
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    segments.push(norm);
  };
  add(subject);
  add(textBody);
  if (htmlBody) {
    add(htmlToPlainText(htmlBody));
    // href URLs intentionally NOT added — they're for link extraction only.
  }
  return segments.join('\n\n');
}

/** Max chars of merged text to scan. Protects against huge emails blowing CPU. */
const MAX_SCAN_CHARS = 50_000;

// ============================================
// Main entrypoint
// ============================================

function resolveCode(
  searchableText: string,
  subject: string | undefined,
  textBody: string | undefined,
  htmlBody: string | undefined,
  hasLink: boolean
): { code: string | undefined; source: ExtractionSource | undefined } {
  const text = searchableText.slice(0, MAX_SCAN_CHARS);

  // Layer 1: prefix-anchored capture (highest confidence).
  // Always run — a code following "verification code:" is unambiguous.
  const prefixCode = findCodeByPrefix(text);
  if (prefixCode) {
    const source: ExtractionSource = subject && subject.includes(prefixCode)
      ? 'subject'
      : (textBody && textBody.includes(prefixCode) ? 'text-body' : 'html-body');
    return { code: prefixCode, source };
  }

  // Layer 2: filtered fallback (lower confidence).
  // When a verification LINK was already found, the email verifies via the
  // link (e.g. "click I'M IN! to confirm") and may contain no code at all.
  // Running the fallback in that case produces false positives (e.g. "34th"
  // from an address). So skip Layer 2 when a link exists.
  if (hasLink) {
    return { code: undefined, source: undefined };
  }

  const fallbackCode = findStandaloneCode(text);
  if (fallbackCode) {
    const source: ExtractionSource = subject && subject.includes(fallbackCode)
      ? 'subject'
      : (textBody && textBody.includes(fallbackCode) ? 'text-body' : 'html-body');
    return { code: fallbackCode, source };
  }

  return { code: undefined, source: undefined };
}

/**
 * Main extraction entrypoint. Given decoded subject/text/html parts, returns
 * the best-effort verification code and/or link.
 *
 * Link-first: the verification link is found first. If present, code extraction
 * uses only high-confidence prefix matching (Layer 1) — the low-confidence
 * fallback is skipped to avoid false positives on link-only emails.
 *
 * Exported for testing; the worker entrypoint calls this after postal-mime parse.
 */
export function extractVerification(
  subject: string | undefined,
  textBody: string | undefined,
  htmlBody: string | undefined
): ExtractionResult {
  // Find the link first — its presence changes the code-extraction strategy.
  const link = findVerificationLink(textBody ?? '', htmlBody);
  const searchableText = buildSearchableText(subject, textBody, htmlBody);
  const { code, source } = resolveCode(searchableText, subject, textBody, htmlBody, !!link);

  const extractedCode: ExtractedCode | undefined =
    code && source ? { value: code, source } : undefined;

  return {
    code: extractedCode,
    link,
    extractedAt: new Date().toISOString(),
  };
}

// ============================================
// Custom-pattern extraction (user-configured regex)
// ============================================

/** Max length of a user-supplied regex source string (ReDoS protection). */
const MAX_PATTERN_LENGTH = 200;

/**
 * Extract a code using a user-supplied regex pattern.
 *
 * Priority: named group `code` → first capture group → full match.
 * Returns undefined if the pattern is invalid, too long, or matches nothing.
 */
export function extractCodeWithPattern(text: string, pattern: string): string | undefined {
  if (!pattern || pattern.length > MAX_PATTERN_LENGTH) return undefined;
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'i');
  } catch {
    return undefined; // invalid regex → skip
  }
  const safeText = text.slice(0, MAX_SCAN_CHARS);
  const m = re.exec(safeText);
  if (!m) return undefined;
  // Named group "code" > capture group 1 > full match
  const value = m.groups?.code ?? m[1] ?? m[0];
  return value?.trim() || undefined;
}

/**
 * Find a verification/discount link by matching anchor text against a
 * user-supplied pattern. Returns the href of the first matching <a> tag.
 */
export function findLinkByAnchorPattern(htmlBody: string, anchorPattern: string): string | undefined {
  if (!anchorPattern || anchorPattern.length > MAX_PATTERN_LENGTH) return undefined;
  let re: RegExp;
  try {
    re = new RegExp(anchorPattern, 'i');
  } catch {
    return undefined;
  }
  for (const { text, href } of extractAnchorPairs(htmlBody)) {
    if (re.test(text) && !LINK_NOISE_RE.test(href)) {
      return href;
    }
  }
  return undefined;
}

/**
 * Collect ALL candidate URLs from both text and HTML representations.
 *
 * Gathers plain-text URLs (from textBody) and href URLs (from htmlBody anchor
 * tags), dedupes via a Set, and strips trailing punctuation. Used by both
 * findLinkByUrlPattern and the generic link heuristics as a shared collector.
 */
export function collectAllUrls(textBody: string, htmlBody: string | undefined): string[] {
  const urls = new Set<string>();
  const plainUrlRe = /https?:\/\/[^\s"'<>]+/gi;
  let m: RegExpExecArray | null;
  while ((m = plainUrlRe.exec(textBody)) !== null) {
    urls.add(m[0].replace(/[.,;:!?)]+$/, '')); // strip trailing punctuation
  }
  if (htmlBody) {
    for (const u of extractHrefUrls(htmlBody)) {
      urls.add(u);
    }
  }
  return [...urls];
}

/**
 * Find a verification/discount link by matching the URL itself against a
 * user-supplied regex pattern.
 *
 * Unlike findLinkByAnchorPattern (which matches anchor *text*), this matches
 * the URL string directly — useful for emails where the anchor text is neutral
 * or absent (e.g. text-only emails with bare URLs).
 *
 * Scans all URLs collected from text + HTML, returns the first matching URL
 * that is not a noise link (unsubscribe/social/etc.).
 *
 * @param urls       Pre-collected candidate URLs (from collectAllUrls)
 * @param urlPattern User-supplied regex pattern string
 */
export function findLinkByUrlPattern(urls: string[], urlPattern: string): string | undefined {
  if (!urlPattern || urlPattern.length > MAX_PATTERN_LENGTH) return undefined;
  let re: RegExp;
  try {
    re = new RegExp(urlPattern, 'i');
  } catch {
    return undefined;
  }
  for (const url of urls) {
    // When the user provides an explicit URL pattern, we trust their intent
    // and do NOT apply LINK_NOISE_RE — the user's regex is precise enough.
    // (The noise filter is only for the generic heuristic that guesses URLs.)
    if (re.test(url)) {
      return url;
    }
  }
  return undefined;
}

// ============================================
// Discount code extraction
// ============================================

/**
 * Discount code prefix phrases (English + Chinese).
 * Different from verification prefixes: promo/coupon/discount/voucher/...
 */
const DISCOUNT_PREFIX_PATTERNS: RegExp[] = [
  new RegExp(`(?:use\\s+)?(?:promo|coupon|discount|voucher|redemption|gift|offer|refer[a-z]*)\\s+(?:code)?[:\\s]+(?<code>${CODE_CHARSET})`, 'i'),
  new RegExp(`\\bcode[:\\s]+(?<code>${CODE_CHARSET})`, 'i'),
  // Chinese
  new RegExp(`(?:优惠码|折扣码|优惠代码|折扣代码|兑换码|礼品码|激活码)[：:\\s是]*\\s*(?<code>${CODE_CHARSET})`, 'i'),
];

/**
 * Validate that a token looks like a discount code (not noise).
 * Key difference from verification: REJECTS pure numbers (order/price/date)
 * and pure letters (dictionary words). Discount codes are mixed alphanumeric.
 *
 * Adapted from yahoo-mail-extractor VALIDATORS.discountCode.
 */
export function isValidDiscountCode(token: string): boolean {
  const t = token.trim();
  if (t.length < 4 || t.length > 20) return false;
  // Must be alphanumeric (with optional dashes)
  if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(t)) return false;
  // Reject pure numbers (order numbers, prices, dates)
  if (/^\d+$/.test(t.replace(/-/g, ''))) return false;
  // Reject pure letters (dictionary words)
  if (/^[A-Za-z]+$/.test(t.replace(/-/g, ''))) return false;
  // Must contain at least one letter
  if (!/[A-Za-z]/.test(t)) return false;
  return true;
}

/**
 * Extract discount value (e.g. "20% OFF", "$10") from subject or body text.
 * Uses hardcoded patterns — discount values have fixed formats.
 */
export function extractDiscountValue(subject: string | undefined, text: string): string | undefined {
  const candidates = [subject, text].filter(Boolean) as string[];
  const patterns = [
    /(?<value>\d{1,3}(?:\.\d{1,2})?%\s*(?:off|OFF|discount|折扣)?)/,
    /(?<value>[\$¥€£]\d+(?:\.\d{2})?\s*(?:off|OFF|save|省)?)/,
    /(?<value>FREE\s+SHIPPING|BOGO|BUY\s+\d+\s+GET\s+\d+)/i,
  ];
  for (const candidate of candidates) {
    for (const re of patterns) {
      const m = re.exec(candidate.slice(0, MAX_SCAN_CHARS));
      if (m?.groups?.value) return m.groups.value.trim();
    }
  }
  return undefined;
}

/**
 * Discount link action words (different from verification: shop/buy/redeem).
 */
const DISCOUNT_LINK_ACTION_RE = /(?:shop|buy|order|claim|redeem|get|apply|grab|购物|购买|领取|立即购买|去使用|领取优惠|立即领取)/i;

/**
 * Find a discount link. Uses anchor text detection (discount action words)
 * then falls back to URL-path verbs.
 */
export function findDiscountLink(textBody: string, htmlBody: string | undefined): string | undefined {
  // Layer 1: anchor text with discount action words
  if (htmlBody) {
    for (const { text, href } of extractAnchorPairs(htmlBody)) {
      if (!text) continue;
      if (ANCHOR_NOISE_RE.test(text)) continue;
      if (DISCOUNT_LINK_ACTION_RE.test(text) && !LINK_NOISE_RE.test(href)) {
        return href;
      }
    }
  }
  // Layer 2: URL-path with discount/promo keywords
  const urls = collectAllUrls(textBody, htmlBody);
  for (const u of urls) {
    if (LINK_NOISE_RE.test(u)) continue;
    if (/(?:promo|coupon|discount|deal|sale|offer|redeem|shop)/i.test(u)) return u;
  }
  return undefined;
}

/**
 * Extract a discount code from text using the same layered approach as
 * verification, but with discount-specific prefixes and the discount validator.
 */
function resolveDiscountCode(
  searchableText: string,
  subject: string | undefined,
  textBody: string | undefined
): { code: string | undefined; source: ExtractionSource | undefined } {
  const text = searchableText.slice(0, MAX_SCAN_CHARS);

  // Layer 1: discount prefix-anchored capture
  for (const re of DISCOUNT_PREFIX_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m?.groups?.code && isValidDiscountCode(m.groups.code)) {
      const source: ExtractionSource = subject && subject.includes(m.groups.code)
        ? 'subject'
        : (textBody && textBody.includes(m.groups.code) ? 'text-body' : 'html-body');
      return { code: m.groups.code, source };
    }
  }

  // Layer 2: filtered fallback — find standalone tokens that pass the discount validator
  const tokenRe = /\b([A-Za-z0-9]{4,20}(?:-[A-Za-z0-9]{2,8})*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text)) !== null) {
    if (isValidDiscountCode(m[1])) {
      const source: ExtractionSource = subject && subject.includes(m[1])
        ? 'subject'
        : (textBody && textBody.includes(m[1]) ? 'text-body' : 'html-body');
      return { code: m[1], source };
    }
  }

  return { code: undefined, source: undefined };
}

// ============================================
// Unified extraction entrypoint (routes by type)
// ============================================

/**
 * Unified extraction entrypoint. Routes to verification or discount logic
 * based on extractType. Applies user-configured patterns when available.
 *
 * @param subject    Decoded email subject
 * @param textBody   text/plain body
 * @param htmlBody   text/html body
 * @param extractType 'verification' | 'discount'
 * @param codePattern  Optional user regex for code extraction
 * @param linkAnchorPattern  Optional user regex for link anchor text
 * @param linkUrlPattern  Optional user regex for matching the link URL itself
 */
export function extract(
  subject: string | undefined,
  textBody: string | undefined,
  htmlBody: string | undefined,
  extractType: 'verification' | 'discount',
  codePattern?: string,
  linkAnchorPattern?: string,
  linkUrlPattern?: string
): ExtractionResult {
  const searchableText = buildSearchableText(subject, textBody, htmlBody);

  if (extractType === 'discount') {
    // Discount extraction
    // Link priority: anchor pattern > URL pattern > generic heuristic
    let link: string | undefined;
    if (linkAnchorPattern && htmlBody) {
      link = findLinkByAnchorPattern(htmlBody, linkAnchorPattern);
    }
    if (!link && linkUrlPattern) {
      link = findLinkByUrlPattern(collectAllUrls(textBody ?? '', htmlBody), linkUrlPattern);
    }
    const effectiveLink = link ?? findDiscountLink(textBody ?? '', htmlBody);

    let code: string | undefined;
    let source: ExtractionSource | undefined;
    if (codePattern) {
      code = extractCodeWithPattern(searchableText, codePattern);
      if (code) source = subject?.includes(code) ? 'subject' : 'text-body';
    }
    if (!code) {
      const result = resolveDiscountCode(searchableText, subject, textBody);
      code = result.code;
      source = result.source;
    }

    const discountValue = extractDiscountValue(subject, searchableText);

    const extractedCode = code && source ? { value: code, source } : undefined;
    return {
      code: extractedCode,
      link: effectiveLink ? unwrapTrackingUrl(effectiveLink) : effectiveLink,
      discountValue,
      extractedAt: new Date().toISOString(),
    };
  }

  // Verification extraction (default)
  // Apply custom patterns first, then fall back to generic logic.
  // Link priority: anchor pattern > URL pattern > generic heuristic
  let link: string | undefined;
  if (linkAnchorPattern && htmlBody) {
    link = findLinkByAnchorPattern(htmlBody, linkAnchorPattern);
  }
  if (!link && linkUrlPattern) {
    link = findLinkByUrlPattern(collectAllUrls(textBody ?? '', htmlBody), linkUrlPattern);
  }
  if (!link) {
    link = findVerificationLink(textBody ?? '', htmlBody);
  }

  let code: string | undefined;
  let source: ExtractionSource | undefined;
  if (codePattern) {
    code = extractCodeWithPattern(searchableText, codePattern);
    if (code) source = subject?.includes(code) ? 'subject' : 'text-body';
  }
  if (!code) {
    const result = resolveCode(searchableText, subject, textBody, htmlBody, !!link);
    code = result.code;
    source = result.source;
  }

  const extractedCode = code && source ? { value: code, source } : undefined;
  return {
    code: extractedCode,
    link: link ? unwrapTrackingUrl(link) : link,
    extractedAt: new Date().toISOString(),
  };
}
