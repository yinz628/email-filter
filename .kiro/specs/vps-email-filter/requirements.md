# Requirements Document

## Introduction

本项目将邮件过滤管理系统从 Cloudflare Workers 迁移到 VPS 部署方案。保留 Cloudflare Email Routing 用于邮件接收，通过 webhook 将邮件转发到 VPS 上的 API 服务进行过滤处理。VPS 方案可以避免 Cloudflare 的资源超额费用，同时保持邮件路由的免费使用。

## Glossary

- **VPS_API**: 部署在 VPS 上的邮件过滤 API 服务，使用 Node.js + Express/Fastify 框架
- **Email_Worker**: 保留在 Cloudflare 上的轻量级 Worker，仅负责接收邮件并转发到 VPS_API
- **SQLite_DB**: VPS 上的本地 SQLite 数据库，使用 better-sqlite3 驱动
- **Admin_Panel**: VPS 上的管理面板服务，用于管理 Worker 实例和系统配置
- **Webhook**: Email_Worker 调用 VPS_API 的 HTTP 接口

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want to deploy the email filter API on a VPS, so that I can avoid Cloudflare's resource overage fees while maintaining full functionality.

#### Acceptance Criteria

1. WHEN the VPS_API starts THEN the system SHALL initialize SQLite_DB connection and create required tables if not exist
2. WHEN the VPS_API receives a health check request THEN the system SHALL respond with service status within 100ms
3. WHEN the VPS_API encounters a database error THEN the system SHALL log the error and return appropriate error response
4. WHEN the VPS_API is configured with environment variables THEN the system SHALL use those values for database path, port, and authentication

### Requirement 2

**User Story:** As a system administrator, I want a minimal Cloudflare Email Worker that only forwards emails to VPS, so that Cloudflare resource usage is minimized.

#### Acceptance Criteria

1. WHEN Email_Worker receives an incoming email THEN the system SHALL extract only essential fields (from, to, subject) without parsing full body
2. WHEN Email_Worker extracts email data THEN the system SHALL send a single lightweight webhook POST request to VPS_API
3. WHEN VPS_API returns a filter decision THEN Email_Worker SHALL execute the action without additional processing
4. IF VPS_API is unreachable THEN Email_Worker SHALL forward the email directly without retry to minimize CPU time
5. WHEN Email_Worker processes email THEN the system SHALL complete within 10ms CPU time to stay within free tier limits
6. WHEN Email_Worker sends webhook THEN the system SHALL use minimal JSON payload to reduce bandwidth

### Requirement 3

**User Story:** As a user, I want to manage filter rules through the VPS-hosted API, so that I can control which emails are filtered.

#### Acceptance Criteria

1. WHEN a user creates a filter rule via API THEN the system SHALL validate the rule and store it in SQLite_DB
2. WHEN a user retrieves filter rules THEN the system SHALL return all rules from SQLite_DB with pagination support
3. WHEN a user updates a filter rule THEN the system SHALL validate changes and update the record in SQLite_DB
4. WHEN a user deletes a filter rule THEN the system SHALL remove the rule and associated statistics from SQLite_DB
5. WHEN a user toggles rule enabled status THEN the system SHALL update the enabled field in SQLite_DB

### Requirement 4

**User Story:** As a user, I want the email filtering logic to work the same as before, so that my existing rules continue to function correctly.

#### Acceptance Criteria

1. WHEN VPS_API receives email data via webhook THEN the system SHALL evaluate all enabled filter rules against the email
2. WHEN an email matches a blacklist rule THEN the system SHALL return action "drop" to Email_Worker
3. WHEN an email matches a whitelist rule THEN the system SHALL return action "forward" with priority over blacklist
4. WHEN an email matches no rules THEN the system SHALL return action "forward" to default destination
5. WHEN evaluating rules THEN the system SHALL support exact, contains, startsWith, endsWith, and regex match modes

### Requirement 5

**User Story:** As a user, I want to view email processing statistics, so that I can monitor the effectiveness of my filter rules.

#### Acceptance Criteria

1. WHEN an email is processed THEN the system SHALL increment the appropriate statistics counters in SQLite_DB
2. WHEN a user requests statistics THEN the system SHALL return rule hit counts, total processed, and error counts
3. WHEN statistics are updated THEN the system SHALL record the timestamp of the last update
4. WHEN a rule is deleted THEN the system SHALL also delete associated statistics records

### Requirement 6

**User Story:** As a user, I want dynamic rules to be automatically created based on email patterns, so that repeated spam is automatically blocked.

#### Acceptance Criteria

1. WHEN VPS_API receives emails with the same subject exceeding threshold count within time window THEN the system SHALL create a dynamic filter rule
2. WHEN a dynamic rule has not been hit within expiration period THEN the system SHALL delete the expired rule during cleanup
3. WHEN a dynamic rule is matched THEN the system SHALL update the lastHitAt timestamp
4. WHEN dynamic rule feature is disabled in configuration THEN the system SHALL not create new dynamic rules

### Requirement 7

**User Story:** As a system administrator, I want to deploy an admin panel on VPS, so that I can manage multiple Email Worker instances.

#### Acceptance Criteria

1. WHEN Admin_Panel starts THEN the system SHALL initialize its own SQLite_DB for instance management
2. WHEN an administrator registers a new Worker instance THEN the system SHALL store the instance URL and API key
3. WHEN an administrator views instances THEN the system SHALL display all registered instances with their status
4. WHEN Admin_Panel authenticates requests THEN the system SHALL verify the admin password from configuration

### Requirement 8

**User Story:** As a system administrator, I want simple authentication between Cloudflare Worker and VPS API, so that security is maintained with minimal overhead.

#### Acceptance Criteria

1. WHEN VPS_API receives a webhook request THEN the system SHALL verify a simple bearer token in Authorization header
2. IF authentication token is missing or invalid THEN VPS_API SHALL reject the request with 401 status
3. WHEN configuring Email_Worker THEN the system SHALL store VPS_API URL and token as environment variables
4. WHEN Email_Worker authenticates THEN the system SHALL use a single header without complex signature computation

### Requirement 9

**User Story:** As a system administrator, I want easy deployment scripts, so that I can quickly set up the VPS services.

#### Acceptance Criteria

1. WHEN deploying VPS_API THEN the system SHALL provide Docker Compose configuration for easy deployment
2. WHEN deploying VPS_API THEN the system SHALL provide systemd service file for native deployment
3. WHEN configuring the system THEN the system SHALL support environment variables and .env file
4. WHEN starting services THEN the system SHALL automatically run database migrations



### Requirement 10

**User Story:** As a system administrator, I want all heavy processing done on VPS, so that Cloudflare Worker stays within free tier limits.

#### Acceptance Criteria

1. WHEN processing filter rules THEN VPS_API SHALL perform all rule matching logic on VPS
2. WHEN tracking email subjects for dynamic rules THEN VPS_API SHALL handle all tracking and threshold detection
3. WHEN generating statistics THEN VPS_API SHALL compute all statistics on VPS
4. WHEN Email_Worker operates THEN the system SHALL perform zero database operations on Cloudflare
5. WHEN Email_Worker operates THEN the system SHALL not use any Cloudflare KV, D1, or Durable Objects

