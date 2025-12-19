# Requirements Document

## Introduction

本项目的 Email Worker 通过 Webhook 调用 VPS API 进行邮件过滤决策。当前架构中，所有处理逻辑（规则匹配、统计更新、日志记录、Campaign Analytics、Signal Monitoring 等）都在同一个请求中同步执行，导致响应时间过长（220-370ms）。

本次优化采用双阶段响应方案，将关键路径（规则匹配）与非关键路径（统计、日志、分析）分离，目标是将响应时间降低到 50ms 以内。

## Glossary

- **Webhook**: Email Worker 发送到 VPS API 的 HTTP POST 请求，用于获取邮件过滤决策
- **Phase 1 (快速响应)**: 仅执行规则匹配等关键操作，立即返回决策结果
- **Phase 2 (异步处理)**: 在响应返回后，异步执行统计更新、日志记录等非关键操作
- **Task Queue**: 内存队列，用于收集和批量处理异步任务
- **Rule Cache**: 规则缓存，减少数据库查询次数
- **Filter Result**: 邮件过滤决策结果（accept/reject/forward 等）
- **Campaign Analytics**: 营销活动分析模块
- **Signal Monitoring**: 信号监控模块

## Requirements

### Requirement 1

**User Story:** As a system operator, I want the webhook response time to be under 50ms, so that email processing is not delayed.

#### Acceptance Criteria

1. WHEN the VPS API receives a webhook request THEN the system SHALL return the filter decision within 50ms
2. WHEN executing Phase 1 processing THEN the system SHALL only perform worker config lookup, rule retrieval, and filter matching
3. WHEN Phase 1 completes THEN the system SHALL immediately return the response without waiting for Phase 2 tasks
4. WHEN measuring response time THEN the system SHALL exclude network latency from the 50ms target

### Requirement 2

**User Story:** As a developer, I want non-critical operations to be processed asynchronously, so that they do not block the webhook response.

#### Acceptance Criteria

1. WHEN a filter decision is made THEN the system SHALL enqueue statistics update, log recording, watch tracking, campaign analytics, and signal monitoring as async tasks
2. WHEN enqueueing async tasks THEN the system SHALL not block the HTTP response
3. WHEN the async task queue receives a task THEN the system SHALL process the task within 5 seconds
4. WHEN an async task fails THEN the system SHALL log the error and continue processing other tasks

### Requirement 3

**User Story:** As a developer, I want async tasks to be batched for efficiency, so that database write operations are minimized.

#### Acceptance Criteria

1. WHEN the task queue reaches the batch size threshold THEN the system SHALL trigger a batch flush
2. WHEN the flush interval expires THEN the system SHALL flush pending tasks regardless of queue size
3. WHEN processing a batch THEN the system SHALL combine similar operations into single database writes
4. WHEN the batch processing fails THEN the system SHALL retry individual tasks up to 3 times

### Requirement 4

**User Story:** As a developer, I want filter rules to be cached, so that database queries are reduced for repeated requests.

#### Acceptance Criteria

1. WHEN a worker requests rules THEN the system SHALL first check the in-memory cache
2. WHEN cache contains valid rules THEN the system SHALL return cached rules without database query
3. WHEN cache entry expires (TTL 60 seconds) THEN the system SHALL fetch fresh rules from database
4. WHEN rules are updated via admin panel THEN the system SHALL invalidate the cache for that worker

### Requirement 5

**User Story:** As a developer, I want the system to gracefully handle failures, so that email processing continues even when async tasks fail.

#### Acceptance Criteria

1. WHEN Phase 2 processing fails THEN the system SHALL not affect the already-returned Phase 1 response
2. WHEN the task queue exceeds maximum size THEN the system SHALL drop oldest tasks and log a warning
3. WHEN the system restarts THEN the system SHALL accept that pending async tasks are lost (acceptable trade-off)
4. WHEN database connection fails during async processing THEN the system SHALL retry with exponential backoff

