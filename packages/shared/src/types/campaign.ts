/**
 * Campaign Analytics Types
 * Types for tracking and analyzing marketing campaigns
 */

// ============================================
// Core Entity Types
// ============================================

/**
 * Merchant entity - represents a sender domain
 */
export interface Merchant {
  id: string;
  domain: string;
  displayName?: string;
  note?: string;
  totalCampaigns: number;
  valuableCampaigns: number;
  totalEmails: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Campaign entity - represents a unique subject from a merchant
 */
export interface Campaign {
  id: string;
  merchantId: string;
  subject: string;
  isValuable: boolean;
  valuableNote?: string;
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
  isValuable: boolean;
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
 * DTO for marking campaign as valuable
 */
export interface MarkValuableDTO {
  valuable: boolean;
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
  sortBy?: 'firstSeenAt' | 'lastSeenAt' | 'totalEmails' | 'uniqueRecipients';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Filter options for querying merchants
 */
export interface MerchantFilter {
  sortBy?: 'domain' | 'totalCampaigns' | 'totalEmails' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
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
  is_valuable: number;
  valuable_note: string | null;
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
  return {
    id: row.id,
    merchantId: row.merchant_id,
    subject: row.subject,
    isValuable: row.is_valuable === 1,
    valuableNote: row.valuable_note ?? undefined,
    totalEmails: row.total_emails,
    uniqueRecipients: row.unique_recipients,
    firstSeenAt: new Date(row.first_seen_at),
    lastSeenAt: new Date(row.last_seen_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
