# Requirements Document

## Introduction

路径分析增强功能，用于分析商户营销活动的收件人路径流向。该功能基于现有的路径分析系统进行增强，需要：
1. 展示所有营销活动的路径，不限制层级数量
2. 对有价值或高价值邮件进行高亮显示
3. 支持灵活的 Worker 实例选择（单个、多个指定、全部）
4. 提供重新分析路径和清理老客户数据的功能
5. 显示新老客户统计信息

现有系统已实现的功能包括：
- 用户统计（总收件人、新用户、老用户、新用户比例）
- 活动层级展示（基于新用户路径）
- 新用户转移路径树形展示
- Root 活动设置和候选检测

## Glossary

- **Path Analysis（路径分析）**: 分析收件人接收营销活动邮件的顺序和流向
- **Recipient Path（收件人路径）**: 单个收件人接收到的营销活动序列
- **Level（层级）**: 营销活动在路径中的位置，Root 活动为第1层
- **Valuable Campaign（有价值活动）**: tag=1 的营销活动，UI 中显示绿色高亮
- **High-Value Campaign（高价值活动）**: tag=2 的营销活动，UI 中显示金色高亮
- **Root Campaign（Root 活动）**: 被确认为分析起点的营销活动，通常是欢迎邮件
- **New Customer（新客户）**: 第一封邮件来自 Root 活动的收件人
- **Old Customer（老客户）**: 第一封邮件不是来自 Root 活动的收件人
- **Worker Instance（Worker 实例）**: Cloudflare Email Worker 实例，数据按实例隔离
- **Merchant（商户）**: 发送营销邮件的商户，通过域名识别
- **Transition（转移）**: 收件人从一个营销活动到下一个营销活动的路径

## Requirements

### Requirement 1

**User Story:** As a data analyst, I want to view the complete path analysis for all campaigns without level restrictions, so that I can understand the full customer journey.

#### Acceptance Criteria

1. WHEN the path analysis is displayed THEN the System SHALL show all levels of campaign paths without any level limit
2. WHEN campaigns exist at level N THEN the System SHALL display level N in the path analysis
3. WHEN rendering path levels THEN the System SHALL order them sequentially from level 1 to the maximum level
4. WHEN rendering the transition tree THEN the System SHALL not limit the depth of the tree

### Requirement 2

**User Story:** As a data analyst, I want valuable and high-value campaigns to be visually highlighted, so that I can quickly identify important campaigns in the path.

#### Acceptance Criteria

1. WHEN a campaign has tag=1 (valuable) THEN the System SHALL display the campaign with a green highlight style and a star marker
2. WHEN a campaign has tag=2 (high-value) THEN the System SHALL display the campaign with a gold/yellow highlight style and a double star marker
3. WHEN a campaign has tag=0 or no tag THEN the System SHALL display the campaign with a neutral/default style
4. WHEN rendering campaign nodes in level stats THEN the System SHALL use the highlighted class for valuable campaigns
5. WHEN rendering campaign nodes in transition tree THEN the System SHALL show star markers for valuable campaigns

### Requirement 3

**User Story:** As a data analyst, I want to rebuild recipient paths from existing email data, so that I can recalculate paths when data changes or corrections are needed.

#### Acceptance Criteria

1. WHEN a user clicks the "Rebuild Paths" button THEN the System SHALL delete all existing paths for the merchant
2. WHEN rebuilding paths THEN the System SHALL recreate paths from campaign_emails data ordered by received timestamp
3. WHEN rebuilding paths with worker filter THEN the System SHALL only include emails from the selected worker instances
4. WHEN the rebuild operation completes THEN the System SHALL display statistics showing paths deleted, paths created, and recipients processed
5. WHEN the rebuild operation completes THEN the System SHALL recalculate new/old user flags based on Root campaigns
6. WHEN the rebuild operation completes THEN the System SHALL automatically refresh the path analysis display

### Requirement 4

**User Story:** As a data analyst, I want path analysis to support flexible worker selection, so that I can analyze paths for a single worker, multiple selected workers, or all workers for the same merchant domain.

#### Acceptance Criteria

1. WHEN a project is associated with a single worker instance THEN the System SHALL filter path analysis data by that worker instance only
2. WHEN a project is configured with multiple selected worker instances THEN the System SHALL aggregate path data from those selected workers for the same merchant domain
3. WHEN a project is configured to include all workers THEN the System SHALL aggregate path data from all available worker instances
4. WHEN calculating path statistics with multiple workers THEN the System SHALL combine emails from all selected worker instances
5. WHEN displaying recipient counts with multiple workers THEN the System SHALL show aggregated counts across selected workers
6. WHEN rebuilding paths with multiple workers THEN the System SHALL include emails from all selected worker instances

### Requirement 5

**User Story:** As a data analyst, I want to see campaign statistics within each level, so that I can understand the distribution of recipients across campaigns.

#### Acceptance Criteria

1. WHEN displaying a campaign in the level stats THEN the System SHALL show the campaign subject
2. WHEN displaying a campaign in the level stats THEN the System SHALL show the new user count for that campaign
3. WHEN displaying a campaign in the level stats THEN the System SHALL show the coverage percentage (new users who received this campaign / total new users)
4. WHEN displaying a campaign in the level stats THEN the System SHALL indicate if it is a Root campaign

### Requirement 6

**User Story:** As a data analyst, I want to configure which worker instances to include in a project's analysis, so that I can customize the scope of path analysis.

#### Acceptance Criteria

1. WHEN creating or editing a project THEN the System SHALL allow selection of one or more worker instances
2. WHEN selecting workers THEN the System SHALL provide options for: single worker, multiple specific workers, or all workers
3. WHEN a project has multiple workers configured THEN the System SHALL store the list of selected worker names
4. WHEN displaying project details THEN the System SHALL show which workers are included in the analysis

### Requirement 7

**User Story:** As a data analyst, I want to identify and clean up old customer data, so that path analysis focuses only on new customers who started with the designated Root campaigns.

#### Acceptance Criteria

1. WHEN a campaign is set as Root THEN the System SHALL identify recipients whose first email was from a Root campaign as new customers
2. WHEN a recipient's first email was NOT from a Root campaign THEN the System SHALL identify that recipient as an old customer
3. WHEN displaying path analysis THEN the System SHALL only include paths from new customers in the level stats and transitions
4. WHEN a user clicks the "Clean Old Customer Data" button THEN the System SHALL remove path data for recipients identified as old customers
5. WHEN cleaning old customer data THEN the System SHALL preserve the campaign_emails records but remove only the recipient_paths entries
6. WHEN the cleanup operation completes THEN the System SHALL display statistics showing how many old customer paths were removed
7. WHEN the cleanup operation completes THEN the System SHALL automatically refresh the path analysis display

### Requirement 8

**User Story:** As a data analyst, I want to see statistics about new vs old customers, so that I can understand the composition of the recipient base.

#### Acceptance Criteria

1. WHEN displaying path analysis THEN the System SHALL show the total number of recipients
2. WHEN displaying path analysis THEN the System SHALL show the number of new customers (recipients starting with Root campaigns)
3. WHEN displaying path analysis THEN the System SHALL show the number of old customers (recipients not starting with Root campaigns)
4. WHEN displaying path analysis THEN the System SHALL show the percentage of new customers vs total recipients
5. WHEN no Root campaign is set THEN the System SHALL display a message prompting the user to set a Root campaign
