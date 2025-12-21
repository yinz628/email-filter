import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getEffectiveWorkerNames, campaignBelongsToWorkers } from './project-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Arbitrary for generating valid worker names (non-empty strings)
const workerNameArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0 && !s.includes("'") && !s.includes('"'));

// Arbitrary for generating non-empty arrays of worker names
const workerNamesArrayArb = fc.array(workerNameArb, { minLength: 1, maxLength: 10 });

// Arbitrary for generating optional worker names array (can be undefined or empty)
const optionalWorkerNamesArb = fc.oneof(
  fc.constant(undefined),
  fc.constant([]),
  workerNamesArrayArb
);

// Arbitrary for generating project-like objects with worker configuration
const projectArb = fc.record({
  workerName: fc.oneof(fc.constant(''), workerNameArb),
  workerNames: optionalWorkerNamesArb,
});

describe('Project Helpers', () => {
  /**
   * **Feature: project-campaign-worker-filter-fix, Property 1: Worker Filter Derivation**
   * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
   * 
   * For any project with either workerName or workerNames set, the system should derive
   * the correct worker filter array: use workerNames if available and non-empty,
   * otherwise use [workerName] if workerName is set.
   */
  describe('Property 1: Worker Filter Derivation', () => {
    it('should use workerNames when available and non-empty', () => {
      fc.assert(
        fc.property(
          workerNamesArrayArb,
          workerNameArb,
          (workerNames, workerName) => {
            const project = { workerName, workerNames };
            const result = getEffectiveWorkerNames(project);
            
            // When workerNames is non-empty, it should be used
            expect(result).toEqual(workerNames);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should fall back to [workerName] when workerNames is undefined', () => {
      fc.assert(
        fc.property(
          workerNameArb,
          (workerName) => {
            const project = { workerName, workerNames: undefined };
            const result = getEffectiveWorkerNames(project);
            
            // Should return single-element array with workerName
            expect(result).toEqual([workerName]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should fall back to [workerName] when workerNames is empty array', () => {
      fc.assert(
        fc.property(
          workerNameArb,
          (workerName) => {
            const project = { workerName, workerNames: [] };
            const result = getEffectiveWorkerNames(project);
            
            // Should return single-element array with workerName
            expect(result).toEqual([workerName]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return undefined when both workerName and workerNames are empty/undefined', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(undefined), fc.constant([])),
          (workerNames) => {
            const project = { workerName: '', workerNames };
            const result = getEffectiveWorkerNames(project);
            
            // Should return undefined for backward compatibility
            expect(result).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve the exact workerNames array when non-empty', () => {
      fc.assert(
        fc.property(
          workerNamesArrayArb,
          (workerNames) => {
            const project = { workerName: 'ignored', workerNames };
            const result = getEffectiveWorkerNames(project);
            
            // Result should be exactly the same array reference
            expect(result).toBe(workerNames);
            // And have the same length
            expect(result?.length).toBe(workerNames.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


/**
 * Test-specific wrapper for campaignBelongsToWorkers that works with sql.js
 */
class TestCampaignRepository {
  constructor(private db: SqlJsDatabase) {}

  /**
   * Create a campaign with emails from specified workers
   */
  createCampaignWithEmails(
    campaignId: string,
    merchantId: string,
    workerNames: string[]
  ): void {
    const now = new Date().toISOString();
    const subjectHash = `hash_${campaignId}`;
    
    // Create merchant first (required by foreign key)
    try {
      this.db.run(
        `INSERT INTO merchants (id, domain, name, created_at, updated_at)
         VALUES (?, 'test.com', 'Test Merchant', ?, ?)`,
        [merchantId, now, now]
      );
    } catch {
      // Merchant may already exist
    }
    
    // Create campaign with all required fields
    this.db.run(
      `INSERT INTO campaigns (id, merchant_id, subject, subject_hash, total_emails, unique_recipients, first_seen_at, last_seen_at, created_at, updated_at)
       VALUES (?, ?, 'Test Subject', ?, ?, ?, ?, ?, ?, ?)`,
      [campaignId, merchantId, subjectHash, workerNames.length, workerNames.length, now, now, now, now]
    );

    // Create campaign_emails for each worker
    for (let i = 0; i < workerNames.length; i++) {
      this.db.run(
        `INSERT INTO campaign_emails (campaign_id, worker_name, recipient, received_at)
         VALUES (?, ?, ?, ?)`,
        [campaignId, workerNames[i], `recipient${i}@example.com`, now]
      );
    }
  }

  /**
   * Check if campaign belongs to workers using the same logic as production
   */
  campaignBelongsToWorkers(campaignId: string, workerNames: string[]): boolean {
    if (!workerNames || workerNames.length === 0) {
      return true;
    }

    const placeholders = workerNames.map(() => '?').join(', ');
    const result = this.db.exec(
      `SELECT COUNT(*) as count FROM campaign_emails WHERE campaign_id = ? AND worker_name IN (${placeholders}) LIMIT 1`,
      [campaignId, ...workerNames]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return false;
    }
    return (result[0].values[0][0] as number) > 0;
  }
}

describe('Campaign Filtering by Worker', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let repository: TestCampaignRepository;

  beforeEach(async () => {
    // Initialize sql.js
    SQL = await initSqlJs();
    db = new SQL.Database();
    
    // Load and execute schema
    const schemaPath = join(__dirname, '../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);
    
    repository = new TestCampaignRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: project-campaign-worker-filter-fix, Property 2: Campaign Filtering by Worker**
   * **Validates: Requirements 1.3, 3.1, 3.2**
   * 
   * For any project with worker association, the returned campaigns should only include
   * those that have at least one email from the project's associated worker(s).
   */
  describe('Property 2: Campaign Filtering by Worker', () => {
    it('should return true when campaign has emails from specified workers', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.array(workerNameArb, { minLength: 1, maxLength: 5 }),
          (campaignId, merchantId, workerNames) => {
            // Create campaign with emails from the specified workers
            repository.createCampaignWithEmails(campaignId, merchantId, workerNames);
            
            // Check if campaign belongs to the workers
            const result = repository.campaignBelongsToWorkers(campaignId, workerNames);
            
            // Should return true since campaign has emails from these workers
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when campaign has no emails from specified workers', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.array(workerNameArb, { minLength: 1, maxLength: 3 }),
          fc.array(workerNameArb, { minLength: 1, maxLength: 3 }),
          (campaignId, merchantId, campaignWorkers, filterWorkers) => {
            // Ensure filter workers are different from campaign workers
            const uniqueFilterWorkers = filterWorkers
              .map(w => `different_${w}`)
              .filter(w => !campaignWorkers.includes(w));
            
            if (uniqueFilterWorkers.length === 0) {
              return; // Skip if we can't generate different workers
            }
            
            // Create campaign with emails from campaign workers
            repository.createCampaignWithEmails(campaignId, merchantId, campaignWorkers);
            
            // Check if campaign belongs to different workers
            const result = repository.campaignBelongsToWorkers(campaignId, uniqueFilterWorkers);
            
            // Should return false since campaign has no emails from filter workers
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return true when filtering with empty worker array (backward compatibility)', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.array(workerNameArb, { minLength: 1, maxLength: 3 }),
          (campaignId, merchantId, campaignWorkers) => {
            // Create campaign with emails
            repository.createCampaignWithEmails(campaignId, merchantId, campaignWorkers);
            
            // Check with empty filter (backward compatibility)
            const result = repository.campaignBelongsToWorkers(campaignId, []);
            
            // Should return true for backward compatibility
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return true when campaign has emails from at least one of the specified workers', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          workerNameArb,
          fc.array(workerNameArb, { minLength: 1, maxLength: 3 }),
          (campaignId, merchantId, matchingWorker, otherWorkers) => {
            // Create campaign with emails from only one worker
            repository.createCampaignWithEmails(campaignId, merchantId, [matchingWorker]);
            
            // Filter includes the matching worker plus others
            const filterWorkers = [matchingWorker, ...otherWorkers.map(w => `other_${w}`)];
            
            // Check if campaign belongs to the filter workers
            const result = repository.campaignBelongsToWorkers(campaignId, filterWorkers);
            
            // Should return true since campaign has at least one email from filter workers
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


/**
 * Unit tests for edge cases
 * **Validates: Requirements 1.4**
 */
describe('Edge Cases', () => {
  describe('getEffectiveWorkerNames edge cases', () => {
    it('should return undefined for project with no worker association', () => {
      // Test project with no worker association (backward compatibility)
      const project = { workerName: '', workerNames: undefined };
      const result = getEffectiveWorkerNames(project);
      expect(result).toBeUndefined();
    });

    it('should return undefined for project with empty workerName and empty workerNames', () => {
      const project = { workerName: '', workerNames: [] };
      const result = getEffectiveWorkerNames(project);
      expect(result).toBeUndefined();
    });

    it('should return [workerName] for project with only workerName set', () => {
      const project = { workerName: 'worker-1', workerNames: undefined };
      const result = getEffectiveWorkerNames(project);
      expect(result).toEqual(['worker-1']);
    });

    it('should return [workerName] for project with workerName and empty workerNames', () => {
      const project = { workerName: 'worker-1', workerNames: [] };
      const result = getEffectiveWorkerNames(project);
      expect(result).toEqual(['worker-1']);
    });

    it('should return workerNames for project with workerNames array', () => {
      const project = { workerName: 'worker-1', workerNames: ['worker-2', 'worker-3'] };
      const result = getEffectiveWorkerNames(project);
      expect(result).toEqual(['worker-2', 'worker-3']);
    });

    it('should prioritize workerNames over workerName when both are set', () => {
      const project = { workerName: 'old-worker', workerNames: ['new-worker-1', 'new-worker-2'] };
      const result = getEffectiveWorkerNames(project);
      expect(result).toEqual(['new-worker-1', 'new-worker-2']);
      expect(result).not.toContain('old-worker');
    });

    it('should handle single-element workerNames array', () => {
      const project = { workerName: 'worker-1', workerNames: ['worker-2'] };
      const result = getEffectiveWorkerNames(project);
      expect(result).toEqual(['worker-2']);
    });
  });
});
