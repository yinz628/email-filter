# Design Document: Path Analysis Seq Fix

## Overview

本设计文档描述了修复新用户转移路径分析中事件序列号计算问题的技术方案。主要解决两个问题：
1. 用户事件的 seq 号不按 received_at 时间排序
2. 层级统计中有价值活动的优先排序（已在之前实现，本次验证）

## Architecture

### 当前问题分析

当前 `addUserEvent` 方法的实现：
```typescript
// 问题代码
const maxSeq = this.getMaxSeq(projectId, recipient);
const newSeq = maxSeq + 1;
```

这种实现假设邮件总是按时间顺序到达，但实际情况可能是：
1. 增量分析时，新发现的邮件可能比已处理的邮件更早
2. 邮件处理顺序可能与接收时间不一致

### 解决方案

修改 `addUserEvent` 方法，使其：
1. 根据 `received_at` 时间计算正确的 seq 位置
2. 如果新事件需要插入到中间位置，调整后续事件的 seq 号

```typescript
// 修复后的逻辑
// 1. 计算新事件应该在的位置（有多少事件的 received_at <= 新事件的时间）
const seqResult = db.prepare(`
  SELECT COUNT(*) as count FROM project_user_events
  WHERE project_id = ? AND recipient = ? AND received_at <= ?
`).get(projectId, recipient, receivedAt);
const newSeq = seqResult.count + 1;

// 2. 将后续事件的 seq 号加1
db.prepare(`
  UPDATE project_user_events
  SET seq = seq + 1
  WHERE project_id = ? AND recipient = ? AND received_at > ?
`).run(projectId, recipient, receivedAt);

// 3. 插入新事件
db.prepare(`
  INSERT INTO project_user_events (project_id, recipient, campaign_id, seq, received_at)
  VALUES (?, ?, ?, ?, ?)
`).run(projectId, recipient, campaignId, newSeq, receivedAt);
```

## Components and Interfaces

### ProjectPathAnalysisService

修改以下方法：

#### addUserEvent (修改)
```typescript
addUserEvent(
  projectId: string,
  recipient: string,
  campaignId: string,
  receivedAt: Date
): { seq: number; isNew: boolean }
```

**修改内容**：
- 使用 `received_at` 时间计算正确的 seq 位置
- 支持在中间位置插入事件
- 调整后续事件的 seq 号

#### validateEventSequence (新增)
```typescript
validateEventSequence(projectId: string): ValidationResult
```

**功能**：
- 验证每个用户的 seq 号是否连续
- 验证 seq 顺序是否与 received_at 时间顺序一致
- 返回验证结果和不一致的记录

#### fixEventSequence (新增)
```typescript
fixEventSequence(projectId: string): FixResult
```

**功能**：
- 修复不一致的 seq 号
- 按 received_at 时间重新分配 seq 号

### 数据模型

#### project_user_events 表
```sql
CREATE TABLE project_user_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, recipient, campaign_id)
);

-- 添加索引以优化按时间查询
CREATE INDEX IF NOT EXISTS idx_project_user_events_time 
ON project_user_events(project_id, recipient, received_at);
```

## Data Models

### ValidationResult
```typescript
interface ValidationResult {
  isValid: boolean;
  totalUsers: number;
  usersWithIssues: number;
  issues: Array<{
    recipient: string;
    issueType: 'gap' | 'order' | 'duplicate';
    details: string;
  }>;
}
```

### FixResult
```typescript
interface FixResult {
  usersFixed: number;
  eventsReordered: number;
  pathEdgesRebuilt: boolean;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 15: Seq-Time Consistency

*For any* user in a project, the sequence numbers in their event stream should be consecutive integers starting from 1, and the seq order should match the received_at time order.

**Validates: Requirements 1.1, 1.4, 2.2, 6.1, 6.2**

### Property 16: Event Insertion Correctness

*For any* new event added to a user's event stream, if its received_at time is earlier than existing events, the new event should be inserted at the correct position and all subsequent events should have their seq numbers incremented by 1.

**Validates: Requirements 1.2, 3.1, 3.2**

### Property 17: Full Analysis Event Order

*For any* full analysis execution, each user's events should be processed in received_at time order, and duplicate campaign events (same user, same campaign) should only record the first occurrence.

**Validates: Requirements 2.1, 2.3**

### Property 18: Path Edge Rebuild After Modification

*For any* modification to user events (insertion, deletion, or reordering), the path edges should be rebuilt to accurately reflect the updated event transitions.

**Validates: Requirements 3.3, 5.1, 5.2**

## Error Handling

### 数据不一致处理

1. **检测不一致**：在分析完成后调用 `validateEventSequence` 检查数据一致性
2. **记录警告**：如果发现不一致，记录警告日志
3. **自动修复**：提供 `fixEventSequence` 方法进行修复
4. **重建路径边**：修复后自动重建路径边

### 并发处理

1. **事务保护**：`addUserEvent` 中的 seq 调整和插入操作应在事务中执行
2. **乐观锁**：考虑使用版本号防止并发修改冲突

## Testing Strategy

### 单元测试

1. **addUserEvent 测试**
   - 测试按时间顺序添加事件
   - 测试乱序添加事件（新事件时间早于已有事件）
   - 测试相同时间的事件处理
   - 测试重复活动事件的去重

2. **validateEventSequence 测试**
   - 测试正常数据的验证
   - 测试有间隙的 seq 号
   - 测试顺序不一致的数据

3. **fixEventSequence 测试**
   - 测试修复间隙
   - 测试修复顺序不一致
   - 测试修复后路径边重建

### 属性测试 (Property-Based Testing)

使用 fast-check 库进行属性测试，每个属性测试运行 100 次迭代。

**Property 15: Seq-Time Consistency**
- 生成随机的邮件时间序列
- 添加事件后验证 seq 号连续且与时间顺序一致

**Property 16: Event Insertion Correctness**
- 生成已有事件流
- 插入时间更早的新事件
- 验证插入位置正确且后续 seq 调整正确

**Property 17: Full Analysis Event Order**
- 生成随机的邮件数据（包含重复活动）
- 执行全量分析
- 验证每个用户的事件按时间排序且无重复

**Property 18: Path Edge Rebuild After Modification**
- 生成事件流并构建路径边
- 修改事件流（插入新事件）
- 重建路径边并验证正确性

### 测试标注格式

每个属性测试必须使用以下格式标注：
```typescript
/**
 * **Feature: path-analysis-seq-fix, Property {number}: {property_text}**
 * **Validates: Requirements {requirement_numbers}**
 */
```

