/**
 * Forward Address Resolver
 *
 * Single source of truth for forwarding-address semantics across rule categories.
 *
 * Background: a rule's `forwardTo` field has two distinct meanings depending on
 * the rule category:
 * - `forward` rules: `forwardTo` is a CORE address (required), the very reason
 *   the rule exists. It must always take effect — it is not an "override".
 * - `whitelist` / `blacklist` / `dynamic` rules: `forwardTo` is an OPTIONAL
 *   OVERRIDE of the default forwarding address. It is gated by the Worker-level
 *   toggle `ruleForwardEnabled`.
 *
 * Before this module existed, the gating logic lived inline in `webhook.ts` as
 * `rules.map(r => ({ ...r, forwardTo: undefined }))`, which stripped the field
 * from EVERY rule indiscriminately — including `forward` rules. That caused a
 * silent bug: with the Worker toggle off, a `forward` rule lost its core address
 * and fell back to the default address, defeating the rule's purpose.
 *
 * This module centralizes the policy so the "which categories are gated" rule
 * lives in exactly one place (`isOverrideAddress`). Adding a new rule category
 * in the future only requires updating that single function.
 */

import type { FilterRule } from '@email-filter/shared';

/**
 * Determine whether a rule's `forwardTo` is an override address subject to the
 * Worker-level forwarding toggle.
 *
 * `forward` rules carry a CORE address that is never gated; all other
 * categories carry an OPTIONAL override address that IS gated.
 *
 * @param rule - The filter rule to inspect
 * @returns true if the rule's forwardTo is an override (gated), false if it is a
 *          core address (never gated)
 */
export function isOverrideAddress(rule: FilterRule): boolean {
  return rule.category !== 'forward';
}

/**
 * Apply the Worker-level forwarding policy to a set of rules.
 *
 * - When the toggle is ON, every rule keeps its `forwardTo` as-is.
 * - When the toggle is OFF, only override addresses are stripped; core addresses
 *   on `forward` rules are preserved.
 *
 * This function never mutates the input array or its elements — it returns a new
 * array of shallow-copied rules, which keeps the rule cache safe from pollution.
 *
 * @param rules - The enabled filter rules retrieved for a Worker
 * @param ruleForwardEnabled - The Worker's `ruleForwardEnabled` flag. When the
 *        Worker record is absent (unregistered workerName), pass false to keep
 *        the safe default of "no override".
 * @returns A new array of rules with the policy applied
 */
export function applyWorkerForwardPolicy(
  rules: FilterRule[],
  ruleForwardEnabled: boolean
): FilterRule[] {
  if (ruleForwardEnabled) {
    // Toggle ON: preserve all forwardTo values verbatim.
    return rules.map((r) => ({ ...r }));
  }
  // Toggle OFF: strip override addresses only; forward rules keep their core address.
  return rules.map((r) =>
    isOverrideAddress(r) ? { ...r, forwardTo: undefined } : { ...r }
  );
}
