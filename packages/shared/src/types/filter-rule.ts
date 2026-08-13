/**
 * Filter rule category types
 *
 * `extract_verification` / `extract_discount` are first-class categories whose
 * category alone determines the extraction type (no separate flag needed).
 * Semantically they behave like `forward` (mail forwarded to default/override
 * address) plus an implicit extraction flag — kept as distinct categories so
 * the UI can present "extraction" as a peer of forward/whitelist/blacklist.
 */
export type RuleCategory =
  | 'whitelist'
  | 'blacklist'
  | 'dynamic'
  | 'forward'
  | 'extract_verification'
  | 'extract_discount';

/** Categories that imply extraction (their category encodes the extraction type). */
export const EXTRACT_CATEGORIES: readonly RuleCategory[] = ['extract_verification', 'extract_discount'];

/** Whether a category is one of the extract_* categories. */
export function isExtractCategory(category: RuleCategory): boolean {
  return EXTRACT_CATEGORIES.includes(category);
}

/**
 * Match type - what field to match against
 */
export type MatchType = 'sender' | 'subject' | 'domain';

/**
 * Match mode - how to perform the match
 */
export type MatchMode = 'exact' | 'contains' | 'startsWith' | 'endsWith' | 'regex';

/**
 * Filter rule interface
 * Defines email filtering conditions
 */
export interface FilterRule {
  id: string;
  category: RuleCategory;
  matchType: MatchType;
  matchMode: MatchMode;
  pattern: string;
  tags?: string[];  // Optional tags for organization
  forwardTo?: string;  // Override default forwarding address when rule matches. Optional for all categories; when omitted, the worker forwards to its DEFAULT_FORWARD_TO (for forward/whitelist) or drops (blacklist/dynamic).
  /**
   * When true (any category), the email-worker will extract a verification
   * code/link from the message body via the extraction-worker. Independent of
   * the rule's action: extraction happens for both forward and drop decisions.
   * Mutually exclusive with extractDiscount.
   */
  extractVerification?: boolean;
  /**
   * When true (any category), the email-worker will extract a discount
   * code/link from the message body via the extraction-worker. Independent of
   * the rule's action.
   * Mutually exclusive with extractVerification.
   */
  extractDiscount?: boolean;
  /** Optional user-configured regex for code extraction (verification or discount). */
  codePattern?: string;
  /** Optional user-configured regex for link anchor text matching. */
  linkAnchorPattern?: string;
  /** Optional user-configured regex for matching the link URL itself. */
  linkUrlPattern?: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastHitAt?: Date; // Used for dynamic rule expiration detection
}

/**
 * DTO for creating a new filter rule
 */
export interface CreateRuleDTO {
  category: RuleCategory;
  matchType: MatchType;
  matchMode: MatchMode;
  pattern: string;
  tags?: string[];
  forwardTo?: string;
  extractVerification?: boolean;
  extractDiscount?: boolean;
  codePattern?: string;
  linkAnchorPattern?: string;
  linkUrlPattern?: string;
  enabled?: boolean;
}

/**
 * DTO for updating an existing filter rule
 */
export interface UpdateRuleDTO {
  category?: RuleCategory;
  matchType?: MatchType;
  matchMode?: MatchMode;
  pattern?: string;
  tags?: string[];
  forwardTo?: string;
  extractVerification?: boolean;
  extractDiscount?: boolean;
  codePattern?: string;
  linkAnchorPattern?: string;
  linkUrlPattern?: string;
  enabled?: boolean;
}
