/**
 * Rule Validation
 * Validates filter rule creation and update requests
 * 
 * Requirements: 10.1
 * - Validates rule format before saving
 */

import type { CreateRuleDTO, UpdateRuleDTO, RuleCategory, MatchType, MatchMode } from '@email-filter/shared';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  message?: string;
  details?: Record<string, string>;
}

/**
 * Custom validation error
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public details?: Record<string, string>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

const VALID_CATEGORIES: RuleCategory[] = ['whitelist', 'blacklist', 'dynamic'];
const VALID_MATCH_TYPES: MatchType[] = ['sender_name', 'subject', 'sender_email'];
const VALID_MATCH_MODES: MatchMode[] = ['regex', 'contains'];

/**
 * Validate a regex pattern
 */
export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a create rule request
 */
export function validateCreateRule(dto: CreateRuleDTO): ValidationResult {
  const details: Record<string, string> = {};

  // Check required fields
  if (!dto.category) {
    details.category = 'Category is required';
  } else if (!VALID_CATEGORIES.includes(dto.category)) {
    details.category = `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`;
  }

  if (!dto.matchType) {
    details.matchType = 'Match type is required';
  } else if (!VALID_MATCH_TYPES.includes(dto.matchType)) {
    details.matchType = `Invalid match type. Must be one of: ${VALID_MATCH_TYPES.join(', ')}`;
  }

  if (!dto.matchMode) {
    details.matchMode = 'Match mode is required';
  } else if (!VALID_MATCH_MODES.includes(dto.matchMode)) {
    details.matchMode = `Invalid match mode. Must be one of: ${VALID_MATCH_MODES.join(', ')}`;
  }


  // Pattern validation
  if (dto.pattern === undefined || dto.pattern === null) {
    details.pattern = 'Pattern is required';
  } else if (typeof dto.pattern !== 'string') {
    details.pattern = 'Pattern must be a string';
  } else if (dto.pattern.trim() === '') {
    details.pattern = 'Pattern cannot be empty';
  } else if (dto.matchMode === 'regex' && !isValidRegex(dto.pattern)) {
    details.pattern = 'Invalid regex pattern';
  }

  // Enabled validation (optional field)
  if (dto.enabled !== undefined && typeof dto.enabled !== 'boolean') {
    details.enabled = 'Enabled must be a boolean';
  }

  if (Object.keys(details).length > 0) {
    return {
      valid: false,
      message: 'Validation failed',
      details,
    };
  }

  return { valid: true };
}

/**
 * Validate an update rule request
 */
export function validateUpdateRule(dto: UpdateRuleDTO): ValidationResult {
  const details: Record<string, string> = {};

  // All fields are optional for update, but if provided must be valid
  if (dto.category !== undefined && !VALID_CATEGORIES.includes(dto.category)) {
    details.category = `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`;
  }

  if (dto.matchType !== undefined && !VALID_MATCH_TYPES.includes(dto.matchType)) {
    details.matchType = `Invalid match type. Must be one of: ${VALID_MATCH_TYPES.join(', ')}`;
  }

  if (dto.matchMode !== undefined && !VALID_MATCH_MODES.includes(dto.matchMode)) {
    details.matchMode = `Invalid match mode. Must be one of: ${VALID_MATCH_MODES.join(', ')}`;
  }

  if (dto.pattern !== undefined) {
    if (typeof dto.pattern !== 'string') {
      details.pattern = 'Pattern must be a string';
    } else if (dto.pattern.trim() === '') {
      details.pattern = 'Pattern cannot be empty';
    } else if (dto.matchMode === 'regex' && !isValidRegex(dto.pattern)) {
      details.pattern = 'Invalid regex pattern';
    }
  }

  if (dto.enabled !== undefined && typeof dto.enabled !== 'boolean') {
    details.enabled = 'Enabled must be a boolean';
  }

  if (Object.keys(details).length > 0) {
    return {
      valid: false,
      message: 'Validation failed',
      details,
    };
  }

  return { valid: true };
}
