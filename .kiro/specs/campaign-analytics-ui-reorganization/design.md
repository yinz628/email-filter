# Design Document: Campaign Analytics UI Reorganization

## Overview

本模块对营销活动分析页面进行 UI 重组，将页面划分为四个主要区域，并引入"分析项目"概念实现项目化管理。

### 核心变更
- 页面结构重组为四个垂直区域
- 引入分析项目作为分析单元
- 项目详情区支持三个标签页切换
- 基于现有后端 API 实现前端重构

### 设计约束
- 复用现有的 CampaignAnalyticsService 后端服务
- 复用现有的 AnalysisProject 数据模型
- 前端使用原生 JavaScript，无框架依赖
- 保持与现有 API 的兼容性

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    营销活动分析页面                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 区域1: 标题区                                              │  │
│  │ [📊 营销活动分析]              [实例选择: ▼ 选择实例]      │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 区域2: 数据管理 - 商户列表                                  │  │
│  │ ┌─────────────────────────────────────────────────────┐   │  │
│  │ │ 商户域名 │ 活动数 │ 邮件数 │ 已有项目 │ 操作        │   │  │
│  │ │ xxx.com │  12   │  156  │   ✓    │ [创建项目]   │   │  │
│  │ └─────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 区域3: 分析项目列表                                        │  │
│  │ ┌─────────────────────────────────────────────────────┐   │  │
│  │ │ 项目名称 │ 商户 │ 状态 │ 创建时间 │ 操作            │   │  │
│  │ │ 项目A   │ xxx │ 进行中│ 12-18  │ [打开] [删除]   │   │  │
│  │ └─────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 区域4: 项目详情 (选中项目后显示)                            │  │
│  │ ┌─────────────────────────────────────────────────────┐   │  │
│  │ │ [Root确认] [营销活动] [路径分析]                      │   │  │
│  │ ├─────────────────────────────────────────────────────┤   │  │
│  │ │                                                     │   │  │
│  │ │              标签页内容区域                          │   │  │
│  │ │                                                     │   │  │
│  │ └─────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流
1. 用户选择实例 → 加载该实例的商户列表和项目列表
2. 用户从商户列表创建项目 → 项目关联商户和实例
3. 用户选择项目 → 展开项目详情区域
4. 用户在项目详情中操作 → 调用对应的后端 API

## Components and Interfaces

### 1. 页面区域组件

```typescript
// 区域1: 标题区
interface HeaderSection {
  title: string;
  instanceSelector: InstanceSelector;
}

// 区域2: 数据管理 - 商户列表
interface MerchantListSection {
  merchants: WorkerMerchant[];
  onCreateProject: (merchantId: string) => void;
}

// 区域3: 项目列表
interface ProjectListSection {
  projects: AnalysisProject[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

// 区域4: 项目详情
interface ProjectDetailSection {
  project: AnalysisProject | null;
  activeTab: 'root' | 'campaigns' | 'path';
  onTabChange: (tab: string) => void;
}
```

### 2. 复用现有 API

```typescript
// 项目管理 API (已实现)
GET    /api/campaign/projects              // 获取项目列表
GET    /api/campaign/projects/:id          // 获取项目详情
POST   /api/campaign/projects              // 创建项目
PUT    /api/campaign/projects/:id          // 更新项目
DELETE /api/campaign/projects/:id          // 删除项目

// 商户 API (已实现)
GET    /api/campaign/merchants             // 获取商户列表 (支持 workerName 过滤)

// 营销活动 API (已实现)
GET    /api/campaign/campaigns             // 获取营销活动列表
POST   /api/campaign/campaigns/:id/tag     // 设置活动标签

// Root 确认 API (已实现)
GET    /api/campaign/merchants/:id/root-campaigns  // 获取 Root 候选
POST   /api/campaign/campaigns/:id/root            // 设置 Root 状态

// 路径分析 API (已实现)
GET    /api/campaign/merchants/:id/path-analysis   // 获取路径分析结果
```

### 3. 前端状态管理

```typescript
// 全局状态
interface CampaignPageState {
  // 实例选择
  selectedWorkerName: string | null;
  
  // 商户列表
  merchants: Merchant[];
  merchantsLoading: boolean;
  
  // 项目列表
  projects: AnalysisProject[];
  projectsLoading: boolean;
  
  // 选中的项目
  selectedProject: AnalysisProject | null;
  
  // 项目详情标签页
  activeDetailTab: 'root' | 'campaigns' | 'path';
  
  // Root 确认数据
  rootCampaigns: RootCampaign[];
  
  // 营销活动数据
  campaigns: Campaign[];
  
  // 路径分析数据
  pathAnalysis: PathAnalysisResult | null;
}
```

## Data Models

### 复用现有数据模型

本设计复用 `@email-filter/shared` 包中已定义的数据模型：

- `AnalysisProject` - 分析项目
- `Merchant` - 商户
- `Campaign` - 营销活动
- `RootCampaign` - Root 候选活动
- `PathAnalysisResult` - 路径分析结果

### 前端显示模型

```typescript
// 商户列表项 (带项目关联信息)
interface MerchantListItem extends Merchant {
  hasProject: boolean;
  projectCount: number;
}

// 项目列表项 (带商户信息)
interface ProjectListItem extends AnalysisProject {
  merchantDomain: string;
  merchantDisplayName?: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Instance Data Isolation
*For any* selected worker instance, all displayed merchants and projects should belong to that instance only.
**Validates: Requirements 1.3, 2.1, 4.1**

### Property 2: List Rendering Completeness
*For any* merchant or project or campaign in the data source, the rendered list item should contain all required display fields (domain/name, counts, status, timestamps).
**Validates: Requirements 2.2, 4.2, 6.2**

### Property 3: Sorting Correctness
*For any* list sorted by a specific field, all adjacent pairs of items should satisfy the sort order constraint.
**Validates: Requirements 2.3, 6.5**

### Property 4: Project-Merchant Association
*For any* created project, the project should correctly reference the selected merchant and current instance.
**Validates: Requirements 3.4**

### Property 5: Project Name Validation
*For any* empty or whitespace-only project name, the creation should be rejected.
**Validates: Requirements 3.2**

### Property 6: Project Deletion Completeness
*For any* deleted project, querying by that project ID should return null.
**Validates: Requirements 4.4**

### Property 7: Merchant Project Indicator
*For any* merchant with at least one associated project, the merchant list should display a project indicator.
**Validates: Requirements 2.5**

### Property 8: Root Campaign Listing
*For any* merchant in a project, the Root confirmation tab should list all campaigns belonging to that merchant.
**Validates: Requirements 5.2**

### Property 9: Root Selection Persistence
*For any* campaign marked as Root, reloading the project should preserve the Root selection.
**Validates: Requirements 5.3**

### Property 10: Campaign Tag Persistence
*For any* campaign marked with a tag, reloading the campaign list should preserve the tag value.
**Validates: Requirements 6.4**

### Property 11: Path Node Data Completeness
*For any* node in the path analysis result, the node should contain recipient count and percentage values.
**Validates: Requirements 7.4**

### Property 12: Valuable Campaign Highlighting
*For any* campaign with tag 1 or 2 in the path analysis, the node should have a visual highlight indicator.
**Validates: Requirements 7.5**

### Property 13: Section State Isolation
*For any* operation in one section, the state of other sections should remain unchanged.
**Validates: Requirements 8.4**

## Error Handling

### API 错误处理
- 网络错误: 显示重试按钮和错误提示
- 404 错误: 显示"数据不存在"提示
- 500 错误: 显示"服务器错误"提示并记录日志

### 用户输入验证
- 项目名称为空: 阻止提交并显示提示
- 实例未选择: 禁用商户列表和项目创建功能

### 状态一致性
- 删除项目后自动清除选中状态
- 切换实例后自动清除项目选中状态

## Testing Strategy

### Unit Testing
- 使用 Vitest 进行单元测试
- 测试数据转换和格式化函数
- 测试状态管理逻辑

### Property-Based Testing
- 使用 fast-check 库进行属性测试
- 每个属性测试运行至少 100 次迭代
- 测试标注格式: `**Feature: campaign-analytics-ui-reorganization, Property {number}: {property_text}**`

### Integration Testing
- 测试 API 调用和响应处理
- 测试页面状态流转

### Test Coverage Goals
- 数据转换函数: 100%
- 状态管理逻辑: 90%+
- API 调用处理: 80%+
