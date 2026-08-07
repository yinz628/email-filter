/**
 * Filter Service for VPS API
 * Core filtering engine that processes emails against filter rules
 * Implements whitelist priority, blacklist/dynamic filtering, and default forwarding
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import type {
  FilterRule,
  EmailWebhookPayload,
  FilterDecision,
  RuleCategory,
} from '@email-filter/shared';
import { matchesRuleWebhook, findMatchingRuleWebhook, isExtractCategory } from '@email-filter/shared';

/**
 * Filter rules grouped by category
 */
export interface GroupedRules {
  forward: FilterRule[];
  whitelist: FilterRule[];
  blacklist: FilterRule[];
  dynamic: FilterRule[];
  /** extract_verification + extract_discount (both behave as forward+extract). */
  extract: FilterRule[];
}

/**
 * Group rules by category for efficient processing
 */
export function groupRulesByCategory(rules: FilterRule[]): GroupedRules {
  const grouped: GroupedRules = {
    forward: [],
    whitelist: [],
    blacklist: [],
    dynamic: [],
    extract: [],
  };

  for (const rule of rules) {
    if (rule.category === 'forward') {
      grouped.forward.push(rule);
    } else if (rule.category === 'whitelist') {
      grouped.whitelist.push(rule);
    } else if (rule.category === 'blacklist') {
      grouped.blacklist.push(rule);
    } else if (rule.category === 'dynamic') {
      grouped.dynamic.push(rule);
    } else if (isExtractCategory(rule.category)) {
      // extract_verification / extract_discount — handled together; their
      // category determines the extraction type (see extractionFlagsFor).
      grouped.extract.push(rule);
    }
  }

  return grouped;
}

/**
 * Check if email matches any forward list rule
 * Forward rules route matching emails to a specific destination
 */
export function matchesForwardList(payload: EmailWebhookPayload, forwardRules: FilterRule[]): FilterRule | undefined {
  const result = findMatchingRuleWebhook(payload, forwardRules);
  return result.matched ? result.rule : undefined;
}

/**
 * Check if email matches any whitelist rule
 * Only considers enabled rules
 */
export function matchesWhitelist(payload: EmailWebhookPayload, whitelistRules: FilterRule[]): FilterRule | undefined {
  const result = findMatchingRuleWebhook(payload, whitelistRules);
  return result.matched ? result.rule : undefined;
}

/**
 * Check if email matches any blacklist rule
 * Only considers enabled rules
 */
export function matchesBlacklist(payload: EmailWebhookPayload, blacklistRules: FilterRule[]): FilterRule | undefined {
  const result = findMatchingRuleWebhook(payload, blacklistRules);
  return result.matched ? result.rule : undefined;
}

/**
 * Check if email matches any dynamic rule
 * Only considers enabled rules
 */
export function matchesDynamicList(payload: EmailWebhookPayload, dynamicRules: FilterRule[]): FilterRule | undefined {
  const result = findMatchingRuleWebhook(payload, dynamicRules);
  return result.matched ? result.rule : undefined;
}

/**
 * Check if email matches any extract_* rule (extract_verification or
 * extract_discount). These behave like forward rules (mail forwarded to the
 * override/default address) but additionally trigger extraction — the type is
 * encoded in the matched rule's category.
 */
export function matchesExtractList(payload: EmailWebhookPayload, extractRules: FilterRule[]): FilterRule | undefined {
  const result = findMatchingRuleWebhook(payload, extractRules);
  return result.matched ? result.rule : undefined;
}

/**
 * Filter result with detailed information
 */
export interface FilterResult {
  action: 'forward' | 'drop';
  matchedRule?: FilterRule;
  matchedCategory?: RuleCategory;
  forwardTo?: string;
  reason?: string;
  /**
   * Set when the matched rule (any category) has extractVerification=true.
   * Signals the email-worker to extract a verification code/link from the body
   * via the extraction-worker service binding. Mutually exclusive with
   * discountRequired. Extraction is independent of the decision action: it
   * happens for both forward and drop outcomes.
   */
  verificationRequired?: boolean;
  /**
   * Set when the matched rule (any category) has extractDiscount=true.
   * Mutually exclusive with verificationRequired.
   */
  discountRequired?: boolean;
  /**
   * The matched rule's ID (any category), passed to extraction-worker to look
   * up extraction config from D1.
   */
  ruleId?: string;
}

/**
 * Build extraction flags for a matched extract_* rule. The category alone
 * determines the extraction type (single source of truth). Called only from
 * the extract_* decision branch — other categories never extract.
 */
function extractionFlagsFor(rule: FilterRule): {
  verificationRequired?: boolean;
  discountRequired?: boolean;
  ruleId: string;
} {
  return {
    verificationRequired: rule.category === 'extract_verification',
    discountRequired: rule.category === 'extract_discount',
    ruleId: rule.id,
  };
}

/**
 * Process an email through the filter engine
 *
 * Priority order:
 * 1. Forward - if matched, email is forwarded to the rule's core address
 *    (forward rules have the highest priority)
 * 2. Whitelist - if matched, email is forwarded regardless of other rules
 * 3. Blacklist - if matched (and not whitelisted), email is dropped (Requirements 4.2)
 * 4. Dynamic list - if matched (and not whitelisted), email is dropped
 * 5. No match - email is forwarded to default destination (Requirements 4.4)
 *
 * Note: Only enabled rules are considered for matching (Requirements 4.1)
 *
 * The `rules` array is expected to have already been preprocessed by
 * `applyWorkerForwardPolicy()` (see services/forward-resolver.ts). That function
 * strips override `forwardTo` values from whitelist/etc. rules when the Worker
 * toggle is off, while always preserving the core `forwardTo` on `forward`
 * rules. As a result, the `forwardMatch.forwardTo || defaultForwardTo` fallback
 * below behaves correctly in every toggle state.
 *
 * @param payload - The email webhook payload to process
 * @param rules - All filter rules (will be grouped by category)
 * @param defaultForwardTo - Default forwarding address when no rules match
 * @returns FilterResult with action and matched rule info
 */
export function filterEmail(
  payload: EmailWebhookPayload,
  rules: FilterRule[],
  defaultForwardTo: string
): FilterResult {
  // Group rules by category
  const grouped = groupRulesByCategory(rules);

  // Step 1: Check forward list first (highest priority)
  // Forward rules explicitly route matching emails to a specific destination
  const forwardMatch = matchesForwardList(payload, grouped.forward);
  if (forwardMatch) {
    return {
      action: 'forward',
      matchedRule: forwardMatch,
      matchedCategory: 'forward',
      forwardTo: forwardMatch.forwardTo || defaultForwardTo,
      reason: `Matched forward rule: ${forwardMatch.pattern}`,
    };
  }

  // Step 1b: Check extract_* rules (extract_verification / extract_discount).
  // These are the ONLY categories that trigger extraction. They forward the
  // mail (to override/default address) AND carry extraction flags. Priority
  // sits between forward and whitelist.
  const extractMatch = matchesExtractList(payload, grouped.extract);
  if (extractMatch) {
    return {
      action: 'forward',
      matchedRule: extractMatch,
      matchedCategory: extractMatch.category,
      forwardTo: extractMatch.forwardTo || defaultForwardTo,
      reason: `Matched ${extractMatch.category} rule: ${extractMatch.pattern}`,
      ...extractionFlagsFor(extractMatch),
    };
  }

  // Step 2: Check whitelist - Requirements 4.3
  // If email matches whitelist, it is forwarded regardless of other rules
  const whitelistMatch = matchesWhitelist(payload, grouped.whitelist);
  if (whitelistMatch) {
    const forwardTo = whitelistMatch.forwardTo || defaultForwardTo;
    return {
      action: 'forward',
      matchedRule: whitelistMatch,
      matchedCategory: 'whitelist',
      forwardTo,
      reason: `Matched whitelist rule: ${whitelistMatch.pattern}`,
    };
  }

  // Step 2: Check blacklist - Requirements 4.2
  // If email matches blacklist (and not whitelisted), drop it.
  const blacklistMatch = matchesBlacklist(payload, grouped.blacklist);
  if (blacklistMatch) {
    return {
      action: 'drop',
      matchedRule: blacklistMatch,
      matchedCategory: 'blacklist',
      reason: `Matched blacklist rule: ${blacklistMatch.pattern}`,
    };
  }

  // Step 3: Check dynamic list
  // If email matches dynamic list (and not whitelisted), drop it
  const dynamicMatch = matchesDynamicList(payload, grouped.dynamic);
  if (dynamicMatch) {
    return {
      action: 'drop',
      matchedRule: dynamicMatch,
      matchedCategory: 'dynamic',
      reason: `Matched dynamic rule: ${dynamicMatch.pattern}`,
    };
  }

  // Step 4: No match - forward to default destination - Requirements 4.4.
  // No rule matched, so there is no extraction config to apply.
  return {
    action: 'forward',
    forwardTo: defaultForwardTo,
    reason: 'No matching rules, forwarding to default',
  };
}

/**
 * Convert FilterResult to FilterDecision for API response
 */
export function toFilterDecision(result: FilterResult): FilterDecision {
  return {
    action: result.action,
    forwardTo: result.forwardTo,
    reason: result.reason,
    verificationRequired: result.verificationRequired,
    discountRequired: result.discountRequired,
    ruleId: result.ruleId,
  };
}

/**
 * Filter Service class for dependency injection
 */
export class FilterService {
  constructor(private defaultForwardTo: string) {}

  /**
   * Process an email through the filter engine using provided rules
   * 
   * @param payload - The email webhook payload
   * @param rules - All enabled filter rules
   * @returns FilterResult with action and matched rule info
   */
  processEmail(payload: EmailWebhookPayload, rules: FilterRule[]): FilterResult {
    return filterEmail(payload, rules, this.defaultForwardTo);
  }

  /**
   * Convert filter result to API response format
   */
  toApiResponse(result: FilterResult): FilterDecision {
    return toFilterDecision(result);
  }

  /**
   * Get the matched rule ID if any
   */
  getMatchedRuleId(result: FilterResult): string | undefined {
    return result.matchedRule?.id;
  }

  /**
   * Update the default forward address
   */
  setDefaultForwardTo(address: string): void {
    this.defaultForwardTo = address;
  }
}
