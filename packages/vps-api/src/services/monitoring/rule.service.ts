/**
 * Monitoring Rule Service
 * 
 * Business logic layer for monitoring rule management.
 * Handles validation, CRUD operations, and rule configuration.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import type {
  MonitoringRule,
  CreateMonitoringRuleDTO,
  UpdateMonitoringRuleDTO,
  MonitoringRuleFilter,
} from '@email-filter/shared';
import type { MonitoringRuleRepository } from '../../db/monitoring-rule-repository.js';
import { validatePattern } from './pattern-matcher.js';

/**
 * Validation error for rule configuration
 */
export class RuleValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public code: string
  ) {
    super(message);
    this.name = 'RuleValidationError';
  }
}

/**
 * Result of rule validation
 */
export interface RuleValidationResult {
  valid: boolean;
  errors: RuleValidationError[];
}

/**
 * Validate a CreateMonitoringRuleDTO
 */
export function validateCreateRuleDTO(dto: CreateMonitoringRuleDTO): RuleValidationResult {
  const errors: RuleValidationError[] = [];

  // Validate merchant
  if (!dto.merchant || dto.merchant.trim().length === 0) {
    errors.push(new RuleValidationError('Merchant is required', 'merchant', 'REQUIRED'));
  }

  // Validate name
  if (!dto.name || dto.name.trim().length === 0) {
    errors.push(new RuleValidationError('Name is required', 'name', 'REQUIRED'));
  }

  // Validate subjectPattern
  if (!dto.subjectPattern || dto.subjectPattern.trim().length === 0) {
    errors.push(new RuleValidationError('Subject pattern is required', 'subjectPattern', 'REQUIRED'));
  } else {
    const patternValidation = validatePattern(dto.subjectPattern);
    if (!patternValidation.valid) {
      errors.push(new RuleValidationError(
        `Invalid regex pattern: ${patternValidation.error}`,
        'subjectPattern',
        'INVALID_REGEX'
      ));
    }
  }

  // Validate expectedIntervalMinutes
  if (dto.expectedIntervalMinutes === undefined || dto.expectedIntervalMinutes === null) {
    errors.push(new RuleValidationError('Expected interval is required', 'expectedIntervalMinutes', 'REQUIRED'));
  } else if (dto.expectedIntervalMinutes <= 0) {
    errors.push(new RuleValidationError('Expected interval must be positive', 'expectedIntervalMinutes', 'INVALID_VALUE'));
  }

  // Validate deadAfterMinutes
  if (dto.deadAfterMinutes === undefined || dto.deadAfterMinutes === null) {
    errors.push(new RuleValidationError('Dead after threshold is required', 'deadAfterMinutes', 'REQUIRED'));
  } else if (dto.deadAfterMinutes <= 0) {
    errors.push(new RuleValidationError('Dead after threshold must be positive', 'deadAfterMinutes', 'INVALID_VALUE'));
  }

  // Validate deadAfterMinutes >= expectedIntervalMinutes * 1.5
  if (dto.expectedIntervalMinutes > 0 && dto.deadAfterMinutes > 0) {
    const minDeadAfter = dto.expectedIntervalMinutes * 1.5;
    if (dto.deadAfterMinutes < minDeadAfter) {
      errors.push(new RuleValidationError(
        `Dead after threshold must be at least ${minDeadAfter} minutes (1.5x expected interval)`,
        'deadAfterMinutes',
        'INVALID_THRESHOLD'
      ));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate an UpdateMonitoringRuleDTO
 */
export function validateUpdateRuleDTO(dto: UpdateMonitoringRuleDTO, existingRule?: MonitoringRule): RuleValidationResult {
  const errors: RuleValidationError[] = [];

  // Validate merchant if provided
  if (dto.merchant !== undefined && dto.merchant.trim().length === 0) {
    errors.push(new RuleValidationError('Merchant cannot be empty', 'merchant', 'INVALID_VALUE'));
  }

  // Validate name if provided
  if (dto.name !== undefined && dto.name.trim().length === 0) {
    errors.push(new RuleValidationError('Name cannot be empty', 'name', 'INVALID_VALUE'));
  }

  // Validate subjectPattern if provided
  if (dto.subjectPattern !== undefined) {
    if (dto.subjectPattern.trim().length === 0) {
      errors.push(new RuleValidationError('Subject pattern cannot be empty', 'subjectPattern', 'INVALID_VALUE'));
    } else {
      const patternValidation = validatePattern(dto.subjectPattern);
      if (!patternValidation.valid) {
        errors.push(new RuleValidationError(
          `Invalid regex pattern: ${patternValidation.error}`,
          'subjectPattern',
          'INVALID_REGEX'
        ));
      }
    }
  }

  // Validate expectedIntervalMinutes if provided
  if (dto.expectedIntervalMinutes !== undefined && dto.expectedIntervalMinutes <= 0) {
    errors.push(new RuleValidationError('Expected interval must be positive', 'expectedIntervalMinutes', 'INVALID_VALUE'));
  }

  // Validate deadAfterMinutes if provided
  if (dto.deadAfterMinutes !== undefined && dto.deadAfterMinutes <= 0) {
    errors.push(new RuleValidationError('Dead after threshold must be positive', 'deadAfterMinutes', 'INVALID_VALUE'));
  }

  // Validate threshold relationship if both are being updated or one is updated with existing rule
  if (existingRule) {
    const expectedInterval = dto.expectedIntervalMinutes ?? existingRule.expectedIntervalMinutes;
    const deadAfter = dto.deadAfterMinutes ?? existingRule.deadAfterMinutes;
    const minDeadAfter = expectedInterval * 1.5;
    
    if (deadAfter < minDeadAfter) {
      errors.push(new RuleValidationError(
        `Dead after threshold must be at least ${minDeadAfter} minutes (1.5x expected interval)`,
        'deadAfterMinutes',
        'INVALID_THRESHOLD'
      ));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Monitoring Rule Service
 */
export class MonitoringRuleService {
  constructor(private repository: MonitoringRuleRepository) {}

  /**
   * Create a new monitoring rule
   * Requirements: 1.1
   */
  createRule(dto: CreateMonitoringRuleDTO): MonitoringRule {
    const validation = validateCreateRuleDTO(dto);
    if (!validation.valid) {
      throw validation.errors[0];
    }

    return this.repository.create(dto);
  }

  /**
   * Update an existing monitoring rule
   * Requirements: 1.2
   */
  updateRule(id: string, dto: UpdateMonitoringRuleDTO): MonitoringRule | null {
    const existingRule = this.repository.getById(id);
    if (!existingRule) {
      return null;
    }

    const validation = validateUpdateRuleDTO(dto, existingRule);
    if (!validation.valid) {
      throw validation.errors[0];
    }

    return this.repository.update(id, dto);
  }

  /**
   * Delete a monitoring rule
   * Requirements: 1.1
   */
  deleteRule(id: string): boolean {
    return this.repository.delete(id);
  }

  /**
   * Get a rule by ID
   * Requirements: 1.4
   */
  getRule(id: string): MonitoringRule | null {
    return this.repository.getById(id);
  }

  /**
   * Get all rules with optional filtering
   * Requirements: 1.4
   */
  getRules(filter?: MonitoringRuleFilter): MonitoringRule[] {
    return this.repository.getAll(filter);
  }

  /**
   * Get all enabled rules
   * Requirements: 1.3
   */
  getEnabledRules(): MonitoringRule[] {
    return this.repository.getEnabled();
  }

  /**
   * Toggle rule enabled status
   * Requirements: 1.3
   */
  toggleRule(id: string): MonitoringRule | null {
    return this.repository.toggleEnabled(id);
  }

  /**
   * Enable a rule
   * Requirements: 1.3
   */
  enableRule(id: string): MonitoringRule | null {
    const rule = this.repository.getById(id);
    if (!rule || rule.enabled) {
      return rule;
    }
    return this.repository.toggleEnabled(id);
  }

  /**
   * Disable a rule
   * Requirements: 1.3
   */
  disableRule(id: string): MonitoringRule | null {
    const rule = this.repository.getById(id);
    if (!rule || !rule.enabled) {
      return rule;
    }
    return this.repository.toggleEnabled(id);
  }

  /**
   * Validate a rule configuration without saving
   */
  validateRule(dto: CreateMonitoringRuleDTO): RuleValidationResult {
    return validateCreateRuleDTO(dto);
  }

  /**
   * Count rules with optional filtering
   */
  countRules(filter?: MonitoringRuleFilter): number {
    return this.repository.count(filter);
  }
}
