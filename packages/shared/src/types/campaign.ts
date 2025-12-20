/**
 * Campaign Analytics Types
 * Types for tracking and analyzing marketing campaigns
 */

// ============================================
// Campaign Tag Types (营销活动标签)
// ============================================

/**
 * Campaign tag values
 * 1 = 包含折扣码，高价值活动
 * 2 = 重要营销活动
 * 3 = 一般营销活动
 * 4 = 可忽略的营销活动 (不参与后续分析)
 * 0 = 未标记
 */
export type CampaignTag = 0 | 1 | 2 | 3 | 4;

/**
 * Campaign tag labels for display
 */
export const CampaignTagLabels: Record<CampaignTag, string> = {
  0: '未标记',
  1: '高价值（含折扣码）',
  2: '重要营销',
  3: '一般营销',
  4: '可忽略',
};

/**
 * Campaign tag colors for UI
 */
export const CampaignTagColors: Record<CampaignTag, { bg: string; text: string; border: string }> = {
  0: { bg: '#f8f9fa', text: '#666', border: '#ddd' },
  1: { bg: '#d4edda', text: '#155724', border: '#28a745' },
  2: { bg: '#cce5ff', text: '#004085', border: '#007bff' },
  3: { bg: '#fff3cd', text: '#856404', border: '#ffc107' },
  4: { bg: '#f8d7da', text: '#721c24', border: '#dc3545' },
};

// ============================================
// Core Entity Types
// ============================================

/**
 * Merchant analysis status
 * pending = 等待分析 (新发现的商户默认状态)
 * active = 需要分析 (用户确认需要进行营销分析)
 * ignored = 忽略 (不需要进行营销分析)
 */
export type MerchantAnalysisStatus = 'pending' | 'active' | 'ignored';

/**
 * Merchant analysis status labels
 */
export const MerchantAnalysisStatusLabels: Record<MerchantAnalysisStatus, string> = {
  pending: '等待分析',
  active: '分析中',
  ignored: '已忽略',
};

/**
 * Merchant entity - represents a sender domain
 */
export interface Merchant {
  id: string;
  domain: string;
  displayName?: string;
  note?: string;
  analysisStatus: MerchantAnalysisStatus; // 分析状态
  totalCampaigns: number;
  valuableCampaigns: number; // Count of campaigns with tag 1 or 2
  totalEmails: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Merchant grouped by Worker instance
 * Used for displaying merchants with their Worker source
 * 
 * Requirements: 1.1, 1.2, 1.3
 */
export interface MerchantByWorker {
  id: string;
  domain: string;
  displayName?: string;
  note?: string;
  workerName: string;
  totalCampaigns: number;
  totalEmails: number;
}

/**
 * Campaign entity - represents a unique subject from a merchant
 */
export interface Campaign {
  id: string;
  merchantId: string;
  subject: string;
  tag: CampaignTag; // New: campaign tag (0-4)
  tagNote?: string; // Note for the tag
  isValuable: boolean; // Computed: tag === 1 || tag === 2
  valuableNote?: string; // Deprecated: use tagNote instead
  isRootCandidate: boolean; // 是否为系统候选Root活动
  rootCandidateReason?: string; // 候选原因
  totalEmails: number;
  uniqueRecipients: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Campaign with merchant details
 */
export interface CampaignDetail extends Campaign {
  merchant: Merchant;
  recipientStats: RecipientStat[];
}

/**
 * Statistics for a recipient within a campaign
 */
export interface RecipientStat {
  recipient: string;
  emailCount: number;
  firstReceivedAt: Date;
  lastReceivedAt: Date;
}

// ============================================
// Path Analysis Types
// ============================================

/**
 * Recipient's journey through campaigns for a merchant
 */
export interface RecipientPath {
  merchantId: string;
  recipient: string;
  campaigns: PathCampaign[];
}

/**
 * Campaign entry in a recipient's path
 */
export interface PathCampaign {
  campaignId: string;
  subject: string;
  tag: CampaignTag;
  isValuable: boolean; // Computed: tag === 1 || tag === 2
  sequenceOrder: number;
  firstReceivedAt: Date;
}

// ============================================
// Level Analysis Types
// ============================================

/**
 * Campaign level grouping
 */
export interface CampaignLevel {
  level: number;
  campaigns: LevelCampaign[];
}

/**
 * Campaign at a specific level
 */
export interface LevelCampaign {
  campaignId: string;
  subject: string;
  isValuable: boolean;
  recipientCount: number;
  percentage: number;
}

// ============================================
// Transition Analysis Types (活动转移路径)
// ============================================

/**
 * Campaign transition - represents a transition from one campaign to another
 * 活动转移关系
 */
export interface CampaignTransition {
  fromCampaignId: string;
  fromSubject: string;
  fromIsValuable: boolean;
  toCampaignId: string;
  toSubject: string;
  toIsValuable: boolean;
  userCount: number;
  transitionRatio: number; // Percentage of users who made this transition
}

/**
 * Campaign transitions result
 */
export interface CampaignTransitionsResult {
  merchantId: string;
  totalRecipients: number;
  transitions: CampaignTransition[];
}

/**
 * Path branch analysis - identifies main and secondary paths
 * 路径分支分析
 */
export interface PathBranch {
  path: string[]; // Array of campaign IDs in order
  subjects: string[]; // Corresponding subjects
  userCount: number;
  percentage: number;
  hasValuable: boolean; // Whether this path contains valuable campaigns
  valuableCampaignIds: string[]; // IDs of valuable campaigns in this path
}

/**
 * Path branch analysis result
 */
export interface PathBranchAnalysis {
  merchantId: string;
  totalRecipients: number;
  mainPaths: PathBranch[]; // High frequency paths
  secondaryPaths: PathBranch[]; // Lower frequency paths
  valuablePaths: PathBranch[]; // Paths containing valuable campaigns
}

/**
 * Valuable campaign path analysis
 * 有价值活动路径视图
 */
export interface ValuableCampaignPath {
  campaignId: string;
  subject: string;
  level: number; // Calculated level in DAG
  recipientCount: number;
  percentage: number;
  commonPredecessors: PredecessorInfo[]; // Common campaigns that lead to this one
  commonSuccessors: SuccessorInfo[]; // Common campaigns that follow this one
}

/**
 * Predecessor campaign info
 */
export interface PredecessorInfo {
  campaignId: string;
  subject: string;
  isValuable: boolean;
  transitionCount: number;
  transitionRatio: number;
}

/**
 * Successor campaign info
 */
export interface SuccessorInfo {
  campaignId: string;
  subject: string;
  isValuable: boolean;
  transitionCount: number;
  transitionRatio: number;
}

/**
 * Valuable campaigns analysis result
 */
export interface ValuableCampaignsAnalysis {
  merchantId: string;
  totalValuableCampaigns: number;
  valuableCampaigns: ValuableCampaignPath[];
}

// ============================================
// Root Campaign and New/Old User Types (第一层级和新老用户)
// ============================================

/**
 * Root Campaign - 第一层级活动
 * 用于确定新用户的起点
 */
export interface RootCampaign {
  campaignId: string;
  subject: string;
  isConfirmed: boolean; // 是否人工确认
  isCandidate: boolean; // 是否系统候选
  candidateReason?: string; // 候选原因 (关键词匹配等)
  newUserCount: number; // 通过此活动进入的新用户数
  confirmedAt?: Date;
}

/**
 * Root Campaign 设置 DTO
 */
export interface SetRootCampaignDTO {
  campaignId: string;
  isRoot: boolean;
}

/**
 * 新老用户统计
 */
export interface UserTypeStats {
  merchantId: string;
  totalRecipients: number;
  newUsers: number; // 收到 Root Campaign 的用户
  oldUsers: number; // 未收到 Root Campaign 的用户
  newUserPercentage: number;
}

/**
 * 活动覆盖率统计 (基于新用户)
 */
export interface CampaignCoverage {
  campaignId: string;
  subject: string;
  tag: CampaignTag;
  isValuable: boolean;
  level: number;
  newUserCount: number; // 新用户中收到此活动的数量
  newUserCoverage: number; // 新用户覆盖率 (%)
  oldUserCount: number; // 老用户中收到此活动的数量
  oldUserCoverage: number; // 老用户覆盖率 (%)
  totalCount: number;
}

/**
 * 活动层级表 (基于新用户路径)
 */
export interface CampaignLevelStats {
  campaignId: string;
  subject: string;
  tag: CampaignTag;
  isValuable: boolean;
  level: number;
  isRoot: boolean;
  userCount: number;
  coverage: number; // 基于新用户基准
}

/**
 * 完整路径分析结果
 */
export interface PathAnalysisResult {
  merchantId: string;
  rootCampaigns: RootCampaign[];
  userStats: UserTypeStats;
  levelStats: CampaignLevelStats[];
  transitions: CampaignTransition[];
  valuableAnalysis: ValuableCampaignPath[];
  oldUserStats: CampaignCoverage[]; // 老用户统计
}

// ============================================
// Flow Analysis Types
// ============================================

/**
 * Campaign flow analysis result
 */
export interface CampaignFlow {
  merchantId: string;
  startCampaignId?: string;
  baselineRecipients: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/**
 * Node in the campaign flow graph
 */
export interface FlowNode {
  campaignId: string;
  subject: string;
  isValuable: boolean;
  level: number;
  recipientCount: number;
  percentage: number;
}

/**
 * Edge connecting two campaigns in the flow
 */
export interface FlowEdge {
  from: string;
  to: string;
  recipientCount: number;
  percentage: number;
}

// ============================================
// DTO Types (Data Transfer Objects)
// ============================================

/**
 * DTO for tracking an email
 */
export interface TrackEmailDTO {
  sender: string;
  subject: string;
  recipient: string;
  receivedAt?: string;
  workerName: string; // Worker instance name for data separation (required)
}

/**
 * DTO for batch tracking emails
 */
export interface TrackEmailBatchDTO {
  emails: TrackEmailDTO[];
}

/**
 * Result of tracking an email
 */
export interface TrackResult {
  merchantId: string;
  campaignId: string;
  isNewMerchant: boolean;
  isNewCampaign: boolean;
}

/**
 * DTO for updating merchant information
 */
export interface UpdateMerchantDTO {
  displayName?: string;
  note?: string;
}

/**
 * DTO for marking campaign as valuable (deprecated, use SetCampaignTagDTO)
 */
export interface MarkValuableDTO {
  valuable: boolean;
  note?: string;
}

/**
 * DTO for setting campaign tag
 */
export interface SetCampaignTagDTO {
  tag: CampaignTag;
  note?: string;
}

// ============================================
// Query/Filter Types
// ============================================

/**
 * Filter options for querying campaigns
 */
export interface CampaignFilter {
  merchantId?: string;
  isValuable?: boolean;
  tag?: CampaignTag; // Filter by specific tag
  excludeTag?: CampaignTag; // Exclude campaigns with this tag (e.g., 4 for ignorable)
  workerName?: string; // Filter by single worker instance name
  workerNames?: string[]; // Filter by multiple worker instance names
  sortBy?: 'firstSeenAt' | 'lastSeenAt' | 'totalEmails' | 'uniqueRecipients';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Filter options for querying merchants
 */
export interface MerchantFilter {
  analysisStatus?: MerchantAnalysisStatus; // Filter by analysis status
  workerName?: string; // Filter by worker instance name
  sortBy?: 'domain' | 'totalCampaigns' | 'totalEmails' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * DTO for setting merchant analysis status
 */
export interface SetMerchantAnalysisStatusDTO {
  status: MerchantAnalysisStatus;
  workerName?: string; // Optional worker name for per-instance status
}

/**
 * DTO for deleting merchant data
 */
export interface DeleteMerchantDataDTO {
  merchantId: string;
  workerName: string;
}

/**
 * Result of deleting merchant data
 */
export interface DeleteMerchantDataResult {
  merchantId: string;
  workerName: string;
  emailsDeleted: number;
  pathsDeleted: number;
  campaignsAffected: number;
  merchantDeleted: boolean; // true if merchant record was also deleted
}

// ============================================
// Analysis Project Types
// ============================================

/**
 * Analysis project status
 */
export type AnalysisProjectStatus = 'active' | 'completed' | 'archived';

/**
 * Analysis project status labels
 */
export const AnalysisProjectStatusLabels: Record<AnalysisProjectStatus, string> = {
  active: '进行中',
  completed: '已完成',
  archived: '已归档',
};

/**
 * Analysis project entity - represents a project for analyzing a merchant's campaigns
 */
export interface AnalysisProject {
  id: string;
  name: string;
  merchantId: string;
  workerName: string;
  workerNames?: string[];  // 多 Worker 列表（新增），空数组或 undefined 表示使用 workerName
  status: AnalysisProjectStatus;
  note?: string;
  // Computed fields from merchant
  merchantDomain?: string;
  totalCampaigns?: number;
  totalEmails?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for creating an analysis project
 */
export interface CreateAnalysisProjectDTO {
  name: string;
  merchantId: string;
  workerName: string;
  workerNames?: string[];  // 多 Worker 列表（新增），支持单选、多选、全选模式
  note?: string;
}

/**
 * DTO for updating an analysis project
 */
export interface UpdateAnalysisProjectDTO {
  name?: string;
  status?: AnalysisProjectStatus;
  workerNames?: string[];  // 多 Worker 列表（新增）
  note?: string;
}

/**
 * Raw analysis project row from database
 */
export interface AnalysisProjectRow {
  id: string;
  name: string;
  merchant_id: string;
  worker_name: string;
  worker_names: string | null;  // JSON 数组字符串
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  merchant_domain?: string;
  total_campaigns?: number;
  total_emails?: number;
}

// ============================================
// Database Row Types (for internal use)
// ============================================

/**
 * Raw merchant row from database
 */
export interface MerchantRow {
  id: string;
  domain: string;
  display_name: string | null;
  note: string | null;
  analysis_status: string | null; // pending, active, ignored
  total_campaigns: number;
  valuable_campaigns: number;
  total_emails: number;
  created_at: string;
  updated_at: string;
}

/**
 * Raw campaign row from database
 */
export interface CampaignRow {
  id: string;
  merchant_id: string;
  subject: string;
  subject_hash: string;
  tag: number; // 0-4
  tag_note: string | null;
  is_valuable: number; // Deprecated, computed from tag
  valuable_note: string | null; // Deprecated, use tag_note
  is_root: number; // 是否为第一层级活动
  is_root_candidate: number; // 是否为系统候选
  root_candidate_reason: string | null; // 候选原因
  total_emails: number;
  unique_recipients: number;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Raw campaign email row from database
 */
export interface CampaignEmailRow {
  id: number;
  campaign_id: string;
  recipient: string;
  received_at: string;
}

/**
 * Raw recipient path row from database
 */
export interface RecipientPathRow {
  id: number;
  merchant_id: string;
  recipient: string;
  campaign_id: string;
  sequence_order: number;
  first_received_at: string;
  is_new_user: number; // 是否为新用户 (收到 Root Campaign)
  first_root_campaign_id: string | null; // 第一个收到的 Root Campaign
}

// ============================================
// Utility Functions for Type Conversion
// ============================================

/**
 * Convert MerchantRow to Merchant
 */
export function toMerchant(row: MerchantRow): Merchant {
  return {
    id: row.id,
    domain: row.domain,
    displayName: row.display_name ?? undefined,
    note: row.note ?? undefined,
    analysisStatus: (row.analysis_status as MerchantAnalysisStatus) || 'pending',
    totalCampaigns: row.total_campaigns,
    valuableCampaigns: row.valuable_campaigns ?? 0,
    totalEmails: row.total_emails,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Convert CampaignRow to Campaign
 */
export function toCampaign(row: CampaignRow): Campaign {
  const tag = (row.tag ?? 0) as CampaignTag;
  return {
    id: row.id,
    merchantId: row.merchant_id,
    subject: row.subject,
    tag,
    tagNote: row.tag_note ?? undefined,
    isValuable: tag === 1 || tag === 2, // High value or important
    valuableNote: row.valuable_note ?? row.tag_note ?? undefined, // Backward compatibility
    isRootCandidate: row.is_root_candidate === 1,
    rootCandidateReason: row.root_candidate_reason ?? undefined,
    totalEmails: row.total_emails,
    uniqueRecipients: row.unique_recipients,
    firstSeenAt: new Date(row.first_seen_at),
    lastSeenAt: new Date(row.last_seen_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Root Campaign 关键词列表 (用于自动候选)
 */
export const ROOT_CAMPAIGN_KEYWORDS = [
  'welcome',
  'onboarding',
  'confirm',
  'verify',
  'activate',
  'get started',
  'first',
  '欢迎',
  '确认',
  '验证',
  '激活',
  '开始',
];

/**
 * Convert AnalysisProjectRow to AnalysisProject
 */
export function toAnalysisProject(row: AnalysisProjectRow): AnalysisProject {
  // Parse worker_names JSON string to array
  let workerNames: string[] | undefined;
  if (row.worker_names) {
    try {
      workerNames = JSON.parse(row.worker_names);
    } catch {
      workerNames = undefined;
    }
  }

  return {
    id: row.id,
    name: row.name,
    merchantId: row.merchant_id,
    workerName: row.worker_name,
    workerNames,
    status: (row.status as AnalysisProjectStatus) || 'active',
    note: row.note ?? undefined,
    merchantDomain: row.merchant_domain ?? undefined,
    totalCampaigns: row.total_campaigns ?? 0,
    totalEmails: row.total_emails ?? 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ============================================
// Project-Level Path Analysis Types (项目级路径分析)
// ============================================

/**
 * Project Root Campaign - 项目级Root活动设置
 * 每个项目独立存储Root活动配置
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
export interface ProjectRootCampaign {
  campaignId: string;
  subject: string;
  isConfirmed: boolean;
  createdAt: Date;
}

/**
 * Project New User - 项目级新用户
 * 基于项目的Root活动判定的新用户
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export interface ProjectNewUser {
  recipient: string;
  firstRootCampaignId: string;
  createdAt: Date;
}

/**
 * Project User Event - 项目级用户事件
 * 用户在项目中接收活动的时间序列
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
export interface ProjectUserEvent {
  recipient: string;
  campaignId: string;
  seq: number;
  receivedAt: Date;
}

/**
 * Project Path Edge - 项目级路径边
 * 记录从活动A到活动B的用户转移数
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
export interface ProjectPathEdge {
  fromCampaignId: string;
  fromSubject: string;
  toCampaignId: string;
  toSubject: string;
  userCount: number;
}

/**
 * Project User Stats - 项目级用户统计
 * 
 * Requirements: 3.2, 3.3
 */
export interface ProjectUserStats {
  totalNewUsers: number;
  totalEvents: number;
}

/**
 * Analysis Progress Phase - 分析进度阶段
 * 
 * Requirements: 9.1, 9.2, 9.3
 */
export type AnalysisProgressPhase = 
  | 'initializing' 
  | 'processing_root_emails' 
  | 'building_events' 
  | 'building_paths' 
  | 'complete';

/**
 * Analysis Progress - 分析进度
 * 用于实时显示分析进度
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */
export interface AnalysisProgress {
  phase: AnalysisProgressPhase;
  progress: number; // 0-100
  message: string;
  details?: {
    processed: number;
    total: number;
  };
}

/**
 * Analysis Result - 分析结果
 * 分析完成后返回的统计信息
 * 
 * Requirements: 6.7, 7.6
 */
export interface AnalysisResult {
  isIncremental: boolean;
  newUsersAdded: number;
  eventsCreated: number;
  edgesUpdated: number;
  duration: number; // milliseconds
}

/**
 * Project Path Analysis Result - 项目路径分析结果
 * 完整的项目级路径分析数据
 * 
 * Requirements: 所有
 */
export interface ProjectPathAnalysisResult {
  projectId: string;
  userStats: ProjectUserStats;
  levelStats: CampaignLevelStats[];
  transitions: CampaignTransition[];
  lastAnalysisTime: Date | null;
}

/**
 * DTO for setting project Root campaign
 * 
 * Requirements: 2.1, 2.4
 */
export interface SetProjectRootCampaignDTO {
  campaignId: string;
  isConfirmed: boolean;
}

/**
 * Project Root Campaigns Response
 * API响应格式
 * 
 * Requirements: 2.2
 */
export interface ProjectRootCampaignsResponse {
  projectId: string;
  rootCampaigns: ProjectRootCampaign[];
}

/**
 * Project Path Analysis Response
 * API响应格式
 * 
 * Requirements: 所有
 */
export interface ProjectPathAnalysisResponse {
  projectId: string;
  userStats: ProjectUserStats;
  levelStats: CampaignLevelStats[];
  transitions: CampaignTransition[];
  lastAnalysisTime: string | null;
}

