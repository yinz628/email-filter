# Requirements Document

## Introduction

本次升级针对营销分析项目的路径分析功能进行修复和优化。核心原则是**项目之间完全隔离**。

**核心问题：**
当前系统中，同一商户的不同项目共享以下数据，导致相互干扰：
1. Root活动设置（campaigns表的is_root字段）- 商户级别共享
2. 收件人路径（recipient_paths表）- 商户级别共享
3. 新用户标记（recipient_paths表的is_new_user字段）- 商户级别共享

**解决方案：**
将所有分析相关数据从商户级别迁移到项目级别，实现项目之间的完全隔离：
1. 每个项目独立存储Root活动配置
2. 每个项目独立存储新用户列表
3. 每个项目独立存储用户事件流
4. 每个项目独立存储路径边数据
5. 每个项目独立存储分析结果缓存

**性能升级：**
1. 路径分析占用大量CPU资源，可能影响邮件过滤系统正常运行
2. 需要增量分析支持，避免每次都全量重新计算
3. 需要进度显示，让用户了解分析进度

**逻辑升级（基于用户提供的流程图）：**
1. 首次分析：处理所有历史Root活动邮件 → 解析收件人 → 新用户加入new_users表 → 生成seq=1事件 → 更新user_event_stream → 生成路径边
2. 增量分析：
   - 已有新用户收到新邮件 → 查询最大seq → 新增事件seq=max+1 → 更新路径边
   - 新增Root用户 → 加入new_users表 → 初始化seq=1 → 生成路径边

## Glossary

- **Analysis Project（分析项目）**: 针对特定商户和Worker实例组合创建的分析单元，是数据隔离的基本单位
- **Project Root Campaign（项目Root活动）**: 项目级别的Root活动设置，完全独立于其他项目
- **Project New Users（项目新用户）**: 项目级别的新用户列表，基于该项目的Root活动判定
- **User Event Stream（用户事件流）**: 项目级别的用户接收邮件时间序列，每条记录包含seq序列号
- **Activity Path Edge（活动路径边）**: 项目级别的活动转移记录，记录从活动A到活动B的用户数
- **Incremental Analysis（增量分析）**: 只处理新增数据的分析模式，基于上次分析时间戳
- **Full Analysis（全量分析/首次分析）**: 处理所有历史数据的分析模式
- **Sequence Number（seq序列号）**: 用户在项目中接收活动的顺序编号，从1开始递增
- **Last Analysis Time（上次分析时间）**: 项目级别记录的上次分析完成时间，用于增量分析判断

## Requirements

### Requirement 1: 项目数据完全隔离

**User Story:** As a data analyst, I want each analysis project to have completely isolated data, so that operations in one project never affect other projects.

#### Acceptance Criteria

1. WHEN a user creates a new project THEN the System SHALL create isolated data storage for that project only
2. WHEN a user modifies Root settings in Project A THEN the System SHALL NOT affect Root settings in any other project
3. WHEN a user performs path analysis in Project A THEN the System SHALL NOT modify data in any other project
4. WHEN a user deletes Project A THEN the System SHALL delete only Project A's isolated data
5. WHEN two projects share the same merchant THEN the System SHALL maintain completely separate analysis data for each

### Requirement 2: 项目级Root活动管理

**User Story:** As a data analyst, I want each project to have its own Root campaign configuration, so that I can analyze different starting points for different projects.

#### Acceptance Criteria

1. WHEN a user sets a Root campaign in a project THEN the System SHALL store the setting in project_root_campaigns table
2. WHEN a user views a project THEN the System SHALL load Root campaigns only from that project's configuration
3. WHEN a new project is created THEN the System SHALL start with no Root campaigns (empty state)
4. WHEN a user confirms a Root campaign THEN the System SHALL update only the current project's Root list
5. WHEN displaying Root candidates THEN the System SHALL show candidates based on project's worker scope

### Requirement 3: 项目级新用户管理

**User Story:** As a data analyst, I want each project to maintain its own new user list, so that new user identification is based on each project's Root configuration.

#### Acceptance Criteria

1. WHEN a recipient's first Root email is detected THEN the System SHALL add them to project_new_users table
2. WHEN calculating new user statistics THEN the System SHALL query only the current project's new user table
3. WHEN Root campaigns change THEN the System SHALL recalculate only the current project's new users
4. WHEN a user is added to new_users THEN the System SHALL record the first_root_campaign_id for that project

### Requirement 4: 项目级用户事件流

**User Story:** As a data analyst, I want each project to track user event sequences independently, so that I can see the campaign journey for each project's users.

#### Acceptance Criteria

1. WHEN a new user receives their first Root email THEN the System SHALL create an event with seq=1 in project_user_events
2. WHEN an existing new user receives a subsequent email THEN the System SHALL create an event with seq=max+1
3. WHEN querying user events THEN the System SHALL return only events for the current project
4. WHEN building path analysis THEN the System SHALL use only the current project's event stream
5. WHEN storing events THEN the System SHALL include project_id, recipient, campaign_id, seq, and received_at

### Requirement 5: 项目级路径边管理

**User Story:** As a data analyst, I want each project to maintain its own path edges, so that transition statistics are isolated per project.

#### Acceptance Criteria

1. WHEN a user transitions from Campaign A to B THEN the System SHALL update project_path_edges for current project
2. WHEN aggregating transitions THEN the System SHALL count only from current project's path edges
3. WHEN displaying transition tree THEN the System SHALL use only current project's path edge data
4. WHEN incremental analysis adds transitions THEN the System SHALL update only current project's edges

### Requirement 6: 首次分析流程

**User Story:** As a data analyst, I want to perform initial path analysis that processes all historical data, so that I can establish a baseline for the project.

#### Acceptance Criteria

1. WHEN triggering analysis on a project with no prior analysis THEN the System SHALL perform full analysis
2. WHEN performing full analysis THEN the System SHALL process all historical Root campaign emails
3. WHEN processing Root emails THEN the System SHALL parse recipients and identify new users
4. WHEN identifying new users THEN the System SHALL add them to project_new_users with first_root_campaign_id
5. WHEN creating user events THEN the System SHALL generate seq=1 events for all new users
6. WHEN building paths THEN the System SHALL generate path edges from user event sequences
7. WHEN full analysis completes THEN the System SHALL record last_analysis_time for the project

### Requirement 7: 增量分析流程

**User Story:** As a data analyst, I want to perform incremental analysis that only processes new data, so that analysis is fast and efficient.

#### Acceptance Criteria

1. WHEN triggering analysis on a project with prior analysis THEN the System SHALL perform incremental analysis
2. WHEN performing incremental analysis THEN the System SHALL get existing new user list from project_new_users
3. WHEN existing new users receive new emails THEN the System SHALL query their max seq and add seq=max+1 events
4. WHEN new Root emails arrive for new recipients THEN the System SHALL add them to project_new_users with seq=1
5. WHEN no new emails exist for a user THEN the System SHALL skip processing for that user
6. WHEN incremental analysis completes THEN the System SHALL update last_analysis_time

### Requirement 8: CPU资源控制

**User Story:** As a system administrator, I want path analysis to limit CPU usage, so that it does not interfere with email filtering operations.

#### Acceptance Criteria

1. WHEN processing large datasets THEN the System SHALL process data in batches (default 100 records per batch)
2. WHEN processing batches THEN the System SHALL yield control using setImmediate/setTimeout between batches
3. WHEN analysis is running THEN the System SHALL NOT block the main event loop for more than 50ms
4. WHEN multiple analyses are requested THEN the System SHALL queue them and process one at a time
5. WHEN system load is high THEN the System SHALL increase delay between batches

### Requirement 9: 分析进度显示

**User Story:** As a data analyst, I want to see real-time progress of path analysis, so that I know the analysis status.

#### Acceptance Criteria

1. WHEN path analysis starts THEN the System SHALL display a progress bar at 0%
2. WHEN processing batches THEN the System SHALL update progress percentage in real-time
3. WHEN analysis is in progress THEN the System SHALL show current phase description
4. WHEN analysis completes THEN the System SHALL show completion message with statistics
5. WHEN an error occurs THEN the System SHALL display error message and enable retry button

### Requirement 10: 数据库Schema升级

**User Story:** As a developer, I want new database tables for project-level isolation, so that data integrity is maintained.

#### Acceptance Criteria

1. WHEN the system starts THEN the System SHALL create project_root_campaigns table (project_id, campaign_id, is_confirmed, created_at)
2. WHEN the system starts THEN the System SHALL create project_new_users table (project_id, recipient, first_root_campaign_id, created_at)
3. WHEN the system starts THEN the System SHALL create project_user_events table (project_id, recipient, campaign_id, seq, received_at)
4. WHEN the system starts THEN the System SHALL create project_path_edges table (project_id, from_campaign_id, to_campaign_id, user_count, updated_at)
5. WHEN the system starts THEN the System SHALL add last_analysis_time column to analysis_projects table
6. WHEN migrating THEN the System SHALL NOT modify existing merchant-level tables (backward compatibility)

</content>
