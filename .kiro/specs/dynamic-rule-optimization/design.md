# Design Document: Dynamic Rule Optimization

## Overview

本设计文档描述了动态规则生成逻辑的优化方案。核心改进包括：

1. **检测逻辑重构**：从"先时间后数量"改为"先数量后时间跨度"
2. **检测范围优化**：只对默认转发的邮件进行动态规则监测
3. **配置参数扩展**：新增时间跨度阈值配置

## Architecture

### 当前架构问题

```
当前流程：
Email → Webhook → Phase1(Filter) → Phase2(Async Tasks)
                                      ↓
                                   Dynamic Task → trackSubject()
                                      ↓
                                   检查时间窗口内的邮件数量
                                      ↓
                                   数量 >= 阈值 → 创建规则
```

问题：
1. 所有邮件都会进入 Dynamic Task，包括已被黑白名单匹配的邮件
2. 检测逻辑是"先检查时间窗口，再统计数量"，无法快速响应突发邮件

### 优化后架构

```
优化流程：
Email → Webhook → Phase1(Filter) → 获取 FilterResult
                                      ↓
                                   检查 FilterResult.matchedCategory
                                      ↓
                              matchedCategory === undefined (默认转发)
                                      ↓
                                   Phase2(Async Tasks)
                                      ↓
                                   Dynamic Task → trackSubject()
                                      ↓
                                   统计同主题邮件数量
                                      ↓
                                   数量 >= 阈值
                                      ↓
                                   计算第1封和第N封的时间跨度
                                      ↓
                                   时间跨度 <= 阈值 → 创建规则
```

## Components and Interfaces

### 1. DynamicConfig 类型扩展

```typescript
// packages/shared/src/types/dynamic-config.ts
export interface DynamicConfig {
  enabled: boolean;
  timeWindowMinutes: number;      // 检测时间窗口，默认 30 分钟
  thresholdCount: number;         // 数量阈值，默认 30
  timeSpanThresholdMinutes: number; // 时间跨度阈值，默认 3 分钟（新增）
  expirationHours: number;        // 规则过期时间
  lastHitThresholdHours: number;  // 最后命中阈值
}

export const DEFAULT_DYNAMIC_CONFIG: DynamicConfig = {
  enabled: true,
  timeWindowMinutes: 30,          // 改为 30 分钟
  thresholdCount: 30,             // 改为 30
  timeSpanThresholdMinutes: 3,    // 新增：3 分钟
  expirationHours: 48,
  lastHitThresholdHours: 72,
};
```

### 2. DynamicRuleService 接口更新

```typescript
// packages/vps-api/src/services/dynamic-rule.service.ts

interface TrackingResult {
  tracked: boolean;
  rule?: FilterRule;
  reason?: string;
}

class DynamicRuleService {
  /**
   * 跟踪邮件主题用于动态规则检测
   * 
   * @param subject - 邮件主题
   * @param receivedAt - 接收时间
   * @returns 跟踪结果，包含是否创建了规则
   */
  trackSubject(subject: string, receivedAt: Date): FilterRule | null;
  
  /**
   * 检查是否应该跟踪该邮件
   * 只有默认转发的邮件才需要跟踪
   * 
   * @param filterResult - 过滤结果
   * @returns 是否应该跟踪
   */
  shouldTrack(filterResult: FilterResult): boolean;
}
```

### 3. AsyncTaskProcessor 接口更新

```typescript
// packages/vps-api/src/services/async-task-processor.ts

interface AsyncTaskData {
  payload: EmailWebhookPayload;
  filterResult: FilterResult;
  workerId?: string;
  defaultForwardTo: string;
}

// enqueueAll 方法需要根据 filterResult 决定是否入队 dynamic 任务
```

### 4. Task Processors 更新

```typescript
// packages/vps-api/src/services/task-processors.ts

/**
 * 处理动态规则任务
 * 只处理默认转发的邮件
 */
export async function processDynamicTasks(
  tasks: PendingTask[],
  dynamicRuleService: DynamicRuleService
): Promise<void>;
```

## Data Models

### 数据库表结构（无变化）

```sql
-- email_subject_tracker 表保持不变
CREATE TABLE IF NOT EXISTS email_subject_tracker (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id TEXT,
  subject_hash TEXT NOT NULL,
  subject TEXT NOT NULL,
  received_at TEXT NOT NULL
);

-- dynamic_config 表保持不变，新增 timeSpanThresholdMinutes 配置项
-- 配置项通过 key-value 存储，无需修改表结构
```

### 配置存储

新增配置项 `timeSpanThresholdMinutes`，存储在 `dynamic_config` 表中：

| key | value | description |
|-----|-------|-------------|
| timeSpanThresholdMinutes | 3 | 时间跨度阈值（分钟） |



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Count-First Detection Logic

*For any* sequence of emails with the same normalized subject tracked within a time window, the system should correctly count all emails and only trigger time span calculation when the count reaches the threshold.

**Validates: Requirements 1.1, 1.2, 2.1, 2.2**

### Property 2: Time Span Threshold Rule Creation

*For any* subject that reaches the threshold count with a time span less than or equal to the configured time span threshold, the system should create exactly one dynamic filter rule for that subject.

**Validates: Requirements 1.3**

### Property 3: Time Span Threshold No Rule Creation

*For any* subject that reaches the threshold count with a time span greater than the configured time span threshold, the system should NOT create a dynamic rule and should continue tracking.

**Validates: Requirements 1.4**

### Property 4: Tracking Scope - Only Default Forwarded Emails

*For any* email processed by the filter system, the dynamic rule tracking should only occur when the email is forwarded by default (no rule matched). Emails matching whitelist, blacklist, or existing dynamic rules should NOT be tracked.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 5: Configuration Round-Trip

*For any* valid dynamic configuration including the time span threshold, saving and then loading the configuration should return the same values.

**Validates: Requirements 4.1**

### Property 6: Configuration Validation

*For any* time window value, the system should accept values between 5 and 120 minutes. *For any* time span threshold value, the system should accept values between 1 and 30 minutes.

**Validates: Requirements 2.4, 4.4**

### Property 7: Existing Rules Preservation

*For any* existing dynamic rules in the database, the optimized detection logic should not modify or delete these rules during normal operation.

**Validates: Requirements 6.2**

## Error Handling

### 配置错误处理

1. **无效时间窗口值**：如果配置的时间窗口不在 5-120 分钟范围内，使用默认值 30 分钟
2. **无效时间跨度阈值**：如果配置的时间跨度阈值不在 1-30 分钟范围内，使用默认值 3 分钟
3. **无效数量阈值**：如果配置的数量阈值小于 1，使用默认值 30

### 数据库错误处理

1. **追踪记录插入失败**：记录错误日志，不影响邮件处理流程
2. **规则创建失败**：记录错误日志，下次达到阈值时重试
3. **配置读取失败**：使用默认配置继续运行

### 边界情况处理

1. **空主题**：跳过追踪，不创建规则
2. **重复规则**：检查是否已存在相同模式的规则，避免重复创建
3. **时间戳异常**：如果邮件时间戳在未来，使用当前时间

## Testing Strategy

### 测试框架

- **单元测试**：Vitest
- **属性测试**：fast-check

### 单元测试覆盖

1. **DynamicRuleService.trackSubject()**
   - 测试数量阈值检测
   - 测试时间跨度计算
   - 测试规则创建条件

2. **DynamicRuleService.shouldTrack()**
   - 测试白名单匹配邮件不追踪
   - 测试黑名单匹配邮件不追踪
   - 测试动态规则匹配邮件不追踪
   - 测试默认转发邮件追踪

3. **DynamicRuleService.getConfig()/updateConfig()**
   - 测试新配置项的读写
   - 测试默认值处理

4. **processDynamicTasks()**
   - 测试只处理默认转发的邮件

### 属性测试覆盖

每个正确性属性都需要对应的属性测试：

1. **Property 1 测试**：生成随机邮件序列，验证计数逻辑
2. **Property 2 测试**：生成时间跨度内的邮件，验证规则创建
3. **Property 3 测试**：生成时间跨度外的邮件，验证不创建规则
4. **Property 4 测试**：生成不同过滤结果的邮件，验证追踪范围
5. **Property 5 测试**：生成随机配置，验证保存和加载一致性
6. **Property 6 测试**：生成边界值配置，验证验证逻辑
7. **Property 7 测试**：创建现有规则，验证不被修改

### 测试配置

```typescript
// 属性测试配置
const PBT_CONFIG = {
  numRuns: 100,  // 每个属性测试运行 100 次
};
```
