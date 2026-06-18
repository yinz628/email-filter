# Worker 主题获取回退升级需求文档

## 1. 文档信息

- 文档主题：Worker 主题获取回退与轻量兜底升级
- 适用项目：`email-filter`
- 文档类型：需求文档
- 文档日期：2026-05-19
- 当前状态：待实施

## 2. 背景

项目此前为了修复“部分邮件无法正确获取主题”的问题，在 Worker 端引入了基于 `message.raw` 的主题兜底逻辑。新逻辑在 `message.headers.get('subject')` 取不到主题时，会继续读取原始 MIME 头，尝试从中提取 `Subject`。

现网运行表明：

- 小流量下该方案基本可工作
- 大流量下开始出现更多 `发送失败`、`拒绝` 等 Cloudflare 侧异常会话结果
- 问题在主题获取逻辑更新后变得明显，更新前未观察到同等级别异常

当前判断表明，风险点集中在 Worker 主链路中对 `message.raw` 的读取行为，而不是过滤 API 本身。

## 3. 当前问题

### 3.1 已确认现象

1. 更新前
- Worker 仅使用 `message.headers.get('subject') || ''`
- 主题获取能力有限，但链路更简单
- 未出现当前量级的高流量异常

2. 更新后
- Worker 增加 `resolveSubject()` 与 `extractSubjectFromRawHeaders()`
- `subject` 缺失时会读取 `message.raw`
- 在邮件量大时更容易出现发送失败、拒绝等现象

3. 业务约束
- 空主题邮件不能完全放弃处理
- 但本轮升级不希望改动 API 端逻辑
- 本轮改动范围应尽量集中在 Worker 端

### 3.2 根因判断

本轮问题最可能的根因不是“主题读取不到”，而是“为补齐主题而在主热路径引入了高成本且可能有副作用的 `raw` 读取”。

具体包括：

- `message.raw` 是 `ReadableStream`
- Worker 在主链路调用 `getReader()` 主动消费流
- 该行为可能增加 CPU/内存/时延负担
- 也可能对后续 `message.forward()` 产生副作用或增加不确定性

## 4. 升级目标

本次升级目标不是继续增强 raw 解析能力，而是回到一个更稳的设计基线：

1. 恢复旧版高性能主题获取主链路
2. 保留轻量、低风险的主题归一化能力
3. 移除 `message.raw` 读取逻辑
4. 在不改 API 代码的前提下，让空主题邮件仍可被现有主题规则体系处理
5. 降低高流量下 Worker 侧发送失败/拒绝风险

## 5. 范围

### 5.1 In Scope

- `packages/email-worker/src/index.ts`
- `packages/email-worker/src/index.test.ts`
- Worker 主题获取逻辑
- Worker 发送给 VPS API 的 `subject`、`subjectSource`、`subjectRawHeader` 语义
- Worker 端调试日志与配置
- Worker 侧测试与灰度验证方案

### 5.2 Out of Scope

- `packages/vps-api` 路由、过滤逻辑、数据库结构修改
- `packages/shared` 类型结构变更
- 新增 API 特殊过滤维度
- 前端页面和管理后台交互改造
- 邮件过滤规则系统重构

## 6. 关键约束

1. 本轮改动应集中在 Worker 端。
2. 不允许继续在主热路径中依赖 `message.raw` 解析主题。
3. 不修改 VPS API 的匹配逻辑和数据模型。
4. 不影响核心 `forward/drop` 决策协议。
5. 必须兼顾高并发稳定性与空主题邮件可处理性。

## 7. 需求清单

### 7.1 功能需求

#### FR-01 回退主题主链路

Worker 必须回退为以 `message.headers.get('subject')` 为唯一主题来源的主链路。

#### FR-02 保留轻量主题归一化

Worker 必须保留轻量主题处理能力，包括：

- 去首尾空白
- RFC2047 UTF-8 编码主题解码

#### FR-03 移除 raw fallback

Worker 不得在主题缺失时继续读取 `message.raw` 提取主题。

#### FR-04 空主题标准化

当 `headers.get('subject')` 不存在、为空、或归一化后为空时，Worker 必须将该邮件主题标准化为固定占位值，而不是直接传空字符串。

#### FR-05 保持现有 API 兼容

Worker 发给 VPS API 的 payload 结构必须保持兼容，不新增 API 必须理解的新字段。

#### FR-06 保留主题来源标识

Worker 仍应通过 `subjectSource` 明确标识主题来源，用于日志排查和灰度验证。

#### FR-07 关闭生产高成本调试

Worker 生产部署默认应关闭高成本调试日志，避免放大高流量性能问题。

### 7.2 数据语义需求

#### DR-01 `subject` 语义

- 有真实 header 主题时：传归一化后的真实主题
- 无法获取主题时：传统一占位主题值

#### DR-02 `subjectSource` 语义

- `header`：从 `message.headers` 获得主题
- `missing`：未获得真实主题，已使用占位值

#### DR-03 `subjectRawHeader` 语义

- `header` 场景下可保留原始 header 值
- `missing` 场景下应为空

### 7.3 非功能需求

#### NFR-01 性能

升级后 Worker 主链路不应再包含 `ReadableStream` 原始邮件头扫描逻辑。

#### NFR-02 稳定性

升级后高流量下的发送失败、拒绝风险应低于当前版本。

#### NFR-03 兼容性

升级不应破坏现有 VPS API、规则匹配协议与日志消费逻辑。

#### NFR-04 可观测性

升级后仍需能够区分：

- 正常 header 主题
- 空主题占位

## 8. 推荐占位值

为满足“只改 Worker、不改 API、空主题仍可过滤”的约束，推荐统一使用固定占位值：

```text
[NO_SUBJECT]
```

说明：

- 该值稳定、可读、便于人工排查
- 现有 API 的主题规则可直接匹配该值
- 不需要新增 API 端特殊判断

## 9. 验收标准

当以下条件全部满足时，本次升级视为验收通过：

1. Worker 不再调用 `message.raw.getReader()` 进行主题提取
2. Worker 仍能正确读取正常邮件主题并完成轻量解码
3. 无主题邮件统一上报固定占位值
4. `subjectSource` 仅保留 `header` 与 `missing`
5. 与 VPS API 的现有交互协议保持兼容
6. 定向测试与高流量 smoke 验证通过

## 10. 最终结论

本轮升级的唯一推荐方向是：

- 回退到旧版高性能主题获取链路
- 保留轻量解码
- 删除 raw fallback
- 用统一占位值承接空主题邮件

该方案能在不修改 API 的前提下，同时满足稳定性优先和空主题可处理的双重目标。
