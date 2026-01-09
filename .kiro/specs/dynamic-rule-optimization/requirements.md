# Requirements Document

## Introduction

本规格说明描述了动态规则生成逻辑的优化升级。当前系统存在两个主要问题：

1. **检测逻辑问题**：现有动态规则生成采用"先检测时间窗口，再检测数量"的逻辑，无法及时响应短时间内的大量营销邮件（如3分钟内1000+封同主题邮件）。需要改为"先检测数量阈值，再检测时间跨度"的逻辑。

2. **检测范围问题**：当前系统对所有邮件（包括黑名单、白名单、已有动态规则匹配的邮件）都进行动态规则生成监测，这是不必要的。只需要对"默认转发"的邮件进行监测。

## Glossary

- **Dynamic Rule System（动态规则系统）**: 自动检测并创建过滤规则的系统，用于拦截突发的大量营销邮件
- **Subject Tracker（主题追踪器）**: 记录邮件主题及其接收时间的数据库表，用于检测重复主题
- **Threshold Count（数量阈值）**: 触发动态规则创建的邮件数量门槛
- **Time Span（时间跨度）**: 第一封和第N封（N=数量阈值）邮件之间的时间差
- **Time Window（时间窗口）**: 用于分组检测的时间段，超出此窗口的邮件不参与当前检测周期
- **Filter Result（过滤结果）**: 邮件经过过滤引擎处理后的结果，包含匹配的规则类别
- **Default Forward（默认转发）**: 邮件未匹配任何规则时的默认处理方式

## Requirements

### Requirement 1: 数量优先检测逻辑

**User Story:** As a system administrator, I want the dynamic rule system to detect email volume first and then check time span, so that burst marketing emails can be blocked more quickly.

#### Acceptance Criteria

1. WHEN the Dynamic Rule System receives an email for tracking THEN the Dynamic Rule System SHALL first count the number of emails with the same normalized subject within the current time window
2. WHEN the email count for a subject reaches the threshold count THEN the Dynamic Rule System SHALL calculate the time span between the first and the threshold-th email
3. WHEN the time span is less than or equal to the configured time span threshold THEN the Dynamic Rule System SHALL create a new dynamic filter rule for that subject
4. WHEN the time span exceeds the configured time span threshold THEN the Dynamic Rule System SHALL NOT create a dynamic rule and SHALL continue tracking

### Requirement 2: 时间窗口分组机制

**User Story:** As a system administrator, I want the dynamic rule system to use time windows for grouping detection, so that only recent burst emails are considered for rule creation.

#### Acceptance Criteria

1. WHEN tracking an email subject THEN the Dynamic Rule System SHALL only consider emails received within the configured time window (e.g., 30 minutes)
2. WHEN calculating the time span for threshold detection THEN the Dynamic Rule System SHALL use the timestamp of the first email within the current time window as the start point
3. WHEN the time window expires THEN the Dynamic Rule System SHALL reset the tracking for that subject in the new window
4. WHEN configuring the time window THEN the Dynamic Rule System SHALL accept values between 5 and 120 minutes

### Requirement 3: 检测范围限制

**User Story:** As a system administrator, I want the dynamic rule system to only monitor emails that are forwarded by default, so that unnecessary tracking is avoided.

#### Acceptance Criteria

1. WHEN an email matches a whitelist rule THEN the Dynamic Rule System SHALL NOT track that email for dynamic rule detection
2. WHEN an email matches a blacklist rule THEN the Dynamic Rule System SHALL NOT track that email for dynamic rule detection
3. WHEN an email matches an existing dynamic rule THEN the Dynamic Rule System SHALL NOT track that email for dynamic rule detection
4. WHEN an email is forwarded by default (no rule matched) THEN the Dynamic Rule System SHALL track that email for dynamic rule detection

### Requirement 4: 配置参数更新

**User Story:** As a system administrator, I want to configure the new detection parameters through the admin interface, so that I can tune the detection sensitivity.

#### Acceptance Criteria

1. WHEN updating dynamic rule configuration THEN the Dynamic Rule System SHALL accept a time span threshold parameter (in minutes)
2. WHEN the time span threshold is not configured THEN the Dynamic Rule System SHALL use a default value of 3 minutes
3. WHEN displaying configuration in the admin interface THEN the Admin Interface SHALL show the time span threshold setting
4. WHEN saving configuration THEN the Admin Interface SHALL validate that time span threshold is between 1 and 30 minutes

### Requirement 5: 前端界面同步更新

**User Story:** As a system administrator, I want the admin interface to reflect the new detection logic, so that I can understand and configure the system correctly.

#### Acceptance Criteria

1. WHEN displaying the dynamic rule configuration page THEN the Admin Interface SHALL show the time span threshold input field
2. WHEN displaying configuration descriptions THEN the Admin Interface SHALL explain the new "count first, then time span" detection logic
3. WHEN saving configuration THEN the Admin Interface SHALL send the time span threshold to the API endpoint
4. WHEN loading configuration THEN the Admin Interface SHALL populate the time span threshold from the API response

### Requirement 6: 向后兼容性

**User Story:** As a system administrator, I want the system to maintain backward compatibility, so that existing configurations continue to work after the upgrade.

#### Acceptance Criteria

1. WHEN the time span threshold is not present in the database THEN the Dynamic Rule System SHALL use the default value of 3 minutes
2. WHEN existing dynamic rules are present THEN the Dynamic Rule System SHALL continue to use existing rules without modification
3. WHEN the system starts with old configuration THEN the Dynamic Rule System SHALL operate with default time span threshold until explicitly configured
