# Requirements Document

## Introduction

本文档定义了修复项目详情页营销活动列表 Worker 过滤问题的需求。当前问题是：同一商户在不同 Worker 实例下创建的不同项目，在项目详情中显示的营销活动列表相同，而不是按照项目关联的 Worker 进行过滤。商户列表中的预览功能正常工作，说明问题出在项目详情页的 API 调用逻辑上。

## Glossary

- **Project (项目)**: 分析项目，关联特定商户和 Worker 实例
- **Worker Instance (Worker 实例)**: Cloudflare Email Worker 的实例，每个实例处理特定域名的邮件
- **Campaign (营销活动)**: 基于邮件主题识别的营销活动
- **workerName**: 项目关联的单个 Worker 名称（旧字段）
- **workerNames**: 项目关联的多个 Worker 名称数组（新字段）

## Requirements

### Requirement 1

**User Story:** As a user, I want to see only the campaigns associated with the project's worker(s) when viewing project details, so that I can analyze data specific to that project.

#### Acceptance Criteria

1. WHEN the system retrieves campaigns for a project THEN the system SHALL use the project's workerNames array if available, otherwise fall back to the single workerName field
2. WHEN a project has workerName but no workerNames THEN the system SHALL treat workerName as a single-element array for filtering
3. WHEN filtering campaigns by worker THEN the system SHALL only return campaigns that have emails from the specified worker(s)
4. WHEN the project has no worker association THEN the system SHALL return all campaigns for the merchant (backward compatibility)

### Requirement 2

**User Story:** As a developer, I want the API to consistently handle worker filtering across all project-related endpoints, so that data isolation is maintained.

#### Acceptance Criteria

1. WHEN the GET /api/campaign/projects/:id/campaigns endpoint is called THEN the system SHALL correctly derive the worker filter from the project's workerName or workerNames
2. WHEN the getProjectCampaignsWithTags method receives undefined workerNames THEN the system SHALL check if the project has a single workerName and use it for filtering
3. WHEN calculating campaign statistics for a project THEN the system SHALL use the same worker filter logic as the campaign list

### Requirement 3

**User Story:** As a user, I want the project detail view to show accurate email counts per campaign based on the project's worker(s), so that I can make informed decisions.

#### Acceptance Criteria

1. WHEN displaying campaign email counts in project detail THEN the system SHALL count only emails from the project's associated worker(s)
2. WHEN displaying unique recipient counts in project detail THEN the system SHALL count only recipients from the project's associated worker(s)
