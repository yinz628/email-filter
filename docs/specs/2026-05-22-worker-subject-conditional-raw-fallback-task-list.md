# Worker 主题按需 Raw Header Fallback Task List

> 参考文档：
> - `F:\tools\email-filter\docs\specs\2026-05-22-worker-subject-conditional-raw-fallback-requirements.md`
> - `F:\tools\email-filter\docs\specs\2026-05-22-worker-subject-conditional-raw-fallback-spec.md`

**目标：** 在不修改 API 端的前提下，为 Worker 恢复按需 raw header fallback，只在 `headers.get('subject')` 缺失时读取邮件头部补回真实主题。

---

## 1. 本次必须完成

- [ ] 为 Worker 增加按需 raw header fallback
- [ ] raw fallback 仅读取头部前缀
- [ ] 支持折行 Subject continuation
- [ ] 支持多段 RFC 2047 encoded-word 拼接与解码
- [ ] 恢复 `subjectSource = raw-header-fallback`
- [ ] 补充真实失败样本单测
- [ ] 运行 Worker 侧测试、typecheck、构建

## 2. 本次明确不做

- [ ] 不改 `packages/vps-api`
- [ ] 不改共享 schema / DB
- [ ] 不改前端页面
- [ ] 不做全文 raw MIME 解析

## 3. 影响文件

### 必改

- [ ] `F:\tools\email-filter\packages\email-worker\src\index.ts`
- [ ] `F:\tools\email-filter\packages\email-worker\src\index.test.ts`

### 本次新增

- [ ] `F:\tools\email-filter\docs\specs\2026-05-22-worker-subject-conditional-raw-fallback-requirements.md`
- [ ] `F:\tools\email-filter\docs\specs\2026-05-22-worker-subject-conditional-raw-fallback-spec.md`
- [ ] `F:\tools\email-filter\docs\specs\2026-05-22-worker-subject-conditional-raw-fallback-task-list.md`

## 4. 实施任务

### 任务 1：补充 raw header 读取能力

- [ ] 新增只读头部前缀的辅助函数
- [ ] 限制最大读取长度
- [ ] 读取到 header/body 分隔符后立即停止

验收：

- [ ] 不读取正文
- [ ] 能返回完整 header 文本

### 任务 2：补充 Subject 头块提取逻辑

- [ ] 新增 `Subject:` 头块扫描函数
- [ ] 支持 continuation 行合并
- [ ] 输出逻辑值而非整段 MIME body

验收：

- [ ] 能提取单行 Subject
- [ ] 能提取折行 Subject

### 任务 3：调整主题归一化逻辑

- [ ] 在 `normalizeSubject()` 中处理折行空白
- [ ] 处理相邻 encoded-word 之间的空白
- [ ] 保持原有 RFC 2047 Base64 / Q 解码能力

验收：

- [ ] 真实 Macy’s 样本可解码
- [ ] 现有单行编码主题不回归

### 任务 4：改造 `resolveSubject()`

- [ ] 快路径优先走 `headers.get('subject')`
- [ ] header 缺失时触发 raw fallback
- [ ] fallback 成功返回 `raw-header-fallback`
- [ ] fallback 失败返回 `[NO_SUBJECT]`

验收：

- [ ] `header`
- [ ] `raw-header-fallback`
- [ ] `missing`

三种语义都能稳定产出。

### 任务 5：补充测试

- [ ] 维持现有 header 成功样本
- [ ] 新增“header 缺失 + raw 折行 Subject”样本
- [ ] 新增“header 缺失 + raw 无 Subject”样本
- [ ] 新增 continuation + 多段 encoded-word 解码测试

验收：

- [ ] Macy’s 样本解码通过
- [ ] `[NO_SUBJECT]` 逻辑保留

### 任务 6：执行验证

- [ ] 运行 `pnpm --filter @email-filter/email-worker test`
- [ ] 运行 `pnpm --filter @email-filter/email-worker typecheck`
- [ ] 运行 `pnpm --filter @email-filter/email-worker build:cf`

验收：

- [ ] 测试通过
- [ ] 类型检查通过
- [ ] 构建通过

## 5. 测试要点

- [ ] header 中单行 Base64 Subject
- [ ] header 中单行 Q Subject
- [ ] raw 中折行多段 Base64 Subject
- [ ] raw fallback 的 `subjectSource`
- [ ] raw fallback 的 `subjectRawHeader`
- [ ] 真空主题的 `[NO_SUBJECT]`

## 6. 完成标准

- [ ] 文档补充完成
- [ ] Worker 代码完成
- [ ] 单测通过
- [ ] typecheck 通过
- [ ] build 通过

