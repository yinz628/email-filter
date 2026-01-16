# Requirements Document

## Introduction

本功能为邮件过滤系统添加邮件主题展示模块，用于展示系统处理的所有邮件的主题名称和数量统计。该模块位于营销分析功能之后，提供对所有处理邮件（包括拦截和转发）的主题级别统计和管理功能。

主要功能包括：
- 展示邮件主题、商户名称、来源Worker实例、邮件数量
- 支持同一主题来自多个Worker实例的分行显示
- 提供删除和重点关注操作
- 支持按实例筛选、数量排序、自动刷新和批量删除
- 在数据清理设置中添加主题展示的存储统计和保留时间配置

## Glossary

- **System**: 邮件过滤系统的 VPS API 后端服务
- **Admin Panel**: 系统的前端管理界面
- **Email Subject**: 邮件主题，从邮件头部提取的 Subject 字段
- **Worker Instance**: Cloudflare Email Worker 实例，每个实例处理特定域名的邮件
- **Merchant**: 商户，通过发件人域名识别的邮件发送方
- **Subject Stats**: 邮件主题统计记录，包含主题、商户、Worker实例和数量信息
- **Focused Subject**: 重点关注的邮件主题，用于标记需要特别关注的主题
- **Retention Period**: 数据保留时间，超过此时间的主题统计数据将被自动清理

## Requirements

### Requirement 1: 邮件主题数据收集

**User Story:** As a 系统管理员, I want to 自动收集所有处理邮件的主题信息, so that 可以统计和分析邮件主题分布。

#### Acceptance Criteria

1. WHEN 系统处理一封邮件（转发或拦截）THEN System SHALL 记录该邮件的主题、发件人域名、Worker实例名称和处理时间
2. WHEN 同一主题的邮件被多次处理 THEN System SHALL 累加该主题的邮件数量计数
3. WHEN 同一主题来自不同Worker实例 THEN System SHALL 分别记录每个Worker实例的数量统计
4. WHEN 记录邮件主题 THEN System SHALL 从发件人地址提取域名作为商户标识

### Requirement 2: 邮件主题列表展示

**User Story:** As a 系统管理员, I want to 查看所有邮件主题的统计列表, so that 可以了解系统处理的邮件主题分布情况。

#### Acceptance Criteria

1. WHEN 管理员访问邮件主题展示页面 THEN System SHALL 显示邮件主题列表，包含主题名称、商户名称、Worker实例、邮件数量和操作列
2. WHEN 同一主题来自多个Worker实例 THEN System SHALL 在Worker实例列中分行显示各实例名称，并在数量列中显示对应实例的数量
3. WHEN 主题列表加载 THEN System SHALL 在 2 秒内返回结果以保证响应速度
4. WHEN 显示主题列表 THEN System SHALL 支持分页展示，每页默认显示 20 条记录

### Requirement 3: 主题筛选和排序

**User Story:** As a 系统管理员, I want to 筛选和排序邮件主题列表, so that 可以快速找到关注的主题。

#### Acceptance Criteria

1. WHEN 管理员选择实例筛选 THEN System SHALL 提供"全部实例"和具体实例名称的选项
2. WHEN 管理员选择具体实例 THEN System SHALL 仅显示该实例处理的邮件主题
3. WHEN 管理员选择数量排序 THEN System SHALL 支持按邮件数量升序或降序排列
4. WHEN 管理员启用自动刷新 THEN System SHALL 按设定间隔自动刷新主题列表数据

### Requirement 4: 主题操作功能

**User Story:** As a 系统管理员, I want to 对邮件主题执行操作, so that 可以管理和标记重要主题。

#### Acceptance Criteria

1. WHEN 管理员点击删除按钮 THEN System SHALL 删除该主题的统计记录
2. WHEN 管理员点击重点关注按钮 THEN System SHALL 标记该主题为重点关注状态
3. WHEN 管理员取消重点关注 THEN System SHALL 移除该主题的重点关注标记
4. WHEN 管理员选择批量删除 THEN System SHALL 支持选择多个主题并一次性删除

### Requirement 5: 重点关注主题管理

**User Story:** As a 系统管理员, I want to 管理重点关注的邮件主题, so that 可以快速查看重要主题的统计。

#### Acceptance Criteria

1. WHEN 显示主题列表 THEN System SHALL 高亮显示重点关注的主题
2. WHEN 管理员筛选重点关注 THEN System SHALL 仅显示标记为重点关注的主题
3. WHEN 重点关注主题有新邮件 THEN System SHALL 在列表中更新该主题的数量统计

### Requirement 6: 数据清理设置集成

**User Story:** As a 系统管理员, I want to 配置邮件主题统计的保留时间, so that 可以控制存储空间使用。

#### Acceptance Criteria

1. WHEN 管理员访问数据清理设置页面 THEN System SHALL 显示邮件主题统计的存储统计信息
2. WHEN 显示存储统计 THEN System SHALL 展示主题统计记录总数和最早记录时间
3. WHEN 管理员配置主题统计保留时间 THEN System SHALL 允许设置保留天数（范围：1-365天）
4. WHEN 清理任务执行 THEN System SHALL 删除超过保留时间的主题统计记录

### Requirement 7: 前端界面集成

**User Story:** As a 系统管理员, I want to 在管理界面中方便地访问邮件主题展示功能, so that 可以与其他功能无缝切换。

#### Acceptance Criteria

1. WHEN 管理员访问管理界面 THEN System SHALL 在营销分析菜单之后显示"邮件主题"菜单项
2. WHEN 管理员点击邮件主题菜单 THEN System SHALL 导航到邮件主题展示页面
3. WHEN 邮件主题页面加载 THEN System SHALL 显示与营销分析页面风格一致的界面布局
4. WHEN 页面显示筛选控件 THEN System SHALL 采用与营销分析相同的筛选控件样式

