# Design Document

## Overview

本设计文档描述路径分析算法的核心实现。系统已实现项目级数据隔离，本文档重点梳理算法逻辑和数据流程。

**核心服务：** `ProjectPathAnalysisService`

**核心算法流程：**
```
1. Root活动配置 → 2. 新用户识别 → 3. 事件流构建 → 4. 路径边生成 → 5. 层级统计
```

## Worker实例过滤机制

### 项目配置
每个分析项目 (`analysis_projects`) 包含以下Worker相关字段：
- `worker_name`: 主Worker实例名称（向后兼容）
- `worker_names`: 多Worker实例列表（JSON数组，可选）

### 过滤逻辑
```typescript
// 获取项目的Worker范围
getProjectInfo(projectId): { merchantId: string; workerNames: string[] }
  - 如果 worker_names 存在且有效，使用 JSON.parse(worker_names)
  - 否则使用 [worker_name] 作为单元素数组
```

### 三种场景

**场景1: 单Worker实例**
```
项目配置: worker_name = "worker_A", worker_names = null
过滤条件: ce.worker_name IN ('worker_A')
结果: 只分析 worker_A 的邮件数据
```

**场景2: 多Worker实例（指定）**
```
项目配置: worker_name = "worker_A", worker_names = '["worker_A", "worker_B"]'
过滤条件: ce.worker_name IN ('worker_A', 'worker_B')
结果: 聚合分析 worker_A 和 worker_B 的邮件数据
```

**场景3: 同一商户跨Worker分析**
```
商户: example.com
Worker A: 收到 user1@gmail.com 的邮件
Worker B: 收到 user1@gmail.com 的邮件
项目配置: worker_names = '["worker_A", "worker_B"]'
结果: user1@gmail.com 的事件流包含来自两个Worker的邮件
```

### SQL查询示例
```sql
-- 获取Root活动邮件（按Worker范围过滤）
SELECT ce.id, ce.campaign_id, ce.recipient, ce.received_at, ce.worker_name
FROM campaign_emails ce
JOIN campaigns c ON ce.campaign_id = c.id
WHERE c.merchant_id = ?
  AND ce.campaign_id IN (?, ?, ...)  -- Root活动ID列表
  AND ce.worker_name IN (?, ?, ...)  -- Worker名称列表
ORDER BY ce.received_at ASC
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Frontend (HTML/JS)                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Root Campaign   │  │ Path Analysis   │  │ Progress Indicator      │  │
│  │ Management      │  │ Display         │  │ (进度条)                │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
└───────────┼─────────────────────┼───────────────────────┼───────────────┘
            │                     │                       │
            ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        REST API (Fastify)                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ /projects/:id/  │  │ /projects/:id/  │  │ /projects/:id/          │  │
│  │ root-campaigns  │  │ analyze         │  │ reanalyze               │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
└───────────┼─────────────────────┼───────────────────────┼───────────────┘
            │                     │                       │
            ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  ProjectPathAnalysisService                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ setProjectRoot  │  │ runFullAnalysis │  │ forceFullAnalysis       │  │
│  │ getProjectRoots │  │ (首次分析)       │  │ (重新分析)               │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
│           │                    │                        │               │
│  ┌────────┴────────────────────┴────────────────────────┴────────────┐  │
│  │                    runIncrementalAnalysis (增量分析)               │  │
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
│  │ project_path_   │  │ analysis_       │                               │
│  │ edges           │  │ projects        │                               │
│  └─────────────────┘  └─────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. ProjectPathAnalysisService

```typescript
class ProjectPathAnalysisService {
  constructor(private db: Database.Database) {}

  // ========== Root Campaign Management ==========
  
  setProjectRootCampaign(projectId: string, campaignId: string, isConfirmed: boolean): void;
  getProjectRootCampaigns(projectId: string): ProjectRootCampaign[];
  removeProjectRootCampaign(projectId: string, campaignId: string): void;

  // ========== New User Management ==========
  
  addProjectNewUser(projectId: string, recipient: string, firstRootCampaignId: string): void;
  getProjectNewUsers(projectId: string): ProjectNewUser[];
  isProjectNewUser(projectId: string, recipient: string): boolean;

  // ========== Event Stream Management ==========
  
  addUserEvent(projectId: string, recipient: string, campaignId: string, receivedAt: Date): number;
  getUserEvents(projectId: string, recipient: string): ProjectUserEvent[];
  getMaxSeq(projectId: string, recipient: string): number;

  // ========== Path Edge Management ==========
  
  updatePathEdge(projectId: string, fromCampaignId: string, toCampaignId: string, userCount: number): void;
  getProjectPathEdges(projectId: string): ProjectPathEdge[];
  buildPathEdgesFromEvents(projectId: string): void;

  // ========== Analysis Methods ==========
  
  async analyzeProject(projectId: string, onProgress?: (progress: AnalysisProgress) => void): Promise<AnalysisResult>;
  async runFullAnalysis(projectId: string, onProgress?: (progress: AnalysisProgress) => void): Promise<AnalysisResult>;
  async runIncrementalAnalysis(projectId: string, lastAnalysisTime: Date, onProgress?: (progress: AnalysisProgress) => void): Promise<AnalysisResult>;
  async forceFullAnalysis(projectId: string, onProgress?: (progress: AnalysisProgress) => void): Promise<AnalysisResult>;
}
```

### 2. Algorithm Details

#### 2.1 首次分析算法 (runFullAnalysis)

**触发条件：** `last_analysis_time = NULL`

**流程图：**
```
┌─────────────────────────────────────────────────────────────────┐
│                        首次分析流程                              │
├─────────────────────────────────────────────────────────────────┤
│ 1. 获取项目信息 (merchantId, workerNames)                        │
│    - 从 analysis_projects 表读取                                │
│    - 解析 worker_names JSON 或使用 worker_name                  │
│                                                                 │
│ 2. 获取已确认的Root活动列表                                      │
│    - 查询 project_root_campaigns WHERE is_confirmed = 1         │
│    - 如果为空，直接返回（无需分析）                              │
│                                                                 │
│ 3. 清空项目分析数据                                              │
│    - DELETE FROM project_new_users WHERE project_id = ?         │
│    - DELETE FROM project_user_events WHERE project_id = ?       │
│    - DELETE FROM project_path_edges WHERE project_id = ?        │
│                                                                 │
│ 4. Phase 1: 处理Root邮件 → 识别新用户                           │
│    - 查询所有Root活动的邮件 (按merchantId + workerNames过滤)     │
│    - 按recipient分组，找到每个recipient的第一封Root邮件          │
│    - 将recipient加入 project_new_users                          │
│    - 创建 seq=1 事件到 project_user_events                      │
│                                                                 │
│ 5. Phase 2: 构建事件流                                          │
│    - 获取所有new_users的recipient列表                           │
│    - 查询这些recipient的所有邮件 (按merchantId + workerNames过滤)│
│    - 按 received_at 排序                                        │
│    - 跳过Root活动邮件 (已在Phase 1处理)                         │
│    - 为每封邮件创建事件 (seq = max(seq) + 1)                    │
│                                                                 │
│ 6. Phase 3: 生成路径边                                          │
│    - 调用 buildPathEdgesFromEvents()                            │
│    - 统计 seq=n → seq=n+1 的转移次数                            │
│                                                                 │
│ 7. 更新 last_analysis_time = NOW()                              │
└─────────────────────────────────────────────────────────────────┘
```

**代码位置：** `runFullAnalysis()` 方法

---

#### 2.2 增量分析算法 (runIncrementalAnalysis)

**触发条件：** `last_analysis_time != NULL`

**流程图：**
```
┌─────────────────────────────────────────────────────────────────┐
│                        增量分析流程                              │
├─────────────────────────────────────────────────────────────────┤
│ 1. 获取项目信息 (merchantId, workerNames)                        │
│                                                                 │
│ 2. 获取已确认的Root活动列表                                      │
│                                                                 │
│ 3. 加载已有 new_users 列表                                       │
│    - 查询 project_new_users WHERE project_id = ?                │
│    - 构建 existingRecipients Set                                │
│                                                                 │
│ 4. Phase 1: 处理新增Root邮件                                    │
│    - 查询 received_at > last_analysis_time 的Root邮件           │
│    - 过滤掉已存在于 existingRecipients 的recipient              │
│    - 将新recipient加入 project_new_users                        │
│    - 创建 seq=1 事件                                            │
│    - 将新recipient加入 existingRecipients Set                   │
│                                                                 │
│ 5. Phase 2: 处理新增邮件                                        │
│    - 查询 received_at > last_analysis_time 的所有邮件           │
│    - 过滤只保留 existingRecipients 中的邮件                     │
│    - 按 received_at 排序                                        │
│    - 为每封邮件创建事件 (seq = max(seq) + 1)                    │
│    - 跳过新增用户的Root邮件（已在Phase 1处理）                  │
│                                                                 │
│ 6. Phase 3: 重建路径边                                          │
│    - 调用 buildPathEdgesFromEvents()                            │
│    - 注意：这里是完全重建，不是增量更新                         │
│                                                                 │
│ 7. 更新 last_analysis_time = NOW()                              │
└─────────────────────────────────────────────────────────────────┘
```

**代码位置：** `runIncrementalAnalysis()` 方法

**关键点：**
- 增量分析只处理 `last_analysis_time` 之后的新邮件
- 但路径边是完全重建的（因为新事件可能改变统计）

---

#### 2.3 重新分析算法 (forceFullAnalysis)

**触发条件：** 用户手动点击"重新分析"按钮

**流程图：**
```
┌─────────────────────────────────────────────────────────────────┐
│                        重新分析流程                              │
├─────────────────────────────────────────────────────────────────┤
│ 1. 清空 last_analysis_time                                      │
│    - UPDATE analysis_projects SET last_analysis_time = NULL     │
│                                                                 │
│ 2. 执行首次分析流程 (runFullAnalysis)                           │
│    - 会自动清空 new_users, events, edges                        │
│    - 重新处理所有历史数据                                       │
└─────────────────────────────────────────────────────────────────┘
```

**代码位置：** `forceFullAnalysis()` 方法

**使用场景：**
- Root活动配置发生变化
- 需要修复数据问题
- Worker配置变更后

---

#### 2.4 路径边生成算法 (buildPathEdgesFromEvents)

```
输入: projectId
输出: void (直接更新数据库)

步骤:
1. 获取项目所有事件，按recipient和seq排序
2. 按recipient分组
3. 统计转移:
   for each recipient's events:
     for i = 0 to events.length - 2:
       if events[i+1].seq == events[i].seq + 1:
         key = events[i].campaignId + ":" + events[i+1].campaignId
         transitionCounts[key]++
4. 清空现有路径边
5. 插入新路径边
```

#### 2.4 层级计算算法 (buildLevelStats)

```
输入: rootCampaigns, pathEdges, totalNewUsers, campaignTags
输出: CampaignLevelStat[]

步骤:
1. 初始化: Root活动 = Level 1
2. 构建邻接表 (from -> [to])
3. BFS遍历:
   queue = [所有Root活动]
   while queue not empty:
     campaign = queue.shift()
     for each edge from campaign:
       if edge.to not visited:
         edge.to.level = campaign.level + 1
         queue.push(edge.to)
4. 计算用户数和覆盖率
5. 按level排序，同一level内按价值优先排序:
   - tag=2 (高价值) 排最前
   - tag=1 (有价值) 排第二
   - 其他按userCount降序
6. 返回结果
```

#### 2.5 有价值活动统计算法 (calculateValuableStats)

**新增功能 (Requirements 9.1-9.6)**

```
输入: projectId, levelStats, userEvents
输出: ValuableStats

步骤:
1. 获取所有有价值活动 (tag=1 或 tag=2)
2. 统计有价值活动数量:
   - valuableCampaignCount = count(tag=1 or tag=2)
   - highValueCampaignCount = count(tag=2)
3. 计算有价值活动触达用户:
   - 遍历所有用户事件
   - 统计到达过任意有价值活动的用户数
   - valuableUserReach = distinct users who reached valuable campaigns
4. 计算转化率:
   - valuableConversionRate = valuableUserReach / totalNewUsers * 100
5. 返回统计结果
```

**数据结构:**
```typescript
interface ValuableStats {
  valuableCampaignCount: number;    // 有价值活动数量 (tag=1 or tag=2)
  highValueCampaignCount: number;   // 高价值活动数量 (tag=2)
  valuableUserReach: number;        // 到达有价值活动的用户数
  valuableConversionRate: number;   // 有价值转化率 (%)
}

## Data Models

### 数据表结构

```sql
-- 项目Root活动配置
CREATE TABLE project_root_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  is_confirmed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, campaign_id)
);

-- 项目新用户列表
CREATE TABLE project_new_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  first_root_campaign_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, recipient)
);

-- 用户事件流
CREATE TABLE project_user_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE(project_id, recipient, campaign_id)
);

-- 路径边
CREATE TABLE project_path_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  from_campaign_id TEXT NOT NULL,
  to_campaign_id TEXT NOT NULL,
  user_count INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, from_campaign_id, to_campaign_id)
);

-- 分析项目 (扩展)
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
}

interface AnalysisResult {
  isIncremental: boolean;
  newUsersAdded: number;
  eventsCreated: number;
  edgesUpdated: number;
  duration: number;
}

interface ValuableStats {
  valuableCampaignCount: number;    // 有价值活动数量 (tag=1 or tag=2)
  highValueCampaignCount: number;   // 高价值活动数量 (tag=2)
  valuableUserReach: number;        // 到达有价值活动的用户数
  valuableConversionRate: number;   // 有价值转化率 (%)
}

interface PathAnalysisResult {
  rootCampaigns: ProjectRootCampaign[];
  userStats: ProjectUserStats;
  levelStats: CampaignLevelStat[];
  transitions: PathTransition[];
  valuableStats: ValuableStats;     // 新增：有价值活动统计
  lastAnalysisTime: Date | null;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Root Email Recipients Become New Users
*For any* Root campaign email recipient within the project's worker scope, that recipient should exist in project_new_users with the correct first_root_campaign_id.
**Validates: Requirements 2.1, 2.2, 6.3, 7.4**

### Property 2: New User Uniqueness
*For any* recipient in project_new_users, there should be exactly one entry per project (no duplicates).
**Validates: Requirements 2.3**

### Property 3: Sequence Number Initialization
*For any* new user in project_new_users, there should be exactly one event with seq=1 corresponding to their Root campaign email.
**Validates: Requirements 3.1, 6.4**

### Property 4: Sequence Number Continuity
*For any* user's events in project_user_events, the sequence numbers should be consecutive integers starting from 1 with no gaps.
**Validates: Requirements 3.2, 7.5**

### Property 5: Campaign Event Uniqueness
*For any* (project_id, recipient, campaign_id) combination, there should be at most one event in project_user_events.
**Validates: Requirements 3.3**

### Property 6: Path Edge Accuracy
*For any* path edge in project_path_edges, the user_count should equal the number of distinct users who have consecutive events (seq=n, seq=n+1) with matching campaign IDs.
**Validates: Requirements 4.1, 4.2**

### Property 7: Path Edge Rebuild Consistency
*For any* project, calling buildPathEdgesFromEvents() multiple times should produce identical results given the same event data.
**Validates: Requirements 4.4**

### Property 8: Level Assignment Correctness
*For any* campaign in level stats, Root campaigns should be Level 1, and non-Root campaigns should have level = min(parent levels) + 1.
**Validates: Requirements 5.1, 5.2, 5.3**

### Property 9: Analysis Mode Selection
*For any* project, if last_analysis_time is NULL then full analysis runs, otherwise incremental analysis runs.
**Validates: Requirements 6.1, 7.1**

### Property 10: Last Analysis Time Update
*For any* completed analysis (full, incremental, or re-analysis), the project's last_analysis_time should be updated to a timestamp >= the analysis start time.
**Validates: Requirements 6.7, 7.8**

### Property 11: Re-analysis Data Clearing
*For any* re-analysis operation, all project analysis data (new_users, events, edges) should be cleared before processing.
**Validates: Requirements 8.2**

### Property 12: Valuable Campaign Priority Sorting
*For any* level stats result, within the same level, campaigns should be sorted with tag=2 first, then tag=1, then others by userCount descending.
**Validates: Requirements 9.1**

### Property 13: Valuable User Reach Accuracy
*For any* project, valuableUserReach should equal the count of distinct users who have at least one event with a campaign where tag=1 or tag=2.
**Validates: Requirements 9.3, 9.4**

### Property 14: Valuable Conversion Rate Calculation
*For any* project with totalNewUsers > 0, valuableConversionRate should equal (valuableUserReach / totalNewUsers) * 100.
**Validates: Requirements 9.5**

## Error Handling

1. **Project Not Found**: Return 404 with error message
2. **No Root Campaigns**: Return warning, analysis produces empty results
3. **Analysis Already Running**: Return 409 Conflict
4. **Database Transaction Failure**: Rollback and return 500

## Testing Strategy

### Unit Tests
- Test each service method in isolation
- Test edge cases (empty data, single user, etc.)

### Property-Based Tests
Using fast-check library:

- **Property 1**: Generate random Root emails, verify all recipients in new_users
- **Property 2**: Generate duplicate add operations, verify no duplicates
- **Property 3**: Verify every new user has exactly one seq=1 event
- **Property 4**: Generate random email sequences, verify seq continuity
- **Property 5**: Generate duplicate campaign emails, verify uniqueness
- **Property 6**: Verify edge counts match actual transitions
- **Property 7**: Run buildPathEdgesFromEvents twice, compare results
- **Property 8**: Verify level assignments follow BFS rules
- **Property 9**: Test analysis mode selection with various last_analysis_time values
- **Property 10**: Verify timestamp updates after analysis
- **Property 11**: Verify data is cleared during re-analysis
- **Property 12**: Verify valuable campaigns are sorted first within each level
- **Property 13**: Verify valuableUserReach counts distinct users reaching valuable campaigns
- **Property 14**: Verify valuableConversionRate calculation accuracy

### Integration Tests
- Test full analysis flow end-to-end
- Test incremental analysis with new emails
- Test re-analysis clears and rebuilds correctly
