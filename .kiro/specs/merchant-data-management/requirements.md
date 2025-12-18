# Requirements Document

## Introduction

本模块实现商户数据的 Worker 级别隔离管理，包括数据来源标记、商户数据删除功能，以及预留的全局/跨 Worker 分析能力。通过 Worker 级别的数据隔离，用户可以针对不同 Worker 来源的商户数据进行独立管理和分析。

## Glossary

- **Worker**: Email Worker 实例，负责接收和处理邮件数据
- **商户（Merchant）**: 从邮件发件人域名识别的商户记录
- **数据来源标记（Source Tagging）**: 将邮件数据按来源 Worker 进行标记
- **Worker 隔离（Worker Isolation）**: 商户列表按 Worker 分别显示，不同 Worker 的数据相互独立
- **全局分析（Global Analysis）**: 跨多个 Worker 对同一商户进行联合分析

## Requirements

### Requirement 1: 数据来源标记

**User Story:** As a 系统管理员, I want to 邮件数据按来源 Worker 进行标记, so that 可以追踪数据来源并实现 Worker 级别的数据隔离。

#### Acceptance Criteria

1. WHEN Email Worker 上报邮件数据 THEN 系统 SHALL 在邮件记录中保存来源 Worker 的名称
2. WHEN 系统存储营销活动邮件 THEN 系统 SHALL 在 campaign_emails 表中记录 worker_name 字段
3. WHEN 查询商户列表 THEN 系统 SHALL 支持按 worker_name 参数过滤结果
4. WHEN 查询营销活动列表 THEN 系统 SHALL 支持按 worker_name 参数过滤结果

### Requirement 2: 商户列表 Worker 隔离显示

**User Story:** As a 系统管理员, I want to 商户列表按 Worker 隔离显示, so that 可以分别管理不同 Worker 来源的商户数据。

#### Acceptance Criteria

1. WHEN 用户选择特定 Worker THEN 系统 SHALL 仅显示该 Worker 上报数据中包含的商户
2. WHEN 显示商户列表 THEN 系统 SHALL 计算该商户在当前 Worker 下的邮件数和活动数
3. WHEN 同一商户域名存在于多个 Worker THEN 系统 SHALL 在各 Worker 视图中独立显示该商户的统计数据
4. WHEN 未选择 Worker THEN 系统 SHALL 提示用户先选择一个 Worker 实例

### Requirement 3: 商户数据删除功能

**User Story:** As a 系统管理员, I want to 删除商户在特定 Worker 下的所有数据, so that 可以清理不需要的数据并释放存储空间。

#### Acceptance Criteria

1. WHEN 用户点击商户的删除按钮 THEN 系统 SHALL 显示确认对话框说明将删除的数据范围
2. WHEN 用户确认删除 THEN 系统 SHALL 删除该商户在当前 Worker 下的所有邮件记录
3. WHEN 用户确认删除 THEN 系统 SHALL 删除该商户在当前 Worker 下的所有路径记录
4. WHEN 删除操作完成 THEN 系统 SHALL 刷新商户列表并显示删除结果
5. WHEN 商户在其他 Worker 中仍有数据 THEN 系统 SHALL 保留该商户的基本信息记录
6. WHEN 商户在所有 Worker 中均无数据 THEN 系统 SHALL 删除该商户的基本信息记录

### Requirement 4: 分析项目与 Worker 关联

**User Story:** As a 系统管理员, I want to 分析项目与特定 Worker 关联, so that 可以针对特定数据源进行分析。

#### Acceptance Criteria

1. WHEN 创建分析项目 THEN 系统 SHALL 记录项目关联的 Worker 名称
2. WHEN 打开分析项目 THEN 系统 SHALL 仅加载该 Worker 下的商户数据进行分析
3. WHEN 项目关联的 Worker 数据被删除 THEN 系统 SHALL 在项目详情中显示数据不可用提示
4. WHEN 查询项目列表 THEN 系统 SHALL 支持按 Worker 名称过滤

### Requirement 5: 全局分析预留功能

**User Story:** As a 系统管理员, I want to 预留全局分析能力, so that 未来可以跨 Worker 分析同一商户的数据。

#### Acceptance Criteria

1. WHEN 创建分析项目 THEN 系统 SHALL 支持选择"全局"作为 Worker 选项
2. WHEN 选择"全局"选项 THEN 系统 SHALL 聚合该商户在所有 Worker 下的数据
3. WHEN 显示全局分析结果 THEN 系统 SHALL 标注数据来源的 Worker 信息
4. WHEN 全局分析中包含多个 Worker 数据 THEN 系统 SHALL 支持按 Worker 筛选查看

### Requirement 6: 数据统计与展示

**User Story:** As a 系统管理员, I want to 查看商户在各 Worker 下的数据统计, so that 可以了解数据分布情况。

#### Acceptance Criteria

1. WHEN 显示商户详情 THEN 系统 SHALL 展示该商户在当前 Worker 下的邮件总数
2. WHEN 显示商户详情 THEN 系统 SHALL 展示该商户在当前 Worker 下的营销活动数
3. WHEN 商户存在于多个 Worker THEN 系统 SHALL 在全局视图中显示各 Worker 的数据分布
4. WHEN 删除数据后 THEN 系统 SHALL 实时更新统计数字

