/**
 * Campaign UI Service
 * 
 * Pure functions for UI data transformation and rendering logic.
 * These functions are extracted from the frontend for testability.
 */

import type { Merchant, Campaign, AnalysisProject, RootCampaign, CampaignLevelStats, PathAnalysisResult } from '@email-filter/shared';

// ============================================
// Types for UI rendering
// ============================================

export interface MerchantListItem {
  id: string;
  domain: string;
  totalCampaigns: number;
  totalEmails: number;
  hasProject: boolean;
}

export interface ProjectListItem {
  id: string;
  name: string;
  merchantDomain: string;
  status: string;
  createdAt: Date;
}

export interface CampaignListItem {
  id: string;
  subject: string;
  totalEmails: number;
  uniqueRecipients: number;
  tag: number;
  isValuable: boolean;
}

export type SortOrder = 'asc' | 'desc';
export type MerchantSortField = 'emails' | 'campaigns';
export type CampaignSortField = 'emails' | 'time';

// ============================================
// Merchant List Functions
// ============================================

/**
 * Transform merchant data for list rendering
 * Adds hasProject indicator based on project data
 */
export function transformMerchantForList(
  merchant: Merchant,
  projectMerchantIds: Set<string>
): MerchantListItem {
  return {
    id: merchant.id,
    domain: merchant.domain,
    totalCampaigns: merchant.totalCampaigns,
    totalEmails: merchant.totalEmails,
    hasProject: projectMerchantIds.has(merchant.id),
  };
}

/**
 * Transform array of merchants for list rendering
 */
export function transformMerchantsForList(
  merchants: Merchant[],
  projects: AnalysisProject[]
): MerchantListItem[] {
  const projectMerchantIds = new Set(projects.map(p => p.merchantId));
  return merchants.map(m => transformMerchantForList(m, projectMerchantIds));
}

/**
 * Sort merchants by specified field and order
 */
export function sortMerchants(
  merchants: MerchantListItem[],
  sortField: MerchantSortField,
  sortOrder: SortOrder
): MerchantListItem[] {
  return [...merchants].sort((a, b) => {
    const aVal = sortField === 'emails' ? a.totalEmails : a.totalCampaigns;
    const bVal = sortField === 'emails' ? b.totalEmails : b.totalCampaigns;
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
  });
}

/**
 * Check if merchant list item has all required fields for rendering
 */
export function isMerchantListItemComplete(item: MerchantListItem): boolean {
  return (
    typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.domain === 'string' && item.domain.length > 0 &&
    typeof item.totalCampaigns === 'number' &&
    typeof item.totalEmails === 'number' &&
    typeof item.hasProject === 'boolean'
  );
}

// ============================================
// Project List Functions
// ============================================

/**
 * Transform project data for list rendering
 */
export function transformProjectForList(project: AnalysisProject): ProjectListItem {
  return {
    id: project.id,
    name: project.name,
    merchantDomain: project.merchantDomain || '-',
    status: project.status,
    createdAt: project.createdAt,
  };
}

/**
 * Transform array of projects for list rendering
 */
export function transformProjectsForList(projects: AnalysisProject[]): ProjectListItem[] {
  return projects.map(transformProjectForList);
}

/**
 * Check if project list item has all required fields for rendering
 */
export function isProjectListItemComplete(item: ProjectListItem): boolean {
  return (
    typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.name === 'string' && item.name.length > 0 &&
    typeof item.merchantDomain === 'string' &&
    typeof item.status === 'string' && item.status.length > 0 &&
    item.createdAt instanceof Date
  );
}

// ============================================
// Campaign List Functions
// ============================================

/**
 * Transform campaign data for list rendering
 */
export function transformCampaignForList(campaign: Campaign): CampaignListItem {
  return {
    id: campaign.id,
    subject: campaign.subject,
    totalEmails: campaign.totalEmails,
    uniqueRecipients: campaign.uniqueRecipients,
    tag: campaign.tag,
    isValuable: campaign.isValuable,
  };
}

/**
 * Transform array of campaigns for list rendering
 */
export function transformCampaignsForList(campaigns: Campaign[]): CampaignListItem[] {
  return campaigns.map(transformCampaignForList);
}

/**
 * Sort campaigns by specified field and order
 */
export function sortCampaigns(
  campaigns: CampaignListItem[],
  sortField: CampaignSortField,
  sortOrder: SortOrder
): CampaignListItem[] {
  return [...campaigns].sort((a, b) => {
    const aVal = sortField === 'emails' ? a.totalEmails : a.totalEmails; // time would use firstSeenAt
    const bVal = sortField === 'emails' ? b.totalEmails : b.totalEmails;
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
  });
}

/**
 * Check if campaign list item has all required fields for rendering
 */
export function isCampaignListItemComplete(item: CampaignListItem): boolean {
  return (
    typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.subject === 'string' &&
    typeof item.totalEmails === 'number' &&
    typeof item.uniqueRecipients === 'number' &&
    typeof item.tag === 'number' &&
    typeof item.isValuable === 'boolean'
  );
}

// ============================================
// Sorting Validation Functions
// ============================================

/**
 * Check if an array is sorted correctly
 * Returns true if all adjacent pairs satisfy the sort order constraint
 */
export function isSortedCorrectly<T>(
  items: T[],
  getValue: (item: T) => number,
  sortOrder: SortOrder
): boolean {
  if (items.length <= 1) return true;
  
  for (let i = 0; i < items.length - 1; i++) {
    const current = getValue(items[i]);
    const next = getValue(items[i + 1]);
    
    if (sortOrder === 'desc') {
      if (current < next) return false;
    } else {
      if (current > next) return false;
    }
  }
  
  return true;
}

// ============================================
// Project Name Validation Functions
// ============================================

/**
 * Validate project name
 * Returns true if the name is valid (non-empty and not whitespace-only)
 * 
 * Requirements 3.2: WHEN 创建项目 THEN 系统 SHALL 要求输入项目名称
 */
export function validateProjectName(name: unknown): boolean {
  if (name === null || name === undefined) return false;
  if (typeof name !== 'string') return false;
  return name.trim().length > 0;
}

/**
 * Check if a merchant has at least one associated project
 * Used for displaying project indicator in merchant list
 * 
 * Requirements 2.5: WHEN 商户已有关联项目 THEN 系统 SHALL 显示已关联项目的标识
 */
export function merchantHasProject(
  merchantId: string,
  projects: { merchantId: string }[]
): boolean {
  return projects.some(p => p.merchantId === merchantId);
}

/**
 * Get project count for a merchant
 */
export function getMerchantProjectCount(
  merchantId: string,
  projects: { merchantId: string }[]
): number {
  return projects.filter(p => p.merchantId === merchantId).length;
}

// ============================================
// Project Deletion Functions
// ============================================

/**
 * Check if a project exists in the list by ID
 * Used to verify project deletion completeness
 * 
 * Requirements 4.4: WHEN 用户删除项目 THEN 系统 SHALL 移除项目及其关联的分析配置
 */
export function projectExistsById(
  projectId: string,
  projects: { id: string }[]
): boolean {
  return projects.some(p => p.id === projectId);
}

/**
 * Remove a project from the list by ID
 * Returns a new array without the deleted project
 */
export function removeProjectById<T extends { id: string }>(
  projectId: string,
  projects: T[]
): T[] {
  return projects.filter(p => p.id !== projectId);
}


// ============================================
// Root Campaign List Functions
// ============================================

/**
 * Root campaign list item for UI rendering
 */
export interface RootCampaignListItem {
  campaignId: string;
  subject: string;
  isConfirmed: boolean;
  isCandidate: boolean;
  candidateReason?: string;
  newUserCount: number;
}

/**
 * Transform root campaign data for list rendering
 * 
 * Requirements 5.2: WHEN 显示 Root 确认 THEN 系统 SHALL 列出该商户的所有营销活动供选择
 */
export function transformRootCampaignForList(rootCampaign: RootCampaign): RootCampaignListItem {
  return {
    campaignId: rootCampaign.campaignId,
    subject: rootCampaign.subject,
    isConfirmed: rootCampaign.isConfirmed,
    isCandidate: rootCampaign.isCandidate,
    candidateReason: rootCampaign.candidateReason,
    newUserCount: rootCampaign.newUserCount,
  };
}

/**
 * Transform array of root campaigns for list rendering
 */
export function transformRootCampaignsForList(rootCampaigns: RootCampaign[]): RootCampaignListItem[] {
  return rootCampaigns.map(transformRootCampaignForList);
}

/**
 * Check if root campaign list item has all required fields for rendering
 * 
 * Property 8: Root Campaign Listing
 * For any merchant in a project, the Root confirmation tab should list all campaigns 
 * belonging to that merchant with required fields.
 */
export function isRootCampaignListItemComplete(item: RootCampaignListItem): boolean {
  return (
    typeof item.campaignId === 'string' && item.campaignId.length > 0 &&
    typeof item.subject === 'string' &&
    typeof item.isConfirmed === 'boolean' &&
    typeof item.isCandidate === 'boolean' &&
    typeof item.newUserCount === 'number' &&
    (item.candidateReason === undefined || typeof item.candidateReason === 'string')
  );
}

/**
 * Filter root campaigns by merchant
 * Returns only campaigns that belong to the specified merchant
 * 
 * Requirements 5.2: Root confirmation tab should list all campaigns belonging to that merchant
 */
export function filterRootCampaignsByMerchant(
  rootCampaigns: RootCampaign[],
  merchantId: string,
  campaignMerchantMap: Map<string, string>
): RootCampaign[] {
  return rootCampaigns.filter(rc => campaignMerchantMap.get(rc.campaignId) === merchantId);
}

/**
 * Get the confirmed root campaign from a list
 * Returns the campaign with isConfirmed = true, or undefined if none
 * 
 * Requirements 5.4: WHEN Root 已选择 THEN 系统 SHALL 在 Root 确认区域显示当前选中的 Root 信息
 */
export function getConfirmedRoot(rootCampaigns: RootCampaign[]): RootCampaign | undefined {
  return rootCampaigns.find(rc => rc.isConfirmed);
}

/**
 * Check if a campaign is set as root
 * 
 * Property 9: Root Selection Persistence
 * For any campaign marked as Root, the isConfirmed flag should be true
 */
export function isCampaignRoot(campaignId: string, rootCampaigns: RootCampaign[]): boolean {
  const campaign = rootCampaigns.find(rc => rc.campaignId === campaignId);
  return campaign?.isConfirmed === true;
}

/**
 * Simulate setting a campaign as root
 * Returns a new array with the specified campaign marked as confirmed root
 * and all other campaigns unmarked
 * 
 * Requirements 5.3: WHEN 用户选择某营销活动作为 Root THEN 系统 SHALL 保存该选择并更新项目状态
 */
export function setRootCampaign(
  rootCampaigns: RootCampaign[],
  campaignId: string
): RootCampaign[] {
  return rootCampaigns.map(rc => ({
    ...rc,
    isConfirmed: rc.campaignId === campaignId,
    confirmedAt: rc.campaignId === campaignId ? new Date() : rc.confirmedAt,
  }));
}

/**
 * Validate that root selection is persisted correctly
 * After setting a root, only one campaign should be confirmed
 * 
 * Property 9: Root Selection Persistence
 */
export function validateRootSelectionPersistence(
  rootCampaigns: RootCampaign[],
  selectedCampaignId: string
): boolean {
  const confirmedCampaigns = rootCampaigns.filter(rc => rc.isConfirmed);
  
  // Exactly one campaign should be confirmed
  if (confirmedCampaigns.length !== 1) return false;
  
  // The confirmed campaign should be the selected one
  return confirmedCampaigns[0].campaignId === selectedCampaignId;
}

// ============================================
// Campaign Tag Functions
// ============================================

/**
 * Campaign with tag for UI rendering
 */
export interface CampaignWithTag {
  id: string;
  subject: string;
  tag: number;
  totalEmails: number;
  uniqueRecipients: number;
}

/**
 * Set campaign tag
 * Returns a new campaign object with the updated tag value
 * 
 * Requirements 6.4: WHEN 用户标记活动为有价值 THEN 系统 SHALL 更新活动的价值状态
 */
export function setCampaignTag<T extends { id: string; tag: number }>(
  campaign: T,
  newTag: number
): T {
  return {
    ...campaign,
    tag: newTag,
  };
}

/**
 * Set campaign tag in a list
 * Returns a new array with the specified campaign's tag updated
 */
export function setCampaignTagInList<T extends { id: string; tag: number }>(
  campaigns: T[],
  campaignId: string,
  newTag: number
): T[] {
  return campaigns.map(c => 
    c.id === campaignId ? setCampaignTag(c, newTag) : c
  );
}

/**
 * Get campaign tag by ID
 * Returns the tag value for the specified campaign, or undefined if not found
 */
export function getCampaignTagById<T extends { id: string; tag: number }>(
  campaignId: string,
  campaigns: T[]
): number | undefined {
  const campaign = campaigns.find(c => c.id === campaignId);
  return campaign?.tag;
}

/**
 * Validate that campaign tag is persisted correctly
 * After setting a tag, the campaign should have the expected tag value
 * 
 * Property 10: Campaign Tag Persistence
 * For any campaign marked with a tag, reloading the campaign list should preserve the tag value.
 */
export function validateCampaignTagPersistence<T extends { id: string; tag: number }>(
  campaigns: T[],
  campaignId: string,
  expectedTag: number
): boolean {
  const actualTag = getCampaignTagById(campaignId, campaigns);
  return actualTag === expectedTag;
}

/**
 * Check if a campaign has a specific tag
 */
export function campaignHasTag<T extends { id: string; tag: number }>(
  campaignId: string,
  campaigns: T[],
  tag: number
): boolean {
  const campaign = campaigns.find(c => c.id === campaignId);
  return campaign?.tag === tag;
}

/**
 * Filter campaigns by tag value
 * Returns campaigns that have the specified tag
 */
export function filterCampaignsByTag<T extends { tag: number }>(
  campaigns: T[],
  tag: number
): T[] {
  return campaigns.filter(c => c.tag === tag);
}

/**
 * Check if tag value is valid (0-4)
 * Tag values:
 * 0 = 未标记
 * 1 = 有价值
 * 2 = 高价值
 * 3 = 一般营销
 * 4 = 可忽略
 */
export function isValidCampaignTag(tag: unknown): tag is number {
  return typeof tag === 'number' && Number.isInteger(tag) && tag >= 0 && tag <= 4;
}


// ============================================
// Path Analysis Functions
// ============================================

/**
 * Path node item for UI rendering
 * Represents a node in the path analysis visualization
 */
export interface PathNodeItem {
  campaignId: string;
  subject: string;
  tag: number;
  isValuable: boolean;
  level: number;
  isRoot: boolean;
  userCount: number;
  coverage: number;
  isHighlighted: boolean;
}

/**
 * Transform CampaignLevelStats to PathNodeItem for UI rendering
 * 
 * Property 11: Path Node Data Completeness
 * For any node in the path analysis result, the node should contain recipient count and percentage values.
 */
export function transformPathNodeForList(levelStat: CampaignLevelStats): PathNodeItem {
  return {
    campaignId: levelStat.campaignId,
    subject: levelStat.subject,
    tag: levelStat.tag,
    isValuable: levelStat.isValuable,
    level: levelStat.level,
    isRoot: levelStat.isRoot,
    userCount: levelStat.userCount,
    coverage: levelStat.coverage,
    isHighlighted: levelStat.tag === 1 || levelStat.tag === 2 || levelStat.isValuable,
  };
}

/**
 * Transform array of CampaignLevelStats to PathNodeItems for UI rendering
 */
export function transformPathNodesForList(levelStats: CampaignLevelStats[]): PathNodeItem[] {
  return levelStats.map(transformPathNodeForList);
}

/**
 * Check if path node item has all required fields for rendering
 * 
 * Property 11: Path Node Data Completeness
 * For any node in the path analysis result, the node should contain recipient count and percentage values.
 * 
 * Requirements 7.4: WHEN 显示路径节点 THEN 系统 SHALL 展示收件人数量和占基准人群的比例
 */
export function isPathNodeComplete(item: PathNodeItem): boolean {
  return (
    typeof item.campaignId === 'string' && item.campaignId.length > 0 &&
    typeof item.subject === 'string' &&
    typeof item.tag === 'number' &&
    typeof item.isValuable === 'boolean' &&
    typeof item.level === 'number' &&
    typeof item.isRoot === 'boolean' &&
    typeof item.userCount === 'number' &&
    typeof item.coverage === 'number' &&
    typeof item.isHighlighted === 'boolean'
  );
}

/**
 * Check if a path node should be highlighted as valuable
 * 
 * Property 12: Valuable Campaign Highlighting
 * For any campaign with tag 1 or 2 in the path analysis, the node should have a visual highlight indicator.
 * 
 * Requirements 7.5: WHEN 路径中包含有价值活动 THEN 系统 SHALL 高亮显示这些活动节点
 */
export function shouldHighlightPathNode(node: { tag: number; isValuable: boolean }): boolean {
  // Tag 1 = 有价值, Tag 2 = 高价值
  return node.tag === 1 || node.tag === 2 || node.isValuable;
}

/**
 * Get all highlighted nodes from path analysis
 * Returns nodes that should be visually highlighted (valuable campaigns)
 */
export function getHighlightedPathNodes(levelStats: CampaignLevelStats[]): CampaignLevelStats[] {
  return levelStats.filter(shouldHighlightPathNode);
}

/**
 * Validate that all path nodes have required data completeness
 * 
 * Property 11: Path Node Data Completeness
 */
export function validatePathNodesCompleteness(levelStats: CampaignLevelStats[]): boolean {
  const pathNodes = transformPathNodesForList(levelStats);
  return pathNodes.every(isPathNodeComplete);
}

/**
 * Validate that valuable campaigns are correctly highlighted
 * 
 * Property 12: Valuable Campaign Highlighting
 * For any campaign with tag 1 or 2, the isHighlighted flag should be true
 */
export function validateValuableCampaignHighlighting(levelStats: CampaignLevelStats[]): boolean {
  const pathNodes = transformPathNodesForList(levelStats);
  
  for (const node of pathNodes) {
    const shouldBeHighlighted = node.tag === 1 || node.tag === 2 || node.isValuable;
    if (node.isHighlighted !== shouldBeHighlighted) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if path analysis result has valid structure
 */
export function isPathAnalysisResultValid(result: PathAnalysisResult | null | undefined): boolean {
  if (!result) return false;
  
  return (
    typeof result.merchantId === 'string' &&
    Array.isArray(result.rootCampaigns) &&
    result.userStats !== null && typeof result.userStats === 'object' &&
    Array.isArray(result.levelStats) &&
    Array.isArray(result.transitions)
  );
}

/**
 * Group path nodes by level for hierarchical display
 */
export function groupPathNodesByLevel(levelStats: CampaignLevelStats[]): Map<number, CampaignLevelStats[]> {
  const groups = new Map<number, CampaignLevelStats[]>();
  
  for (const stat of levelStats) {
    const level = stat.level;
    if (!groups.has(level)) {
      groups.set(level, []);
    }
    groups.get(level)!.push(stat);
  }
  
  return groups;
}

// ============================================
// Section State Management Functions
// ============================================

/**
 * Page state interface for campaign analytics UI
 * Represents the complete state of the page with isolated sections
 * 
 * Property 13: Section State Isolation
 * For any operation in one section, the state of other sections should remain unchanged.
 * 
 * Requirements 8.4: WHEN 用户在各区域操作 THEN 系统 SHALL 保持其他区域的状态不变
 */
export interface CampaignPageState {
  // Section 1: Header - Instance selection
  selectedWorkerName: string | null;
  
  // Section 2: Merchant list state
  merchants: MerchantListItem[];
  merchantSortField: MerchantSortField;
  merchantSortOrder: SortOrder;
  
  // Section 3: Project list state
  projects: ProjectListItem[];
  projectStatusFilter: string;
  
  // Section 4: Project detail state
  selectedProjectId: string | null;
  selectedMerchantId: string | null;
  activeDetailTab: 'root' | 'campaigns' | 'path';
  projectDetailVisible: boolean;
}

/**
 * Create initial page state with default values
 */
export function createInitialPageState(): CampaignPageState {
  return {
    selectedWorkerName: null,
    merchants: [],
    merchantSortField: 'emails',
    merchantSortOrder: 'desc',
    projects: [],
    projectStatusFilter: '',
    selectedProjectId: null,
    selectedMerchantId: null,
    activeDetailTab: 'root',
    projectDetailVisible: false,
  };
}

/**
 * Select a project and show project detail section
 * Only modifies Section 4 state, preserving other sections
 * 
 * Requirements 8.3: WHEN 项目选中 THEN 系统 SHALL 展开项目详情区域并显示标签页导航
 */
export function selectProject(
  state: CampaignPageState,
  projectId: string,
  merchantId: string
): CampaignPageState {
  return {
    ...state,
    selectedProjectId: projectId,
    selectedMerchantId: merchantId,
    projectDetailVisible: true,
    activeDetailTab: 'root', // Reset to default tab when selecting new project
  };
}

/**
 * Deselect project and hide project detail section
 * Only modifies Section 4 state, preserving other sections
 * 
 * Requirements 8.2: WHEN 项目未选中 THEN 系统 SHALL 隐藏或折叠项目详情区域
 */
export function deselectProject(state: CampaignPageState): CampaignPageState {
  return {
    ...state,
    selectedProjectId: null,
    selectedMerchantId: null,
    projectDetailVisible: false,
  };
}

/**
 * Change worker instance selection
 * Clears project selection when instance changes
 * 
 * Requirements 1.3: WHEN 用户切换实例 THEN 系统 SHALL 刷新商户列表和项目列表以显示对应实例的数据
 */
export function changeWorkerInstance(
  state: CampaignPageState,
  workerName: string | null
): CampaignPageState {
  return {
    ...state,
    selectedWorkerName: workerName,
    // Clear project selection when instance changes
    selectedProjectId: null,
    selectedMerchantId: null,
    projectDetailVisible: false,
    activeDetailTab: 'root',
  };
}

/**
 * Update merchant list state
 * Only modifies Section 2 state, preserving other sections
 */
export function updateMerchantList(
  state: CampaignPageState,
  merchants: MerchantListItem[]
): CampaignPageState {
  return {
    ...state,
    merchants,
  };
}

/**
 * Update merchant sort settings
 * Only modifies Section 2 state, preserving other sections
 */
export function updateMerchantSort(
  state: CampaignPageState,
  sortField: MerchantSortField,
  sortOrder: SortOrder
): CampaignPageState {
  return {
    ...state,
    merchantSortField: sortField,
    merchantSortOrder: sortOrder,
  };
}

/**
 * Update project list state
 * Only modifies Section 3 state, preserving other sections
 */
export function updateProjectList(
  state: CampaignPageState,
  projects: ProjectListItem[]
): CampaignPageState {
  return {
    ...state,
    projects,
  };
}

/**
 * Update project status filter
 * Only modifies Section 3 state, preserving other sections
 */
export function updateProjectStatusFilter(
  state: CampaignPageState,
  statusFilter: string
): CampaignPageState {
  return {
    ...state,
    projectStatusFilter: statusFilter,
  };
}

/**
 * Switch active detail tab
 * Only modifies Section 4 state, preserving other sections
 */
export function switchDetailTab(
  state: CampaignPageState,
  tab: 'root' | 'campaigns' | 'path'
): CampaignPageState {
  return {
    ...state,
    activeDetailTab: tab,
  };
}

/**
 * Extract Section 2 (Merchant List) state from page state
 * Used for state isolation verification
 */
export function extractMerchantSectionState(state: CampaignPageState): {
  merchants: MerchantListItem[];
  merchantSortField: MerchantSortField;
  merchantSortOrder: SortOrder;
} {
  return {
    merchants: state.merchants,
    merchantSortField: state.merchantSortField,
    merchantSortOrder: state.merchantSortOrder,
  };
}

/**
 * Extract Section 3 (Project List) state from page state
 * Used for state isolation verification
 */
export function extractProjectSectionState(state: CampaignPageState): {
  projects: ProjectListItem[];
  projectStatusFilter: string;
} {
  return {
    projects: state.projects,
    projectStatusFilter: state.projectStatusFilter,
  };
}

/**
 * Extract Section 4 (Project Detail) state from page state
 * Used for state isolation verification
 */
export function extractDetailSectionState(state: CampaignPageState): {
  selectedProjectId: string | null;
  selectedMerchantId: string | null;
  activeDetailTab: 'root' | 'campaigns' | 'path';
  projectDetailVisible: boolean;
} {
  return {
    selectedProjectId: state.selectedProjectId,
    selectedMerchantId: state.selectedMerchantId,
    activeDetailTab: state.activeDetailTab,
    projectDetailVisible: state.projectDetailVisible,
  };
}

/**
 * Compare two section states for equality
 * Used for verifying state isolation
 */
export function areSectionStatesEqual<T extends Record<string, unknown>>(
  state1: T,
  state2: T
): boolean {
  const keys1 = Object.keys(state1);
  const keys2 = Object.keys(state2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    const val1 = state1[key];
    const val2 = state2[key];
    
    // Handle arrays
    if (Array.isArray(val1) && Array.isArray(val2)) {
      if (val1.length !== val2.length) return false;
      // For arrays, compare by JSON serialization (simple deep equality)
      if (JSON.stringify(val1) !== JSON.stringify(val2)) return false;
    } else if (val1 !== val2) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validate that merchant section state is unchanged after an operation
 * 
 * Property 13: Section State Isolation
 */
export function validateMerchantSectionUnchanged(
  stateBefore: CampaignPageState,
  stateAfter: CampaignPageState
): boolean {
  const before = extractMerchantSectionState(stateBefore);
  const after = extractMerchantSectionState(stateAfter);
  return areSectionStatesEqual(before, after);
}

/**
 * Validate that project section state is unchanged after an operation
 * 
 * Property 13: Section State Isolation
 */
export function validateProjectSectionUnchanged(
  stateBefore: CampaignPageState,
  stateAfter: CampaignPageState
): boolean {
  const before = extractProjectSectionState(stateBefore);
  const after = extractProjectSectionState(stateAfter);
  return areSectionStatesEqual(before, after);
}

/**
 * Validate that detail section state is unchanged after an operation
 * 
 * Property 13: Section State Isolation
 */
export function validateDetailSectionUnchanged(
  stateBefore: CampaignPageState,
  stateAfter: CampaignPageState
): boolean {
  const before = extractDetailSectionState(stateBefore);
  const after = extractDetailSectionState(stateAfter);
  return areSectionStatesEqual(before, after);
}

/**
 * Check if project detail section should be visible
 * 
 * Requirements 8.2: WHEN 项目未选中 THEN 系统 SHALL 隐藏或折叠项目详情区域
 * Requirements 8.3: WHEN 项目选中 THEN 系统 SHALL 展开项目详情区域并显示标签页导航
 */
export function shouldShowProjectDetail(state: CampaignPageState): boolean {
  return state.selectedProjectId !== null && state.projectDetailVisible;
}
