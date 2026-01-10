# Requirements Document

## Introduction

本功能包含两个改进：

1. **动态规则实时检测**：当前动态规则检测在 Phase 2 异步处理中执行，导致在高频邮件攻击时响应延迟。例如，57秒内收到387封邮件，系统在第387封才开始拦截。本功能将动态规则追踪从异步处理中分离，改为同步实时检测。

2. **系统日志改进**：当前系统日志中"管理操作"和"系统"类型没有任何内容，需要添加相应的日志记录。同时移除前端日志过滤器中重复的"全局"选项。

## Glossary

- **Phase 1 Processing**: 同步处理阶段，包括规则匹配和返回过滤决策，目标响应时间 < 100ms
- **Phase 2 Processing**: 异步处理阶段，包括统计更新、日志记录等非时效敏感操作
- **Dynamic Rule Detection**: 动态规则检测，基于邮件频率自动创建黑名单规则
- **Subject Tracker**: 主题追踪器，记录邮件主题和接收时间用于频率检测
- **Admin Action Log**: 管理操作日志，记录管理员对规则、Worker等的增删改操作
- **System Log**: 系统日志，记录系统级事件如启动、配置变更、错误等

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want dynamic rule detection to happen in real-time, so that spam attacks are blocked within seconds instead of minutes.

#### Acceptance Criteria

1. WHEN an email is processed THEN the System SHALL execute dynamic rule tracking synchronously in Phase 1 before returning the filter decision
2. WHEN dynamic rule tracking is moved to Phase 1 THEN the System SHALL maintain Phase 1 response time under 100ms (relaxed from 50ms to accommodate tracking)
3. WHEN a new dynamic rule is created during Phase 1 THEN the System SHALL apply the rule to the current email immediately
4. WHEN the dynamic rule threshold is reached THEN the System SHALL create and cache the rule within the same request cycle

### Requirement 2

**User Story:** As a system administrator, I want non-time-sensitive operations to remain asynchronous, so that the system maintains good performance.

#### Acceptance Criteria

1. WHEN an email is processed THEN the System SHALL continue to process statistics updates asynchronously in Phase 2
2. WHEN an email is processed THEN the System SHALL continue to process log recording asynchronously in Phase 2
3. WHEN an email is processed THEN the System SHALL continue to process campaign analytics asynchronously in Phase 2
4. WHEN an email is processed THEN the System SHALL continue to process signal monitoring asynchronously in Phase 2

### Requirement 3

**User Story:** As a system administrator, I want the dynamic rule detection to be more aggressive, so that spam attacks are detected faster.

#### Acceptance Criteria

1. WHEN configuring dynamic rules THEN the System SHALL allow threshold count as low as 5 (reduced from minimum of 30)
2. WHEN configuring dynamic rules THEN the System SHALL allow time span threshold as low as 30 seconds (0.5 minutes)
3. WHEN a spam attack is detected THEN the System SHALL block subsequent emails within 5 seconds of rule creation

### Requirement 4

**User Story:** As a system administrator, I want to see metrics on dynamic rule detection performance, so that I can tune the configuration.

#### Acceptance Criteria

1. WHEN a dynamic rule is created THEN the System SHALL log the detection latency (time from first email to rule creation)
2. WHEN a dynamic rule is created THEN the System SHALL log how many emails were forwarded before blocking started

### Requirement 5

**User Story:** As a system administrator, I want to see admin action logs, so that I can audit changes made to the system.

#### Acceptance Criteria

1. WHEN an administrator creates a filter rule THEN the System SHALL log the action with category "admin_action"
2. WHEN an administrator updates a filter rule THEN the System SHALL log the action with category "admin_action"
3. WHEN an administrator deletes a filter rule THEN the System SHALL log the action with category "admin_action"
4. WHEN an administrator creates or updates a Worker THEN the System SHALL log the action with category "admin_action"
5. WHEN an administrator deletes a Worker THEN the System SHALL log the action with category "admin_action"
6. WHEN an administrator updates dynamic rule configuration THEN the System SHALL log the action with category "admin_action"

### Requirement 6

**User Story:** As a system administrator, I want to see system logs, so that I can monitor system health and troubleshoot issues.

#### Acceptance Criteria

1. WHEN a dynamic rule is automatically created THEN the System SHALL log the event with category "system"
2. WHEN expired dynamic rules are cleaned up THEN the System SHALL log the event with category "system"
3. WHEN data cleanup runs THEN the System SHALL log the event with category "system"

### Requirement 7

**User Story:** As a system administrator, I want the log filter UI to be clear and non-redundant, so that I can easily find the logs I need.

#### Acceptance Criteria

1. WHEN displaying the Worker filter dropdown THEN the System SHALL show "全部实例" as the default option for all workers
2. WHEN displaying the Worker filter dropdown THEN the System SHALL NOT show a separate "全局" option that duplicates "全部实例" functionality
