/**
 * Project Helper Utilities
 * 
 * Helper functions for project-related operations
 * Requirements: 1.1, 1.2, 2.1, 2.2, 2.3
 */

import type { AnalysisProject } from '@email-filter/shared';
import type { Database } from 'better-sqlite3';

/**
 * Derives the effective worker names array from a project's worker configuration.
 * 
 * Logic:
 * - If workerNames is available and non-empty, use workerNames
 * - Otherwise, if workerName is set, use [workerName] as a single-element array
 * - Otherwise, return undefined (no worker filter - backward compatibility)
 * 
 * @param project - The analysis project containing workerName and/or workerNames
 * @returns Array of worker names for filtering, or undefined if no filter should be applied
 * 
 * Requirements: 1.1, 1.2, 2.1, 2.2
 */
export function getEffectiveWorkerNames(project: Pick<AnalysisProject, 'workerName' | 'workerNames'>): string[] | undefined {
  // Use workerNames if available and non-empty
  if (project.workerNames && project.workerNames.length > 0) {
    return project.workerNames;
  }
  
  // Fall back to workerName as single-element array if set
  if (project.workerName) {
    return [project.workerName];
  }
  
  // No worker association - return undefined for backward compatibility
  return undefined;
}


/**
 * Checks if a campaign has emails from any of the specified workers.
 * 
 * This is used to validate that a campaign belongs to a project's worker(s)
 * before allowing operations like setting it as a root campaign.
 * 
 * @param db - Database instance
 * @param campaignId - The campaign ID to check
 * @param workerNames - Array of worker names to check against
 * @returns true if the campaign has at least one email from any of the specified workers
 * 
 * Requirements: 2.3
 */
export function campaignBelongsToWorkers(
  db: Database,
  campaignId: string,
  workerNames: string[]
): boolean {
  if (!workerNames || workerNames.length === 0) {
    // No worker filter - campaign belongs to all workers (backward compatibility)
    return true;
  }

  const placeholders = workerNames.map(() => '?').join(', ');
  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM campaign_emails
    WHERE campaign_id = ? AND worker_name IN (${placeholders})
    LIMIT 1
  `);

  const result = stmt.get(campaignId, ...workerNames) as { count: number };
  return result.count > 0;
}
