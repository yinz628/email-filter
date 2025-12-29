/**
 * Project Path Analysis Service
 * Handles project-level path analysis with complete data isolation between projects
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1-2.5, 3.1-3.4, 4.1-4.5, 5.1-5.4, 6.1-6.7, 7.1-7.6
 */

import type Database from 'better-sqlite3';
import { BatchProcessor, type BatchProgress } from '../utils/batch-processor.js';

// ============================================
// Type Definitions
// ============================================

/**
 * Project Root Campaign - 项目级Root活动设置
 */
export interface ProjectRootCampaign {
  campaignId: string;
  subject: string;
  isConfirmed: boolean;
  createdAt: Date;
}

/**
 * Project New User - 项目级新用户
 */
export interface ProjectNewUser {
  recipient: string;
  firstRootCampaignId: string;
  createdAt: Date;
}

/**
 * Project User Event - 项目级用户事件
 */
export interface ProjectUserEvent {
  recipient: string;
  campaignId: string;
  seq: number;
  receivedAt: Date;
}

/**
 * Project Path Edge - 项目级路径边
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
 */
export interface ProjectUserStats {
  totalNewUsers: number;
  totalEvents: number;
}

/**
 * Analysis Progress - 分析进度
 */
export interface AnalysisProgress {
  phase: 'initializing' | 'processing_root_emails' | 'building_events' | 'building_paths' | 'complete';
  progress: number; // 0-100
  message: string;
  details?: {
    processed: number;
    total: number;
  };
}

/**
 * Analysis Result - 分析结果
 */
export interface AnalysisResult {
  isIncremental: boolean;
  newUsersAdded: number;
  eventsCreated: number;
  edgesUpdated: number;
  duration: number; // milliseconds
}

/**
 * Campaign Email Row - 邮件记录行
 */
interface CampaignEmailRow {
  id: number;
  campaign_id: string;
  recipient: string;
  received_at: string;
  worker_name: string;
}

/**
 * Database row types
 */
interface ProjectRootCampaignRow {
  id: number;
  project_id: string;
  campaign_id: string;
  is_confirmed: number;
  created_at: string;
  subject?: string;
}

interface ProjectNewUserRow {
  id: number;
  project_id: string;
  recipient: string;
  first_root_campaign_id: string;
  created_at: string;
}

interface ProjectUserEventRow {
  id: number;
  project_id: string;
  recipient: string;
  campaign_id: string;
  seq: number;
  received_at: string;
}

interface ProjectPathEdgeRow {
  id: number;
  project_id: string;
  from_campaign_id: string;
  to_campaign_id: string;
  user_count: number;
  updated_at: string;
  from_subject?: string;
  to_subject?: string;
}

/**
 * Project Path Analysis Service
 * Provides project-level data isolation for path analysis
 */
export class ProjectPathAnalysisService {
  constructor(private db: Database.Database) {}

  // ============================================
  // Root Campaign Management (Requirements 2.1-2.5)
  // ============================================

  /**
   * Set a Root campaign for a project
   * 
   * @param projectId - Project ID
   * @param campaignId - Campaign ID to set as Root
   * @param isConfirmed - Whether the Root is confirmed by user
   * 
   * Requirements: 2.1, 2.4
   */
  setProjectRootCampaign(
    projectId: string,
    campaignId: string,
    isConfirmed: boolean = false
  ): void {
    const now = new Date().toISOString();
    
    // Use UPSERT to insert or update
    const stmt = this.db.prepare(`
      INSERT INTO project_root_campaigns (project_id, campaign_id, is_confirmed, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id, campaign_id) DO UPDATE SET
        is_confirmed = excluded.is_confirmed
    `);
    
    stmt.run(projectId, campaignId, isConfirmed ? 1 : 0, now);
  }

  /**
   * Get all Root campaigns for a project
   * 
   * @param projectId - Project ID
   * @returns Array of ProjectRootCampaign
   * 
   * Requirements: 2.2, 2.3
   */
  getProjectRootCampaigns(projectId: string): ProjectRootCampaign[] {
    const stmt = this.db.prepare(`
      SELECT 
        prc.campaign_id,
        prc.is_confirmed,
        prc.created_at,
        c.subject
      FROM project_root_campaigns prc
      LEFT JOIN campaigns c ON prc.campaign_id = c.id
      WHERE prc.project_id = ?
      ORDER BY prc.created_at DESC
    `);
    
    const rows = stmt.all(projectId) as ProjectRootCampaignRow[];
    
    return rows.map(row => ({
      campaignId: row.campaign_id,
      subject: row.subject || '',
      isConfirmed: row.is_confirmed === 1,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Remove a Root campaign from a project
   * 
   * @param projectId - Project ID
   * @param campaignId - Campaign ID to remove
   * 
   * Requirements: 2.4
   */
  removeProjectRootCampaign(projectId: string, campaignId: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM project_root_campaigns
      WHERE project_id = ? AND campaign_id = ?
    `);
    
    stmt.run(projectId, campaignId);
  }

  // ============================================
  // New User Management (Requirements 3.1-3.4)
  // ============================================

  /**
   * Add a new user to a project
   * 
   * @param projectId - Project ID
   * @param recipient - Recipient email
   * @param firstRootCampaignId - The first Root campaign this user received
   * 
   * Requirements: 3.1, 3.4
   */
  addProjectNewUser(
    projectId: string,
    recipient: string,
    firstRootCampaignId: string
  ): void {
    const now = new Date().toISOString();
    
    // Use INSERT OR IGNORE to avoid duplicates
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO project_new_users (project_id, recipient, first_root_campaign_id, created_at)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(projectId, recipient, firstRootCampaignId, now);
  }

  /**
   * Get all new users for a project
   * 
   * @param projectId - Project ID
   * @returns Array of ProjectNewUser
   * 
   * Requirements: 3.2
   */
  getProjectNewUsers(projectId: string): ProjectNewUser[] {
    const stmt = this.db.prepare(`
      SELECT recipient, first_root_campaign_id, created_at
      FROM project_new_users
      WHERE project_id = ?
      ORDER BY created_at ASC
    `);
    
    const rows = stmt.all(projectId) as ProjectNewUserRow[];
    
    return rows.map(row => ({
      recipient: row.recipient,
      firstRootCampaignId: row.first_root_campaign_id,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Get user statistics for a project
   * 
   * @param projectId - Project ID
   * @returns ProjectUserStats
   * 
   * Requirements: 3.2, 3.3
   */
  getProjectUserStats(projectId: string): ProjectUserStats {
    const userCountStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM project_new_users WHERE project_id = ?
    `);
    const userCountRow = userCountStmt.get(projectId) as { count: number };
    
    const eventCountStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM project_user_events WHERE project_id = ?
    `);
    const eventCountRow = eventCountStmt.get(projectId) as { count: number };
    
    return {
      totalNewUsers: userCountRow.count,
      totalEvents: eventCountRow.count,
    };
  }

  /**
   * Check if a recipient is a new user in a project
   * 
   * @param projectId - Project ID
   * @param recipient - Recipient email
   * @returns true if the recipient is a new user
   */
  isProjectNewUser(projectId: string, recipient: string): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM project_new_users WHERE project_id = ? AND recipient = ?
    `);
    const row = stmt.get(projectId, recipient);
    return row !== undefined;
  }

  // ============================================
  // User Event Stream Management (Requirements 4.1-4.5)
  // ============================================

  /**
   * Add a user event to a project (auto-calculates seq)
   * 
   * @param projectId - Project ID
   * @param recipient - Recipient email
   * @param campaignId - Campaign ID
   * @param receivedAt - When the email was received
   * @returns Object with seq number and whether it was newly created
   * 
   * Requirements: 4.1, 4.2, 4.5
   */
  addUserEvent(
    projectId: string,
    recipient: string,
    campaignId: string,
    receivedAt: Date
  ): { seq: number; isNew: boolean } {
    // Check if this event already exists (same project, recipient, campaign)
    const existingStmt = this.db.prepare(`
      SELECT seq FROM project_user_events
      WHERE project_id = ? AND recipient = ? AND campaign_id = ?
    `);
    const existing = existingStmt.get(projectId, recipient, campaignId) as { seq: number } | undefined;
    
    if (existing) {
      // Event already exists, return existing seq
      return { seq: existing.seq, isNew: false };
    }
    
    // Get the max seq for this user in this project
    const maxSeq = this.getMaxSeq(projectId, recipient);
    const newSeq = maxSeq + 1;
    
    const stmt = this.db.prepare(`
      INSERT INTO project_user_events (project_id, recipient, campaign_id, seq, received_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(projectId, recipient, campaignId, newSeq, receivedAt.toISOString());
    
    return { seq: newSeq, isNew: true };
  }

  /**
   * Get all events for a user in a project
   * 
   * @param projectId - Project ID
   * @param recipient - Recipient email
   * @returns Array of ProjectUserEvent sorted by seq
   * 
   * Requirements: 4.3, 4.4
   */
  getUserEvents(projectId: string, recipient: string): ProjectUserEvent[] {
    const stmt = this.db.prepare(`
      SELECT recipient, campaign_id, seq, received_at
      FROM project_user_events
      WHERE project_id = ? AND recipient = ?
      ORDER BY seq ASC
    `);
    
    const rows = stmt.all(projectId, recipient) as ProjectUserEventRow[];
    
    return rows.map(row => ({
      recipient: row.recipient,
      campaignId: row.campaign_id,
      seq: row.seq,
      receivedAt: new Date(row.received_at),
    }));
  }

  /**
   * Get the maximum sequence number for a user in a project
   * 
   * @param projectId - Project ID
   * @param recipient - Recipient email
   * @returns Maximum seq number, or 0 if no events exist
   * 
   * Requirements: 4.2
   */
  getMaxSeq(projectId: string, recipient: string): number {
    const stmt = this.db.prepare(`
      SELECT MAX(seq) as max_seq
      FROM project_user_events
      WHERE project_id = ? AND recipient = ?
    `);
    
    const row = stmt.get(projectId, recipient) as { max_seq: number | null };
    return row.max_seq ?? 0;
  }

  /**
   * Get all events for a project
   * 
   * @param projectId - Project ID
   * @returns Array of ProjectUserEvent
   */
  getAllProjectEvents(projectId: string): ProjectUserEvent[] {
    const stmt = this.db.prepare(`
      SELECT recipient, campaign_id, seq, received_at
      FROM project_user_events
      WHERE project_id = ?
      ORDER BY recipient, seq ASC
    `);
    
    const rows = stmt.all(projectId) as ProjectUserEventRow[];
    
    return rows.map(row => ({
      recipient: row.recipient,
      campaignId: row.campaign_id,
      seq: row.seq,
      receivedAt: new Date(row.received_at),
    }));
  }

  // ============================================
  // Path Edge Management (Requirements 5.1-5.4)
  // ============================================

  /**
   * Update or create a path edge for a project
   * 
   * @param projectId - Project ID
   * @param fromCampaignId - Source campaign ID
   * @param toCampaignId - Target campaign ID
   * @param userCount - Number of users who made this transition
   * 
   * Requirements: 5.1, 5.4
   */
  updatePathEdge(
    projectId: string,
    fromCampaignId: string,
    toCampaignId: string,
    userCount: number
  ): void {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO project_path_edges (project_id, from_campaign_id, to_campaign_id, user_count, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id, from_campaign_id, to_campaign_id) DO UPDATE SET
        user_count = excluded.user_count,
        updated_at = excluded.updated_at
    `);
    
    stmt.run(projectId, fromCampaignId, toCampaignId, userCount, now);
  }

  /**
   * Get all path edges for a project
   * 
   * @param projectId - Project ID
   * @returns Array of ProjectPathEdge
   * 
   * Requirements: 5.2, 5.3
   */
  getProjectPathEdges(projectId: string): ProjectPathEdge[] {
    const stmt = this.db.prepare(`
      SELECT 
        ppe.from_campaign_id,
        ppe.to_campaign_id,
        ppe.user_count,
        c1.subject as from_subject,
        c2.subject as to_subject
      FROM project_path_edges ppe
      LEFT JOIN campaigns c1 ON ppe.from_campaign_id = c1.id
      LEFT JOIN campaigns c2 ON ppe.to_campaign_id = c2.id
      WHERE ppe.project_id = ?
      ORDER BY ppe.user_count DESC
    `);
    
    const rows = stmt.all(projectId) as ProjectPathEdgeRow[];
    
    return rows.map(row => ({
      fromCampaignId: row.from_campaign_id,
      fromSubject: row.from_subject || '',
      toCampaignId: row.to_campaign_id,
      toSubject: row.to_subject || '',
      userCount: row.user_count,
    }));
  }

  /**
   * Build path edges from user events
   * Calculates transitions between consecutive events (seq=n to seq=n+1)
   * 
   * @param projectId - Project ID
   * 
   * Requirements: 5.1, 5.4
   */
  buildPathEdgesFromEvents(projectId: string): void {
    // Get all events grouped by recipient, ordered by seq
    const events = this.getAllProjectEvents(projectId);
    
    // Group events by recipient
    const eventsByRecipient = new Map<string, ProjectUserEvent[]>();
    for (const event of events) {
      if (!eventsByRecipient.has(event.recipient)) {
        eventsByRecipient.set(event.recipient, []);
      }
      eventsByRecipient.get(event.recipient)!.push(event);
    }
    
    // Count transitions
    const transitionCounts = new Map<string, number>();
    
    for (const [, userEvents] of eventsByRecipient) {
      // Events are already sorted by seq
      for (let i = 0; i < userEvents.length - 1; i++) {
        const fromEvent = userEvents[i];
        const toEvent = userEvents[i + 1];
        
        // Only count consecutive seq transitions
        if (toEvent.seq === fromEvent.seq + 1) {
          const key = `${fromEvent.campaignId}:${toEvent.campaignId}`;
          transitionCounts.set(key, (transitionCounts.get(key) || 0) + 1);
        }
      }
    }
    
    // Clear existing edges for this project
    const deleteStmt = this.db.prepare(`
      DELETE FROM project_path_edges WHERE project_id = ?
    `);
    deleteStmt.run(projectId);
    
    // Insert new edges
    for (const [key, count] of transitionCounts) {
      const [fromCampaignId, toCampaignId] = key.split(':');
      this.updatePathEdge(projectId, fromCampaignId, toCampaignId, count);
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Clear all project-level data for a project
   * Used when deleting a project or resetting analysis
   * 
   * @param projectId - Project ID
   * 
   * Requirements: 1.4
   */
  clearProjectData(projectId: string): void {
    // Delete in order to respect foreign key constraints
    // (though CASCADE should handle this)
    const tables = [
      'project_path_edges',
      'project_user_events',
      'project_new_users',
      'project_root_campaigns',
    ];
    
    for (const table of tables) {
      const stmt = this.db.prepare(`DELETE FROM ${table} WHERE project_id = ?`);
      stmt.run(projectId);
    }
  }

  /**
   * Get project's last analysis time
   * 
   * @param projectId - Project ID
   * @returns Last analysis time or null if never analyzed
   */
  getLastAnalysisTime(projectId: string): Date | null {
    const stmt = this.db.prepare(`
      SELECT last_analysis_time FROM analysis_projects WHERE id = ?
    `);
    const row = stmt.get(projectId) as { last_analysis_time: string | null } | undefined;
    
    if (!row || !row.last_analysis_time) {
      return null;
    }
    
    return new Date(row.last_analysis_time);
  }

  /**
   * Update project's last analysis time
   * 
   * @param projectId - Project ID
   * @param time - Analysis time
   */
  updateLastAnalysisTime(projectId: string, time: Date): void {
    const stmt = this.db.prepare(`
      UPDATE analysis_projects SET last_analysis_time = ? WHERE id = ?
    `);
    stmt.run(time.toISOString(), projectId);
  }

  // ============================================
  // Path Analysis Methods (Requirements 6.1-6.7, 7.1-7.6)
  // ============================================

  /**
   * Trigger path analysis for a project (auto-determines full or incremental)
   * 
   * @param projectId - Project ID
   * @param onProgress - Optional progress callback
   * @returns Analysis result
   * 
   * Requirements: 6.1, 7.1
   */
  async analyzeProject(
    projectId: string,
    onProgress?: (progress: AnalysisProgress) => void
  ): Promise<AnalysisResult> {
    const lastAnalysisTime = this.getLastAnalysisTime(projectId);
    
    if (lastAnalysisTime === null) {
      // First time analysis - run full analysis
      return this.runFullAnalysis(projectId, onProgress);
    } else {
      // Incremental analysis
      return this.runIncrementalAnalysis(projectId, lastAnalysisTime, onProgress);
    }
  }

  /**
   * Force a full re-analysis for a project
   * Clears all existing analysis data and runs a fresh full analysis
   * 
   * @param projectId - Project ID
   * @param onProgress - Optional progress callback
   * @returns Analysis result
   * 
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
   */
  async forceFullAnalysis(
    projectId: string,
    onProgress?: (progress: AnalysisProgress) => void
  ): Promise<AnalysisResult> {
    // Clear last analysis time to force full analysis
    this.clearLastAnalysisTime(projectId);
    
    // Run full analysis
    return this.runFullAnalysis(projectId, onProgress);
  }

  /**
   * Clear last analysis time for a project
   * This will cause the next analysis to be a full analysis
   */
  private clearLastAnalysisTime(projectId: string): void {
    const stmt = this.db.prepare(`
      UPDATE analysis_projects
      SET last_analysis_time = NULL
      WHERE id = ?
    `);
    stmt.run(projectId);
  }

  /**
   * Run full analysis for a project (first time analysis)
   * Processes all historical Root campaign emails
   * 
   * @param projectId - Project ID
   * @param onProgress - Optional progress callback
   * @returns Analysis result
   * 
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
   */
  async runFullAnalysis(
    projectId: string,
    onProgress?: (progress: AnalysisProgress) => void
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    let newUsersAdded = 0;
    let eventsCreated = 0;
    
    // Report initializing
    onProgress?.({
      phase: 'initializing',
      progress: 0,
      message: '初始化分析...',
    });

    // Get project info to determine worker scope
    const projectInfo = this.getProjectInfo(projectId);
    if (!projectInfo) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Get confirmed Root campaigns for this project
    const rootCampaigns = this.getProjectRootCampaigns(projectId)
      .filter(rc => rc.isConfirmed);
    
    if (rootCampaigns.length === 0) {
      // No Root campaigns, nothing to analyze
      const analysisTime = new Date();
      this.updateLastAnalysisTime(projectId, analysisTime);
      
      onProgress?.({
        phase: 'complete',
        progress: 100,
        message: '分析完成（无Root活动）',
      });
      
      return {
        isIncremental: false,
        newUsersAdded: 0,
        eventsCreated: 0,
        edgesUpdated: 0,
        duration: Date.now() - startTime,
      };
    }

    const rootCampaignIds = rootCampaigns.map(rc => rc.campaignId);

    // Clear existing project data for fresh analysis
    this.clearProjectAnalysisData(projectId);

    // Phase 1: Process Root campaign emails to identify new users
    onProgress?.({
      phase: 'processing_root_emails',
      progress: 5,
      message: '处理Root活动邮件...',
    });

    // Get all emails for Root campaigns within worker scope
    const rootEmails = this.getRootCampaignEmails(projectInfo.merchantId, rootCampaignIds, projectInfo.workerNames);
    
    // Group emails by recipient to find first Root email for each
    const recipientFirstRoot = new Map<string, { campaignId: string; receivedAt: Date }>();
    
    for (const email of rootEmails) {
      const existing = recipientFirstRoot.get(email.recipient);
      const receivedAt = new Date(email.received_at);
      
      if (!existing || receivedAt < existing.receivedAt) {
        recipientFirstRoot.set(email.recipient, {
          campaignId: email.campaign_id,
          receivedAt,
        });
      }
    }

    // Add new users and create seq=1 events
    const batchProcessor = new BatchProcessor<[string, { campaignId: string; receivedAt: Date }]>();
    const recipientEntries = Array.from(recipientFirstRoot.entries());
    
    await batchProcessor.processBatch(
      recipientEntries,
      ([recipient, firstRoot]) => {
        // Add to new users
        this.addProjectNewUser(projectId, recipient, firstRoot.campaignId);
        newUsersAdded++;
        
        // Create seq=1 event
        const result = this.addUserEvent(projectId, recipient, firstRoot.campaignId, firstRoot.receivedAt);
        if (result.isNew) {
          eventsCreated++;
        }
      },
      (progress: BatchProgress) => {
        onProgress?.({
          phase: 'processing_root_emails',
          progress: 5 + Math.round(progress.percentage * 0.35), // 5-40%
          message: `处理Root邮件中... (${progress.processed}/${progress.total})`,
          details: progress,
        });
      }
    );

    // Phase 2: Build events for all subsequent emails
    onProgress?.({
      phase: 'building_events',
      progress: 40,
      message: '构建用户事件流...',
    });

    // Get all emails for new users (non-Root emails)
    const newUsers = this.getProjectNewUsers(projectId);
    const newUserRecipients = new Set(newUsers.map(u => u.recipient));
    
    // Get all campaign emails for these recipients within worker scope
    const allEmails = this.getAllCampaignEmails(projectInfo.merchantId, projectInfo.workerNames);
    
    // Filter to only new user emails and sort by received_at
    const newUserEmails = allEmails
      .filter(email => newUserRecipients.has(email.recipient))
      .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());

    // Process emails to build event stream (create new batch processor for different type)
    const emailBatchProcessor = new BatchProcessor<CampaignEmailRow>();
    await emailBatchProcessor.processBatch(
      newUserEmails,
      (email) => {
        // Skip if this is a Root campaign email (already processed as seq=1)
        if (rootCampaignIds.includes(email.campaign_id)) {
          return;
        }
        
        // Add event (will auto-calculate seq)
        const result = this.addUserEvent(projectId, email.recipient, email.campaign_id, new Date(email.received_at));
        if (result.isNew && result.seq > 1) {
          eventsCreated++;
        }
      },
      (progress: BatchProgress) => {
        onProgress?.({
          phase: 'building_events',
          progress: 40 + Math.round(progress.percentage * 0.40), // 40-80%
          message: `构建事件流中... (${progress.processed}/${progress.total})`,
          details: progress,
        });
      }
    );

    // Phase 3: Build path edges
    onProgress?.({
      phase: 'building_paths',
      progress: 80,
      message: '构建路径边...',
    });

    this.buildPathEdgesFromEvents(projectId);
    const edges = this.getProjectPathEdges(projectId);

    // Update last analysis time
    const analysisTime = new Date();
    this.updateLastAnalysisTime(projectId, analysisTime);

    onProgress?.({
      phase: 'complete',
      progress: 100,
      message: `分析完成: ${newUsersAdded}个新用户, ${eventsCreated}个事件, ${edges.length}条路径边`,
    });

    return {
      isIncremental: false,
      newUsersAdded,
      eventsCreated,
      edgesUpdated: edges.length,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Run incremental analysis for a project
   * Only processes new data since last analysis
   * 
   * @param projectId - Project ID
   * @param lastAnalysisTime - Last analysis timestamp
   * @param onProgress - Optional progress callback
   * @returns Analysis result
   * 
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
   */
  async runIncrementalAnalysis(
    projectId: string,
    lastAnalysisTime: Date,
    onProgress?: (progress: AnalysisProgress) => void
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    let newUsersAdded = 0;
    let eventsCreated = 0;

    onProgress?.({
      phase: 'initializing',
      progress: 0,
      message: '初始化增量分析...',
    });

    // Get project info
    const projectInfo = this.getProjectInfo(projectId);
    if (!projectInfo) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Get confirmed Root campaigns
    const rootCampaigns = this.getProjectRootCampaigns(projectId)
      .filter(rc => rc.isConfirmed);
    
    if (rootCampaigns.length === 0) {
      const analysisTime = new Date();
      this.updateLastAnalysisTime(projectId, analysisTime);
      
      onProgress?.({
        phase: 'complete',
        progress: 100,
        message: '增量分析完成（无Root活动）',
      });
      
      return {
        isIncremental: true,
        newUsersAdded: 0,
        eventsCreated: 0,
        edgesUpdated: 0,
        duration: Date.now() - startTime,
      };
    }

    const rootCampaignIds = rootCampaigns.map(rc => rc.campaignId);

    // Get existing new users
    const existingNewUsers = this.getProjectNewUsers(projectId);
    const existingRecipients = new Set(existingNewUsers.map(u => u.recipient));

    // Phase 1: Process new Root emails to find new users
    onProgress?.({
      phase: 'processing_root_emails',
      progress: 5,
      message: '处理新Root邮件...',
    });

    // Get Root emails received after last analysis
    const newRootEmails = this.getRootCampaignEmailsSince(
      projectInfo.merchantId,
      rootCampaignIds,
      projectInfo.workerNames,
      lastAnalysisTime
    );

    // Find new users (recipients not in existing new users)
    const newRecipientFirstRoot = new Map<string, { campaignId: string; receivedAt: Date }>();
    
    for (const email of newRootEmails) {
      if (existingRecipients.has(email.recipient)) {
        continue; // Already a new user
      }
      
      const existing = newRecipientFirstRoot.get(email.recipient);
      const receivedAt = new Date(email.received_at);
      
      if (!existing || receivedAt < existing.receivedAt) {
        newRecipientFirstRoot.set(email.recipient, {
          campaignId: email.campaign_id,
          receivedAt,
        });
      }
    }

    // Add new users and create seq=1 events
    const batchProcessor = new BatchProcessor<[string, { campaignId: string; receivedAt: Date }]>();
    const newRecipientEntries = Array.from(newRecipientFirstRoot.entries());
    
    await batchProcessor.processBatch(
      newRecipientEntries,
      ([recipient, firstRoot]) => {
        this.addProjectNewUser(projectId, recipient, firstRoot.campaignId);
        newUsersAdded++;
        
        const result = this.addUserEvent(projectId, recipient, firstRoot.campaignId, firstRoot.receivedAt);
        if (result.isNew) {
          eventsCreated++;
        }
        
        // Add to existing recipients set for next phase
        existingRecipients.add(recipient);
      },
      (progress: BatchProgress) => {
        onProgress?.({
          phase: 'processing_root_emails',
          progress: 5 + Math.round(progress.percentage * 0.30), // 5-35%
          message: `处理新Root邮件中... (${progress.processed}/${progress.total})`,
          details: progress,
        });
      }
    );

    // Phase 2: Process new emails for all new users (existing + newly added)
    onProgress?.({
      phase: 'building_events',
      progress: 35,
      message: '处理新用户邮件...',
    });

    // Get all new emails since last analysis for new users
    const newEmails = this.getCampaignEmailsSince(
      projectInfo.merchantId,
      projectInfo.workerNames,
      lastAnalysisTime
    );

    // Filter to only new user emails and sort by received_at
    const newUserEmails = newEmails
      .filter(email => existingRecipients.has(email.recipient))
      .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());

    // Process emails to add events (create new batch processor for different type)
    const emailBatchProcessor = new BatchProcessor<CampaignEmailRow>();
    await emailBatchProcessor.processBatch(
      newUserEmails,
      (email) => {
        // Skip Root campaign emails for newly added users (already processed as seq=1)
        // But allow Root emails for existing users (they might receive another Root email)
        const isNewlyAddedUser = newRecipientFirstRoot.has(email.recipient);
        if (isNewlyAddedUser && rootCampaignIds.includes(email.campaign_id)) {
          return;
        }
        
        // Add event (will auto-calculate seq, skip if already exists)
        const result = this.addUserEvent(projectId, email.recipient, email.campaign_id, new Date(email.received_at));
        if (result.isNew) {
          eventsCreated++;
        }
      },
      (progress: BatchProgress) => {
        onProgress?.({
          phase: 'building_events',
          progress: 35 + Math.round(progress.percentage * 0.45), // 35-80%
          message: `处理新邮件中... (${progress.processed}/${progress.total})`,
          details: progress,
        });
      }
    );

    // Phase 3: Rebuild path edges
    onProgress?.({
      phase: 'building_paths',
      progress: 80,
      message: '重建路径边...',
    });

    this.buildPathEdgesFromEvents(projectId);
    const edges = this.getProjectPathEdges(projectId);

    // Update last analysis time
    const analysisTime = new Date();
    this.updateLastAnalysisTime(projectId, analysisTime);

    onProgress?.({
      phase: 'complete',
      progress: 100,
      message: `增量分析完成: ${newUsersAdded}个新用户, ${eventsCreated}个新事件, ${edges.length}条路径边`,
    });

    return {
      isIncremental: true,
      newUsersAdded,
      eventsCreated,
      edgesUpdated: edges.length,
      duration: Date.now() - startTime,
    };
  }

  // ============================================
  // Helper Methods for Analysis
  // ============================================

  /**
   * Get project info including merchant and worker scope
   */
  private getProjectInfo(projectId: string): { merchantId: string; workerNames: string[] } | null {
    const stmt = this.db.prepare(`
      SELECT merchant_id, worker_name, worker_names
      FROM analysis_projects
      WHERE id = ?
    `);
    const row = stmt.get(projectId) as { merchant_id: string; worker_name: string; worker_names: string | null } | undefined;
    
    if (!row) return null;
    
    let workerNames: string[] = [row.worker_name];
    if (row.worker_names) {
      try {
        workerNames = JSON.parse(row.worker_names);
      } catch {
        // Fallback to single worker
      }
    }
    
    return {
      merchantId: row.merchant_id,
      workerNames,
    };
  }

  /**
   * Get all emails for Root campaigns within worker scope
   */
  private getRootCampaignEmails(
    merchantId: string,
    rootCampaignIds: string[],
    workerNames: string[]
  ): CampaignEmailRow[] {
    if (rootCampaignIds.length === 0) return [];
    
    const placeholders = rootCampaignIds.map(() => '?').join(',');
    const workerPlaceholders = workerNames.map(() => '?').join(',');
    
    const stmt = this.db.prepare(`
      SELECT ce.id, ce.campaign_id, ce.recipient, ce.received_at, ce.worker_name
      FROM campaign_emails ce
      JOIN campaigns c ON ce.campaign_id = c.id
      WHERE c.merchant_id = ?
        AND ce.campaign_id IN (${placeholders})
        AND ce.worker_name IN (${workerPlaceholders})
      ORDER BY ce.received_at ASC
    `);
    
    return stmt.all(merchantId, ...rootCampaignIds, ...workerNames) as CampaignEmailRow[];
  }

  /**
   * Get Root campaign emails received since a specific time
   */
  private getRootCampaignEmailsSince(
    merchantId: string,
    rootCampaignIds: string[],
    workerNames: string[],
    since: Date
  ): CampaignEmailRow[] {
    if (rootCampaignIds.length === 0) return [];
    
    const placeholders = rootCampaignIds.map(() => '?').join(',');
    const workerPlaceholders = workerNames.map(() => '?').join(',');
    
    const stmt = this.db.prepare(`
      SELECT ce.id, ce.campaign_id, ce.recipient, ce.received_at, ce.worker_name
      FROM campaign_emails ce
      JOIN campaigns c ON ce.campaign_id = c.id
      WHERE c.merchant_id = ?
        AND ce.campaign_id IN (${placeholders})
        AND ce.worker_name IN (${workerPlaceholders})
        AND ce.received_at > ?
      ORDER BY ce.received_at ASC
    `);
    
    return stmt.all(merchantId, ...rootCampaignIds, ...workerNames, since.toISOString()) as CampaignEmailRow[];
  }

  /**
   * Get all campaign emails within worker scope
   */
  private getAllCampaignEmails(merchantId: string, workerNames: string[]): CampaignEmailRow[] {
    const workerPlaceholders = workerNames.map(() => '?').join(',');
    
    const stmt = this.db.prepare(`
      SELECT ce.id, ce.campaign_id, ce.recipient, ce.received_at, ce.worker_name
      FROM campaign_emails ce
      JOIN campaigns c ON ce.campaign_id = c.id
      WHERE c.merchant_id = ?
        AND ce.worker_name IN (${workerPlaceholders})
      ORDER BY ce.received_at ASC
    `);
    
    return stmt.all(merchantId, ...workerNames) as CampaignEmailRow[];
  }

  /**
   * Get campaign emails received since a specific time
   */
  private getCampaignEmailsSince(
    merchantId: string,
    workerNames: string[],
    since: Date
  ): CampaignEmailRow[] {
    const workerPlaceholders = workerNames.map(() => '?').join(',');
    
    const stmt = this.db.prepare(`
      SELECT ce.id, ce.campaign_id, ce.recipient, ce.received_at, ce.worker_name
      FROM campaign_emails ce
      JOIN campaigns c ON ce.campaign_id = c.id
      WHERE c.merchant_id = ?
        AND ce.worker_name IN (${workerPlaceholders})
        AND ce.received_at > ?
      ORDER BY ce.received_at ASC
    `);
    
    return stmt.all(merchantId, ...workerNames, since.toISOString()) as CampaignEmailRow[];
  }

  /**
   * Clear project analysis data (for fresh full analysis)
   * Keeps Root campaign settings but clears analysis results
   */
  private clearProjectAnalysisData(projectId: string): void {
    const tables = [
      'project_path_edges',
      'project_user_events',
      'project_new_users',
    ];
    
    for (const table of tables) {
      const stmt = this.db.prepare(`DELETE FROM ${table} WHERE project_id = ?`);
      stmt.run(projectId);
    }
  }

  // ============================================
  // Project Campaign Tag Methods (项目级活动标记)
  // ============================================

  /**
   * Set campaign tag for a project
   * This creates project-level isolation for campaign tags
   * 
   * @param projectId - Project ID
   * @param campaignId - Campaign ID
   * @param tag - Tag value (0-4)
   * @param note - Optional note
   * @returns Updated tag info or null if project/campaign not found
   */
  setProjectCampaignTag(
    projectId: string,
    campaignId: string,
    tag: number,
    note?: string
  ): ProjectCampaignTag | null {
    // Validate project exists
    const projectStmt = this.db.prepare('SELECT id FROM analysis_projects WHERE id = ?');
    const project = projectStmt.get(projectId);
    if (!project) {
      return null;
    }

    // Validate campaign exists
    const campaignStmt = this.db.prepare('SELECT id, subject FROM campaigns WHERE id = ?');
    const campaign = campaignStmt.get(campaignId) as { id: string; subject: string } | undefined;
    if (!campaign) {
      return null;
    }

    // Validate tag value
    if (tag < 0 || tag > 4) {
      throw new Error('Invalid tag value. Must be 0-4.');
    }

    const now = new Date().toISOString();

    // Upsert project campaign tag
    const upsertStmt = this.db.prepare(`
      INSERT INTO project_campaign_tags (project_id, campaign_id, tag, tag_note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, campaign_id) DO UPDATE SET
        tag = excluded.tag,
        tag_note = excluded.tag_note,
        updated_at = excluded.updated_at
    `);

    upsertStmt.run(projectId, campaignId, tag, note ?? null, now, now);

    return {
      projectId,
      campaignId,
      subject: campaign.subject,
      tag,
      tagNote: note,
      isValuable: tag === 1 || tag === 2,
      updatedAt: new Date(now),
    };
  }

  /**
   * Get campaign tag for a project
   * Returns project-level tag if exists, otherwise returns null
   * 
   * @param projectId - Project ID
   * @param campaignId - Campaign ID
   * @returns Project campaign tag or null
   */
  getProjectCampaignTag(projectId: string, campaignId: string): ProjectCampaignTag | null {
    const stmt = this.db.prepare(`
      SELECT pct.*, c.subject
      FROM project_campaign_tags pct
      JOIN campaigns c ON pct.campaign_id = c.id
      WHERE pct.project_id = ? AND pct.campaign_id = ?
    `);

    const row = stmt.get(projectId, campaignId) as ProjectCampaignTagRow | undefined;
    if (!row) {
      return null;
    }

    return {
      projectId: row.project_id,
      campaignId: row.campaign_id,
      subject: row.subject,
      tag: row.tag,
      tagNote: row.tag_note ?? undefined,
      isValuable: row.tag === 1 || row.tag === 2,
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Get all campaign tags for a project
   * 
   * @param projectId - Project ID
   * @returns Array of project campaign tags
   */
  getProjectCampaignTags(projectId: string): ProjectCampaignTag[] {
    const stmt = this.db.prepare(`
      SELECT pct.*, c.subject
      FROM project_campaign_tags pct
      JOIN campaigns c ON pct.campaign_id = c.id
      WHERE pct.project_id = ?
      ORDER BY pct.updated_at DESC
    `);

    const rows = stmt.all(projectId) as ProjectCampaignTagRow[];
    return rows.map(row => ({
      projectId: row.project_id,
      campaignId: row.campaign_id,
      subject: row.subject,
      tag: row.tag,
      tagNote: row.tag_note ?? undefined,
      isValuable: row.tag === 1 || row.tag === 2,
      updatedAt: new Date(row.updated_at),
    }));
  }

  /**
   * Remove campaign tag for a project
   * 
   * @param projectId - Project ID
   * @param campaignId - Campaign ID
   * @returns true if deleted, false if not found
   */
  removeProjectCampaignTag(projectId: string, campaignId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM project_campaign_tags
      WHERE project_id = ? AND campaign_id = ?
    `);

    const result = stmt.run(projectId, campaignId);
    return result.changes > 0;
  }

  /**
   * Get campaigns with project-level tags merged
   * Returns campaigns with project-specific tag overrides
   * 
   * @param projectId - Project ID
   * @param merchantId - Merchant ID
   * @param workerNames - Optional worker names filter
   * @returns Array of campaigns with project tags
   */
  getProjectCampaignsWithTags(
    projectId: string,
    merchantId: string,
    workerNames?: string[]
  ): ProjectCampaignWithTag[] {
    // Get all project campaign tags
    const tagsMap = new Map<string, ProjectCampaignTag>();
    const tags = this.getProjectCampaignTags(projectId);
    for (const tag of tags) {
      tagsMap.set(tag.campaignId, tag);
    }

    // Build query for campaigns
    let query: string;
    const params: (string | number)[] = [merchantId];

    if (workerNames && workerNames.length > 0) {
      const placeholders = workerNames.map(() => '?').join(', ');
      query = `
        SELECT 
          c.id, c.merchant_id, c.subject, c.tag, c.tag_note,
          c.first_seen_at, c.last_seen_at, c.created_at, c.updated_at,
          COUNT(ce.id) as total_emails,
          COUNT(DISTINCT ce.recipient) as unique_recipients
        FROM campaigns c
        INNER JOIN campaign_emails ce ON c.id = ce.campaign_id
        WHERE c.merchant_id = ? AND ce.worker_name IN (${placeholders})
        GROUP BY c.id
        ORDER BY total_emails DESC
      `;
      params.push(...workerNames);
    } else {
      query = `
        SELECT * FROM campaigns
        WHERE merchant_id = ?
        ORDER BY total_emails DESC
      `;
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as CampaignRow[];

    return rows.map(row => {
      const projectTag = tagsMap.get(row.id);
      
      // Use project-level tag if exists, otherwise use campaign-level tag
      const effectiveTag = projectTag ? projectTag.tag : (row.tag ?? 0);
      const effectiveTagNote = projectTag ? projectTag.tagNote : (row.tag_note ?? undefined);
      
      return {
        id: row.id,
        merchantId: row.merchant_id,
        subject: row.subject,
        tag: effectiveTag,
        tagNote: effectiveTagNote,
        isValuable: effectiveTag === 1 || effectiveTag === 2,
        totalEmails: row.total_emails,
        uniqueRecipients: row.unique_recipients,
        firstSeenAt: new Date(row.first_seen_at),
        lastSeenAt: new Date(row.last_seen_at),
        hasProjectTag: !!projectTag,
      };
    });
  }

  // ============================================
  // Valuable Stats Methods (Requirements 9.1-9.6)
  // ============================================

  /**
   * Calculate valuable campaign statistics for a project
   * 
   * @param projectId - Project ID
   * @returns ValuableStats with counts and conversion rate
   * 
   * Requirements: 9.3, 9.4, 9.5
   */
  calculateValuableStats(projectId: string): ValuableStats {
    // Get project info
    const projectInfo = this.getProjectInfo(projectId);
    if (!projectInfo) {
      return {
        valuableCampaignCount: 0,
        highValueCampaignCount: 0,
        valuableUserReach: 0,
        valuableConversionRate: 0,
      };
    }

    // Get all project campaign tags
    const projectTags = this.getProjectCampaignTags(projectId);
    const projectTagsMap = new Map<string, number>();
    for (const tag of projectTags) {
      projectTagsMap.set(tag.campaignId, tag.tag);
    }

    // Get all campaigns for this merchant with their tags
    const campaignsStmt = this.db.prepare(`
      SELECT c.id, c.tag
      FROM campaigns c
      WHERE c.merchant_id = ?
    `);
    const campaigns = campaignsStmt.all(projectInfo.merchantId) as { id: string; tag: number | null }[];

    // Count valuable campaigns (using project-level tag if exists, otherwise campaign-level)
    let valuableCampaignCount = 0;
    let highValueCampaignCount = 0;
    const valuableCampaignIds = new Set<string>();

    for (const campaign of campaigns) {
      const effectiveTag = projectTagsMap.has(campaign.id) 
        ? projectTagsMap.get(campaign.id)! 
        : (campaign.tag ?? 0);
      
      if (effectiveTag === 1 || effectiveTag === 2) {
        valuableCampaignCount++;
        valuableCampaignIds.add(campaign.id);
      }
      if (effectiveTag === 2) {
        highValueCampaignCount++;
      }
    }

    // Get total new users
    const userStats = this.getProjectUserStats(projectId);
    const totalNewUsers = userStats.totalNewUsers;

    // Calculate valuable user reach - count distinct users who reached any valuable campaign
    let valuableUserReach = 0;
    if (valuableCampaignIds.size > 0 && totalNewUsers > 0) {
      const placeholders = Array.from(valuableCampaignIds).map(() => '?').join(',');
      const reachStmt = this.db.prepare(`
        SELECT COUNT(DISTINCT recipient) as reach_count
        FROM project_user_events
        WHERE project_id = ? AND campaign_id IN (${placeholders})
      `);
      const reachResult = reachStmt.get(projectId, ...valuableCampaignIds) as { reach_count: number };
      valuableUserReach = reachResult.reach_count;
    }

    // Calculate conversion rate
    const valuableConversionRate = totalNewUsers > 0 
      ? (valuableUserReach / totalNewUsers) * 100 
      : 0;

    return {
      valuableCampaignCount,
      highValueCampaignCount,
      valuableUserReach,
      valuableConversionRate: Math.round(valuableConversionRate * 100) / 100, // Round to 2 decimal places
    };
  }

  /**
   * Get campaign tag for sorting (project-level tag takes precedence)
   * 
   * @param projectId - Project ID
   * @param campaignId - Campaign ID
   * @returns Effective tag value (0-4)
   */
  getEffectiveCampaignTag(projectId: string, campaignId: string): number {
    // Check project-level tag first
    const projectTag = this.getProjectCampaignTag(projectId, campaignId);
    if (projectTag) {
      return projectTag.tag;
    }

    // Fall back to campaign-level tag
    const stmt = this.db.prepare('SELECT tag FROM campaigns WHERE id = ?');
    const row = stmt.get(campaignId) as { tag: number | null } | undefined;
    return row?.tag ?? 0;
  }
}

/**
 * Project Campaign Tag - 项目级活动标记
 */
export interface ProjectCampaignTag {
  projectId: string;
  campaignId: string;
  subject: string;
  tag: number;
  tagNote?: string;
  isValuable: boolean;
  updatedAt: Date;
}

/**
 * Project Campaign With Tag - 带项目标记的活动
 */
export interface ProjectCampaignWithTag {
  id: string;
  merchantId: string;
  subject: string;
  tag: number;
  tagNote?: string;
  isValuable: boolean;
  totalEmails: number;
  uniqueRecipients: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  hasProjectTag: boolean;
}

interface ProjectCampaignTagRow {
  id: number;
  project_id: string;
  campaign_id: string;
  tag: number;
  tag_note: string | null;
  created_at: string;
  updated_at: string;
  subject: string;
}

interface CampaignRow {
  id: string;
  merchant_id: string;
  subject: string;
  tag: number | null;
  tag_note: string | null;
  total_emails: number;
  unique_recipients: number;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Valuable Stats - 有价值活动统计
 * Requirements: 9.3, 9.4, 9.5
 */
export interface ValuableStats {
  valuableCampaignCount: number;    // 有价值活动数量 (tag=1 or tag=2)
  highValueCampaignCount: number;   // 高价值活动数量 (tag=2)
  valuableUserReach: number;        // 到达有价值活动的用户数
  valuableConversionRate: number;   // 有价值转化率 (%)
}
