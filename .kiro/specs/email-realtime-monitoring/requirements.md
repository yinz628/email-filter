# Requirements Document

## Introduction

重点邮件实时监控与告警是一个基于邮件元数据的持续信号监测系统，用于判断关键营销邮件是否仍在按预期出现，并在异常中断或频率下降时及时告警。它是一个"营销信号心跳监测器"，与现有的路径分析系统解耦，提供实时的信号健康状态监控。

核心理念：重点邮件监控不是为了"看见邮件"，而是为了"看见营销信号是否还活着"。

## Glossary

- **Signal（信号）**: 一个持续出现的邮件模式，由商户 + 邮件主题规则定义，而非单封邮件
- **Monitoring Rule（监控规则）**: 定义信号预期出现频率的配置，包含商户、主题匹配模式、预期间隔等
- **Signal State（信号状态）**: 信号的健康状态，包括 ACTIVE（正常）、WEAK（变慢）、DEAD（消失）
- **Gap（间隔）**: 当前时间与信号最后出现时间的差值（分钟）
- **Expected Interval（预期间隔）**: 信号正常情况下应该出现的时间间隔（分钟）
- **Dead After（死亡阈值）**: 超过此时间未出现则判定信号已死亡（分钟）
- **Time Window Metrics（时间窗口指标）**: 统计信号在特定时间窗口内的出现次数（1h/12h/24h）
- **Alert（告警）**: 当信号状态发生变化时触发的通知
- **Heartbeat Check（心跳检查）**: 定时执行的状态检查任务

## Requirements

### Requirement 1: 监控规则管理

**User Story:** As a 系统管理员, I want to 创建和管理重点邮件监控规则, so that 系统知道哪些信号需要监控以及它们的预期频率。

#### Acceptance Criteria

1. WHEN 管理员创建监控规则 THEN the Monitoring System SHALL 存储规则包含 rule_id、merchant、subject_pattern、expected_interval_minutes、dead_after_minutes、enabled 字段
2. WHEN 管理员更新监控规则 THEN the Monitoring System SHALL 立即应用新的配置到后续的状态判定中
3. WHEN 管理员禁用监控规则 THEN the Monitoring System SHALL 停止对该规则的状态检查和告警
4. WHEN 管理员查询监控规则列表 THEN the Monitoring System SHALL 返回所有规则及其当前状态
5. WHEN 规则的 subject_pattern 为正则表达式 THEN the Monitoring System SHALL 使用正则匹配来识别符合条件的邮件

### Requirement 2: 信号状态管理

**User Story:** As a 监控系统, I want to 维护每个监控规则的信号状态, so that 可以准确判断信号的健康程度。

#### Acceptance Criteria

1. WHEN 系统计算信号状态 THEN the Monitoring System SHALL 使用公式：gap <= expected_interval * 1.5 为 ACTIVE，gap <= dead_after 为 WEAK，否则为 DEAD
2. WHEN 信号状态为 ACTIVE THEN the Monitoring System SHALL 表示信号正常出现
3. WHEN 信号状态为 WEAK THEN the Monitoring System SHALL 表示信号出现但明显变慢
4. WHEN 信号状态为 DEAD THEN the Monitoring System SHALL 表示信号长时间未出现
5. WHEN 查询信号状态 THEN the Monitoring System SHALL 返回 last_seen_at、gap_minutes、current_state、count_1h、count_12h、count_24h

### Requirement 3: 邮件命中处理

**User Story:** As a 监控系统, I want to 在收到匹配监控规则的邮件时更新信号状态, so that 状态能实时反映信号的活跃程度。

#### Acceptance Criteria

1. WHEN 收到邮件且匹配某个启用的监控规则 THEN the Monitoring System SHALL 更新该规则的 last_seen_at 为当前时间
2. WHEN 收到邮件且匹配某个启用的监控规则 THEN the Monitoring System SHALL 递增该规则的时间窗口计数器
3. WHEN 收到邮件且信号状态不是 ACTIVE THEN the Monitoring System SHALL 将状态更新为 ACTIVE 并触发 RECOVERED 事件
4. WHEN 收到邮件 THEN the Monitoring System SHALL 记录命中日志用于审计

### Requirement 4: 心跳检查机制

**User Story:** As a 监控系统, I want to 定时检查所有启用规则的信号状态, so that 能及时发现信号异常。

#### Acceptance Criteria

1. WHEN 心跳检查定时器触发（每5分钟） THEN the Monitoring System SHALL 遍历所有启用的监控规则并重新计算状态
2. WHEN 心跳检查发现状态变化 THEN the Monitoring System SHALL 触发相应的告警事件
3. WHEN 心跳检查完成 THEN the Monitoring System SHALL 记录检查时间和结果摘要

### Requirement 5: 告警系统

**User Story:** As a 系统管理员, I want to 在信号状态发生变化时收到告警, so that 能及时响应营销信号的异常。

#### Acceptance Criteria

1. WHEN 信号状态从 ACTIVE 变为 WEAK THEN the Monitoring System SHALL 触发频率下降告警
2. WHEN 信号状态从 WEAK 变为 DEAD THEN the Monitoring System SHALL 触发信号消失告警
3. WHEN 信号状态从 DEAD 变为 ACTIVE THEN the Monitoring System SHALL 触发信号恢复通知
4. WHEN 信号状态从 ACTIVE 变为 ACTIVE THEN the Monitoring System SHALL 不触发任何告警
5. WHEN 触发告警 THEN the Monitoring System SHALL 包含商户、规则、状态变化、gap 时间、历史表现（24h/12h/1h 计数）
6. WHEN 告警生成 THEN the Monitoring System SHALL 通过配置的渠道发送通知（Webhook/邮件）

### Requirement 6: 状态查询与展示

**User Story:** As a 系统管理员, I want to 查看所有监控信号的当前状态, so that 能一目了然地了解整体健康状况。

#### Acceptance Criteria

1. WHEN 查询监控状态列表 THEN the Monitoring System SHALL 返回所有启用规则的当前状态、last_seen_at、gap、时间窗口计数
2. WHEN 展示监控状态 THEN the Monitoring System SHALL 按状态排序：DEAD > WEAK > ACTIVE
3. WHEN 展示单个监控状态 THEN the Monitoring System SHALL 显示格式为 [状态图标] 商户 / 规则名 last: Xh ago | 24h: N | 12h: N | 1h: N

### Requirement 7: 数据存储与清理

**User Story:** As a 系统管理员, I want to 合理管理监控数据的存储, so that 系统能高效运行且保留必要的历史数据。

#### Acceptance Criteria

1. WHEN 存储监控状态数据 THEN the Monitoring System SHALL 永久保存状态表和窗口计数
2. WHEN 存储命中记录 THEN the Monitoring System SHALL 保留 48-72 小时后自动清理
3. WHEN 存储告警记录 THEN the Monitoring System SHALL 保留 30-90 天后自动清理
4. WHEN 执行数据清理 THEN the Monitoring System SHALL 在低峰期执行且不影响正常监控

### Requirement 8: 系统集成

**User Story:** As a 开发者, I want to 将监控模块与现有 email-worker 集成, so that 能复用现有的邮件接收基础设施。

#### Acceptance Criteria

1. WHEN email-worker 收到邮件 THEN the Monitoring System SHALL 异步检查是否匹配任何监控规则
2. WHEN 监控模块处理邮件 THEN the Monitoring System SHALL 仅使用邮件元数据（from、subject、to、received_at）
3. WHEN 监控模块运行 THEN the Monitoring System SHALL 与路径分析系统完全解耦，独立运行
4. WHEN VPS API 不可用 THEN the Monitoring System SHALL 本地缓存命中事件，待恢复后同步
