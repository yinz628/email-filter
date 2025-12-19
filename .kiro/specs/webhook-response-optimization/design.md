# Design Document

## Overview

本设计文档描述了 Webhook 响应优化方案 C（双阶段响应）的实现细节。通过将关键路径（规则匹配）与非关键路径（统计、日志、分析）分离，将响应时间从 220-370ms 降低到 50ms 以内。

## 现有系统分析

### 1. 过滤系统 (Filter System)

**核心文件：**
- `services/filter.service.ts` - 过滤引擎核心
- `services/email.service.ts` - 邮件处理编排
- `services/dynamic-rule.service.ts` - 动态规则管理

**处理流程：**
```
EmailService.processEmail()
├─ ruleRepository.findEnabled(workerId)     // 获取规则 ~5ms
├─ filterService.processEmail(payload, rules) // 规则匹配 ~10ms
├─ updateStats(filterResult)                 // 统计更新 ~20ms [可异步]
└─ logEmailProcessing(payload, filterResult) // 日志记录 ~10ms [可异步]
```

**关键路径（必须同步）：**
- `ruleRepository.findEnabled()` - 获取规则
- `filterService.processEmail()` - 执行匹配

**非关键路径（可异步）：**
- `updateStats()` - 统计更新
- `logEmailProcessing()` - 日志记录

### 2. 营销分析系统 (Campaign Analytics)

**核心文件：**
- `services/campaign-analytics.service.ts` - 营销分析服务

**处理流程：**
```
CampaignAnalyticsService.trackEmailSelective()
├─ extractDomain(sender)                    // 提取域名 ~1ms
├─ getOrCreateMerchant(domain)              // 获取/创建商户 ~20ms
├─ createOrUpdateCampaign()                 // 创建/更新活动 ~50ms
└─ recordCampaignEmail()                    // 记录邮件 ~30ms
```

**全部可异步** - 不影响过滤决策

### 3. 信号监控系统 (Signal Monitoring)

**核心文件：**
- `services/monitoring/hit-processor.ts` - 命中处理器
- `services/monitoring/signal-state.service.ts` - 信号状态服务

**处理流程：**
```
HitProcessor.processEmail()
├─ validateEmailMetadata()                  // 验证 ~1ms
├─ matchRules(email)                        // 规则匹配 ~10ms
└─ recordHit() for each matched rule        // 记录命中 ~40ms
```

**全部可异步** - 不影响过滤决策

### 4. Watch 规则统计

**核心文件：**
- `db/watch-repository.ts` - Watch 规则仓库

**处理流程：**
```
├─ watchRepo.findEnabled()                  // 获取规则 ~5ms
├─ matchesRuleWebhook() for each rule       // 匹配 ~10ms
└─ watchRepo.incrementHit() for matched     // 更新统计 ~5ms
```

**可异步** - 仅统计用途

### 5. 动态规则追踪

**核心文件：**
- `services/dynamic-rule.service.ts`

**处理流程：**
```
DynamicRuleService.trackSubject()
├─ getConfig()                              // 获取配置 ~2ms
├─ hashSubject()                            // 计算哈希 ~1ms
├─ INSERT INTO email_subject_tracker        // 插入记录 ~5ms
└─ createDynamicRule() (if threshold met)   // 创建规则 ~10ms
```

**可异步** - 动态规则创建不影响当前邮件的过滤决策

## Architecture

### 优化后架构

```
Phase 1: 快速响应 (<50ms)
┌─────────────────────────────────────────────────────────────┐
│  Worker ──POST──> VPS API                                   │
│                      │                                       │
│                      ├─ 查找 Worker 配置                     │
│                      ├─ 获取规则列表 (可选缓存)               │
│                      ├─ 执行过滤匹配                         │
│                      └─ 返回决策 ──────────> Worker          │
└─────────────────────────────────────────────────────────────┘
                       │
                       │ setImmediate()
                       ▼
Phase 2: 异步处理
┌─────────────────────────────────────────────────────────────┐
│  AsyncTaskProcessor                                          │
│      │                                                       │
│      ├─ 统计更新 (EmailService.updateStats)                  │
│      ├─ 日志记录 (EmailService.logEmailProcessing)           │
│      ├─ Watch 规则统计 (WatchRepository.incrementHit)        │
│      ├─ 动态规则追踪 (DynamicRuleService.trackSubject)       │
│      ├─ Campaign Analytics (trackEmailSelective)             │
│      └─ Signal Monitoring (HitProcessor.processEmail)        │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. AsyncTaskProcessor (异步任务处理器)

```typescript
// packages/vps-api/src/services/async-task-processor.ts

export type AsyncTaskType = 
  | 'stats' | 'log' | 'watch' | 'dynamic' | 'campaign' | 'monitoring';

export interface AsyncTaskData {
  payload: EmailWebhookPayload;
  filterResult: FilterResult;
  workerId?: string;
  defaultForwardTo: string;
}

export interface PendingTask {
  type: AsyncTaskType;
  data: AsyncTaskData;
  timestamp: number;
  retryCount: number;
}

export interface AsyncTaskProcessorConfig {
  batchSize: number;        // 默认 10
  flushIntervalMs: number;  // 默认 1000ms
  maxQueueSize: number;     // 默认 1000
  maxRetries: number;       // 默认 3
}

export class AsyncTaskProcessor {
  enqueueAll(data: AsyncTaskData): void;
  enqueue(task: PendingTask): void;
  flush(): Promise<void>;
  startFlushTimer(): void;
  stopFlushTimer(): void;
  getStatus(): { queueSize: number; processing: boolean };
}
```

### 2. RuleCache (规则缓存) - 可选增强

```typescript
// packages/vps-api/src/services/rule-cache.ts

export interface RuleCacheConfig {
  ttlMs: number;         // 默认 60000ms
  maxEntries: number;    // 默认 100
}

export class RuleCache {
  get(workerId?: string): FilterRule[] | null;
  set(workerId: string | undefined, rules: FilterRule[]): void;
  invalidate(workerId?: string): void;
  getStats(): { size: number; hitRate: number };
}
```

### 3. 优化后的 Webhook Handler

```typescript
// Phase 1: 快速响应
const rules = ruleRepository.findEnabled(workerId);
const filterResult = filterService.processEmail(payload, rules);
const decision = filterService.toApiResponse(filterResult);

// Phase 2: 异步处理
setImmediate(() => {
  asyncTaskProcessor.enqueueAll({
    payload, filterResult, workerId, defaultForwardTo
  });
});

return reply.send(decision);
```

## Data Models

### AsyncTaskData
```typescript
interface AsyncTaskData {
  payload: EmailWebhookPayload;
  filterResult: FilterResult;
  workerId?: string;
  defaultForwardTo: string;
}
```

### PendingTask
```typescript
interface PendingTask {
  type: AsyncTaskType;
  data: AsyncTaskData;
  timestamp: number;
  retryCount: number;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system.*

### Property 1: Response Time Guarantee
*For any* valid webhook request, Phase 1 processing time should be less than 50ms
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Task Queue Consistency
*For any* webhook request completing Phase 1, all Phase 2 tasks should be enqueued
**Validates: Requirements 2.1, 2.2**

### Property 3: Cache Round Trip
*For any* cached rules, retrieval should return same rules until TTL expires
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 4: Batch Processing Completeness
*For any* batch processed, all tasks should either succeed or be logged as failed
**Validates: Requirements 3.1, 3.2, 3.3**

### Property 5: Failure Isolation
*For any* Phase 2 failure, Phase 1 response should remain unaffected
**Validates: Requirements 5.1, 5.2**

## Error Handling

### Phase 1 Errors
- 数据库连接失败: 返回 500 错误
- 规则解析错误: 使用默认转发行为

### Phase 2 Errors
- 任务处理失败: 重试最多 3 次
- 队列溢出: 丢弃最旧任务，记录警告

## Testing Strategy

### Unit Tests
- AsyncTaskProcessor 入队、出队、批量处理
- RuleCache 缓存命中、过期、失效
- Phase 1 响应时间测试

### Property-Based Tests (fast-check)
- 缓存往返一致性
- 批量处理完整性
- 任务队列 FIFO 顺序

### Integration Tests
- 完整双阶段处理流程
- 高并发队列行为
- 错误恢复机制
