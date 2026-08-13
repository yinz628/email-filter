# 统一正则编辑器 — 验证码/折扣码/验证链接通用正则生成与配置

> 状态：已实现
> 日期：2026-08-13
> 依赖：
> - `2026-07-23-extraction-worker-architecture-spec.md`（提取引擎基础架构）
> - `2026-08-07-extract-first-class-category-spec.md`（extract_* 第一公民类别）

## 1. 背景与动机

### 1.1 问题

验证码提取（通过前缀正则匹配）已经完善，但验证链接的提取方式不完善：

- **纯文本邮件**（如 Neiman Marcus 案例）：邮件无 HTML `<a>` 标签，所有 URL 以裸文本堆在正文末尾。锚文字检测完全失效，只能靠 URL 路径动词碰运气。
- **多候选链接无排序**：`candidates[0]` 取第一个，footer 的 "verify preferences" 可能抢过真正的 CTA。
- **用户无法按 URL 形状配置提取规则**：原有的 `link_anchor_pattern` 只能匹配锚文本，不能匹配 URL 本身。

### 1.2 设计决策

采用**纯正则方案**（不引入 DOM 解析器或复杂评分引擎），通过用户可编辑的自定义正则规则解决链接提取问题。

参考 `F:\tools\yahoo imap\` 项目的正则生成器实现（用户从预览中选择目标 → 自动生成候选正则），不同点在于本项目无 IMAP 预览，用户需手动复制邮件内容到编辑器。

## 2. 核心设计

将正则编辑器升级为**三种提取目标通用**的工具：

| 提取目标 | 样例输入 | 生成的正则写入 | 匹配对象 |
|---------|---------|--------------|---------|
| 验证码/折扣码 | `SAVE20`、`482913` | `code_pattern` | 邮件正文中的码字符串 |
| 验证链接 | `https://app.io/verify?t=1` | `link_url_pattern`（新增） | 邮件正文中的 URL |

### 2.1 用户操作流程（统一）

```
复制邮件纯文本 → 粘贴到正则编辑器① → 鼠标选中目标（验证码/URL）→ 自动填入②
→ 点击「生成候选」→ 系统返回多个候选正则（③）→ 点击选用 → 测试命中（⑤）→ 应用到规则
```

与 yahoo imap 的差异：

| | yahoo imap | 本项目 |
|---|-----------|--------|
| 获取邮件内容 | IMAP 预览，鼠标选中文本 | 用户手动复制粘贴到编辑器 |
| 选择目标 | `window.getSelection()` 高亮选择 | textarea 内鼠标选中（`mouseup` 事件）或手动输入 |
| 应用对象 | 单一 code pattern | 验证码/折扣码→`code_pattern`；链接→`link_url_pattern`（新增） |
| URL 支持 | ❌ 无（只处理 code） | ✅ 新增 URL 正则生成分支 |

## 3. URL 正则生成算法

### 3.1 `suggestUrlPatterns(target)` — 候选生成策略

给定一个样例 URL，生成 5 个候选正则，按置信度降序排列：

| 候选 | 策略 | 示例 | 置信度 |
|------|------|------|--------|
| 1 | 精确域名 + 完整路径 | `https?://www\.neimanmarcus\.com/manage-accounts/v1/confirm-user-email` | 0.95 |
| 2 | 任意域名 + 路径关键词 | `https?://[^/\s]+/[^\s]*confirm-user-email[^\s]*` | 0.85 |
| 3 | 仅域名 | `https?://www\.neimanmarcus\.com\b` | 0.70 |
| 4 | 查询参数名（如有 code=/token=） | `https?://[^\s]*[?&]code=[^\s&]+` | 0.90 |
| 5 | 字面匹配（转义，兜底） | 完整 URL 转义 | 0.50 |

**关键设计**：
- **泛化 query 参数值**：`code=385946` → `code=[^\s&]+`（不同邮件的 code 值不同）
- **保留路径结构**：`/confirm-user-email` 是强语义信号
- **URL 动作关键词检测**：路径中含 `confirm/verify/activat/reset/unlock/auth` 的片段优先选为锚点
- 所有 URL 候选不含 `(?<url>...)` 命名组（URL 不需要从文本中提取子串，整个匹配就是 URL）

### 3.2 `escapeUrlSegment(segment)` — URL 段转义

转义正则特殊字符 **和正斜杠**（URL 路径中大量出现）：
```
/[.*+?^${}()|[\]\\/]/g → \$
```

## 4. 提取优先级链

`extract()` 的链接提取优先级更新为三层：

```
1. linkAnchorPattern（锚文本正则）     ← 已有，最高优先
2. linkUrlPattern（URL 正则）          ← 新增，次高优先
3. 通用启发式（锚文本动作词 + URL 路径动词） ← 已有，兜底
```

### 4.1 `findLinkByUrlPattern(urls, pattern)`

```ts
export function findLinkByUrlPattern(urls: string[], urlPattern: string): string | undefined {
  // 编译用户正则（无效则返回 undefined）
  // 遍历所有候选 URL，返回第一个匹配且非噪声的
}
```

与 `findLinkByAnchorPattern` 的区别：后者匹配锚**文本**，前者匹配 URL **本身**。

### 4.2 `collectAllUrls(textBody, htmlBody)` — 共享 URL 收集器

重构后 `findVerificationLink` 和 `findDiscountLink` 共用同一个 URL 收集函数（消除重复代码）：
- 从 `textBody` 提取裸 URL（`/https?:\/\/[^\s"'<>]+/gi`）
- 从 `htmlBody` 提取 href URL（`extractHrefUrls`）
- 去重 + 去尾标点

## 5. 数据层改动

### 5.1 新增字段 `link_url_pattern`

| 层 | 文件 | 改动 |
|----|------|------|
| 类型 | `shared/types/filter-rule.ts` | `linkUrlPattern?: string`（FilterRule / CreateRuleDTO / UpdateRuleDTO） |
| Worker D1 | `extraction-worker/schema.sql` | `extraction_rules` 表加 `link_url_pattern TEXT` |
| Worker D1 | `extraction-worker/src/db.ts` | `ExtractionRuleRow` + `upsertRule` 读写新列 |
| Worker 入口 | `extraction-worker/src/index.ts` | `handleExtract` 读 `link_url_pattern` 传入 `extract()`；`handlePushRule` 接收 |
| VPS SQLite | `vps-api/db/schema.sql` | `filter_rules` 表加 `link_url_pattern TEXT` |
| VPS 迁移 | `vps-api/db/run-migrations.ts` | `migrateFilterRulesLinkUrlPattern`（幂等 ADD COLUMN） |
| VPS Repository | `vps-api/db/rule-repository.ts` | `RuleRow` + `rowToRule` + `create` + `update` |
| VPS 路由 | `vps-api/routes/rules.ts` | `validateCreateRule` + `validateUpdateRule` + `pushExtractionRule` |
| 前端 | `vps-api/routes/frontend.ts` | 表单新字段 + 提交逻辑 + 正则编辑器升级 |

### 5.2 迁移幂等性

`migrateFilterRulesLinkUrlPattern`：
- 检测 `columnExists(db, 'filter_rules', 'link_url_pattern')`
- 不存在则 `ALTER TABLE ADD COLUMN`
- 已存在则 skip

## 6. 前端正则编辑器升级

### 6.1 双模式设计

```
┌─ 🔧 正则编辑器 ──────────────────────────────┐
│  提取目标：◉ 验证码/折扣码  ◯ 验证链接        │ ← radio 切换
│                                                │
│  ① 邮件内容（粘贴纯文本，可选中目标）          │ ← textarea，mouseup 事件自动填入②
│  ② 目标样例（选中自动填入，或手动输入）        │ ← input
│  ③ 候选正则（点击选用）                        │ ← 动态生成
│  ④ 正则表达式（可手动修改）                    │ ← input
│  ⑤ 测试匹配（使用①中的邮件内容）              │ ← 复用①，无需重复粘贴
│                           [取消]  [应用到此规则] │
└────────────────────────────────────────────────┘
```

### 6.2 关键 JS 函数

| 函数 | 职责 |
|------|------|
| `getRegexMode()` | 读取当前模式（code/link） |
| `onRegexModeChange()` | 模式切换时更新提示文本 + 清空候选 |
| `setupEmailSelectionHandler()` | 绑定①textarea 的 mouseup/keyup，选中文本自动填入② |
| `generateCandidates()` | 调用 worker API 生成候选（auto-detect code vs URL） |
| `applyRegexToRule()` | 根据 mode 写入 `code-pattern` 或 `link-url-pattern` 输入框 |

### 6.3 鼠标选中→自动填入

```js
textarea.addEventListener('mouseup', function () {
  const text = window.getSelection().toString().trim();
  if (text.length > 0) {
    document.getElementById('regex-editor-sample').value = text;
  }
});
```

用户在①的 textarea 中直接鼠标选中要提取的验证码或 URL，自动填入②的样例输入框。

## 7. Neiman Marcus 案例的预期使用流程

```
用户收到 NM 验证邮件 → 复制纯文本正文
→ 打开正则编辑器 → 选择"验证链接"模式
→ 粘贴正文到①（12 个 awstrack URL 都在里面）
→ 选中真实目标 URL: https://www.neimanmarcus.com/manage-accounts/v1/confirm-user-email?code=385946
→ 点击「生成候选」→ 得到：
    1. https?://www\.neimanmarcus\.com/manage-accounts/v1/confirm-user-email (95%)
    2. https?://[^\s]*[?&]code=[^\s&]+ (90%)
    3. https?://[^/\s]+/[^\s]*confirm-user-email[^\s]* (85%)
    4. https?://www\.neimanmarcus\.com\b (70%)
    5. 字面匹配 (50%)
→ 选用候选 1 → 测试命中（确认匹配正文中的 URL）→ 应用到规则
→ 此后该规则匹配的邮件，linkUrlPattern 直接用此正则精确命中 confirm-user-email URL
```

## 8. 向后兼容

- `code_pattern` 和 `link_anchor_pattern` 语义不变
- `link_url_pattern` 纯新增可选字段，未配置时走通用启发式（原行为）
- 现有正则编辑器的 code 模式完全保留（默认模式）
- 所有现有测试用例保持通过
- D1/VPS 迁移均为幂等 ADD COLUMN，不重建表

## 9. 实施文件清单

### extraction-worker
- `src/regex-generator.ts` — `suggestUrlPatterns()` + `escapeUrlSegment()` + `URL_ACTION_KEYWORDS`
- `src/extract.ts` — `collectAllUrls()` + `findLinkByUrlPattern()` + `extract()` 新增 `linkUrlPattern` 参数
- `src/db.ts` — `ExtractionRuleRow` + `upsertRule` 新增 `link_url_pattern`
- `src/index.ts` — `handleExtract` + `handlePushRule` 新增字段
- `schema.sql` — `extraction_rules` 加列
- `src/regex-generator.test.ts` — URL 候选生成测试
- `src/extract.test.ts` — `collectAllUrls` + `findLinkByUrlPattern` + `extract` 集成测试

### shared
- `src/types/filter-rule.ts` — `linkUrlPattern?: string`（3 处接口）

### vps-api
- `src/db/schema.sql` — `filter_rules` 加列
- `src/db/run-migrations.ts` — `migrateFilterRulesLinkUrlPattern`
- `src/db/rule-repository.ts` — `RuleRow` + `rowToRule` + `create` + `update`
- `src/routes/rules.ts` — 验证 + `pushExtractionRule` 透传
- `src/routes/frontend.ts` — 表单新字段 + 正则编辑器升级 + 提交逻辑
