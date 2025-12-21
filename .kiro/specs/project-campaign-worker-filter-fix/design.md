# Design Document: Project Campaign Worker Filter Fix

## Overview

本设计文档描述了修复项目详情页营销活动列表 Worker 过滤问题的方案。问题根源是在调用 `getProjectCampaignsWithTags` 方法时，没有正确处理项目只有 `workerName`（单个 Worker）而没有 `workerNames`（Worker 数组）的情况。

## Architecture

### 问题分析

当前代码流程：
```
GET /api/campaign/projects/:id/campaigns
  ↓
getAnalysisProjectById(id) → project
  ↓
getProjectCampaignsWithTags(projectId, merchantId, project.workerNames)
  ↓
如果 workerNames 为 undefined → 返回所有商户营销活动（错误！）
```

问题：
- `project.workerNames` 可能是 `undefined`（当项目只设置了 `workerName` 时）
- `getProjectCampaignsWithTags` 方法在 `workerNames` 为空时不进行过滤
- 导致不同 Worker 的项目显示相同的营销活动列表

### 修复方案

在 API 层正确计算 Worker 过滤数组：

```
GET /api/campaign/projects/:id/campaigns
  ↓
getAnalysisProjectById(id) → project
  ↓
计算 effectiveWorkerNames:
  - 如果 project.workerNames 有值 → 使用 workerNames
  - 否则如果 project.workerName 有值 → 使用 [workerName]
  - 否则 → undefined（返回所有）
  ↓
getProjectCampaignsWithTags(projectId, merchantId, effectiveWorkerNames)
```

## Components and Interfaces

### 修改的文件

1. **packages/vps-api/src/routes/campaign.ts**
   - 修改 `GET /api/campaign/projects/:id/campaigns` 端点
   - 在调用 `getProjectCampaignsWithTags` 前计算 `effectiveWorkerNames`

### 代码修改

```typescript
// 当前代码（有问题）
const campaigns = pathService.getProjectCampaignsWithTags(
  request.params.id,
  project.merchantId,
  project.workerNames  // 可能是 undefined
);

// 修复后的代码
const effectiveWorkerNames = project.workerNames && project.workerNames.length > 0
  ? project.workerNames
  : (project.workerName ? [project.workerName] : undefined);

const campaigns = pathService.getProjectCampaignsWithTags(
  request.params.id,
  project.merchantId,
  effectiveWorkerNames
);
```

## Data Models

无需修改数据模型，现有的 `AnalysisProject` 接口已经包含 `workerName` 和 `workerNames` 字段。

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Worker Filter Derivation

*For any* project with either `workerName` or `workerNames` set, the system should derive the correct worker filter array: use `workerNames` if available and non-empty, otherwise use `[workerName]` if `workerName` is set.

**Validates: Requirements 1.1, 1.2, 2.1, 2.2**

### Property 2: Campaign Filtering by Worker

*For any* project with worker association, the returned campaigns should only include those that have at least one email from the project's associated worker(s). The email counts and recipient counts should reflect only the data from those workers.

**Validates: Requirements 1.3, 3.1, 3.2**

### Property 3: Backward Compatibility

*For any* project without worker association (both `workerName` and `workerNames` are empty/undefined), the system should return all campaigns for the merchant.

**Validates: Requirements 1.4**

## Error Handling

- 如果项目不存在，返回 404 错误
- 如果数据库查询失败，返回 500 错误并记录日志

## Testing Strategy

### Unit Tests

1. 测试 `effectiveWorkerNames` 计算逻辑
2. 测试不同项目配置下的 API 响应

### Property-Based Tests

使用 fast-check 库进行属性测试：

1. **Property 1 测试**: 生成随机项目配置，验证 Worker 过滤数组计算正确
2. **Property 2 测试**: 生成随机营销活动和邮件数据，验证过滤结果正确
3. **Property 3 测试**: 测试无 Worker 关联的项目返回所有营销活动

每个属性测试运行至少 100 次迭代。
