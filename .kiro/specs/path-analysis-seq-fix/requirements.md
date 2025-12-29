# Requirements Document

## Introduction

本文档定义了修复新用户转移路径分析中两个关键问题的需求：
1. 新用户转移路径和实际收到的邮件顺序不符合
2. 新用户转移路径中，相同层级需要优先显示标记为有价值、高价值的营销活动

## Glossary

- **Project**: 分析项目，包含特定商户和Worker实例范围的路径分析配置
- **New User**: 新用户，首次收到Root活动邮件的收件人
- **User Event**: 用户事件，记录用户收到某个营销活动邮件的事件
- **Seq (Sequence Number)**: 序列号，表示用户收到邮件的时间顺序
- **Path Edge**: 路径边，表示用户从一个活动转移到另一个活动的统计
- **Level Stats**: 层级统计，按层级组织的活动统计数据
- **Valuable Campaign**: 有价值活动，tag=1（有价值）或 tag=2（高价值）的活动
- **received_at**: 邮件接收时间，记录在 campaign_emails 表中

## Requirements

### Requirement 1: 事件序列号按时间顺序计算

**User Story:** As a 数据分析师, I want 用户事件的序列号严格按照邮件接收时间排序, so that 转移路径能准确反映用户实际收到邮件的顺序。

#### Acceptance Criteria

1. WHEN 添加用户事件时 THEN the System SHALL 根据 received_at 时间计算正确的 seq 号，而不是简单地使用 max(seq) + 1
2. WHEN 新事件的 received_at 早于已有事件时 THEN the System SHALL 将新事件插入到正确的时间位置，并调整后续事件的 seq 号
3. WHEN 多个事件具有相同的 received_at 时间时 THEN the System SHALL 按照插入顺序分配 seq 号
4. WHEN 查询用户事件流时 THEN the System SHALL 返回按 seq 升序排列的事件，且 seq 顺序与 received_at 时间顺序一致

### Requirement 2: 全量分析时按用户分组处理邮件

**User Story:** As a 系统管理员, I want 全量分析时每个用户的邮件按时间顺序独立处理, so that 每个用户的事件流都是正确的时间顺序。

#### Acceptance Criteria

1. WHEN 执行全量分析时 THEN the System SHALL 先按用户分组邮件，再按 received_at 时间排序每个用户的邮件
2. WHEN 处理用户邮件时 THEN the System SHALL 按时间顺序逐个添加事件，确保 seq 号连续且正确
3. WHEN 用户有多封来自同一活动的邮件时 THEN the System SHALL 只记录第一封邮件的事件

### Requirement 3: 增量分析时正确插入新事件

**User Story:** As a 系统管理员, I want 增量分析时新邮件能正确插入到用户事件流中, so that 即使邮件延迟到达也能保持正确的时间顺序。

#### Acceptance Criteria

1. WHEN 增量分析发现新邮件时 THEN the System SHALL 根据 received_at 时间将事件插入到正确位置
2. WHEN 新邮件的 received_at 早于已有事件时 THEN the System SHALL 调整已有事件的 seq 号以保持时间顺序
3. WHEN 增量分析完成后 THEN the System SHALL 重建路径边以反映更新后的事件流

### Requirement 4: 层级统计按价值优先排序

**User Story:** As a 数据分析师, I want 同一层级内的活动按价值优先排序, so that 我能快速识别最重要的转化路径。

#### Acceptance Criteria

1. WHEN 构建层级统计时 THEN the System SHALL 在同一层级内按以下优先级排序：tag=2（高价值）> tag=1（有价值）> 其他（按 userCount 降序）
2. WHEN 活动没有项目级标签时 THEN the System SHALL 使用活动级别的标签作为排序依据
3. WHEN 多个活动具有相同标签优先级时 THEN the System SHALL 按 userCount 降序排序

### Requirement 5: 路径边重建一致性

**User Story:** As a 系统管理员, I want 路径边能准确反映用户事件流的转移关系, so that 转移路径统计数据是准确的。

#### Acceptance Criteria

1. WHEN 重建路径边时 THEN the System SHALL 只统计 seq 连续的事件转移（seq=n 到 seq=n+1）
2. WHEN 用户事件流被修改后 THEN the System SHALL 重新计算所有路径边
3. WHEN 路径边统计完成后 THEN the System SHALL 确保 user_count 等于实际发生该转移的用户数

### Requirement 6: 数据一致性验证

**User Story:** As a 开发者, I want 能够验证事件流和路径边的数据一致性, so that 我能确保分析结果的准确性。

#### Acceptance Criteria

1. WHEN 分析完成后 THEN the System SHALL 验证每个用户的 seq 号是从1开始的连续整数
2. WHEN 分析完成后 THEN the System SHALL 验证每个用户的事件按 received_at 时间排序与 seq 排序一致
3. IF 发现数据不一致 THEN the System SHALL 记录警告日志并提供修复选项

