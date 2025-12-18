# Design Document: Worker Instance Data Separation

## Overview

本模块为邮件过滤系统添加 Worker 实例数据分类功能，支持按实例查看和管理日志、统计、营销分析、信号监控等数据。

### 核心功能
- 日志记录实例标识
- 统计信息按实例分类
- 热门拦截规则实例统计
- 营销分析实例筛选
- 信号监控实例作用范围
- 漏斗监控实例支持

### 设计原则
- 向后兼容：现有数据默认归属于 "global" 或第一个实例
- 渐进增强：先添加字段，再逐步完善功能
- 统一筛选器：所有模块使用统一的实例筛选组件

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Admin Panel                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Instance Filter (Global / Instance)        │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                 │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │   Logs   │  Stats   │ Campaign │ Monitor  │  Funnel  │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       VPS API                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              worker_name Filter Support              │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      SQLite Database                         │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │   logs   │  rules   │ campaigns│ monitors │  ratios  │  │
│  │ +worker  │ +worker  │ +worker  │ +scope   │ +scope   │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema Changes

### 1. logs 表添加 worker_name 字段

```sql
ALTER TABLE logs ADD COLUMN worker_name TEXT DEFAULT 'global';
CREATE INDEX idx_logs_worker_name ON logs(worker_name);
```

### 2. campaign_emails 表添加 worker_name 字段

```sql
ALTER TABLE campaign_emails ADD COLUMN worker_name TEXT DEFAULT 'global';
CREATE INDEX idx_campaign_emails_worker ON campaign_emails(worker_name);
```

### 3. monitoring_rules 表添加 worker_scope 字段

```sql
ALTER TABLE monitoring_rules ADD COLUMN worker_scope TEXT DEFAULT 'global';
```

### 4. ratio_monitors 表添加 worker_scope 字段

```sql
ALTER TABLE ratio_monitors ADD COLUMN worker_scope TEXT DEFAULT 'global';
```

## API Changes

### 1. Logs API

```typescript
// GET /api/logs - 添加 workerName 查询参数
interface GetLogsQuery {
  workerName?: string;  // 'global' | 具体实例名 | undefined(全部)
  // ... existing params
}

// Response 添加 workerName 字段
interface LogEntry {
  workerName: string;
  // ... existing fields
}
```

### 2. Stats API

```typescript
// GET /api/stats - 添加 workerName 查询参数
interface GetStatsQuery {
  workerName?: string;
}

// GET /api/stats/by-worker - 新增按实例分组统计
interface WorkerStats {
  workerName: string;
  total: number;
  forwarded: number;
  dropped: number;
}
```

### 3. Trending Rules API

```typescript
// GET /api/stats/trending - 添加 workerName 参数
interface GetTrendingQuery {
  hours?: number;
  workerName?: string;
}

// Response 添加实例分布
interface TrendingRule {
  // ... existing fields
  workerBreakdown: Array<{
    workerName: string;
    count: number;
  }>;
}
```

### 4. Campaign API

```typescript
// GET /api/campaign/merchants - 添加 workerName 参数
// GET /api/campaign/campaigns - 添加 workerName 参数
interface CampaignFilter {
  workerName?: string;
  // ... existing fields
}
```

### 5. Monitoring API

```typescript
// POST /api/monitoring/rules - 添加 workerScope 字段
interface CreateMonitoringRuleDTO {
  workerScope?: string;  // 'global' | 具体实例名
  // ... existing fields
}

// GET /api/monitoring/status - 添加 workerScope 筛选
interface GetMonitoringStatusQuery {
  workerScope?: string;
}
```

### 6. Ratio Monitor API

```typescript
// POST /api/ratio-monitors - 添加 workerScope 字段
interface CreateRatioMonitorDTO {
  workerScope?: string;
  // ... existing fields
}
```

## Frontend Components

### 1. 全局实例筛选器组件

```html
<select id="global-worker-filter" onchange="onWorkerFilterChange()">
  <option value="">全部实例</option>
  <option value="global">全局</option>
  <!-- 动态加载实例列表 -->
</select>
```

### 2. 各模块筛选器集成

- 日志页面：添加实例筛选下拉框
- 统计页面：添加实例筛选下拉框
- 营销分析：添加实例筛选下拉框
- 信号监控：规则创建/编辑时添加作用范围选择
- 漏斗监控：监控创建/编辑时添加作用范围选择

## Data Models

### TypeScript Types

```typescript
// Worker scope type
type WorkerScope = 'global' | string;

// Log entry with worker info
interface LogEntry {
  id: number;
  workerName: string;
  category: string;
  subject?: string;
  sender?: string;
  recipient?: string;
  matchedRule?: string;
  createdAt: Date;
}

// Stats with worker breakdown
interface StatsResponse {
  global: {
    total: number;
    forwarded: number;
    dropped: number;
    rules: number;
    workers: number;
  };
  byWorker?: WorkerStats[];
}

interface WorkerStats {
  workerName: string;
  total: number;
  forwarded: number;
  dropped: number;
}

// Trending rule with worker breakdown
interface TrendingRule {
  ruleId: number;
  pattern: string;
  count: number;
  lastHit: Date;
  workerBreakdown: WorkerBreakdown[];
}

interface WorkerBreakdown {
  workerName: string;
  count: number;
}

// Monitoring rule with scope
interface MonitoringRule {
  id: string;
  workerScope: WorkerScope;
  // ... existing fields
}

// Ratio monitor with scope
interface RatioMonitor {
  id: string;
  workerScope: WorkerScope;
  // ... existing fields
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Worker Name Persistence
*For any* log entry created with a worker name, querying that log should return the same worker name.
**Validates: Requirements 1.1, 1.2**

### Property 2: Filter Consistency
*For any* query with a specific worker name filter, all returned records should have that worker name. This applies to logs, stats, campaigns, and merchants.
**Validates: Requirements 1.3, 2.2, 3.3, 4.2, 4.3, 7.4**

### Property 3: Global Stats Aggregation
*For any* global stats query, the totals should equal the sum of all individual worker stats.
**Validates: Requirements 2.1**

### Property 4: Worker Breakdown Completeness
*For any* trending rule query, the sum of counts in workerBreakdown should equal the total count.
**Validates: Requirements 3.2**

### Property 5: Scope-Based Data Aggregation
*For any* monitoring rule or ratio monitor with a specific worker scope, the statistics should only include data from that worker. For global scope, statistics should include all workers.
**Validates: Requirements 5.2, 5.3, 6.2, 6.3**

### Property 6: Alert Scope Marking
*For any* alert triggered by a scoped rule, the alert should contain the rule's worker scope information.
**Validates: Requirements 5.5**

### Property 7: Schema Field Presence
*For any* newly created log, campaign email, monitoring rule, or ratio monitor, the worker_name or worker_scope field should be present and non-null.
**Validates: Requirements 7.1, 7.2, 7.3**

### Property 8: Backward Compatibility
*For any* existing data without worker_name, the system should treat it as 'global' scope when querying.
**Validates: Requirements 7.1, 7.2**

## Error Handling

### API Errors
- 400 Bad Request: 无效的 workerName 或 workerScope 参数
- 404 Not Found: 指定的 Worker 实例不存在

### Data Migration
- 现有数据的 worker_name 默认设置为 'global'
- 迁移脚本应该是幂等的，可以安全重复执行

## Testing Strategy

### Unit Testing
- 测试各 API 的 workerName 筛选功能
- 测试统计聚合逻辑
- 测试监控规则的作用范围判断

### Property-Based Testing
- 使用 fast-check 库进行属性测试
- 测试筛选结果的一致性
- 测试统计数据的聚合正确性

### Integration Testing
- 测试从 Worker 上报到数据展示的完整流程
- 测试实例筛选器与各模块的联动
