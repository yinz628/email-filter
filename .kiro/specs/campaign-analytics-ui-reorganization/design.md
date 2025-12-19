# Design Document

## Overview

营销分析模块 UI 重组，基于现有代码进行优化，主要涉及：
1. 新增 API 端点获取按 Worker 分组的商户列表
2. 简化 UI 结构，移除标题区，只保留商户列表和项目列表
3. 更新商户列表 UI，支持"全部实例"筛选和 Worker 标签显示
4. 修复项目创建功能中的 bug

## 现有代码结构

### 后端 (campaign.ts)
```
/api/campaign/merchants          - GET 商户列表 (支持 workerName 筛选)
/api/campaign/merchants/:id      - GET 单个商户
/api/campaign/merchants/:id/data - DELETE 删除商户数据 (支持 workerName)
/api/campaign/projects           - GET/POST 项目列表/创建
/api/campaign/workers/:workerName/merchants - GET 特定 Worker 的商户
```

### 前端 (frontend.ts)
```
campaign-tab                     - 营销分析主标签页
├── campaign-header-section      - 标题区 (将移除)
├── campaign-merchants-section   - 商户列表区 (保留并增强)
├── campaign-projects-section    - 项目列表区 (保留)
├── campaign-project-detail-section - 项目详情区 (保留)
└── campaign-data-management-section - 数据管理区 (隐藏)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Campaign Analytics Tab (简化后)               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              🏪 商户列表                                  │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │  Worker Filter: [全部实例▼] [排序▼] [刷新]       │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │  | 商户域名 | Worker实例 | 活动数 | 邮件数 | 操作 │    │    │
│  │  │  | macys   | ndemail   | 10     | 500   | ...  │    │    │
│  │  │  | macys   | aloemail  | 8      | 300   | ...  │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              📁 分析项目                                  │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │  | 项目名称 | 商户域名 | Worker | 状态 | 操作    │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              项目详情区 (点击项目后显示)                   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. 新增 API 端点

#### GET /api/campaign/merchants-by-worker
获取所有 Worker 的商户列表（按 Worker 分组）

Query Parameters:
- `workerName` (optional): 筛选特定 Worker，不传则返回所有

Response:
```json
{
  "merchants": [
    {
      "id": "xxx",
      "domain": "macys.com",
      "workerName": "ndemail.store",
      "totalCampaigns": 10,
      "totalEmails": 500,
      "displayName": "Macy's"
    },
    {
      "id": "xxx",
      "domain": "macys.com",
      "workerName": "aloemail.store",
      "totalCampaigns": 8,
      "totalEmails": 300,
      "displayName": "Macy's"
    }
  ]
}
```

### 2. 服务层新增方法

#### getMerchantsByWorker()
```typescript
getMerchantsByWorker(): MerchantByWorker[] {
  // 查询所有 Worker 的商户数据
  // 返回 merchant + workerName 组合列表
}
```

### 3. 前端函数修改

#### loadMerchantList() (修改)
- 当 workerFilter 为空或"全部实例"时，调用新 API 获取所有 Worker 的商户
- 当 workerFilter 为特定 Worker 时，使用现有 API

#### renderMerchants() (修改)
- 添加 Worker 实例列
- 显示 Worker 名称标签

### 4. UI 修改

#### 移除的元素
- `campaign-header-section` - 标题区

#### 修改的元素
- `campaign-worker-filter` - 添加"全部实例"选项
- 商户表格 - 添加 Worker 实例列
- 商户操作按钮 - 始终显示删除按钮（传递 workerName）

## Data Models

### MerchantByWorker (新增)
```typescript
interface MerchantByWorker {
  id: string;
  domain: string;
  workerName: string;
  totalCampaigns: number;
  totalEmails: number;
  displayName?: string;
  note?: string;
}
```

### 现有模型 (保持不变)
- Merchant
- AnalysisProject
- CreateProjectRequest (已支持 workerNames)

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Worker Instance Separation
*For any* merchant that exists in multiple Worker instances, the getMerchantsByWorker API should return separate entries for each Worker instance with independent statistics calculated from that Worker's data only.
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Worker Filter Isolation
*For any* Worker filter selection, the merchant list API should only return merchants that have data from the selected Worker instance. When "全部实例" is selected, all merchant-worker combinations should be returned.
**Validates: Requirements 1.4, 3.2, 3.3**

### Property 3: Delete Worker Data Isolation
*For any* delete operation on a merchant-worker combination (using existing deleteMerchantData API), only the data for that specific Worker instance should be removed, preserving data from other Worker instances.
**Validates: Requirements 4.4**

### Property 4: Project Creation with Multiple Workers
*For any* project creation request with multiple Worker instances (using existing POST /api/campaign/projects), the project should be successfully created and the workerNames array should be stored correctly.
**Validates: Requirements 5.2, 5.3**

## Error Handling

1. **Merchant Not Found**: Return 404 with error message (existing behavior)
2. **Invalid Worker Name**: Return 400 with validation error
3. **Project Creation Failure**: Return error with specific reason (e.g., duplicate name, invalid merchant)
4. **Database Error**: Return 500 with generic error message (existing behavior)

## Testing Strategy

### Unit Tests
- Test getMerchantsByWorker returns correct grouped data
- Test existing getMerchants with workerName filter
- Test project creation with workerNames array

### Property-Based Tests
Using fast-check library (existing test infrastructure):
- Property 1: Generate multi-worker merchant data, verify separate entries
- Property 2: Generate filter scenarios, verify correct filtering
- Property 3: Use existing delete tests (Property 5, 6 from merchant-data-management)
- Property 4: Generate project creation requests, verify success

### Integration Tests
- Test full flow: list merchants -> create project -> view project
- Test Worker filter with various data scenarios

## 与现有代码的整合点

### 复用的代码
1. `getMerchants(filter)` - 已支持 workerName 筛选
2. `deleteMerchantData(data)` - 已支持 workerName
3. `showCreateProjectModal()` - 已支持多 Worker 选择
4. 项目创建 API - 已支持 workerNames 数组

### 需要新增的代码
1. `getMerchantsByWorker()` - 服务层方法
2. `GET /api/campaign/merchants-by-worker` - API 端点
3. 前端 Worker 筛选逻辑更新
4. 商户表格 Worker 列渲染

### 需要修改的代码
1. 移除 `campaign-header-section` HTML
2. 更新 `campaign-worker-filter` 添加"全部实例"选项
3. 更新 `renderMerchants()` 添加 Worker 列
4. 修复项目创建表单提交逻辑

