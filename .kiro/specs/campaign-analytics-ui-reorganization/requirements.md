# Requirements Document

## Introduction

本模块对营销活动分析页面进行 UI 重组，引入"分析项目"概念，将页面划分为四个主要区域：标题区、数据管理区、项目列表区和项目详情区。通过项目化管理，用户可以针对特定商户创建分析项目，并在项目内进行 Root 确认、营销活动查看和路径分析。

## Glossary

- **分析项目（Analysis Project）**: 针对特定商户创建的分析单元，包含 Root 确认、营销活动列表和路径分析功能
- **Worker 商户（Worker Merchant）**: 从 Email Worker 上报数据中自动识别的商户记录
- **Root 确认（Root Confirmation）**: 在项目中选择作为分析起点的营销活动
- **路径分析（Path Analysis）**: 基于选定 Root 的收件人路径流向分析
- **实例（Instance）**: 系统中配置的 Worker 实例，用于数据隔离

## Requirements

### Requirement 1: 页面标题与实例选择

**User Story:** As a 系统管理员, I want to 在页面顶部看到清晰的标题和实例选择器, so that 可以快速识别当前功能并切换数据源。

#### Acceptance Criteria

1. WHEN 用户访问营销活动分析页面 THEN 系统 SHALL 在页面顶部显示"营销活动分析"标题
2. WHEN 页面加载 THEN 系统 SHALL 在标题旁显示实例选择下拉框
3. WHEN 用户切换实例 THEN 系统 SHALL 刷新商户列表和项目列表以显示对应实例的数据
4. WHEN 实例切换完成 THEN 系统 SHALL 保持当前选中的实例状态直到用户再次切换

### Requirement 2: 数据管理 - 商户列表

**User Story:** As a 系统管理员, I want to 查看 Worker 上报的商户列表, so that 可以选择商户创建分析项目。

#### Acceptance Criteria

1. WHEN 页面加载 THEN 系统 SHALL 在数据管理区域显示当前实例的所有 Worker 商户
2. WHEN 显示商户列表 THEN 系统 SHALL 展示商户域名、显示名称、邮件总数和营销活动数
3. WHEN 商户列表加载 THEN 系统 SHALL 支持按邮件数量和活动数量排序
4. WHEN 用户点击商户 THEN 系统 SHALL 提供创建分析项目的入口
5. WHEN 商户已有关联项目 THEN 系统 SHALL 显示已关联项目的标识

### Requirement 3: 分析项目创建

**User Story:** As a 系统管理员, I want to 基于商户创建分析项目, so that 可以对特定商户进行深入分析。

#### Acceptance Criteria

1. WHEN 用户选择商户并点击创建项目 THEN 系统 SHALL 显示项目创建表单
2. WHEN 创建项目 THEN 系统 SHALL 要求输入项目名称
3. WHEN 项目创建成功 THEN 系统 SHALL 将新项目添加到项目列表并自动选中
4. WHEN 项目创建 THEN 系统 SHALL 关联选定的商户和当前实例
5. WHEN 同一商户已存在项目 THEN 系统 SHALL 允许创建多个项目以支持不同分析场景

### Requirement 4: 分析项目列表

**User Story:** As a 系统管理员, I want to 查看和管理已创建的分析项目, so that 可以快速访问历史分析。

#### Acceptance Criteria

1. WHEN 页面加载 THEN 系统 SHALL 显示当前实例下所有已创建的分析项目
2. WHEN 显示项目列表 THEN 系统 SHALL 展示项目名称、关联商户、创建时间和分析状态
3. WHEN 用户点击项目 THEN 系统 SHALL 在项目详情区域显示该项目的详细信息
4. WHEN 用户删除项目 THEN 系统 SHALL 移除项目及其关联的分析配置
5. WHEN 项目列表为空 THEN 系统 SHALL 显示引导用户创建项目的提示信息

### Requirement 5: 项目详情 - Root 确认

**User Story:** As a 系统管理员, I want to 在项目中选择分析起点, so that 可以定义路径分析的基准。

#### Acceptance Criteria

1. WHEN 用户打开项目详情 THEN 系统 SHALL 显示 Root 确认标签页
2. WHEN 显示 Root 确认 THEN 系统 SHALL 列出该商户的所有营销活动供选择
3. WHEN 用户选择某营销活动作为 Root THEN 系统 SHALL 保存该选择并更新项目状态
4. WHEN Root 已选择 THEN 系统 SHALL 在 Root 确认区域显示当前选中的 Root 信息
5. WHEN 用户更改 Root 选择 THEN 系统 SHALL 更新路径分析结果

### Requirement 6: 项目详情 - 营销活动

**User Story:** As a 系统管理员, I want to 在项目中查看商户的营销活动列表, so that 可以了解商户的营销活动情况。

#### Acceptance Criteria

1. WHEN 用户切换到营销活动标签页 THEN 系统 SHALL 显示关联商户的所有营销活动
2. WHEN 显示营销活动列表 THEN 系统 SHALL 展示活动主题、邮件数量、收件人数量和价值标记
3. WHEN 用户点击营销活动 THEN 系统 SHALL 显示活动详情包括收件人统计
4. WHEN 用户标记活动为有价值 THEN 系统 SHALL 更新活动的价值状态
5. WHEN 营销活动列表展示 THEN 系统 SHALL 支持按邮件数量和时间排序

### Requirement 7: 项目详情 - 路径分析

**User Story:** As a 系统管理员, I want to 在项目中查看路径分析结果, so that 可以了解营销活动的推送策略。

#### Acceptance Criteria

1. WHEN 用户切换到路径分析标签页 THEN 系统 SHALL 显示基于 Root 的路径分析结果
2. WHEN Root 未选择 THEN 系统 SHALL 提示用户先在 Root 确认中选择起点
3. WHEN 显示路径分析 THEN 系统 SHALL 以树形或流程图形式展示活动层级关系
4. WHEN 显示路径节点 THEN 系统 SHALL 展示收件人数量和占基准人群的比例
5. WHEN 路径中包含有价值活动 THEN 系统 SHALL 高亮显示这些活动节点

### Requirement 8: 页面布局与导航

**User Story:** As a 系统管理员, I want to 在清晰的页面布局中进行操作, so that 可以高效完成分析任务。

#### Acceptance Criteria

1. WHEN 页面加载 THEN 系统 SHALL 按照标题区、数据管理区、项目列表区、项目详情区的顺序垂直排列
2. WHEN 项目未选中 THEN 系统 SHALL 隐藏或折叠项目详情区域
3. WHEN 项目选中 THEN 系统 SHALL 展开项目详情区域并显示标签页导航
4. WHEN 用户在各区域操作 THEN 系统 SHALL 保持其他区域的状态不变
5. WHEN 页面宽度变化 THEN 系统 SHALL 响应式调整布局以适应不同屏幕尺寸
