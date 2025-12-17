# Design Document: 重点邮件实时监控与告警

## Overview

重点邮件实时监控与告警系统是一个独立的信号监测层，用于持续监控关键营销邮件的出现频率。系统基于"信号"概念而非单封邮件，通过定义监控规则来跟踪特定商户的特定主题模式，并在信号异常时及时告警。

### 核心设计原则

1. **信号驱动**: 监控的是"信号是否还活着"，而非单封邮件
2. **事件驱动 + 心跳检查**: 邮件命中时实时更新，定时心跳检查状态变化
3. **状态变化告警**: 只在状态发生变化时告警，避免告警疲劳
4. **与路径分析解耦**: 完全独立的监控层，仅依赖邮件元数据

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Email Worker                              │
│  ┌─────────────┐                                                │
│  │ email()     │──────────────────────────────────────────────┐ │
│  └─────────────┘                                              │ │
│         │                                                     │ │
│         ▼                                                     ▼ │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────────┐│
│  │ Filter API  │    │Campaign API │    │ Monitoring API       ││
│  └─────────────┘    └─────────────┘    │ (新增)               ││
│                                        └──────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         VPS API                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Monitoring Service (新增)                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │   │
│  │  │ Rule Mgmt   │  │ State Mgmt  │  │ Alert Mgmt  │       │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │   │
│  │         │                │                │               │   │
│  │         ▼                ▼                ▼               │   │
│  │  ┌─────────────────────────────────────────────────┐     │   │
│  │  │              SQLite Database                     │     │   │
│  │  │  monitoring_rules | signal_states | alerts       │     │   │
│  │  │  hit_logs | heartbeat_logs                       │     │   │
│  │  └─────────────────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Heartbeat Scheduler (Cron)                   │   │
│  │              每 5 分钟执行状态检查                         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Alert Channels                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Webhook    │  │   Email     │  │   Future    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Monitoring Rule Manager

负责监控规则的 CRUD 操作。

```typescript
interface MonitoringRule {
  id: string;
  merchant: string;           // 商户域名或标识
  name: string;               // 规则名称（用于展示）
  subjectPattern: string;     // 主题匹配模式（正则表达式）
  expectedIntervalMinutes: number;  // 预期出现间隔（分钟）
  deadAfterMinutes: number;   // 死亡阈值（分钟）
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MonitoringRuleService {
  createRule(data: CreateRuleDTO): MonitoringRule;
  updateRule(id: string, data: UpdateRuleDTO): MonitoringRule | null;
  deleteRule(id: string): boolean;
  getRule(id: string): MonitoringRule | null;
  getRules(filter?: RuleFilter): MonitoringRule[];
  toggleRule(id: string, enabled: boolean): MonitoringRule | null;
}
```

### 2. Signal State Manager

负责信号状态的计算和管理。

```typescript
type SignalState = 'ACTIVE' | 'WEAK' | 'DEAD';

interface SignalStatus {
  ruleId: string;
  rule: MonitoringRule;
  state: SignalState;
  lastSeenAt: Date | null;
  gapMinutes: number;
  count1h: number;
  count12h: number;
  count24h: number;
  updatedAt: Date;
}

interface SignalStateService {
  getStatus(ruleId: string): SignalStatus | null;
  getAllStatuses(): SignalStatus[];
  calculateState(lastSeenAt: Date | null, rule: MonitoringRule): SignalState;
  updateOnHit(ruleId: string, hitTime: Date): SignalStatus;
  runHeartbeatCheck(): HeartbeatResult;
}
```

### 3. Alert Manager

负责告警的生成和发送。

```typescript
type AlertType = 'FREQUENCY_DOWN' | 'SIGNAL_DEAD' | 'SIGNAL_RECOVERED';

interface Alert {
  id: string;
  ruleId: string;
  alertType: AlertType;
  previousState: SignalState;
  currentState: SignalState;
  gapMinutes: number;
  count1h: number;
  count12h: number;
  count24h: number;
  message: string;
  sentAt: Date | null;
  createdAt: Date;
}

interface AlertService {
  createAlert(data: CreateAlertDTO): Alert;
  sendAlert(alert: Alert): Promise<boolean>;
  getAlerts(filter?: AlertFilter): Alert[];
  getAlertChannels(): AlertChannel[];
  configureChannel(channel: AlertChannelConfig): void;
}
```

### 4. Hit Processor

负责处理邮件命中事件。

```typescript
interface EmailHit {
  id: string;
  ruleId: string;
  sender: string;
  subject: string;
  recipient: string;
  receivedAt: Date;
  createdAt: Date;
}

interface HitProcessor {
  processEmail(email: EmailMetadata): HitResult;
  matchRules(email: EmailMetadata): MonitoringRule[];
  recordHit(ruleId: string, email: EmailMetadata): EmailHit;
}
```

### 5. API Routes

```typescript
// 规则管理
POST   /api/monitoring/rules          // 创建规则
GET    /api/monitoring/rules          // 获取规则列表
GET    /api/monitoring/rules/:id      // 获取单个规则
PUT    /api/monitoring/rules/:id      // 更新规则
DELETE /api/monitoring/rules/:id      // 删除规则
PATCH  /api/monitoring/rules/:id/toggle // 启用/禁用规则

// 状态查询
GET    /api/monitoring/status         // 获取所有信号状态
GET    /api/monitoring/status/:ruleId // 获取单个信号状态

// 告警管理
GET    /api/monitoring/alerts         // 获取告警历史
GET    /api/monitoring/alerts/:id     // 获取单个告警详情

// 邮件命中（内部调用）
POST   /api/monitoring/hit            // 记录邮件命中

// 心跳检查（内部/Cron 调用）
POST   /api/monitoring/heartbeat      // 触发心跳检查
```

## Data Models

### Database Schema

```sql
-- 监控规则表
CREATE TABLE monitoring_rules (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  name TEXT NOT NULL,
  subject_pattern TEXT NOT NULL,
  expected_interval_minutes INTEGER NOT NULL,
  dead_after_minutes INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_monitoring_rules_merchant ON monitoring_rules(merchant);
CREATE INDEX idx_monitoring_rules_enabled ON monitoring_rules(enabled);

-- 信号状态表
CREATE TABLE signal_states (
  rule_id TEXT PRIMARY KEY REFERENCES monitoring_rules(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'DEAD',  -- ACTIVE, WEAK, DEAD
  last_seen_at TEXT,
  count_1h INTEGER NOT NULL DEFAULT 0,
  count_12h INTEGER NOT NULL DEFAULT 0,
  count_24h INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 命中记录表（48-72小时后清理）
CREATE TABLE hit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL REFERENCES monitoring_rules(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  subject TEXT NOT NULL,
  recipient TEXT NOT NULL,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_hit_logs_rule_id ON hit_logs(rule_id);
CREATE INDEX idx_hit_logs_created_at ON hit_logs(created_at);

-- 告警记录表（30-90天后清理）
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES monitoring_rules(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,  -- FREQUENCY_DOWN, SIGNAL_DEAD, SIGNAL_RECOVERED
  previous_state TEXT NOT NULL,
  current_state TEXT NOT NULL,
  gap_minutes INTEGER NOT NULL,
  count_1h INTEGER NOT NULL,
  count_12h INTEGER NOT NULL,
  count_24h INTEGER NOT NULL,
  message TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_alerts_rule_id ON alerts(rule_id);
CREATE INDEX idx_alerts_created_at ON alerts(created_at);
CREATE INDEX idx_alerts_alert_type ON alerts(alert_type);

-- 心跳检查日志表
CREATE TABLE heartbeat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at TEXT NOT NULL,
  rules_checked INTEGER NOT NULL,
  state_changes INTEGER NOT NULL,
  alerts_triggered INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL
);

CREATE INDEX idx_heartbeat_logs_checked_at ON heartbeat_logs(checked_at);

-- 告警渠道配置表
CREATE TABLE alert_channels (
  id TEXT PRIMARY KEY,
  channel_type TEXT NOT NULL,  -- webhook, email
  config TEXT NOT NULL,        -- JSON 配置
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Type Definitions

```typescript
// 创建规则 DTO
interface CreateRuleDTO {
  merchant: string;
  name: string;
  subjectPattern: string;
  expectedIntervalMinutes: number;
  deadAfterMinutes: number;
  enabled?: boolean;
}

// 更新规则 DTO
interface UpdateRuleDTO {
  merchant?: string;
  name?: string;
  subjectPattern?: string;
  expectedIntervalMinutes?: number;
  deadAfterMinutes?: number;
  enabled?: boolean;
}

// 邮件元数据
interface EmailMetadata {
  sender: string;
  subject: string;
  recipient: string;
  receivedAt: Date;
}

// 命中结果
interface HitResult {
  matched: boolean;
  matchedRules: string[];  // 匹配的规则 ID 列表
  stateChanges: StateChange[];
}

// 状态变化
interface StateChange {
  ruleId: string;
  previousState: SignalState;
  currentState: SignalState;
  alertTriggered: boolean;
}

// 心跳检查结果
interface HeartbeatResult {
  checkedAt: Date;
  rulesChecked: number;
  stateChanges: StateChange[];
  alertsTriggered: number;
  durationMs: number;
}

// 告警渠道配置
interface AlertChannelConfig {
  id?: string;
  channelType: 'webhook' | 'email';
  config: WebhookConfig | EmailConfig;
  enabled: boolean;
}

interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  method?: 'POST' | 'PUT';
}

interface EmailConfig {
  to: string[];
  from?: string;
  subject?: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: 规则创建完整性
*For any* 有效的规则创建请求，创建后查询该规则应返回所有字段且值与请求一致
**Validates: Requirements 1.1, 1.4**

### Property 2: 规则更新立即生效
*For any* 规则更新操作，更新后的状态计算应使用新的配置值
**Validates: Requirements 1.2**

### Property 3: 禁用规则跳过检查
*For any* 被禁用的规则，心跳检查应跳过该规则且不产生告警
**Validates: Requirements 1.3**

### Property 4: 正则匹配正确性
*For any* 包含正则表达式的规则和任意邮件主题，匹配结果应与 JavaScript RegExp 行为一致
**Validates: Requirements 1.5**

### Property 5: 状态计算公式正确性
*For any* gap、expectedInterval、deadAfter 值组合，状态计算应满足：
- gap <= expectedInterval * 1.5 → ACTIVE
- expectedInterval * 1.5 < gap <= deadAfter → WEAK
- gap > deadAfter → DEAD
**Validates: Requirements 2.1**

### Property 6: 状态查询完整性
*For any* 信号状态查询，返回结果应包含 lastSeenAt、gapMinutes、currentState、count1h、count12h、count24h 所有字段
**Validates: Requirements 2.5**

### Property 7: 邮件命中更新一致性
*For any* 匹配监控规则的邮件，命中后 lastSeenAt 应更新为邮件接收时间，且相应时间窗口计数器应递增
**Validates: Requirements 3.1, 3.2**

### Property 8: 恢复事件触发
*For any* 状态为 WEAK 或 DEAD 的规则，收到匹配邮件后状态应变为 ACTIVE 且触发 RECOVERED 事件
**Validates: Requirements 3.3**

### Property 9: 心跳检查覆盖所有启用规则
*For any* 心跳检查执行，所有 enabled=true 的规则都应被检查且状态被重新计算
**Validates: Requirements 4.1**

### Property 10: 状态转换告警矩阵
*For any* 状态转换：
- ACTIVE → WEAK: 触发 FREQUENCY_DOWN 告警
- WEAK → DEAD: 触发 SIGNAL_DEAD 告警
- DEAD/WEAK → ACTIVE: 触发 SIGNAL_RECOVERED 告警
- ACTIVE → ACTIVE: 不触发告警
- WEAK → WEAK: 不触发告警
- DEAD → DEAD: 不触发告警
**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 11: 告警内容完整性
*For any* 生成的告警，应包含 merchant、ruleName、previousState、currentState、gapMinutes、count1h、count12h、count24h 所有字段
**Validates: Requirements 5.5**

### Property 12: 状态列表排序正确性
*For any* 状态列表查询，返回结果应按 DEAD > WEAK > ACTIVE 顺序排序
**Validates: Requirements 6.2**

### Property 13: 状态格式化输出
*For any* 信号状态，格式化输出应包含状态图标、商户、规则名、last 时间、24h/12h/1h 计数
**Validates: Requirements 6.3**

### Property 14: 数据清理正确性
*For any* 超过保留期限的记录（命中记录 48-72h，告警记录 30-90天），清理操作应删除这些记录且不影响未过期记录
**Validates: Requirements 7.2, 7.3**

### Property 15: 邮件元数据约束
*For any* 监控模块处理的邮件，仅使用 sender、subject、recipient、receivedAt 四个字段
**Validates: Requirements 8.2**

## Error Handling

### 规则验证错误
- 无效的正则表达式：返回 400 错误，包含正则语法错误信息
- 缺少必填字段：返回 400 错误，列出缺少的字段
- 无效的时间间隔（负数或零）：返回 400 错误

### 状态计算错误
- 规则不存在：返回 404 错误
- 数据库查询失败：记录错误日志，返回 500 错误

### 告警发送错误
- Webhook 调用失败：记录错误，标记告警为未发送，支持重试
- 邮件发送失败：记录错误，标记告警为未发送

### 心跳检查错误
- 单个规则检查失败：记录错误，继续检查其他规则
- 整体检查失败：记录错误，下次心跳重试

## Testing Strategy

### Property-Based Testing

使用 **fast-check** 库进行属性测试。

每个属性测试必须：
1. 使用注释标注对应的正确性属性：`**Feature: email-realtime-monitoring, Property N: property_text**`
2. 运行至少 100 次迭代
3. 使用智能生成器约束输入空间

### Unit Tests

单元测试覆盖：
- 状态计算函数的边界条件
- 正则匹配的特殊字符处理
- 时间窗口计数器的滚动逻辑
- 告警消息格式化

### Integration Tests

集成测试覆盖：
- 完整的邮件命中流程
- 心跳检查触发告警流程
- API 端点的请求/响应
- 数据库事务一致性
