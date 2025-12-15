/**
 * Filter Service
 * Core filtering engine that processes emails against filter rules
 * Implements whitelist priority, blacklist/dynamic filtering, and rule enabled status
 */

import type {
  FilterRule,
  IncomingEmail,
  ProcessResult,
  RuleCategory,
} from '@email-filter/shared';
import { matchesRule, findMatchingRule } from '@email-filter/shared';

/**
 * Filter rules grouped by category
 */
export interface GroupedRules {
  whitelist: FilterRule[];
  blacklist: FilterRule[];
  dynamic: FilterRule[];
}

/**
 * Group rules by category for efficient processing
 */
export function groupRulesByCategory(rules: FilterRule[]): GroupedRules {
  const grouped: GroupedRules = {
    whitelist: [],
    blacklist: [],
    dynamic: [],
  };

  for (const rule of rules) {
    if (rule.category === 'whitelist') {
      grouped.whitelist.push(rule);
    } else if (rule.category === 'blacklist') {
      grouped.blacklist.push(rule);
    } else if (rule.category === 'dynamic') {
      grouped.dynamic.push(rule);
    }
  }

  return grouped;
}

/**
 * Check if email matches any whitelist rule
 * Only considers enabled rules
 */
export function matchesWhitelist(email: IncomingEmail, whitelistRules: FilterRule[]): FilterRule | undefined {
  const result = findMatchingRule(email, whitelistRules);
  return result.matched ? result.rule : undefined;
}

/**
 * Check if email matches any blacklist rule
 * Only considers enabled rules
 */
export function matchesBlacklist(email: IncomingEmail, blacklistRules: FilterRule[]): FilterRule | undefined {
  const result = findMatchingRule(email, blacklistRules);
  return result.matched ? result.rule : undefined;
}

/**
 * Check if email matches any dynamic rule
 * Only considers enabled rules
 */
export function matchesDynamicList(email: IncomingEmail, dynamicRules: FilterRule[]): FilterRule | undefined {
  const result = findMatchingRule(email, dynamicRules);
  return result.matched ? result.rule : undefined;
}

/**
 * Filter result with detailed information
 */
export interface FilterResult {
  action: 'passed' | 'deleted';
  matchedRule?: FilterRule;
  matchedCategory?: RuleCategory;
}

/**
 * Process an email through the filter engine
 * 
 * Priority order:
 * 1. Whitelist - if matched, email passes regardless of other rules
 * 2. Blacklist - if matched (and not whitelisted), email is deleted
 * 3. Dynamic list - if matched (and not whitelisted), email is deleted
 * 4. No match - email passes
 * 
 * Note: Only enabled rules are considered for matching
 * 
 * @param email - The incoming email to process
 * @param rules - All filter rules (will be grouped by category)
 * @returns FilterResult with action and matched rule info
 */
export function filterEmail(email: IncomingEmail, rules: FilterRule[]): FilterResult {
  // Group rules by category
  const grouped = groupRulesByCategory(rules);

  // Step 1: Check whitelist first (highest priority)
  // If email matches whitelist, it passes regardless of other rules
  const whitelistMatch = matchesWhitelist(email, grouped.whitelist);
  if (whitelistMatch) {
    return {
      action: 'passed',
      matchedRule: whitelistMatch,
      matchedCategory: 'whitelist',
    };
  }

  // Step 2: Check blacklist
  // If email matches blacklist (and not whitelisted), delete it
  const blacklistMatch = matchesBlacklist(email, grouped.blacklist);
  if (blacklistMatch) {
    return {
      action: 'deleted',
      matchedRule: blacklistMatch,
      matchedCategory: 'blacklist',
    };
  }

  // Step 3: Check dynamic list
  // If email matches dynamic list (and not whitelisted), delete it
  const dynamicMatch = matchesDynamicList(email, grouped.dynamic);
  if (dynamicMatch) {
    return {
      action: 'deleted',
      matchedRule: dynamicMatch,
      matchedCategory: 'dynamic',
    };
  }

  // Step 4: No match - email passes
  return {
    action: 'passed',
  };
}

/**
 * Convert FilterResult to ProcessResult for API response
 */
export function toProcessResult(result: FilterResult): ProcessResult {
  if (result.matchedRule) {
    return {
      action: result.action,
      matchedRule: {
        id: result.matchedRule.id,
        category: result.matchedRule.category,
        pattern: result.matchedRule.pattern,
      },
    };
  }

  return {
    action: result.action,
  };
}

/**
 * Filter Service class for dependency injection and database integration
 */
export class FilterService {
  /**
   * Process an email through the filter engine using provided rules
   * This is a pure function that doesn't depend on database
   */
  processEmail(email: IncomingEmail, rules: FilterRule[]): FilterResult {
    return filterEmail(email, rules);
  }

  /**
   * Convert filter result to API response format
   */
  toApiResponse(result: FilterResult): ProcessResult {
    return toProcessResult(result);
  }
}
