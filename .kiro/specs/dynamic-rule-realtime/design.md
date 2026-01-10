# Design Document: Dynamic Rule Realtime Detection

## Overview

本设计文档描述如何将动态规则检测从异步 Phase 2 处理移动到同步 Phase 1 处理，以实现实时垃圾邮件拦截。同时包含系统日志改进，添加管理操作和系统事件的日志记录。

## Architecture

### 当前架构

```
Email → Worker → VPS API
                    ├── Phase 1 (同步): 规则匹配 → 返回决策
                    └── Phase 2 (异步): 统计、日志、动态规则追踪、营销分析、监控
```

### 新架构

```
Email → Worker → VPS API
                    ├── Phase 1 (同步): 规则匹配 → 动态规则追踪 → 返回决策
                    └── Phase 2 (异步): 统计、日志、营销分析、监控
```

关键变化：
1. 动态规则追踪从 Phase 2 移到 Phase 1
2. 如果在 Phase 1 创建了新规则，立即应用到当前邮件
3. Phase 1 响应时间目标从 50ms 放宽到 100ms

## Components and Interfaces

### 1. Webhook Route (webhook.ts)

修改 `processPhase1` 函数，在规则匹配后、返回决策前执行动态规则追踪。

```typescript
interface Phase1Result {
  decision: FilterDecision;
  filterResult: FilterResult;
  workerId?: string;
  defaultForwardTo: string;
  dynamicRuleCreated?: FilterRule; // 新增：记录是否创建了动态规则
}

function processPhase1(payload: EmailWebhookPayload): Phase1Result {
  // 1. Worker config lookup
  // 2. Rule retrieval (with caching)
  // 3. Filter matching
  
  // 4. NEW: Dynamic rule tracking (synchronous)
  if (filterResult.matchedCategory === undefined) {
    const dynamicRule = dynamicRuleService.trackSubject(payload.subject, new Date(payload.timestamp));
    if (dynamicRule) {
      // Re-evaluate with new rule
      filterResult = reEvaluateWithNewRule(payload, dynamicRule);
    }
  }
  
  // 5. Return decision
}
```

### 2. Dynamic Rule Service (dynamic-rule.service.ts)

优化 `trackSubject` 方法以支持同步调用，并添加检测指标记录。

```typescript
interface DynamicRuleCreationResult {
  rule: FilterRule | null;
  detectionLatencyMs?: number;  // 从第一封邮件到规则创建的时间
  emailsForwardedBeforeBlock?: number;  // 规则创建前转发的邮件数
}

trackSubject(subject: string, receivedAt: Date): DynamicRuleCreationResult
```

### 3. Async Task Processor (async-task-processor.ts)

从 `ALL_TASK_TYPES` 中移除 `'dynamic'`，保留其他异步任务。

```typescript
const ALL_TASK_TYPES: AsyncTaskType[] = [
  'stats',
  'log',
  'watch',
  // 'dynamic', // 移除 - 现在在 Phase 1 同步处理
  'campaign',
  'monitoring',
];
```

### 4. Log Repository (log-repository.ts)

添加辅助方法用于创建管理操作和系统日志。

```typescript
// 管理操作日志
createAdminLog(action: string, details: Record<string, unknown>, workerName?: string): SystemLog

// 系统日志
createSystemLog(event: string, details: Record<string, unknown>, workerName?: string): SystemLog
```

### 5. Admin Logging Integration

在以下路由中添加管理操作日志：
- `rules.ts`: 规则的增删改
- `workers.ts`: Worker 的增删改
- `dynamic.ts`: 动态规则配置变更

## Data Models

### Dynamic Rule Creation Log Entry

```typescript
interface DynamicRuleCreationLog {
  category: 'system';
  level: 'info';
  message: string;  // e.g., "动态规则已创建: {pattern}"
  details: {
    ruleId: string;
    pattern: string;
    detectionLatencyMs: number;
    emailsForwardedBeforeBlock: number;
    firstEmailTime: string;
    triggerEmailTime: string;
  };
}
```

### Admin Action Log Entry

```typescript
interface AdminActionLog {
  category: 'admin_action';
  level: 'info';
  message: string;  // e.g., "创建规则: {pattern}"
  details: {
    action: 'create' | 'update' | 'delete';
    entityType: 'rule' | 'worker' | 'dynamic_config';
    entityId?: string;
    changes?: Record<string, unknown>;
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Synchronous rule creation affects current email
*For any* sequence of emails with the same subject that triggers dynamic rule creation, the email that triggers the rule creation SHALL be blocked by that rule in the same request.
**Validates: Requirements 1.1, 1.3**

### Property 2: Rule cache is updated synchronously
*For any* email that triggers dynamic rule creation, after the request completes, the rule cache SHALL contain the newly created rule.
**Validates: Requirements 1.4**

### Property 3: Threshold configuration accepts valid low values
*For any* threshold count value between 5 and 1000, the system SHALL accept and save the configuration.
**Validates: Requirements 3.1**

### Property 4: Time span configuration accepts valid low values
*For any* time span threshold value between 0.5 and 30 minutes, the system SHALL accept and save the configuration.
**Validates: Requirements 3.2**

### Property 5: Admin actions create logs
*For any* rule creation, update, or deletion operation, the system SHALL create an admin_action log entry containing the operation details.
**Validates: Requirements 5.1, 5.2, 5.3**

### Property 6: Worker operations create logs
*For any* Worker creation, update, or deletion operation, the system SHALL create an admin_action log entry containing the operation details.
**Validates: Requirements 5.4, 5.5**

### Property 7: Dynamic rule creation creates system log
*For any* automatically created dynamic rule, the system SHALL create a system log entry containing detection latency and forwarded email count.
**Validates: Requirements 4.1, 4.2, 6.1**

## Error Handling

1. **Database errors during Phase 1**: 如果动态规则追踪失败，记录错误但继续返回原始过滤决策，不阻塞邮件处理
2. **Cache invalidation failures**: 如果缓存更新失败，记录警告，规则将在下次缓存刷新时生效
3. **Log creation failures**: 日志创建失败不应影响主要功能，仅记录错误

## Testing Strategy

### Unit Tests

1. 测试 `processPhase1` 在创建动态规则后重新评估邮件
2. 测试配置验证接受新的最小值
3. 测试管理操作日志创建

### Property-Based Tests

使用 fast-check 库进行属性测试：

1. **Property 1**: 生成随机邮件序列，验证触发规则创建的邮件被阻止
2. **Property 3-4**: 生成有效配置值范围内的随机值，验证系统接受
3. **Property 5-7**: 生成随机操作，验证相应日志被创建

### Integration Tests

1. 端到端测试：发送多封相同主题邮件，验证规则创建和阻止时机
2. 性能测试：验证 Phase 1 响应时间在 100ms 以内
