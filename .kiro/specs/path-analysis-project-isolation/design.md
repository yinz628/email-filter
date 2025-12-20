# Design Document

## Overview

本设计文档描述路径分析项目隔离功能的技术实现方案。核心目标是实现**项目之间的完全数据隔离**，同时优化分析性能和用户体验。

主要变更：
1. 新增5个项目级数据表，替代原有的商户级共享数据
2. 重构路径分析服务，支持项目级数据操作
3. 实现增量分析算法，减少重复计算
4. 添加批量处理和进度报告机制

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Frontend (HTML/JS)                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Project Root UI │  │ Path Analysis   │  │ Progress Indicator      │  │
│  │ (项目Root管理)   │  │ (路径分析显示)   │  │ (进度条)                │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
└───────────┼─────────────────────┼───────────────────────┼───────────────┘
            │                     │                       │
            ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        REST API (Fastify)                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ /projects/:id/  │  │ /projects/:id/  │  │ /projects/:id/          │  │
│  │ root-campaigns  │  │ analyze         │  │ analysis-status         │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
└───────────┼─────────────────────┼───────────────────────┼───────────────┘
            │                     │                       │
            ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  ProjectPathAnalysisService (新增)                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ setProjectRoot  │  │ runFullAnalysis │  │ runIncrementalAnalysis  │  │
│  │ getProjectRoots │  │ (首次分析)       │  │ (增量分析)               │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
│           │                    │                        │               │
│  ┌────────┴────────────────────┴────────────────────────┴────────────┐  │
│  │                    BatchProcessor (批量处理器)                     │  │
│  │  - processBatch() with yield                                      │  │
│  │  - progressCallback for UI updates                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
            │                     │                       │
            ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      SQLite Database (项目级表)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ project_root_   │  │ project_new_    │  │ project_user_events     │  │
│  │ campaigns       │  │ users           │  │ (用户事件流)             │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐                               │
│  │ project_path_   │  │ analysis_       │  (保留原有表，向后兼容)        │
│  │ edges           │  │ projects        │                               │
│  └─────────────────┘  └─────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. ProjectPathAnalysisService (新增服务)

```typescript
class ProjectPathAnalysisService {
  constructor(private db: Database.Database) {}

  // ========== Root Campaign Management ==========
  
  /**
   * 设置项目的Root活动
   */
  setProjectRootCampaign(
    projectId: string,
    campaignId: string,
    isConfirmed: boolean
  ): void;

  /**
   * 获取项目的Root活动列表
   */
  getProjectRootCampaigns(projectId: string): ProjectRootCampaign[];

  /**
   * 删除项目的Root活动
   */
  removeProjectRootCampaign(projectId: string, campaignId: string): void;

  // ========== Path Analysis ==========

  /**
   * 触发路径分析（自动判断首次/增量）
   */
  async analyzeProject(
    projectId: string,
    onProgress?: (progress: AnalysisProgress) => void
  ): Promise<AnalysisResult>;

  /**
   * 执行首次全量分析
   */
  private async runFullAnalysis(
    projectId: string,
    onProgress?: (progress: AnalysisProgress) => void
  ): Promise<AnalysisResult>;

  /**
   * 执行增量分析
   */
  private async runIncrementalAnalysis(
    projectId: string,
    lastAnalysisTime: Date,
    onProgress?: (progress: AnalysisProgress) => void
  ): Promise<AnalysisResult>;

  // ========== Data Retrieval ==========

  /**
   * 获取项目的路径分析结果
   */
  getProjectPathAnalysis(projectId: string): ProjectPathAnalysisResult;

  /**
   * 获取项目的新用户统计
   */
  getProjectUserStats(projectId: string): ProjectUserStats;

  /**
   * 获取项目的路径边数据
   */
  getProjectPathEdges(projectId: string): ProjectPathEdge[];
}
```

### 2. BatchProcessor (批量处理器)

```typescript
interface BatchProcessorConfig {
  batchSize: number;      // 每批处理数量，默认100
  yieldDelayMs: number;   // 批次间延迟，默认10ms
  maxBlockTimeMs: number; // 最大阻塞时间，默认50ms
}

class BatchProcessor<T> {
  constructor(config?: Partial<BatchProcessorConfig>) {}

  /**
   * 批量处理数据，自动让出控制权
   */
  async processBatch<R>(
    items: T[],
    processor: (item: T) => R,
    onProgress?: (processed: number, total: number) => void
  ): Promise<R[]>;
}
```

### 3. REST API Endpoints

#### GET /api/campaign/projects/:id/root-campaigns
获取项目的Root活动列表

Response:
```json
{
  "projectId": "xxx",
  "rootCampaigns": [
    {
      "campaignId": "yyy",
      "subject": "Welcome to...",
      "isConfirmed": true,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/campaign/projects/:id/root-campaigns
设置项目的Root活动

Request Body:
```json
{
  "campaignId": "yyy",
  "isConfirmed": true
}
```

#### DELETE /api/campaign/projects/:id/root-campaigns/:campaignId
删除项目的Root活动

#### POST /api/campaign/projects/:id/analyze
触发项目路径分析

Response (SSE for progress):
```
event: progress
data: {"phase": "processing_root_emails", "progress": 25, "message": "处理Root邮件中..."}

event: progress
data: {"phase": "building_paths", "progress": 75, "message": "构建路径中..."}

event: complete
data: {"newUsersAdded": 100, "eventsCreated": 500, "edgesUpdated": 200}
```

#### GET /api/campaign/projects/:id/path-analysis
获取项目的路径分析结果

Response:
```json
{
  "projectId": "xxx",
  "userStats": {
    "totalNewUsers": 1000,
    "totalEvents": 5000
  },
  "levelStats": [...],
  "transitions": [...],
  "lastAnalysisTime": "2025-01-01T00:00:00Z"
}
```

## Data Models

### 新增数据表

#### project_root_campaigns
```sql
CREATE TABLE project_root_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  is_confirmed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  UNIQUE(project_id, campaign_id)
);
CREATE INDEX idx_project_root_campaigns_project ON project_root_campaigns(project_id);
```

#### project_new_users
```sql
CREATE TABLE project_new_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  first_root_campaign_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (first_root_campaign_id) REFERENCES campaigns(id),
  UNIQUE(project_id, recipient)
);
CREATE INDEX idx_project_new_users_project ON project_new_users(project_id);
CREATE INDEX idx_project_new_users_recipient ON project_new_users(recipient);
```

#### project_user_events
```sql
CREATE TABLE project_user_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  UNIQUE(project_id, recipient, campaign_id)
);
CREATE INDEX idx_project_user_events_project ON project_user_events(project_id);
CREATE INDEX idx_project_user_events_recipient ON project_user_events(project_id, recipient);
CREATE INDEX idx_project_user_events_seq ON project_user_events(project_id, recipient, seq);
```

#### project_path_edges
```sql
CREATE TABLE project_path_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  from_campaign_id TEXT NOT NULL,
  to_campaign_id TEXT NOT NULL,
  user_count INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (from_campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (to_campaign_id) REFERENCES campaigns(id),
  UNIQUE(project_id, from_campaign_id, to_campaign_id)
);
CREATE INDEX idx_project_path_edges_project ON project_path_edges(project_id);
CREATE INDEX idx_project_path_edges_from ON project_path_edges(project_id, from_campaign_id);
```

#### analysis_projects 表扩展
```sql
ALTER TABLE analysis_projects ADD COLUMN last_analysis_time TEXT;
```

### TypeScript 接口

```typescript
interface ProjectRootCampaign {
  campaignId: string;
  subject: string;
  isConfirmed: boolean;
  createdAt: Date;
}

interface ProjectNewUser {
  recipient: string;
  firstRootCampaignId: string;
  createdAt: Date;
}

interface ProjectUserEvent {
  recipient: string;
  campaignId: string;
  seq: number;
  receivedAt: Date;
}

interface ProjectPathEdge {
  fromCampaignId: string;
  fromSubject: string;
  toCampaignId: string;
  toSubject: string;
  userCount: number;
}

interface AnalysisProgress {
  phase: 'initializing' | 'processing_root_emails' | 'building_events' | 'building_paths' | 'complete';
  progress: number; // 0-100
  message: string;
  details?: {
    processed: number;
    total: number;
  };
}

interface AnalysisResult {
  isIncremental: boolean;
  newUsersAdded: number;
  eventsCreated: number;
  edgesUpdated: number;
  duration: number; // milliseconds
}

interface ProjectPathAnalysisResult {
  projectId: string;
  userStats: {
    totalNewUsers: number;
    totalEvents: number;
  };
  levelStats: CampaignLevelStats[];
  transitions: CampaignTransition[];
  lastAnalysisTime: Date | null;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Project Data Isolation
*For any* two projects A and B (even for the same merchant), modifying Root campaigns, new users, events, or path edges in project A should NOT affect any data in project B.
**Validates: Requirements 1.1, 1.2, 1.3, 1.5, 2.2, 2.4, 3.2, 4.3, 5.2**

### Property 2: Sequence Number Consistency
*For any* project and any user in that project, the sequence numbers in project_user_events should be consecutive integers starting from 1, with no gaps or duplicates.
**Validates: Requirements 4.1, 4.2, 6.5, 7.3**

### Property 3: New User First Root Consistency
*For any* new user in project_new_users, their first_root_campaign_id should match the campaign_id of their seq=1 event in project_user_events.
**Validates: Requirements 3.1, 3.4, 6.4, 7.4**

### Property 4: Path Edge Count Accuracy
*For any* path edge in project_path_edges, the user_count should equal the number of distinct users who have consecutive events (seq=n, seq=n+1) with matching campaign IDs.
**Validates: Requirements 5.1, 5.4, 6.6**

### Property 5: Incremental Analysis Correctness
*For any* incremental analysis, the resulting data should be identical to what a full analysis would produce given the same input data.
**Validates: Requirements 7.2, 7.3, 7.4, 7.5**

### Property 6: Last Analysis Time Update
*For any* completed analysis (full or incremental), the project's last_analysis_time should be updated to a timestamp >= the analysis start time.
**Validates: Requirements 6.7, 7.6**

### Property 7: Batch Processing Non-Blocking
*For any* batch processing operation, the main event loop should not be blocked for more than 50ms continuously.
**Validates: Requirements 8.1, 8.3**

### Property 8: Schema Migration Backward Compatibility
*For any* schema migration, existing data in campaigns, campaign_emails, and recipient_paths tables should remain unchanged.
**Validates: Requirements 10.6**

## Error Handling

1. **Project Not Found**: Return 404 with error message
2. **Campaign Not Found**: Return 404 when setting non-existent campaign as Root
3. **Analysis Already Running**: Return 409 Conflict if analysis is in progress
4. **Database Transaction Failure**: Rollback and return 500 with error details
5. **Invalid Project State**: Return 400 if project has no Root campaigns when analyzing

## Testing Strategy

### Unit Tests
- Test ProjectPathAnalysisService methods in isolation
- Test BatchProcessor with various batch sizes
- Test schema migration scripts

### Property-Based Tests
Using fast-check library:

- **Property 1**: Generate random operations on two projects, verify isolation
- **Property 2**: Generate random email sequences, verify seq consistency
- **Property 3**: Verify first_root_campaign_id matches seq=1 event
- **Property 4**: Verify edge counts match actual transitions
- **Property 5**: Compare incremental vs full analysis results
- **Property 6**: Verify last_analysis_time is updated
- **Property 7**: Measure blocking time during batch processing
- **Property 8**: Verify existing tables unchanged after migration

### Integration Tests
- Test full analysis flow end-to-end
- Test incremental analysis with new emails
- Test project deletion cascades correctly
- Test concurrent analysis requests are queued

