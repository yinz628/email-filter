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

### 3.3 跟踪包装 URL 解码（`unwrapTrackingUrl`）

邮件服务商（尤其 AWS SES）会把真实链接包装成跟踪 URL 再嵌入邮件。AWS SES 的 `awstrack.me` 格式：

```
https://{sub}.r.{region}.awstrack.me/L0/{percent-encoded-real-url}/{segment-number}/{tracking-uuid}/{signature}
```

`new URL()` 只能解析这种 URL，但会把 percent-encoded 真实链接放进 `pathname`（而非 query），导致后续基于 pathname 的正则生成匹配到编码后的乱码。

`unwrapTrackingUrl(rawUrl)` 在两处使用，确保用户始终面对真实 URL：

| 使用点 | 文件 | 作用 |
|--------|------|------|
| 正则候选生成前 | `regex-generator.ts` → `suggestUrlPatterns()` | 解码后再分析域名/路径/参数，生成的候选针对真实 URL |
| 提取结果返回时 | `extract.ts` → `extract()` 返回值 | 落库的 link 是解码后的真实 URL，而非 awstrack 包装 |

```ts
export function unwrapTrackingUrl(rawUrl: string): string {
  const m = rawUrl.match(
    /^https?:\/\/[^/]+\.r\.[a-z]+-[a-z]+-\d\.awstrack\.me\/L0\/(.+?)\/\d+\//i
  );
  if (m) {
    try {
      const decoded = decodeURIComponent(m[1]);
      if (/^https?:\/\//i.test(decoded)) return decoded;
    } catch { /* fall through */ }
  }
  return rawUrl;
}
```

> **awstrack 尾段不是链接内容**：`/L0/{url}/1/{uuid}/{sig}` 中的 `/{n}/{uuid}/{sig}` 是 AWS SES 的投递追踪元数据（分片号/投递 ID/签名），不属于真实链接。保留 query 参数的 URL 若拼接这些尾段会破坏 `?key=value` 解析。因此解码时只取 `/L0/` 到 `/{number}/` 之间的段。

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
  // 遍历所有候选 URL，返回第一个匹配的
  // 注意：不应用 LINK_NOISE_RE 过滤——用户正则是权威配置
}
```

与 `findLinkByAnchorPattern` 的区别：后者匹配锚**文本**，前者匹配 URL **本身**。

**关键原则：用户正则是权威的。** `findLinkByUrlPattern` **不**应用 `LINK_NOISE_RE` 噪声过滤。原因是用户在正则编辑器里选中目标 URL 并生成正则后，该正则已经精确表达了意图——如果它匹配了某个含 "manage" / "account" 等所谓"噪声词"的 URL（如 Neiman Marcus 案例的 `/manage-accounts/v1/confirm-user-email`），那是用户**想要**的结果。通用启发式（`findVerificationLink`）保留噪声过滤，因为它需要从一堆 footer 链接中猜出真正的 CTA。

| 函数 | 应用 LINK_NOISE_RE？ | 原因 |
|------|---------------------|------|
| `findLinkByUrlPattern` | ❌ 不应用 | 用户正则是权威配置，噪声过滤会误杀（如 "manage-accounts" 中的 "manage" 子串） |
| `findLinkByAnchorPattern` | ✅ 应用 | 锚文本正则可能过宽，仍需噪声过滤辅助 |
| `findVerificationLink`（通用） | ✅ 应用 | 无用户配置，需噪声过滤排除 footer 链接 |

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
- `src/regex-generator.ts` — `suggestUrlPatterns()` + `escapeUrlSegment()` + `URL_ACTION_KEYWORDS` + `unwrapTrackingUrl()`
- `src/extract.ts` — `collectAllUrls()` + `findLinkByUrlPattern()`（无噪声过滤）+ `extract()` 新增 `linkUrlPattern` 参数 + 返回值 `unwrapTrackingUrl` 解码
- `src/db.ts` — `ExtractionRuleRow` + `upsertRule` 新增 `link_url_pattern`
- `src/index.ts` — `handleExtract` + `handlePushRule` 新增字段
- `schema.sql` — `extraction_rules` 加列
- `src/regex-generator.test.ts` — URL 候选生成测试 + awstrack 解码测试 + URL 提前返回测试
- `src/extract.test.ts` — `collectAllUrls` + `findLinkByUrlPattern`（含"用户正则权威"测试）+ `extract` 集成测试 + awstrack 解码集成测试

### shared
- `src/types/filter-rule.ts` — `linkUrlPattern?: string`（3 处接口）

### vps-api
- `src/db/schema.sql` — `filter_rules` 加列
- `src/db/run-migrations.ts` — `migrateFilterRulesLinkUrlPattern`
- `src/db/rule-repository.ts` — `RuleRow` + `rowToRule` + `create` + `update`
- `src/routes/rules.ts` — 验证 + `pushExtractionRule` 透传
- `src/routes/frontend.ts` — 表单新字段 + 正则编辑器升级 + 提交逻辑 + 规则筛选下拉补齐 extract_* 选项

## 10. 生产排障经验（实施过程中发现的问题）

本节记录实施过程中在生产环境遇到的实际问题及修复，供未来维护参考。

### 10.1 `suggestPatterns()` 对 URL 输入混入优惠码候选

**现象**：输入 URL 样例，候选列表却包含 `\b(优惠码|折扣码|...)\b` 等通用前缀正则。

**根因**：`suggestPatterns()` 入口未对 URL 做提前返回，走到最后的通用前缀兜底分支。

**修复**：函数入口加 `if (/^https?:\/\//i.test(trimmed)) return suggestUrlPatterns(trimmed);` 提前返回，URL 与 code 走完全独立的生成路径。

### 10.2 D1 已有表不会因 `CREATE TABLE IF NOT EXISTS` 加列

**现象**：extraction-worker 部署后 `extraction_rules` 表存在但缺 `link_url_pattern` 列，导致提取时读不到 URL 正则。

**根因**：`schema.sql` 的 `CREATE TABLE IF NOT EXISTS` 对已存在的表是 no-op，不会 ALTER 加列。Cloudflare D1 的 `wrangler d1 execute` 只在首次建表时跑 schema。

**修复**：手动 `wrangler d1 execute extraction-db --command "ALTER TABLE extraction_rules ADD COLUMN link_url_pattern TEXT"`。长期方案：extraction-worker 应像 vps-api 一样引入幂等迁移机制（检测列存在再 ALTER）。

### 10.3 awstrack 包装链接未解码就落库

**现象**：提取到的 link 是 `https://s8qexllb.r.us-west-2.awstrack.me/L0/https%3A...` 而非真实 URL。

**根因**：`unwrapTrackingUrl` 最初只在正则生成器中使用，提取引擎 `extract()` 的返回值未调用。

**修复**：`extract.ts` 导入 `unwrapTrackingUrl`，在两处返回点（verification / discount 分支）对 link 解码。

### 10.4 `LINK_NOISE_RE` 误杀用户正则匹配

**现象**：用户配了 `linkUrlPattern` 命中 `https://www.neimanmarcus.com/manage-accounts/...`，但提取结果为空。

**根因**：`findLinkByUrlPattern` 原先也套了 `LINK_NOISE_RE`，而该正则的 `manage` 子串匹配到了路径中的 `manage-accounts`，把用户明确想要的结果当噪声过滤掉了。

**修复**：移除 `findLinkByUrlPattern` 中的噪声过滤——用户正则是权威配置（见 §4.1）。

### 10.5 `migrate.ts` / `run-migrations.ts` 重复代码漂移

**现象**：vps-api 有两个迁移入口（`migrate.ts` CLI 和 `run-migrations.ts` 库函数），各自维护一份 947 行 vs 800 行的迁移副本，`migrate.ts` 漏了 5 个迁移。

**根因**：历史演进中两份代码分别添加迁移，未保持同步。

**修复**：`migrate.ts` 重写为 ~90 行的薄包装，全部委托 `runMigrations()`，彻底消除漂移风险。`runMigrations()` 返回值扩展为含 `results: MigrationResult[]`，`migrate.ts` 仅负责格式化输出。
