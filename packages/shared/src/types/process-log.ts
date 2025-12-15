/**
 * Email processing action result
 */
export type ProcessAction = 'passed' | 'deleted' | 'error';

/**
 * Email processing log record
 */
export interface ProcessLog {
  id: string;
  recipient: string;
  sender: string;
  senderEmail: string;
  subject: string;
  processedAt: Date;
  action: ProcessAction;
  matchedRuleId?: string;
  matchedRuleCategory?: string;
  errorMessage?: string;
}

/**
 * Filter for querying process logs
 */
export interface LogFilter {
  startDate?: Date;
  endDate?: Date;
  action?: ProcessAction;
  ruleCategory?: string;
  limit?: number;
  offset?: number;
}
