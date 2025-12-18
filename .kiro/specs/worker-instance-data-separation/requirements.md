# Requirements Document

## Introduction

本模块用于对不同 Worker 实例的数据进行分类管理和展示。目前系统中的日志、统计、营销分析、信号监控等功能都是全局统计，无法区分不同 Worker 实例的数据。本次升级将支持按 Worker 实例进行数据分类，同时保留全局视图。

## Glossary

- **Worker 实例（Worker Instance）**: 每个 Cloudflare Email Worker 对应一个实例，通过 workerName 进行标识
- **全局数据（Global Data）**: 所有 Worker 实例的汇总数据
- **实例数据（Instance Data）**: 单个 Worker 实例的独立数据
- **实例筛选器（Instance Filter）**: 用于选择查看全局或特定实例数据的下拉选择器

## Requirements

### Requirement 1: 日志系统实例标识

**User Story:** As a 系统管理员, I want to 在日志中看到每条记录所属的 Worker 实例, so that 可以区分不同实例的邮件处理情况。

#### Acceptance Criteria

1. WHEN 系统记录邮件转发或拦截日志 THEN 系统 SHALL 同时记录该日志所属的 Worker 实例名称
2. WHEN 显示系统日志列表 THEN 系统 SHALL 在每条日志中显示其所属的 Worker 实例名称
3. WHEN 筛选日志 THEN 系统 SHALL 支持按 Worker 实例进行筛选
4. WHEN 查看日志详情 THEN 系统 SHALL 显示该日志的 Worker 实例信息

### Requirement 2: 统计信息实例分类

**User Story:** As a 系统管理员, I want to 查看各 Worker 实例的独立统计数据, so that 可以了解每个实例的运行情况。

#### Acceptance Criteria

1. WHEN 查看统计信息 THEN 系统 SHALL 显示全局统计数据（总处理数、已转发、已拦截等）
2. WHEN 查看统计信息 THEN 系统 SHALL 支持按实例筛选，显示单个实例的统计数据
3. WHEN 显示实例统计 THEN 系统 SHALL 展示该实例的处理数、转发数、拦截数
4. WHEN 切换实例筛选 THEN 系统 SHALL 实时更新统计数据显示

### Requirement 3: 热门拦截规则实例统计

**User Story:** As a 系统管理员, I want to 查看各实例的热门拦截规则, so that 可以了解不同实例的拦截情况。

#### Acceptance Criteria

1. WHEN 查看热门拦截规则 THEN 系统 SHALL 显示全局拦截次数
2. WHEN 查看热门拦截规则 THEN 系统 SHALL 显示各实例中该规则的拦截次数明细
3. WHEN 选择特定实例 THEN 系统 SHALL 只显示该实例的热门拦截规则
4. WHEN 显示规则详情 THEN 系统 SHALL 展示该规则在各实例的拦截分布

### Requirement 4: 营销分析实例分类

**User Story:** As a 系统管理员, I want to 按实例查看营销活动分析, so that 可以了解不同实例收到的营销邮件情况。

#### Acceptance Criteria

1. WHEN 查看营销活动分析 THEN 系统 SHALL 默认显示全局统计数据
2. WHEN 选择特定实例 THEN 系统 SHALL 只显示该实例的营销活动数据
3. WHEN 显示商户列表 THEN 系统 SHALL 支持按实例筛选商户
4. WHEN 进行路径分析 THEN 系统 SHALL 支持基于单个实例的数据进行分析
5. WHEN 显示数据管理 THEN 系统 SHALL 支持按实例查看和管理数据

### Requirement 5: 信号监控实例支持

**User Story:** As a 系统管理员, I want to 为信号监控规则设置作用范围, so that 可以监控全局或特定实例的信号。

#### Acceptance Criteria

1. WHEN 创建信号监控规则 THEN 系统 SHALL 支持选择作用范围（全局或特定实例）
2. WHEN 规则设置为全局 THEN 系统 SHALL 统计所有实例的数据
3. WHEN 规则设置为特定实例 THEN 系统 SHALL 只统计该实例的数据
4. WHEN 显示信号状态 THEN 系统 SHALL 区分显示全局规则和实例规则的状态
5. WHEN 触发告警 THEN 系统 SHALL 在告警信息中标明规则的作用范围

### Requirement 6: 漏斗监控实例支持

**User Story:** As a 系统管理员, I want to 为漏斗监控设置作用范围, so that 可以监控全局或特定实例的比例。

#### Acceptance Criteria

1. WHEN 创建漏斗监控 THEN 系统 SHALL 支持选择作用范围（全局或特定实例）
2. WHEN 监控设置为全局 THEN 系统 SHALL 统计所有实例的比例数据
3. WHEN 监控设置为特定实例 THEN 系统 SHALL 只统计该实例的比例数据
4. WHEN 显示漏斗状态 THEN 系统 SHALL 区分显示全局和实例监控的状态

### Requirement 7: 数据存储实例标识

**User Story:** As a 系统开发者, I want to 在数据存储中记录实例信息, so that 可以支持按实例查询和统计。

#### Acceptance Criteria

1. WHEN 存储日志记录 THEN 系统 SHALL 包含 worker_name 字段
2. WHEN 存储营销活动数据 THEN 系统 SHALL 包含 worker_name 字段
3. WHEN 存储监控规则 THEN 系统 SHALL 包含 worker_scope 字段（global 或具体实例名）
4. WHEN 查询数据 THEN 系统 SHALL 支持按 worker_name 进行筛选
