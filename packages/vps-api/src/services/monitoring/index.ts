/**
 * Monitoring Services Module
 * 
 * Exports all monitoring-related services for the VPS API.
 */

// State Calculator
export {
  calculateSignalState,
  calculateGapMinutes,
  calculateStateFromLastSeen,
  calculateStateForRule,
  StateCalculatorService,
  determineAlertType,
} from './state-calculator.js';
export type { SignalState, AlertType } from './state-calculator.js';

// Pattern Matcher
export {
  matchSubject,
  validatePattern,
  findMatchingPattern,
  PatternMatcherService,
} from './pattern-matcher.js';
export type { PatternMatchResult, PatternValidationResult } from './pattern-matcher.js';

// Rule Service
export {
  MonitoringRuleService,
  validateCreateRuleDTO,
  validateUpdateRuleDTO,
  RuleValidationError,
} from './rule.service.js';
export type { RuleValidationResult } from './rule.service.js';

// Signal State Service
export { SignalStateService } from './signal-state.service.js';

// Alert Service
export { AlertService, formatStatusDisplay } from './alert.service.js';

// Hit Processor
export { HitProcessor } from './hit-processor.js';

// Heartbeat Service
export { HeartbeatService } from './heartbeat.service.js';

// Cleanup Service
export { CleanupService } from './cleanup.service.js';
export type { CleanupResult, FullCleanupResult } from './cleanup.service.js';

// Scheduler Service
export { SchedulerService, DEFAULT_SCHEDULER_CONFIG } from './scheduler.service.js';
export type { SchedulerConfig } from './scheduler.service.js';
