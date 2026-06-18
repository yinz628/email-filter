# Worker 主题按需 Raw Header Fallback 需求补充

## 1. 文档信息

- 文档主题：Worker 主题按需 raw header fallback
- 适用项目：`email-filter`
- 文档类型：需求补充（Requirements Addendum）
- 文档日期：2026-05-22
- 关联文档：
  - `F:\tools\email-filter\docs\specs\2026-05-19-worker-subject-fallback-upgrade-requirements.md`
  - `F:\tools\email-filter\docs\specs\2026-05-19-worker-subject-fallback-upgrade-spec.md`

## 2. 需求背景

2026-05-22 新增的诊断日志样本表明，现网 `[NO_SUBJECT]` 并非都属于真实空主题邮件。

来自 `shop@emails.macys.com` 的一批营销邮件具备如下特征：

- `message.headers.get('subject')` 返回 `null`
- `message.raw` 头部中存在真实 `Subject:`
- 该 `Subject:` 采用 RFC 2047 多段 Base64 encoded-word
- 该 `Subject:` 存在 continuation 折行

示例模式如下：

```text
Subject: =?UTF-8?B?...?=
	=?UTF-8?B?...?=
```

因此，2026-05-19 版本中“完全移除 raw fallback”的设计不再满足真实业务场景。

## 3. 核心目标

本次补充需求要求 Worker 主题解析逻辑升级为：

1. 默认仍使用 `message.headers.get('subject')`
2. 仅当 header 缺失或归一化后为空时，才触发 raw fallback
3. fallback 只读取邮件头部，不读取正文
4. fallback 仅解析 `Subject:` 头块
5. fallback 必须支持折行 continuation
6. fallback 必须支持多段 RFC 2047 encoded-word 拼接与解码
7. 不修改 API 端逻辑
8. 不把所有邮件都拉入 `message.raw` 慢路径

## 4. 约束条件

### 4.1 范围约束

- 只改 Worker 侧
- 不改 `packages/vps-api`
- 不改数据库 schema
- 不改前端页面

### 4.2 性能约束

- 绝大多数邮件仍走 header-only 快路径
- 只有缺失主题邮件才允许进入 raw fallback
- raw fallback 只读取头部前缀，遇到空行即停止
- 不允许读取完整邮件正文后再解析主题

### 4.3 兼容性约束

- Worker 发给 API 的 payload 结构不变
- `subjectSource` 允许重新产出 `raw-header-fallback`
- `subjectRawHeader` 在 raw fallback 场景下需保留原始逻辑值

## 5. 目标行为

### 5.1 正常主题

当 `message.headers.get('subject')` 存在且归一化后非空时：

- `subject = 真实主题`
- `subjectSource = header`
- `subjectRawHeader = 原始 header 值`

### 5.2 Header 缺失但 raw 中存在 Subject

当 header 缺失或归一化后为空，但 raw 头部中存在合法 `Subject:` 时：

- `subject = 解码后的真实主题`
- `subjectSource = raw-header-fallback`
- `subjectRawHeader = raw 头部中的 Subject 逻辑值`

### 5.3 真实空主题

当 header 缺失且 raw 头部也无可用 `Subject:` 时：

- `subject = [NO_SUBJECT]`
- `subjectSource = missing`
- `subjectRawHeader = undefined`

## 6. 新增验收要求

### 6.1 功能验收

- 能恢复 Macy’s 折行多段 Subject
- 能继续正确处理普通单行 Subject
- 能继续正确处理 header 中可直接读取的编码主题
- 能继续把真实空主题邮件归一化为 `[NO_SUBJECT]`

### 6.2 性能验收

- 不允许所有邮件默认触发 `message.raw` 读取
- fallback 逻辑只在 header 缺失路径执行
- fallback 只读取头部前缀

### 6.3 可观测性验收

- 新数据中允许出现 `subjectSource = raw-header-fallback`
- 便于区分：
  - `header` 成功
  - `raw-header-fallback` 补回
  - `missing` 真实缺失

