import type { FilterRule, MatchType, MatchMode, IncomingEmail, EmailWebhookPayload } from '../types/index.js';

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string {
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) {
    return email.toLowerCase();
  }
  return email.substring(atIndex + 1).toLowerCase();
}

/**
 * Get the value from email based on matchType
 */
export function getEmailFieldValue(email: IncomingEmail, matchType: MatchType): string {
  switch (matchType) {
    case 'sender':
      return email.sender;
    case 'subject':
      return email.subject;
    case 'domain':
      return extractDomain(email.senderEmail);
    default:
      // Exhaustive check
      const _exhaustive: never = matchType;
      throw new Error(`Unknown matchType: ${_exhaustive}`);
  }
}

/**
 * Get the value from webhook payload based on matchType
 */
export function getWebhookFieldValue(payload: EmailWebhookPayload, matchType: MatchType): string {
  switch (matchType) {
    case 'sender':
      return payload.from;
    case 'subject':
      return payload.subject;
    case 'domain':
      return extractDomain(payload.from);
    default:
      // Exhaustive check
      const _exhaustive: never = matchType;
      throw new Error(`Unknown matchType: ${_exhaustive}`);
  }
}

/**
 * Check if a value matches a pattern using the specified match mode
 */
export function matchPattern(value: string, pattern: string, matchMode: MatchMode): boolean {
  const lowerValue = value.toLowerCase();
  const lowerPattern = pattern.toLowerCase();
  
  switch (matchMode) {
    case 'exact':
      return lowerValue === lowerPattern;
    case 'contains':
      return lowerValue.includes(lowerPattern);
    case 'startsWith':
      return lowerValue.startsWith(lowerPattern);
    case 'endsWith':
      return lowerValue.endsWith(lowerPattern);
    case 'regex':
      try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(value);
      } catch {
        // Invalid regex pattern - return false
        return false;
      }
    default:
      // Exhaustive check
      const _exhaustive: never = matchMode;
      throw new Error(`Unknown matchMode: ${_exhaustive}`);
  }
}

/**
 * Check if an email matches a filter rule
 * Returns true if the email matches the rule's criteria
 */
export function matchesRule(email: IncomingEmail, rule: FilterRule): boolean {
  // Disabled rules never match
  if (!rule.enabled) {
    return false;
  }

  const fieldValue = getEmailFieldValue(email, rule.matchType);
  return matchPattern(fieldValue, rule.pattern, rule.matchMode);
}

/**
 * Check if a webhook payload matches a filter rule
 * Returns true if the payload matches the rule's criteria
 */
export function matchesRuleWebhook(payload: EmailWebhookPayload, rule: FilterRule): boolean {
  // Disabled rules never match
  if (!rule.enabled) {
    return false;
  }

  const fieldValue = getWebhookFieldValue(payload, rule.matchType);
  return matchPattern(fieldValue, rule.pattern, rule.matchMode);
}

/**
 * Result of matching an email against multiple rules
 */
export interface MatchResult {
  matched: boolean;
  rule?: FilterRule;
}

/**
 * Find the first matching rule from a list of rules
 * Returns the matched rule or undefined if no match
 */
export function findMatchingRule(email: IncomingEmail, rules: FilterRule[]): MatchResult {
  for (const rule of rules) {
    if (matchesRule(email, rule)) {
      return { matched: true, rule };
    }
  }
  return { matched: false };
}

/**
 * Find the first matching rule from a list of rules using webhook payload
 * Returns the matched rule or undefined if no match
 */
export function findMatchingRuleWebhook(payload: EmailWebhookPayload, rules: FilterRule[]): MatchResult {
  for (const rule of rules) {
    if (matchesRuleWebhook(payload, rule)) {
      return { matched: true, rule };
    }
  }
  return { matched: false };
}
