# Design Document: Merchant Data Management

## Overview

本模块实现商户数据的 Worker 级别隔离管理，主要包括：
- 数据来源标记：邮件按来源 Worker 标记
- Worker 隔离显示：商户列表按 Worker 分别显示
- 数据删除功能：删除商户在特定 Worker 下的所有数据
- 全局分析预留：支持跨 Worker 分析（预留功能）

### 核心变更
- 增强现有的 Worker 数据隔离机制
- 添加商户数据删除 API 和 UI
- 预留全局分析的数据结构和接口

### 设计约束
- 复用现有的 CampaignAnalyticsService
- 保持与现有 API 的向后兼容性
- 删除操作需要确认，防止误删

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    数据流向                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Email Worker A ──┐                                             │
│                   │    ┌─────────────────────────────────┐     │
│  Email Worker B ──┼───▶│  VPS API                        │     │
│                   │    │  - trackEmail(workerName)       │     │
│  Email Worker C ──┘    │  - campaign_emails.worker_name  │     │
│                        └─────────────────────────────────┘     │
│                                      │                          │
│                                      ▼                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    SQLite Database                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │ merchants   │  │ campaigns   │  │ campaign_emails │  │   │
│  │  │             │  │             │  │ - worker_name   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │   │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │ recipient_paths │  │ analysis_projects           │   │   │
│  │  │                 │  │ - worker_name               │   │   │
│  │  └─────────────────┘  └─────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 数据隔离模型

```
┌─────────────────────────────────────────────────────────────────┐
│                    Worker 数据隔离视图                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Worker A 视图:                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 商户: example.com                                        │   │
│  │ - 邮件数: 150 (仅 Worker A 的数据)                        │   │
│  │ - 活动数: 12 (仅 Worker A 的数据)                         │   │
│  │ [删除数据] [创建项目]                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Worker B 视图:                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 商户: example.com                                        │   │
│  │ - 邮件数: 80 (仅 Worker B 的数据)                         │   │
│  │ - 活动数: 8 (仅 Worker B 的数据)                          │   │
│  │ [删除数据] [创建项目]                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  全局视图 (预留):                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 商户: example.com                                        │   │
│  │ - 总邮件数: 230                                          │   │
│  │ - Worker A: 150 | Worker B: 80                          │   │
│  │ [创建全局项目]                                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. 数据删除服务

```typescript
interface DeleteMerchantDataDTO {
  merchantId: string;
  workerName: string;
}

interface DeleteMerchantDataResult {
  merchantId: string;
  workerName: string;
  emailsDeleted: number;
  pathsDeleted: number;
  campaignsAffected: number;
  merchantDeleted: boolean; // true if merchant record was also deleted
}
```

### 2. API 接口

```typescript
// 删除商户数据 API
DELETE /api/campaign/merchants/:id/data?workerName=xxx

// 响应
{
  success: true,
  result: {
    merchantId: string,
    workerName: string,
    emailsDeleted: number,
    pathsDeleted: number,
    campaignsAffected: number,
    merchantDeleted: boolean
  }
}

// 获取商户在各 Worker 下的数据分布 (预留)
GET /api/campaign/merchants/:id/distribution

// 响应
{
  merchantId: string,
  domain: string,
  workers: [
    { workerName: string, emailCount: number, campaignCount: number }
  ]
}
```

### 3. 前端组件

```typescript
// 商户列表项（带删除按钮）
interface MerchantListItemWithDelete {
  id: string;
  domain: string;
  displayName?: string;
  totalEmails: number;
  totalCampaigns: number;
  hasProject: boolean;
  onDelete: () => void;
  onCreateProject: () => void;
}

// 删除确认对话框
interface DeleteConfirmDialog {
  merchantDomain: string;
  workerName: string;
  emailCount: number;
  campaignCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}
```

## Data Models

### 现有数据模型（复用）

本设计复用现有的数据模型，主要依赖 `campaign_emails.worker_name` 字段进行数据隔离：

- `merchants` - 商户基本信息（全局共享）
- `campaigns` - 营销活动（通过 campaign_emails 关联 Worker）
- `campaign_emails` - 邮件记录（包含 worker_name 字段）
- `recipient_paths` - 收件人路径
- `analysis_projects` - 分析项目（包含 worker_name 字段）

### 数据删除逻辑

```sql
-- 删除商户在特定 Worker 下的邮件记录
DELETE FROM campaign_emails 
WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE merchant_id = ?
) AND worker_name = ?;

-- 删除商户在特定 Worker 下的路径记录
-- 注意：recipient_paths 目前没有 worker_name 字段
-- 需要通过 campaign_emails 关联判断
DELETE FROM recipient_paths 
WHERE merchant_id = ? 
AND recipient IN (
  SELECT DISTINCT recipient FROM campaign_emails 
  WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?)
  AND worker_name = ?
);

-- 检查商户是否还有其他 Worker 的数据
SELECT COUNT(*) FROM campaign_emails 
WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = ?);

-- 如果没有数据，删除商户记录
DELETE FROM merchants WHERE id = ?;
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Worker Data Source Tagging
*For any* email tracked by the system, the campaign_emails record should contain the correct worker_name that matches the source Worker.
**Validates: Requirements 1.1, 1.2**

### Property 2: Worker Filter Isolation
*For any* merchant list query with a workerName filter, all returned merchants should have at least one email from that Worker.
**Validates: Requirements 1.3, 2.1**

### Property 3: Worker Statistics Accuracy
*For any* merchant displayed in a Worker-filtered view, the email count and campaign count should only include data from that specific Worker.
**Validates: Requirements 2.2, 6.1, 6.2**

### Property 4: Cross-Worker Data Independence
*For any* merchant that exists in multiple Workers, the statistics shown in each Worker view should be independent and not affect each other.
**Validates: Requirements 2.3**

### Property 5: Delete Removes Worker Emails
*For any* delete operation on a merchant for a specific Worker, all campaign_emails records for that merchant and Worker should be removed.
**Validates: Requirements 3.2**

### Property 6: Delete Removes Worker Paths
*For any* delete operation on a merchant for a specific Worker, all recipient_paths records associated with that Worker's data should be removed.
**Validates: Requirements 3.3**

### Property 7: Delete Preserves Other Worker Data
*For any* delete operation on a merchant for Worker A, if the merchant has data in Worker B, the Worker B data should remain unchanged.
**Validates: Requirements 3.5**

### Property 8: Delete Cleans Up Empty Merchant
*For any* merchant that has no remaining data in any Worker after a delete operation, the merchant record should be removed.
**Validates: Requirements 3.6**

### Property 9: Project Worker Association
*For any* analysis project, the project should be associated with a specific Worker name, and queries should respect this association.
**Validates: Requirements 4.1, 4.4**

### Property 10: Project Data Isolation
*For any* analysis project opened, the loaded data should only include records from the project's associated Worker.
**Validates: Requirements 4.2**

### Property 11: Statistics Update After Delete
*For any* delete operation, the merchant statistics should be updated to reflect the remaining data.
**Validates: Requirements 6.4**

## Error Handling

### 删除操作错误处理
- 商户不存在：返回 404 错误
- Worker 名称无效：返回 400 错误
- 数据库操作失败：返回 500 错误并回滚事务
- 并发删除冲突：使用事务确保数据一致性

### 用户确认流程
- 删除前显示将要删除的数据量
- 要求用户明确确认
- 删除后显示操作结果

### 数据一致性
- 使用数据库事务确保删除操作的原子性
- 删除失败时回滚所有更改
- 删除成功后刷新相关统计数据

## Testing Strategy

### Unit Testing
- 使用 Vitest 进行单元测试
- 测试数据删除逻辑的正确性
- 测试统计计算的准确性

### Property-Based Testing
- 使用 fast-check 库进行属性测试
- 每个属性测试运行至少 100 次迭代
- 测试标注格式: `**Feature: merchant-data-management, Property {number}: {property_text}**`

### Integration Testing
- 测试 API 端点的完整流程
- 测试删除操作的事务性
- 测试前端与后端的交互

### Test Coverage Goals
- 删除逻辑: 100%
- 统计计算: 100%
- API 端点: 90%+

