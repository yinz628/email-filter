/**
 * Campaign UI Service Tests
 * 
 * Property-based tests for UI data transformation and rendering logic.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  transformMerchantForList,
  transformMerchantsForList,
  sortMerchants,
  isMerchantListItemComplete,
  transformProjectForList,
  transformProjectsForList,
  isProjectListItemComplete,
  transformCampaignForList,
  transformCampaignsForList,
  sortCampaigns,
  isCampaignListItemComplete,
  isSortedCorrectly,
  validateProjectName,
  merchantHasProject,
  getMerchantProjectCount,
  projectExistsById,
  removeProjectById,
  transformRootCampaignForList,
  transformRootCampaignsForList,
  isRootCampaignListItemComplete,
  getConfirmedRoot,
  isCampaignRoot,
  setRootCampaign,
  validateRootSelectionPersistence,
  setCampaignTag,
  setCampaignTagInList,
  getCampaignTagById,
  validateCampaignTagPersistence,
  campaignHasTag,
  filterCampaignsByTag,
  isValidCampaignTag,
  // Path Analysis Functions (Property 11 & 12)
  transformPathNodeForList,
  transformPathNodesForList,
  isPathNodeComplete,
  shouldHighlightPathNode,
  getHighlightedPathNodes,
  validatePathNodesCompleteness,
  validateValuableCampaignHighlighting,
  groupPathNodesByLevel,
  // State Management Functions (Property 13)
  createInitialPageState,
  selectProject,
  deselectProject,
  changeWorkerInstance,
  updateMerchantList,
  updateMerchantSort,
  updateProjectList,
  updateProjectStatusFilter,
  switchDetailTab,
  validateMerchantSectionUnchanged,
  validateProjectSectionUnchanged,
  validateDetailSectionUnchanged,
  shouldShowProjectDetail,
  type MerchantListItem,
  type ProjectListItem,
  type CampaignListItem,
  type RootCampaignListItem,
  type SortOrder,
  type MerchantSortField,
  type PathNodeItem,
  type CampaignPageState,
} from './campaign-ui.service.js';
import type { Merchant, Campaign, AnalysisProject, RootCampaign, CampaignTag, MerchantAnalysisStatus, AnalysisProjectStatus } from '@email-filter/shared';

// ============================================
// Arbitraries for generating test data
// ============================================

// Generate valid UUID-like strings
const uuidArb = fc.uuid();

// Generate valid domain
const domainArb = fc.tuple(
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 20 }),
  fc.constantFrom('com', 'org', 'net', 'io', 'co')
).map(([name, tld]) => `${name}.${tld}`);

// Generate valid merchant
const merchantArb: fc.Arbitrary<Merchant> = fc.record({
  id: uuidArb,
  domain: domainArb,
  displayName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  note: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  analysisStatus: fc.constantFrom<MerchantAnalysisStatus>('pending', 'active', 'ignored'),
  totalCampaigns: fc.nat({ max: 1000 }),
  valuableCampaigns: fc.nat({ max: 100 }),
  totalEmails: fc.nat({ max: 100000 }),
  createdAt: fc.date(),
  updatedAt: fc.date(),
});

// Generate valid analysis project
const analysisProjectArb: fc.Arbitrary<AnalysisProject> = fc.record({
  id: uuidArb,
  name: fc.string({ minLength: 1, maxLength: 100 }),
  merchantId: uuidArb,
  workerName: fc.string({ minLength: 1, maxLength: 50 }),
  status: fc.constantFrom<AnalysisProjectStatus>('active', 'completed', 'archived'),
  note: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  merchantDomain: fc.option(domainArb, { nil: undefined }),
  totalCampaigns: fc.option(fc.nat({ max: 1000 }), { nil: undefined }),
  totalEmails: fc.option(fc.nat({ max: 100000 }), { nil: undefined }),
  createdAt: fc.date(),
  updatedAt: fc.date(),
});

// Generate valid campaign
const campaignArb: fc.Arbitrary<Campaign> = fc.record({
  id: uuidArb,
  merchantId: uuidArb,
  subject: fc.string({ minLength: 0, maxLength: 200 }),
  tag: fc.constantFrom<CampaignTag>(0, 1, 2, 3, 4),
  tagNote: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  isValuable: fc.boolean(),
  valuableNote: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  totalEmails: fc.nat({ max: 10000 }),
  uniqueRecipients: fc.nat({ max: 5000 }),
  firstSeenAt: fc.date(),
  lastSeenAt: fc.date(),
  createdAt: fc.date(),
  updatedAt: fc.date(),
});

// Generate sort order
const sortOrderArb: fc.Arbitrary<SortOrder> = fc.constantFrom('asc', 'desc');

// Generate merchant sort field
const merchantSortFieldArb: fc.Arbitrary<MerchantSortField> = fc.constantFrom('emails', 'campaigns');

// ============================================
// Property Tests
// ============================================

describe('Campaign UI Service', () => {
  /**
   * **Feature: campaign-analytics-ui-reorganization, Property 2: List Rendering Completeness**
   * **Validates: Requirements 2.2, 4.2, 6.2**
   * 
   * For any merchant or project or campaign in the data source, the rendered list item 
   * should contain all required display fields (domain/name, counts, status, timestamps).
   */
  describe('Property 2: List Rendering Completeness', () => {
    it('should transform any merchant to a complete list item with all required fields', () => {
      fc.assert(
        fc.property(
          merchantArb,
          fc.array(analysisProjectArb, { minLength: 0, maxLength: 10 }),
          (merchant, projects) => {
            const projectMerchantIds = new Set(projects.map(p => p.merchantId));
            const listItem = transformMerchantForList(merchant, projectMerchantIds);
            
            // Verify all required fields are present and valid
            expect(isMerchantListItemComplete(listItem)).toBe(true);
            
            // Verify field values match source data
            expect(listItem.id).toBe(merchant.id);
            expect(listItem.domain).toBe(merchant.domain);
            expect(listItem.totalCampaigns).toBe(merchant.totalCampaigns);
            expect(listItem.totalEmails).toBe(merchant.totalEmails);
            expect(listItem.hasProject).toBe(projectMerchantIds.has(merchant.id));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should transform any project to a complete list item with all required fields', () => {
      fc.assert(
        fc.property(
          analysisProjectArb,
          (project) => {
            const listItem = transformProjectForList(project);
            
            // Verify all required fields are present and valid
            expect(isProjectListItemComplete(listItem)).toBe(true);
            
            // Verify field values match source data
            expect(listItem.id).toBe(project.id);
            expect(listItem.name).toBe(project.name);
            expect(listItem.merchantDomain).toBe(project.merchantDomain || '-');
            expect(listItem.status).toBe(project.status);
            expect(listItem.createdAt).toEqual(project.createdAt);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should transform any campaign to a complete list item with all required fields', () => {
      fc.assert(
        fc.property(
          campaignArb,
          (campaign) => {
            const listItem = transformCampaignForList(campaign);
            
            // Verify all required fields are present and valid
            expect(isCampaignListItemComplete(listItem)).toBe(true);
            
            // Verify field values match source data
            expect(listItem.id).toBe(campaign.id);
            expect(listItem.subject).toBe(campaign.subject);
            expect(listItem.totalEmails).toBe(campaign.totalEmails);
            expect(listItem.uniqueRecipients).toBe(campaign.uniqueRecipients);
            expect(listItem.tag).toBe(campaign.tag);
            expect(listItem.isValuable).toBe(campaign.isValuable);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should transform array of merchants preserving all items', () => {
      fc.assert(
        fc.property(
          fc.array(merchantArb, { minLength: 0, maxLength: 50 }),
          fc.array(analysisProjectArb, { minLength: 0, maxLength: 20 }),
          (merchants, projects) => {
            const listItems = transformMerchantsForList(merchants, projects);
            
            // Same number of items
            expect(listItems.length).toBe(merchants.length);
            
            // All items are complete
            for (const item of listItems) {
              expect(isMerchantListItemComplete(item)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should transform array of projects preserving all items', () => {
      fc.assert(
        fc.property(
          fc.array(analysisProjectArb, { minLength: 0, maxLength: 50 }),
          (projects) => {
            const listItems = transformProjectsForList(projects);
            
            // Same number of items
            expect(listItems.length).toBe(projects.length);
            
            // All items are complete
            for (const item of listItems) {
              expect(isProjectListItemComplete(item)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should transform array of campaigns preserving all items', () => {
      fc.assert(
        fc.property(
          fc.array(campaignArb, { minLength: 0, maxLength: 50 }),
          (campaigns) => {
            const listItems = transformCampaignsForList(campaigns);
            
            // Same number of items
            expect(listItems.length).toBe(campaigns.length);
            
            // All items are complete
            for (const item of listItems) {
              expect(isCampaignListItemComplete(item)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics-ui-reorganization, Property 3: Sorting Correctness**
   * **Validates: Requirements 2.3, 6.5**
   * 
   * For any list sorted by a specific field, all adjacent pairs of items 
   * should satisfy the sort order constraint.
   */
  describe('Property 3: Sorting Correctness', () => {
    it('should sort merchants correctly by any field and order', () => {
      fc.assert(
        fc.property(
          fc.array(merchantArb, { minLength: 0, maxLength: 50 }),
          fc.array(analysisProjectArb, { minLength: 0, maxLength: 20 }),
          merchantSortFieldArb,
          sortOrderArb,
          (merchants, projects, sortField, sortOrder) => {
            const listItems = transformMerchantsForList(merchants, projects);
            const sorted = sortMerchants(listItems, sortField, sortOrder);
            
            // Verify sort order is correct
            const getValue = (item: MerchantListItem) => 
              sortField === 'emails' ? item.totalEmails : item.totalCampaigns;
            
            expect(isSortedCorrectly(sorted, getValue, sortOrder)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all items when sorting merchants', () => {
      fc.assert(
        fc.property(
          fc.array(merchantArb, { minLength: 0, maxLength: 50 }),
          fc.array(analysisProjectArb, { minLength: 0, maxLength: 20 }),
          merchantSortFieldArb,
          sortOrderArb,
          (merchants, projects, sortField, sortOrder) => {
            const listItems = transformMerchantsForList(merchants, projects);
            const sorted = sortMerchants(listItems, sortField, sortOrder);
            
            // Same number of items
            expect(sorted.length).toBe(listItems.length);
            
            // Same set of IDs
            const originalIds = new Set(listItems.map(m => m.id));
            const sortedIds = new Set(sorted.map(m => m.id));
            expect(sortedIds).toEqual(originalIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sort campaigns correctly by email count', () => {
      fc.assert(
        fc.property(
          fc.array(campaignArb, { minLength: 0, maxLength: 50 }),
          sortOrderArb,
          (campaigns, sortOrder) => {
            const listItems = transformCampaignsForList(campaigns);
            const sorted = sortCampaigns(listItems, 'emails', sortOrder);
            
            // Verify sort order is correct
            const getValue = (item: CampaignListItem) => item.totalEmails;
            
            expect(isSortedCorrectly(sorted, getValue, sortOrder)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all items when sorting campaigns', () => {
      fc.assert(
        fc.property(
          fc.array(campaignArb, { minLength: 0, maxLength: 50 }),
          sortOrderArb,
          (campaigns, sortOrder) => {
            const listItems = transformCampaignsForList(campaigns);
            const sorted = sortCampaigns(listItems, 'emails', sortOrder);
            
            // Same number of items
            expect(sorted.length).toBe(listItems.length);
            
            // Same set of IDs
            const originalIds = new Set(listItems.map(c => c.id));
            const sortedIds = new Set(sorted.map(c => c.id));
            expect(sortedIds).toEqual(originalIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty arrays correctly', () => {
      const emptyMerchants: MerchantListItem[] = [];
      const emptyCampaigns: CampaignListItem[] = [];
      
      expect(sortMerchants(emptyMerchants, 'emails', 'desc')).toEqual([]);
      expect(sortMerchants(emptyMerchants, 'campaigns', 'asc')).toEqual([]);
      expect(sortCampaigns(emptyCampaigns, 'emails', 'desc')).toEqual([]);
    });

    it('should handle single item arrays correctly', () => {
      fc.assert(
        fc.property(
          merchantArb,
          merchantSortFieldArb,
          sortOrderArb,
          (merchant, sortField, sortOrder) => {
            const listItem = transformMerchantForList(merchant, new Set());
            const sorted = sortMerchants([listItem], sortField, sortOrder);
            
            expect(sorted.length).toBe(1);
            expect(sorted[0]).toEqual(listItem);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be idempotent - sorting twice gives same result', () => {
      fc.assert(
        fc.property(
          fc.array(merchantArb, { minLength: 0, maxLength: 50 }),
          fc.array(analysisProjectArb, { minLength: 0, maxLength: 20 }),
          merchantSortFieldArb,
          sortOrderArb,
          (merchants, projects, sortField, sortOrder) => {
            const listItems = transformMerchantsForList(merchants, projects);
            const sortedOnce = sortMerchants(listItems, sortField, sortOrder);
            const sortedTwice = sortMerchants(sortedOnce, sortField, sortOrder);
            
            // Sorting twice should give same result
            expect(sortedTwice.map(m => m.id)).toEqual(sortedOnce.map(m => m.id));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics-ui-reorganization, Property 5: Project Name Validation**
   * **Validates: Requirements 3.2**
   * 
   * For any empty or whitespace-only project name, the creation should be rejected.
   */
  describe('Property 5: Project Name Validation', () => {
    it('should reject null and undefined values', () => {
      expect(validateProjectName(null)).toBe(false);
      expect(validateProjectName(undefined)).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(validateProjectName('')).toBe(false);
    });

    it('should reject any string composed entirely of whitespace characters', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'), { minLength: 1, maxLength: 100 }),
          (whitespaceString) => {
            expect(validateProjectName(whitespaceString)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept any non-empty string with at least one non-whitespace character', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          (validName) => {
            expect(validateProjectName(validName)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject non-string values', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.double(),
            fc.boolean(),
            fc.array(fc.anything()),
            fc.object()
          ),
          (nonStringValue) => {
            expect(validateProjectName(nonStringValue)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept strings with leading/trailing whitespace if they contain non-whitespace', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringOf(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 10 }),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.stringOf(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 10 })
          ),
          ([leadingWs, content, trailingWs]) => {
            const nameWithWhitespace = leadingWs + content + trailingWs;
            expect(validateProjectName(nameWithWhitespace)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics-ui-reorganization, Property 6: Project Deletion Completeness**
   * **Validates: Requirements 4.4**
   * 
   * For any deleted project, querying by that project ID should return null.
   */
  describe('Property 6: Project Deletion Completeness', () => {
    it('should not find a project after it is removed from the list', () => {
      fc.assert(
        fc.property(
          fc.array(analysisProjectArb, { minLength: 1, maxLength: 50 }),
          (projects) => {
            // Pick a random project to delete
            const indexToDelete = Math.floor(Math.random() * projects.length);
            const projectToDelete = projects[indexToDelete];
            
            // Remove the project
            const remainingProjects = removeProjectById(projectToDelete.id, projects);
            
            // Verify the project no longer exists
            expect(projectExistsById(projectToDelete.id, remainingProjects)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all other projects when one is deleted', () => {
      fc.assert(
        fc.property(
          fc.array(analysisProjectArb, { minLength: 2, maxLength: 50 }),
          (projects) => {
            // Pick a random project to delete
            const indexToDelete = Math.floor(Math.random() * projects.length);
            const projectToDelete = projects[indexToDelete];
            
            // Remove the project
            const remainingProjects = removeProjectById(projectToDelete.id, projects);
            
            // Verify all other projects still exist
            const otherProjects = projects.filter(p => p.id !== projectToDelete.id);
            for (const project of otherProjects) {
              expect(projectExistsById(project.id, remainingProjects)).toBe(true);
            }
            
            // Verify count is correct
            expect(remainingProjects.length).toBe(projects.length - 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle deleting from empty list gracefully', () => {
      const emptyProjects: AnalysisProject[] = [];
      const result = removeProjectById('non-existent-id', emptyProjects);
      expect(result).toEqual([]);
      expect(projectExistsById('non-existent-id', result)).toBe(false);
    });

    it('should handle deleting non-existent project gracefully', () => {
      fc.assert(
        fc.property(
          fc.array(analysisProjectArb, { minLength: 1, maxLength: 50 }),
          (projects) => {
            const nonExistentId = 'non-existent-' + Date.now();
            const result = removeProjectById(nonExistentId, projects);
            
            // Should return same projects
            expect(result.length).toBe(projects.length);
            expect(result.map(p => p.id)).toEqual(projects.map(p => p.id));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics-ui-reorganization, Property 7: Merchant Project Indicator**
   * **Validates: Requirements 2.5**
   * 
   * For any merchant with at least one associated project, the merchant list should display a project indicator.
   */
  describe('Property 7: Merchant Project Indicator', () => {
    it('should return true for merchants with at least one project', () => {
      fc.assert(
        fc.property(
          merchantArb,
          fc.array(analysisProjectArb, { minLength: 1, maxLength: 20 }),
          (merchant, projects) => {
            // Create a project that references this merchant
            const projectsWithMerchant = [
              ...projects,
              { ...projects[0], merchantId: merchant.id }
            ];
            
            expect(merchantHasProject(merchant.id, projectsWithMerchant)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false for merchants with no projects', () => {
      fc.assert(
        fc.property(
          merchantArb,
          fc.array(analysisProjectArb, { minLength: 0, maxLength: 20 }),
          (merchant, projects) => {
            // Filter out any projects that might reference this merchant
            const projectsWithoutMerchant = projects.filter(p => p.merchantId !== merchant.id);
            
            expect(merchantHasProject(merchant.id, projectsWithoutMerchant)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly count projects for a merchant', () => {
      fc.assert(
        fc.property(
          merchantArb,
          fc.array(analysisProjectArb, { minLength: 0, maxLength: 20 }),
          fc.integer({ min: 0, max: 5 }),
          (merchant, otherProjects, additionalProjectCount) => {
            // Create additional projects for this merchant
            const merchantProjects = Array.from({ length: additionalProjectCount }, (_, i) => ({
              ...otherProjects[0] || { id: `proj-${i}`, merchantId: merchant.id },
              id: `merchant-proj-${i}`,
              merchantId: merchant.id
            }));
            
            const allProjects = [...otherProjects.filter(p => p.merchantId !== merchant.id), ...merchantProjects];
            
            expect(getMerchantProjectCount(merchant.id, allProjects)).toBe(additionalProjectCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should show hasProject indicator in transformed merchant list', () => {
      fc.assert(
        fc.property(
          fc.array(merchantArb, { minLength: 1, maxLength: 20 }),
          fc.array(analysisProjectArb, { minLength: 0, maxLength: 20 }),
          (merchants, projects) => {
            const listItems = transformMerchantsForList(merchants, projects);
            const projectMerchantIds = new Set(projects.map(p => p.merchantId));
            
            for (const item of listItems) {
              const expectedHasProject = projectMerchantIds.has(item.id);
              expect(item.hasProject).toBe(expectedHasProject);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics-ui-reorganization, Property 8: Root Campaign Listing**
   * **Validates: Requirements 5.2**
   * 
   * For any merchant in a project, the Root confirmation tab should list all campaigns 
   * belonging to that merchant with all required fields.
   */
  describe('Property 8: Root Campaign Listing', () => {
    // Generate valid RootCampaign
    const rootCampaignArb: fc.Arbitrary<RootCampaign> = fc.record({
      campaignId: uuidArb,
      subject: fc.string({ minLength: 0, maxLength: 200 }),
      isConfirmed: fc.boolean(),
      isCandidate: fc.boolean(),
      candidateReason: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
      newUserCount: fc.nat({ max: 10000 }),
      confirmedAt: fc.option(fc.date(), { nil: undefined }),
    });

    it('should transform any root campaign to a complete list item with all required fields', () => {
      fc.assert(
        fc.property(
          rootCampaignArb,
          (rootCampaign) => {
            const listItem = transformRootCampaignForList(rootCampaign);
            
            // Verify all required fields are present and valid
            expect(isRootCampaignListItemComplete(listItem)).toBe(true);
            
            // Verify field values match source data
            expect(listItem.campaignId).toBe(rootCampaign.campaignId);
            expect(listItem.subject).toBe(rootCampaign.subject);
            expect(listItem.isConfirmed).toBe(rootCampaign.isConfirmed);
            expect(listItem.isCandidate).toBe(rootCampaign.isCandidate);
            expect(listItem.newUserCount).toBe(rootCampaign.newUserCount);
            expect(listItem.candidateReason).toBe(rootCampaign.candidateReason);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should transform array of root campaigns preserving all items', () => {
      fc.assert(
        fc.property(
          fc.array(rootCampaignArb, { minLength: 0, maxLength: 50 }),
          (rootCampaigns) => {
            const listItems = transformRootCampaignsForList(rootCampaigns);
            
            // Same number of items
            expect(listItems.length).toBe(rootCampaigns.length);
            
            // All items are complete
            for (const item of listItems) {
              expect(isRootCampaignListItemComplete(item)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify confirmed root campaign', () => {
      fc.assert(
        fc.property(
          fc.array(rootCampaignArb, { minLength: 1, maxLength: 20 }),
          (rootCampaigns) => {
            const confirmedRoot = getConfirmedRoot(rootCampaigns);
            const hasConfirmed = rootCampaigns.some(rc => rc.isConfirmed);
            
            if (hasConfirmed) {
              expect(confirmedRoot).toBeDefined();
              expect(confirmedRoot!.isConfirmed).toBe(true);
            } else {
              expect(confirmedRoot).toBeUndefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics-ui-reorganization, Property 9: Root Selection Persistence**
   * **Validates: Requirements 5.3**
   * 
   * For any campaign marked as Root, reloading the project should preserve the Root selection.
   */
  describe('Property 9: Root Selection Persistence', () => {
    // Generate valid RootCampaign
    const rootCampaignArb: fc.Arbitrary<RootCampaign> = fc.record({
      campaignId: uuidArb,
      subject: fc.string({ minLength: 0, maxLength: 200 }),
      isConfirmed: fc.boolean(),
      isCandidate: fc.boolean(),
      candidateReason: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
      newUserCount: fc.nat({ max: 10000 }),
      confirmedAt: fc.option(fc.date(), { nil: undefined }),
    });

    it('should persist root selection after setting a campaign as root', () => {
      fc.assert(
        fc.property(
          fc.array(rootCampaignArb, { minLength: 1, maxLength: 20 }),
          fc.nat(),
          (rootCampaigns, indexSeed) => {
            // Pick a random campaign to set as root
            const index = indexSeed % rootCampaigns.length;
            const selectedCampaignId = rootCampaigns[index].campaignId;
            
            // Set the campaign as root
            const updatedCampaigns = setRootCampaign(rootCampaigns, selectedCampaignId);
            
            // Verify the selection is persisted correctly
            expect(validateRootSelectionPersistence(updatedCampaigns, selectedCampaignId)).toBe(true);
            
            // Verify only one campaign is confirmed
            const confirmedCount = updatedCampaigns.filter(rc => rc.isConfirmed).length;
            expect(confirmedCount).toBe(1);
            
            // Verify the correct campaign is confirmed
            const confirmedCampaign = updatedCampaigns.find(rc => rc.isConfirmed);
            expect(confirmedCampaign?.campaignId).toBe(selectedCampaignId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify if a campaign is root', () => {
      fc.assert(
        fc.property(
          fc.array(rootCampaignArb, { minLength: 1, maxLength: 20 }),
          fc.nat(),
          (rootCampaigns, indexSeed) => {
            // Pick a random campaign to set as root
            const index = indexSeed % rootCampaigns.length;
            const selectedCampaignId = rootCampaigns[index].campaignId;
            
            // Set the campaign as root
            const updatedCampaigns = setRootCampaign(rootCampaigns, selectedCampaignId);
            
            // Verify isCampaignRoot returns correct values
            for (const campaign of updatedCampaigns) {
              const isRoot = isCampaignRoot(campaign.campaignId, updatedCampaigns);
              expect(isRoot).toBe(campaign.campaignId === selectedCampaignId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should unset previous root when setting a new root', () => {
      fc.assert(
        fc.property(
          fc.array(rootCampaignArb, { minLength: 2, maxLength: 20 }),
          fc.nat(),
          fc.nat(),
          (rootCampaigns, firstIndexSeed, secondIndexSeed) => {
            // Pick two different campaigns
            const firstIndex = firstIndexSeed % rootCampaigns.length;
            let secondIndex = secondIndexSeed % rootCampaigns.length;
            if (secondIndex === firstIndex) {
              secondIndex = (secondIndex + 1) % rootCampaigns.length;
            }
            
            const firstCampaignId = rootCampaigns[firstIndex].campaignId;
            const secondCampaignId = rootCampaigns[secondIndex].campaignId;
            
            // Set first campaign as root
            const afterFirst = setRootCampaign(rootCampaigns, firstCampaignId);
            expect(isCampaignRoot(firstCampaignId, afterFirst)).toBe(true);
            
            // Set second campaign as root
            const afterSecond = setRootCampaign(afterFirst, secondCampaignId);
            
            // First should no longer be root
            expect(isCampaignRoot(firstCampaignId, afterSecond)).toBe(false);
            // Second should be root
            expect(isCampaignRoot(secondCampaignId, afterSecond)).toBe(true);
            
            // Only one root should exist
            const confirmedCount = afterSecond.filter(rc => rc.isConfirmed).length;
            expect(confirmedCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics-ui-reorganization, Property 10: Campaign Tag Persistence**
   * **Validates: Requirements 6.4**
   * 
   * For any campaign marked with a tag, reloading the campaign list should preserve the tag value.
   */
  describe('Property 10: Campaign Tag Persistence', () => {
    // Generate campaign with tag
    const campaignWithTagArb: fc.Arbitrary<{ id: string; tag: number; subject: string; totalEmails: number; uniqueRecipients: number }> = fc.record({
      id: uuidArb,
      tag: fc.constantFrom(0, 1, 2, 3, 4),
      subject: fc.string({ minLength: 0, maxLength: 200 }),
      totalEmails: fc.nat({ max: 10000 }),
      uniqueRecipients: fc.nat({ max: 5000 }),
    });

    // Generate valid tag value (0-4)
    const validTagArb = fc.constantFrom(0, 1, 2, 3, 4);

    it('should persist tag value after setting a campaign tag', () => {
      fc.assert(
        fc.property(
          fc.array(campaignWithTagArb, { minLength: 1, maxLength: 50 }),
          fc.nat(),
          validTagArb,
          (campaigns, indexSeed, newTag) => {
            // Pick a random campaign to tag
            const index = indexSeed % campaigns.length;
            const selectedCampaignId = campaigns[index].id;
            
            // Set the campaign tag
            const updatedCampaigns = setCampaignTagInList(campaigns, selectedCampaignId, newTag);
            
            // Verify the tag is persisted correctly
            expect(validateCampaignTagPersistence(updatedCampaigns, selectedCampaignId, newTag)).toBe(true);
            
            // Verify the campaign has the correct tag
            expect(campaignHasTag(selectedCampaignId, updatedCampaigns, newTag)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve other campaigns tags when setting one campaign tag', () => {
      fc.assert(
        fc.property(
          fc.array(campaignWithTagArb, { minLength: 2, maxLength: 50 }),
          fc.nat(),
          validTagArb,
          (campaigns, indexSeed, newTag) => {
            // Pick a random campaign to tag
            const index = indexSeed % campaigns.length;
            const selectedCampaignId = campaigns[index].id;
            
            // Store original tags for other campaigns
            const originalTags = new Map(
              campaigns
                .filter(c => c.id !== selectedCampaignId)
                .map(c => [c.id, c.tag])
            );
            
            // Set the campaign tag
            const updatedCampaigns = setCampaignTagInList(campaigns, selectedCampaignId, newTag);
            
            // Verify other campaigns' tags are unchanged
            for (const [id, originalTag] of originalTags) {
              expect(getCampaignTagById(id, updatedCampaigns)).toBe(originalTag);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify campaigns with specific tags', () => {
      fc.assert(
        fc.property(
          fc.array(campaignWithTagArb, { minLength: 1, maxLength: 50 }),
          validTagArb,
          (campaigns, targetTag) => {
            // Filter campaigns by tag
            const filteredCampaigns = filterCampaignsByTag(campaigns, targetTag);
            
            // All filtered campaigns should have the target tag
            for (const campaign of filteredCampaigns) {
              expect(campaign.tag).toBe(targetTag);
            }
            
            // Count should match
            const expectedCount = campaigns.filter(c => c.tag === targetTag).length;
            expect(filteredCampaigns.length).toBe(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate tag values correctly', () => {
      // Valid tags (0-4)
      expect(isValidCampaignTag(0)).toBe(true);
      expect(isValidCampaignTag(1)).toBe(true);
      expect(isValidCampaignTag(2)).toBe(true);
      expect(isValidCampaignTag(3)).toBe(true);
      expect(isValidCampaignTag(4)).toBe(true);
      
      // Invalid tags
      expect(isValidCampaignTag(-1)).toBe(false);
      expect(isValidCampaignTag(5)).toBe(false);
      expect(isValidCampaignTag(1.5)).toBe(false);
      expect(isValidCampaignTag('1')).toBe(false);
      expect(isValidCampaignTag(null)).toBe(false);
      expect(isValidCampaignTag(undefined)).toBe(false);
    });

    it('should handle setting tag on non-existent campaign gracefully', () => {
      fc.assert(
        fc.property(
          fc.array(campaignWithTagArb, { minLength: 1, maxLength: 50 }),
          validTagArb,
          (campaigns, newTag) => {
            const nonExistentId = 'non-existent-' + Date.now();
            
            // Set tag on non-existent campaign
            const updatedCampaigns = setCampaignTagInList(campaigns, nonExistentId, newTag);
            
            // Should return same campaigns (no changes)
            expect(updatedCampaigns.length).toBe(campaigns.length);
            
            // All original campaigns should be unchanged
            for (let i = 0; i < campaigns.length; i++) {
              expect(updatedCampaigns[i].id).toBe(campaigns[i].id);
              expect(updatedCampaigns[i].tag).toBe(campaigns[i].tag);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty campaign list gracefully', () => {
      const emptyCampaigns: { id: string; tag: number }[] = [];
      
      const result = setCampaignTagInList(emptyCampaigns, 'any-id', 1);
      expect(result).toEqual([]);
      
      expect(getCampaignTagById('any-id', emptyCampaigns)).toBeUndefined();
      expect(validateCampaignTagPersistence(emptyCampaigns, 'any-id', 1)).toBe(false);
    });

    it('should be idempotent - setting same tag twice gives same result', () => {
      fc.assert(
        fc.property(
          fc.array(campaignWithTagArb, { minLength: 1, maxLength: 50 }),
          fc.nat(),
          validTagArb,
          (campaigns, indexSeed, newTag) => {
            const index = indexSeed % campaigns.length;
            const selectedCampaignId = campaigns[index].id;
            
            // Set tag once
            const afterFirst = setCampaignTagInList(campaigns, selectedCampaignId, newTag);
            
            // Set same tag again
            const afterSecond = setCampaignTagInList(afterFirst, selectedCampaignId, newTag);
            
            // Results should be identical
            expect(afterSecond.map(c => ({ id: c.id, tag: c.tag })))
              .toEqual(afterFirst.map(c => ({ id: c.id, tag: c.tag })));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics-ui-reorganization, Property 11: Path Node Data Completeness**
   * **Validates: Requirements 7.4**
   * 
   * For any node in the path analysis result, the node should contain recipient count and percentage values.
   */
  describe('Property 11: Path Node Data Completeness', () => {
    // Generate valid CampaignLevelStats
    const campaignLevelStatsArb: fc.Arbitrary<{
      campaignId: string;
      subject: string;
      tag: number;
      isValuable: boolean;
      level: number;
      isRoot: boolean;
      userCount: number;
      coverage: number;
    }> = fc.record({
      campaignId: uuidArb,
      subject: fc.string({ minLength: 0, maxLength: 200 }),
      tag: fc.constantFrom(0, 1, 2, 3, 4),
      isValuable: fc.boolean(),
      level: fc.integer({ min: 1, max: 10 }),
      isRoot: fc.boolean(),
      userCount: fc.nat({ max: 10000 }),
      coverage: fc.double({ min: 0, max: 100, noNaN: true }),
    });

    it('should transform any CampaignLevelStats to a complete path node with all required fields', () => {
      fc.assert(
        fc.property(
          campaignLevelStatsArb,
          (levelStat) => {
            const pathNode = transformPathNodeForList(levelStat as any);
            
            // Verify all required fields are present and valid
            expect(isPathNodeComplete(pathNode)).toBe(true);
            
            // Verify field values match source data
            expect(pathNode.campaignId).toBe(levelStat.campaignId);
            expect(pathNode.subject).toBe(levelStat.subject);
            expect(pathNode.tag).toBe(levelStat.tag);
            expect(pathNode.isValuable).toBe(levelStat.isValuable);
            expect(pathNode.level).toBe(levelStat.level);
            expect(pathNode.isRoot).toBe(levelStat.isRoot);
            expect(pathNode.userCount).toBe(levelStat.userCount);
            expect(pathNode.coverage).toBe(levelStat.coverage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should transform array of CampaignLevelStats preserving all items with complete data', () => {
      fc.assert(
        fc.property(
          fc.array(campaignLevelStatsArb, { minLength: 0, maxLength: 50 }),
          (levelStats) => {
            const pathNodes = transformPathNodesForList(levelStats as any);
            
            // Same number of items
            expect(pathNodes.length).toBe(levelStats.length);
            
            // All items are complete
            for (const node of pathNodes) {
              expect(isPathNodeComplete(node)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ensure every path node has recipient count (userCount) field', () => {
      fc.assert(
        fc.property(
          campaignLevelStatsArb,
          (levelStat) => {
            const pathNode = transformPathNodeForList(levelStat as any);
            
            // userCount must be a number
            expect(typeof pathNode.userCount).toBe('number');
            // userCount must be non-negative
            expect(pathNode.userCount).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ensure every path node has percentage (coverage) field', () => {
      fc.assert(
        fc.property(
          campaignLevelStatsArb,
          (levelStat) => {
            const pathNode = transformPathNodeForList(levelStat as any);
            
            // coverage must be a number
            expect(typeof pathNode.coverage).toBe('number');
            // coverage must be between 0 and 100
            expect(pathNode.coverage).toBeGreaterThanOrEqual(0);
            expect(pathNode.coverage).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate path nodes completeness for any array of level stats', () => {
      fc.assert(
        fc.property(
          fc.array(campaignLevelStatsArb, { minLength: 0, maxLength: 50 }),
          (levelStats) => {
            // All valid level stats should produce complete path nodes
            expect(validatePathNodesCompleteness(levelStats as any)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly group path nodes by level', () => {
      fc.assert(
        fc.property(
          fc.array(campaignLevelStatsArb, { minLength: 0, maxLength: 50 }),
          (levelStats) => {
            const groups = groupPathNodesByLevel(levelStats as any);
            
            // Total count should match
            let totalCount = 0;
            for (const [, nodes] of groups) {
              totalCount += nodes.length;
            }
            expect(totalCount).toBe(levelStats.length);
            
            // Each node should be in the correct level group
            for (const [level, nodes] of groups) {
              for (const node of nodes) {
                expect(node.level).toBe(level);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics-ui-reorganization, Property 12: Valuable Campaign Highlighting**
   * **Validates: Requirements 7.5**
   * 
   * For any campaign with tag 1 or 2 in the path analysis, the node should have a visual highlight indicator.
   */
  describe('Property 12: Valuable Campaign Highlighting', () => {
    // Generate valid CampaignLevelStats
    const campaignLevelStatsArb: fc.Arbitrary<{
      campaignId: string;
      subject: string;
      tag: number;
      isValuable: boolean;
      level: number;
      isRoot: boolean;
      userCount: number;
      coverage: number;
    }> = fc.record({
      campaignId: uuidArb,
      subject: fc.string({ minLength: 0, maxLength: 200 }),
      tag: fc.constantFrom(0, 1, 2, 3, 4),
      isValuable: fc.boolean(),
      level: fc.integer({ min: 1, max: 10 }),
      isRoot: fc.boolean(),
      userCount: fc.nat({ max: 10000 }),
      coverage: fc.double({ min: 0, max: 100, noNaN: true }),
    });

    it('should highlight campaigns with tag 1 (有价值)', () => {
      fc.assert(
        fc.property(
          campaignLevelStatsArb.map(stat => ({ ...stat, tag: 1 })),
          (levelStat) => {
            const pathNode = transformPathNodeForList(levelStat as any);
            
            // Tag 1 should always be highlighted
            expect(pathNode.isHighlighted).toBe(true);
            expect(shouldHighlightPathNode(levelStat)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should highlight campaigns with tag 2 (高价值)', () => {
      fc.assert(
        fc.property(
          campaignLevelStatsArb.map(stat => ({ ...stat, tag: 2 })),
          (levelStat) => {
            const pathNode = transformPathNodeForList(levelStat as any);
            
            // Tag 2 should always be highlighted
            expect(pathNode.isHighlighted).toBe(true);
            expect(shouldHighlightPathNode(levelStat)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should highlight campaigns with isValuable=true regardless of tag', () => {
      fc.assert(
        fc.property(
          campaignLevelStatsArb.map(stat => ({ ...stat, isValuable: true })),
          (levelStat) => {
            const pathNode = transformPathNodeForList(levelStat as any);
            
            // isValuable=true should always be highlighted
            expect(pathNode.isHighlighted).toBe(true);
            expect(shouldHighlightPathNode(levelStat)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not highlight campaigns with tag 0, 3, or 4 when isValuable=false', () => {
      fc.assert(
        fc.property(
          campaignLevelStatsArb.map(stat => ({ 
            ...stat, 
            tag: fc.sample(fc.constantFrom(0, 3, 4), 1)[0],
            isValuable: false 
          })),
          (levelStat) => {
            const pathNode = transformPathNodeForList(levelStat as any);
            
            // Non-valuable tags with isValuable=false should not be highlighted
            expect(pathNode.isHighlighted).toBe(false);
            expect(shouldHighlightPathNode(levelStat)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify all highlighted nodes in a list', () => {
      fc.assert(
        fc.property(
          fc.array(campaignLevelStatsArb, { minLength: 0, maxLength: 50 }),
          (levelStats) => {
            const highlightedNodes = getHighlightedPathNodes(levelStats as any);
            
            // All highlighted nodes should have tag 1, 2, or isValuable=true
            for (const node of highlightedNodes) {
              expect(shouldHighlightPathNode(node)).toBe(true);
            }
            
            // Count should match
            const expectedCount = levelStats.filter(s => 
              s.tag === 1 || s.tag === 2 || s.isValuable
            ).length;
            expect(highlightedNodes.length).toBe(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate valuable campaign highlighting for any array of level stats', () => {
      fc.assert(
        fc.property(
          fc.array(campaignLevelStatsArb, { minLength: 0, maxLength: 50 }),
          (levelStats) => {
            // All valid level stats should have correct highlighting
            expect(validateValuableCampaignHighlighting(levelStats as any)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve highlighting consistency after transformation', () => {
      fc.assert(
        fc.property(
          fc.array(campaignLevelStatsArb, { minLength: 1, maxLength: 50 }),
          (levelStats) => {
            const pathNodes = transformPathNodesForList(levelStats as any);
            
            // Each path node's isHighlighted should match the shouldHighlightPathNode result
            for (let i = 0; i < levelStats.length; i++) {
              const expected = shouldHighlightPathNode(levelStats[i]);
              expect(pathNodes[i].isHighlighted).toBe(expected);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: campaign-analytics-ui-reorganization, Property 13: Section State Isolation**
   * **Validates: Requirements 8.4**
   * 
   * For any operation in one section, the state of other sections should remain unchanged.
   */
  describe('Property 13: Section State Isolation', () => {
    // Generate valid page state
    const pageStateArb: fc.Arbitrary<CampaignPageState> = fc.record({
      selectedWorkerName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
      merchants: fc.array(
        fc.record({
          id: uuidArb,
          domain: domainArb,
          totalCampaigns: fc.nat({ max: 1000 }),
          totalEmails: fc.nat({ max: 100000 }),
          hasProject: fc.boolean(),
        }),
        { minLength: 0, maxLength: 20 }
      ),
      merchantSortField: fc.constantFrom('emails', 'campaigns') as fc.Arbitrary<'emails' | 'campaigns'>,
      merchantSortOrder: fc.constantFrom('asc', 'desc') as fc.Arbitrary<'asc' | 'desc'>,
      projects: fc.array(
        fc.record({
          id: uuidArb,
          name: fc.string({ minLength: 1, maxLength: 100 }),
          merchantDomain: fc.string({ minLength: 1, maxLength: 50 }),
          status: fc.constantFrom('active', 'completed', 'archived'),
          createdAt: fc.date(),
        }),
        { minLength: 0, maxLength: 20 }
      ),
      projectStatusFilter: fc.constantFrom('', 'active', 'completed', 'archived'),
      selectedProjectId: fc.option(uuidArb, { nil: null }),
      selectedMerchantId: fc.option(uuidArb, { nil: null }),
      activeDetailTab: fc.constantFrom('root', 'campaigns', 'path') as fc.Arbitrary<'root' | 'campaigns' | 'path'>,
      projectDetailVisible: fc.boolean(),
    });

    describe('Merchant section operations should not affect other sections', () => {
      it('should not change project section when updating merchant list', () => {
        fc.assert(
          fc.property(
            pageStateArb,
            fc.array(
              fc.record({
                id: uuidArb,
                domain: domainArb,
                totalCampaigns: fc.nat({ max: 1000 }),
                totalEmails: fc.nat({ max: 100000 }),
                hasProject: fc.boolean(),
              }),
              { minLength: 0, maxLength: 20 }
            ),
            (initialState, newMerchants) => {
              const newState = updateMerchantList(initialState, newMerchants);
              
              // Project section should be unchanged
              expect(validateProjectSectionUnchanged(initialState, newState)).toBe(true);
              // Detail section should be unchanged
              expect(validateDetailSectionUnchanged(initialState, newState)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should not change project or detail sections when updating merchant sort', () => {
        fc.assert(
          fc.property(
            pageStateArb,
            fc.constantFrom('emails', 'campaigns') as fc.Arbitrary<'emails' | 'campaigns'>,
            fc.constantFrom('asc', 'desc') as fc.Arbitrary<'asc' | 'desc'>,
            (initialState, sortField, sortOrder) => {
              const newState = updateMerchantSort(initialState, sortField, sortOrder);
              
              // Project section should be unchanged
              expect(validateProjectSectionUnchanged(initialState, newState)).toBe(true);
              // Detail section should be unchanged
              expect(validateDetailSectionUnchanged(initialState, newState)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Project section operations should not affect other sections', () => {
      it('should not change merchant section when updating project list', () => {
        fc.assert(
          fc.property(
            pageStateArb,
            fc.array(
              fc.record({
                id: uuidArb,
                name: fc.string({ minLength: 1, maxLength: 100 }),
                merchantDomain: fc.string({ minLength: 1, maxLength: 50 }),
                status: fc.constantFrom('active', 'completed', 'archived'),
                createdAt: fc.date(),
              }),
              { minLength: 0, maxLength: 20 }
            ),
            (initialState, newProjects) => {
              const newState = updateProjectList(initialState, newProjects);
              
              // Merchant section should be unchanged
              expect(validateMerchantSectionUnchanged(initialState, newState)).toBe(true);
              // Detail section should be unchanged
              expect(validateDetailSectionUnchanged(initialState, newState)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should not change merchant or detail sections when updating project status filter', () => {
        fc.assert(
          fc.property(
            pageStateArb,
            fc.constantFrom('', 'active', 'completed', 'archived'),
            (initialState, statusFilter) => {
              const newState = updateProjectStatusFilter(initialState, statusFilter);
              
              // Merchant section should be unchanged
              expect(validateMerchantSectionUnchanged(initialState, newState)).toBe(true);
              // Detail section should be unchanged
              expect(validateDetailSectionUnchanged(initialState, newState)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Detail section operations should not affect other sections', () => {
      it('should not change merchant or project sections when selecting a project', () => {
        fc.assert(
          fc.property(
            pageStateArb,
            uuidArb,
            uuidArb,
            (initialState, projectId, merchantId) => {
              const newState = selectProject(initialState, projectId, merchantId);
              
              // Merchant section should be unchanged
              expect(validateMerchantSectionUnchanged(initialState, newState)).toBe(true);
              // Project section should be unchanged
              expect(validateProjectSectionUnchanged(initialState, newState)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should not change merchant or project sections when deselecting a project', () => {
        fc.assert(
          fc.property(
            pageStateArb,
            (initialState) => {
              const newState = deselectProject(initialState);
              
              // Merchant section should be unchanged
              expect(validateMerchantSectionUnchanged(initialState, newState)).toBe(true);
              // Project section should be unchanged
              expect(validateProjectSectionUnchanged(initialState, newState)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should not change merchant or project sections when switching detail tab', () => {
        fc.assert(
          fc.property(
            pageStateArb,
            fc.constantFrom('root', 'campaigns', 'path') as fc.Arbitrary<'root' | 'campaigns' | 'path'>,
            (initialState, tab) => {
              const newState = switchDetailTab(initialState, tab);
              
              // Merchant section should be unchanged
              expect(validateMerchantSectionUnchanged(initialState, newState)).toBe(true);
              // Project section should be unchanged
              expect(validateProjectSectionUnchanged(initialState, newState)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Instance change should clear project selection but preserve list data', () => {
      it('should clear project selection when changing worker instance', () => {
        fc.assert(
          fc.property(
            pageStateArb,
            fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
            (initialState, newWorkerName) => {
              const newState = changeWorkerInstance(initialState, newWorkerName);
              
              // Project selection should be cleared
              expect(newState.selectedProjectId).toBeNull();
              expect(newState.selectedMerchantId).toBeNull();
              expect(newState.projectDetailVisible).toBe(false);
              
              // Worker name should be updated
              expect(newState.selectedWorkerName).toBe(newWorkerName);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should preserve merchant list data when changing worker instance', () => {
        fc.assert(
          fc.property(
            pageStateArb,
            fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
            (initialState, newWorkerName) => {
              const newState = changeWorkerInstance(initialState, newWorkerName);
              
              // Merchant list data should be preserved (will be refreshed by API call)
              expect(newState.merchants).toEqual(initialState.merchants);
              expect(newState.merchantSortField).toBe(initialState.merchantSortField);
              expect(newState.merchantSortOrder).toBe(initialState.merchantSortOrder);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should preserve project list data when changing worker instance', () => {
        fc.assert(
          fc.property(
            pageStateArb,
            fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
            (initialState, newWorkerName) => {
              const newState = changeWorkerInstance(initialState, newWorkerName);
              
              // Project list data should be preserved (will be refreshed by API call)
              expect(newState.projects).toEqual(initialState.projects);
              expect(newState.projectStatusFilter).toBe(initialState.projectStatusFilter);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Project detail visibility', () => {
      it('should show project detail when project is selected and visible flag is true', () => {
        fc.assert(
          fc.property(
            pageStateArb,
            uuidArb,
            uuidArb,
            (initialState, projectId, merchantId) => {
              const newState = selectProject(initialState, projectId, merchantId);
              
              // Detail should be visible after selection
              expect(shouldShowProjectDetail(newState)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should hide project detail when project is deselected', () => {
        fc.assert(
          fc.property(
            pageStateArb,
            (initialState) => {
              const newState = deselectProject(initialState);
              
              // Detail should be hidden after deselection
              expect(shouldShowProjectDetail(newState)).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should hide project detail when instance is changed', () => {
        fc.assert(
          fc.property(
            pageStateArb,
            fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
            (initialState, newWorkerName) => {
              const newState = changeWorkerInstance(initialState, newWorkerName);
              
              // Detail should be hidden after instance change
              expect(shouldShowProjectDetail(newState)).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Initial state', () => {
      it('should create valid initial state with all sections empty/default', () => {
        const initialState = createInitialPageState();
        
        expect(initialState.selectedWorkerName).toBeNull();
        expect(initialState.merchants).toEqual([]);
        expect(initialState.merchantSortField).toBe('emails');
        expect(initialState.merchantSortOrder).toBe('desc');
        expect(initialState.projects).toEqual([]);
        expect(initialState.projectStatusFilter).toBe('');
        expect(initialState.selectedProjectId).toBeNull();
        expect(initialState.selectedMerchantId).toBeNull();
        expect(initialState.activeDetailTab).toBe('root');
        expect(initialState.projectDetailVisible).toBe(false);
      });

      it('should not show project detail in initial state', () => {
        const initialState = createInitialPageState();
        expect(shouldShowProjectDetail(initialState)).toBe(false);
      });
    });
  });
});
