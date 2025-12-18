# Design Document

## Overview

路径分析增强功能基于现有的 `CampaignAnalyticsService` 进行扩展，主要涉及：
1. 修改 `rebuildRecipientPaths` 方法支持多 Worker 选择
2. 添加 `cleanupOldCustomerPaths` 方法清理老客户数据
3. 修改前端渲染逻辑，移除层级限制并增强高亮显示
4. 扩展项目数据模型支持多 Worker 配置

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (HTML/JS)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Path Tab UI │  │ Project UI  │  │ Worker Selection Modal  │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
          ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      REST API (Fastify)                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ /path-analysis   │  │ /rebuild-paths   │  │ /cleanup-old  │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘  │
└───────────┼─────────────────────┼────────────────────┼──────────┘
            │                     │                    │
            ▼                     ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CampaignAnalyticsService                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ getPathAnalysis  │  │rebuildRecipient  │  │cleanupOldCust │  │
│  │                  │  │     Paths        │  │   omerPaths   │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘  │
└───────────┼─────────────────────┼────────────────────┼──────────┘
            │                     │                    │
            ▼                     ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SQLite Database                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  campaigns   │  │campaign_emails│  │  recipient_paths    │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. CampaignAnalyticsService Extensions

#### rebuildRecipientPaths (已添加，需增强)
```typescript
rebuildRecipientPaths(
  merchantId: string,
  workerNames?: string[]  // 支持多个 Worker，空数组或 undefined 表示全部
): {
  pathsDeleted: number;
  pathsCreated: number;
  recipientsProcessed: number;
}
```

#### cleanupOldCustomerPaths (新增)
```typescript
cleanupOldCustomerPaths(
  merchantId: string,
  workerNames?: string[]
): {
  pathsDeleted: number;
  recipientsAffected: number;
}
```

### 2. REST API Endpoints

#### POST /api/campaign/merchants/:id/rebuild-paths
重建商户的收件人路径

Request Body:
```json
{
  "workerNames": ["worker1", "worker2"]  // 可选，空或不传表示全部
}
```

Response:
```json
{
  "merchantId": "xxx",
  "pathsDeleted": 100,
  "pathsCreated": 150,
  "recipientsProcessed": 50
}
```

#### POST /api/campaign/merchants/:id/cleanup-old-customers
清理老客户路径数据

Request Body:
```json
{
  "workerNames": ["worker1", "worker2"]  // 可选
}
```

Response:
```json
{
  "merchantId": "xxx",
  "pathsDeleted": 80,
  "recipientsAffected": 30
}
```

### 3. Frontend Functions

#### recalculatePathsForProject()
调用重建路径 API 并刷新显示

#### cleanupOldCustomersForProject()
调用清理老客户 API 并刷新显示

#### renderProjectPathAnalysis(data) (增强)
- 移除层级限制
- 增强高亮显示逻辑
- 移除树深度限制

## Data Models

### AnalysisProject (扩展)
```typescript
interface AnalysisProject {
  id: string;
  name: string;
  merchantId: string;
  workerName: string;           // 主 Worker（向后兼容）
  workerNames?: string[];       // 多 Worker 列表（新增）
  status: 'active' | 'completed' | 'archived';
  rootCampaignId?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### PathAnalysisResult (现有)
```typescript
interface PathAnalysisResult {
  merchantId: string;
  rootCampaigns: RootCampaign[];
  userStats: UserTypeStats;
  levelStats: CampaignLevelStats[];
  transitions: Transition[];
  valuableAnalysis: ValuableCampaign[];
  oldUserStats: CampaignCoverage[];
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Path Rebuild Consistency
*For any* merchant with campaign_emails data, rebuilding paths should create paths that match the chronological order of emails for each recipient.
**Validates: Requirements 3.2**

### Property 2: Worker Filter Isolation
*For any* rebuild operation with specified workerNames, the resulting paths should only contain data from those workers.
**Validates: Requirements 3.3, 4.1, 4.2**

### Property 3: Old Customer Identification
*For any* recipient whose first email is not from a Root campaign, that recipient should be identified as an old customer.
**Validates: Requirements 7.1, 7.2**

### Property 4: Old Customer Cleanup Preservation
*For any* cleanup operation, campaign_emails records should be preserved while only recipient_paths entries are removed.
**Validates: Requirements 7.5**

### Property 5: Level Stats Completeness
*For any* path analysis result, all campaigns with new users should appear in levelStats with correct level assignments.
**Validates: Requirements 1.1, 1.2, 5.1, 5.2, 5.3**

### Property 6: User Statistics Accuracy
*For any* path analysis result, the sum of newUsers and oldUsers should equal totalRecipients.
**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

## Error Handling

1. **Merchant Not Found**: Return 404 with error message
2. **No Root Campaign Set**: Return warning in response, UI shows prompt
3. **Database Transaction Failure**: Rollback and return 500 with error details
4. **Invalid Worker Names**: Ignore invalid workers, proceed with valid ones

## Testing Strategy

### Unit Tests
- Test `rebuildRecipientPaths` with various worker configurations
- Test `cleanupOldCustomerPaths` preserves campaign_emails
- Test level calculation with deep paths

### Property-Based Tests
Using fast-check library:
- Property 1: Generate random email sequences, verify path order matches timestamp order
- Property 2: Generate multi-worker data, verify filter isolation
- Property 3: Generate paths with various first emails, verify classification
- Property 4: Verify cleanup preserves emails
- Property 5: Verify all new-user campaigns appear in levelStats
- Property 6: Verify user count consistency

### Integration Tests
- Test full rebuild -> cleanup -> analysis flow
- Test multi-worker aggregation
- Test UI rendering with various data shapes
