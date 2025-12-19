# Requirements Document

## Introduction

营销分析模块 UI 重组功能，基于现有的 `CampaignAnalyticsService` 和前端代码进行优化。主要目标是：
1. 按 Worker 实例分离商户数据展示，同一商户在不同 Worker 实例中的数据需要分开显示
2. 简化 UI 结构，取消"营销活动分析"标题区，只保留"商户列表"和"分析项目列表"两个区域
3. 完善商户列表功能，支持按 Worker 实例筛选，并显示数据来源标记
4. 修复创建项目功能，支持多 Worker 实例数据聚合

## 现有代码分析

### 后端 API (campaign.ts)
- `GET /api/campaign/merchants` - 已支持 workerName 筛选
- `GET /api/campaign/workers/:workerName/merchants` - 获取特定 Worker 的商户
- `POST /api/campaign/projects` - 创建项目，已支持 workerNames 数组
- `DELETE /api/campaign/merchants/:id/data` - 删除商户数据，已支持 workerName

### 服务层 (campaign-analytics.service.ts)
- `getMerchants(filter)` - 已支持 workerName 筛选，动态计算 Worker 特定统计
- `getMerchantsForWorker(workerName)` - 获取特定 Worker 的商户列表
- `deleteMerchantData(data)` - 删除特定 Worker 的商户数据

### 前端 (frontend.ts)
- 营销分析标签页包含：标题区、商户列表区、项目列表区、项目详情区
- `loadMerchants()` - 加载商户列表，已支持 workerName 筛选
- `showCreateProjectModal()` - 创建项目弹窗，已支持多 Worker 选择
- 商户表格显示：域名、活动数、邮件数、已有项目、操作

## Glossary

- **Worker 实例**: Cloudflare Email Worker 实例，每个实例有唯一的 workerName
- **商户 (Merchant)**: 发送营销邮件的商户，通过域名识别
- **商户-Worker 组合**: 同一商户在不同 Worker 实例中的数据视为独立的数据源
- **分析项目 (Analysis Project)**: 用户创建的路径分析项目，可关联一个或多个 Worker 实例
- **数据来源标记**: 显示商户数据来自哪个 Worker 实例

## Requirements

### Requirement 1

**User Story:** As a data analyst, I want to see merchants grouped by Worker instance, so that I can understand which Worker instance each merchant's data comes from.

#### Acceptance Criteria

1. WHEN displaying the merchant list with "全部实例" filter THEN the System SHALL show each merchant-worker combination as a separate entry with Worker instance tag
2. WHEN a merchant exists in multiple Worker instances THEN the System SHALL display separate entries for each Worker instance (e.g., "macys.com - ndemail.store worker" and "macys.com - aloemail.store worker")
3. WHEN displaying merchant statistics THEN the System SHALL calculate statistics based on the specific Worker instance data only (using existing getMerchants with workerName filter)
4. WHEN filtering by a specific Worker instance THEN the System SHALL only show merchants that have data from that Worker instance

### Requirement 2

**User Story:** As a user, I want a simplified campaign analytics UI with only two main sections, so that I can navigate more easily.

#### Acceptance Criteria

1. WHEN the campaign analytics tab is displayed THEN the System SHALL show only two main sections: Merchant List (商户列表) and Analysis Projects (分析项目)
2. WHEN the campaign analytics tab is displayed THEN the System SHALL remove the header section with "📊 营销活动分析" title
3. WHEN the campaign analytics tab is displayed THEN the System SHALL hide the data management section (campaign-data-management-section)

### Requirement 3

**User Story:** As a data analyst, I want to filter the merchant list by Worker instance, so that I can focus on data from specific instances.

#### Acceptance Criteria

1. WHEN viewing the merchant list THEN the System SHALL provide a Worker instance filter dropdown with "全部实例" option
2. WHEN the filter is set to "全部实例" THEN the System SHALL show all merchants from all Worker instances, with each merchant-worker combination as a separate row
3. WHEN the filter is set to a specific Worker instance THEN the System SHALL only show merchants from that Worker instance (current behavior)
4. WHEN displaying merchant entries with "全部实例" filter THEN the System SHALL show the Worker instance name as a colored tag/badge in a new column

### Requirement 4

**User Story:** As a data analyst, I want to perform actions on merchants including preview, create project, and delete data, so that I can manage merchant data effectively.

#### Acceptance Criteria

1. WHEN viewing a merchant entry THEN the System SHALL provide a "预览" (Preview) action button
2. WHEN viewing a merchant entry THEN the System SHALL provide a "创建项目" (Create Project) action button
3. WHEN viewing a merchant entry THEN the System SHALL provide a "删除数据" (Delete Data) action button
4. WHEN deleting merchant data THEN the System SHALL pass the workerName parameter to delete only data for that specific Worker instance (using existing deleteMerchantData API)

### Requirement 5

**User Story:** As a data analyst, I want to create analysis projects that can aggregate data from multiple Worker instances for the same merchant, so that I can analyze cross-instance data.

#### Acceptance Criteria

1. WHEN creating a project THEN the System SHALL allow selection of one or more Worker instances using the existing worker-mode radio buttons (single/multiple/all)
2. WHEN creating a project for a merchant that exists in multiple Worker instances THEN the System SHALL show all available Worker instances for selection (using existing getMerchantsForWorker or similar API)
3. WHEN the project creation is submitted THEN the System SHALL successfully create the project with the selected Worker instances (fix any existing bugs in the create-project-form submission)
4. WHEN a project creation fails THEN the System SHALL display a clear error message explaining the failure reason

### Requirement 6

**User Story:** As a data analyst, I want to see the analysis projects list with clear information about associated merchants and Worker instances, so that I can manage my projects effectively.

#### Acceptance Criteria

1. WHEN displaying the projects list THEN the System SHALL show the project name, merchant domain, and associated Worker instances (workerName or workerNames)
2. WHEN displaying the projects list THEN the System SHALL show the project status (active, completed, archived) with appropriate styling
3. WHEN clicking on a project row THEN the System SHALL navigate to the project detail view (using existing openProject function)
4. WHEN viewing the projects list THEN the System SHALL provide actions to edit or delete projects (using existing editProject and deleteProject functions)

