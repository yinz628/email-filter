/**
 * Statistics for a single filter rule
 */
export interface RuleStats {
  ruleId: string;
  totalProcessed: number;
  deletedCount: number;
  errorCount: number;
  lastUpdated: Date;
}

/**
 * Summary statistics for all rules
 */
export interface StatsSummary {
  totalRules: number;
  activeRules: number;
  totalProcessed: number;
  totalDeleted: number;
  totalErrors: number;
}
