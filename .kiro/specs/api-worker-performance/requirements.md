# Requirements Document

## Introduction

本文档定义了优化 VPS API 与多个 Cloudflare Worker 之间通信性能的需求，重点解决大量营销邮件短时间涌入时的动态规则生成延迟问题。

当前架构为 1 个 API 端和 8 个 Worker 端，核心问题是：

1. **API 响应超时导致统计丢失** - 当 API 响应超过 5 秒时，Worker fallback 转发，邮件不会被统计，动态规则无法及时生成
2. **高并发时数据库成为瓶颈** - SQLite 单线程写入，大量邮件同时到达时响应变慢
3. **Phase 1 同步处理包含数据库写入** - 动态规则追踪需要写入 email_subject_tracker，增加响应时间

**解决思路：确保 API 在任何情况下都能在 5 秒内响应，让每封邮件都能被正确统计。**

## Glossary

- **VPS API**: 运行在 VPS 上的 Fastify 服务器，处理邮件过滤决策
- **Worker**: Cloudflare Email Worker，接收邮件并调用 VPS API 获取过滤决策
- **Phase 1**: 同步处理阶段，必须在返回响应前完成（规则匹配、动态规则追踪）
- **Phase 2**: 异步处理阶段，在返回响应后执行（日志、统计等）
- **Dynamic Rule**: 基于邮件主题频率自动创建的过滤规则
- **WAL Mode**: SQLite 的 Write-Ahead Logging 模式，支持并发读写
- **Subject Tracker**: email_subject_tracker 表，用于追踪邮件主题频率

## Requirements

### Requirement 1: SQLite 数据库性能优化

**User Story:** As a system administrator, I want the database to handle high concurrency efficiently, so that the API can respond quickly during email bursts.

#### Acceptance Criteria

1. WHEN the VPS API starts THEN the SQLite database SHALL be configured with WAL mode using PRAGMA journal_mode=WAL
2. WHEN the database is initialized THEN the system SHALL configure pragmas: synchronous=NORMAL, cache_size=10000, temp_store=MEMORY, mmap_size=268435456
3. WHEN the database is initialized THEN the system SHALL set busy_timeout=5000 to handle lock contention
4. WHEN multiple concurrent requests arrive THEN the database SHALL allow concurrent reads while a write is in progress

### Requirement 2: Phase 1 处理时间优化

**User Story:** As a developer, I want Phase 1 processing to complete within 100ms, so that workers never timeout waiting for a response.

#### Acceptance Criteria

1. WHEN a webhook request is received THEN the Phase 1 processing SHALL complete within 100ms for 99% of requests
2. WHEN retrieving filter rules THEN the system SHALL use the in-memory rule cache with 60-second TTL
3. WHEN the rule cache is empty THEN the system SHALL populate it with a single optimized query using prepared statements
4. WHEN checking for existing dynamic rules THEN the system SHALL use an in-memory Set for O(1) lookup of existing rule patterns

### Requirement 3: 动态规则追踪优化

**User Story:** As a developer, I want dynamic rule tracking to be fast, so that it doesn't slow down the webhook response.

#### Acceptance Criteria

1. WHEN inserting into email_subject_tracker THEN the system SHALL use a prepared statement that is reused across requests
2. WHEN counting subjects in the time window THEN the query SHALL use the composite index on (subject_hash, received_at)
3. WHEN calculating subject hash THEN the system SHALL use a fast non-cryptographic hash function (e.g., xxhash or fnv1a)
4. WHEN a dynamic rule is created THEN the system SHALL update the in-memory pattern Set immediately

### Requirement 4: 内存缓存优化

**User Story:** As a developer, I want frequently accessed data to be cached in memory, so that database queries are minimized.

#### Acceptance Criteria

1. WHEN the API starts THEN the system SHALL load all dynamic rule patterns into an in-memory Set
2. WHEN a new dynamic rule is created THEN the system SHALL add the pattern to the in-memory Set without database query
3. WHEN checking if a subject matches an existing dynamic rule THEN the system SHALL check the in-memory Set first
4. WHEN the in-memory Set is checked THEN the lookup SHALL complete in O(1) time complexity

### Requirement 5: 请求处理并发优化

**User Story:** As a developer, I want the API to handle concurrent requests efficiently, so that multiple workers can be served simultaneously.

#### Acceptance Criteria

1. WHEN multiple webhook requests arrive simultaneously THEN the API SHALL process them concurrently using Node.js event loop
2. WHEN database writes are needed THEN the system SHALL queue writes and batch them when possible
3. WHEN a database write is in progress THEN read operations SHALL NOT be blocked due to WAL mode
4. WHEN the async task queue has pending items THEN the system SHALL process them in batches of 50 items

### Requirement 6: 数据库索引优化

**User Story:** As a developer, I want database queries to use optimal indexes, so that lookups are fast even with large datasets.

#### Acceptance Criteria

1. WHEN querying email_subject_tracker by subject_hash and time THEN the query SHALL use the index idx_subject_tracker_hash_time
2. WHEN querying filter_rules by category THEN the query SHALL use the index idx_filter_rules_category
3. WHEN the database is initialized THEN the system SHALL verify indexes exist and create them if missing
4. WHEN a query takes longer than 10ms THEN the system SHALL log a warning with the query details

### Requirement 7: 连接和请求优化

**User Story:** As a developer, I want to minimize overhead in request processing, so that responses are as fast as possible.

#### Acceptance Criteria

1. WHEN the Fastify server starts THEN the server SHALL be configured with disableRequestLogging=true for webhook routes
2. WHEN validating webhook payload THEN the validation SHALL use a pre-compiled JSON schema
3. WHEN serializing the response THEN the system SHALL use a pre-compiled serializer
4. WHEN the request is processed THEN the system SHALL avoid creating unnecessary objects or closures

### Requirement 8: 监控和诊断

**User Story:** As a system administrator, I want to monitor API performance, so that I can identify and resolve bottlenecks.

#### Acceptance Criteria

1. WHEN the API processes a webhook request THEN the system SHALL record the Phase 1 duration in a histogram
2. WHEN Phase 1 takes longer than 100ms THEN the system SHALL log a warning with request details
3. WHEN viewing the admin panel THEN the system SHALL display: average Phase 1 time, p95 Phase 1 time, requests per second
4. WHEN the database query takes longer than 10ms THEN the system SHALL log the slow query for analysis


### Requirement 9: Worker 端请求优化

**User Story:** As a developer, I want the Worker to send requests efficiently, so that the API receives requests as fast as possible.

#### Acceptance Criteria

1. WHEN the Worker sends a webhook request THEN the request SHALL use minimal payload size by excluding null/undefined fields
2. WHEN the Worker builds the request THEN the JSON serialization SHALL be performed only once
3. WHEN the Worker extracts email fields THEN the extraction SHALL use optimized string operations
4. WHEN debug logging is disabled THEN the Worker SHALL skip all debug log string construction

### Requirement 10: Worker 端超时策略优化

**User Story:** As a developer, I want the Worker to use an optimal timeout strategy, so that it balances between waiting for API response and not blocking email processing.

#### Acceptance Criteria

1. WHEN the Worker sends a webhook request THEN the timeout SHALL be set to 4 seconds (reduced from 5 seconds)
2. WHEN the API responds within 4 seconds THEN the Worker SHALL use the API decision
3. WHEN the API times out THEN the Worker SHALL immediately forward to default address without additional delay
4. WHEN a timeout occurs THEN the Worker SHALL log the timeout event with the API URL and duration

### Requirement 11: Worker 端连接复用

**User Story:** As a developer, I want the Worker to reuse connections when possible, so that connection overhead is minimized.

#### Acceptance Criteria

1. WHEN the Worker sends requests to the API THEN the requests SHALL use HTTP keep-alive headers
2. WHEN multiple requests are sent in sequence THEN the Worker SHALL benefit from Cloudflare's connection pooling
3. WHEN the API URL is parsed THEN the parsed URL object SHALL be cached for reuse within the same request
