# 提取作为独立规则类别（第一公民）— 设计规格

## 1. 文档信息

- 文档主题：将「提取验证码/折扣码」提升为与 forward/whitelist/blacklist 平级的独立规则类别
- 适用项目：`email-filter`
- 文档类型：设计规格（Spec）
- 文档日期：2026-08-07
- 当前状态：已实施并部署生产
- 关联文档：
  - `2026-08-06-extraction-independence-and-discount-management-spec.md`（上一版：提取与动作正交、任意类别可叠加——**本文修订该语义**）
  - `2026-07-23-rule-forward-override-spec.md`（forwardTo 语义）
  - `2026-07-23-extraction-worker-architecture-spec.md`（提取架构基线）

## 2. 变更背景

提取能力的归属经历了三个阶段：

1. **初版**：提取强绑定 `forward` 类别（仅 forward 规则可勾选提取，forwardTo 必填）。
2. **2026-08-06**：提取改为与规则动作正交——任意类别（forward/whitelist/blacklist/dynamic）都可叠加提取，forwardTo 全可选。
3. **本文（2026-08-07）**：提取定格为**独立的第一公民类别**。`extract_verification` / `extract_discount` 与 forward/whitelist/blacklist 平级，类别本身决定提取类型；其他类别**不再具备提取能力**。

第 2 阶段的"任意类别可叠加"虽灵活，但带来模型复杂度：一个规则既有动作语义（forward/whitelist/...）又有提取语义，表单需用勾选框叠加，类别与标志可能不一致。第 3 阶段回归**单一职责**——每个类别做一件事，提取是一种独立的规则意图，应自成类别。

## 3. 设计结论

### 3.1 规则类别扩展为 6 种

`RuleCategory` 新增两个值：

```ts
type RuleCategory =
  | 'whitelist' | 'blacklist' | 'dynamic' | 'forward'
  | 'extract_verification' | 'extract_discount';
```

`shared` 提供 `isExtractCategory(category)` 辅助函数集中判断，避免散落的字符串比较。

### 3.2 类别即提取语义（单一数据源）

`extract_verification` / `extract_discount` 类别的提取类型由 **category 决定**，不依赖额外的 `extractVerification` / `extractDiscount` 标志：

- 后端校验（`rules.ts`）：extract_* 类别时，对应标志被**强制**为 true（忽略请求体冲突字段）；非 extract 类别**拒绝**任何提取标志。
- 决策层（`filter.service.ts`）：`extractionFlagsFor` 仅凭 category 产出提取标记，不再兜底 flag。

这消除了"类别与标志不一致"的风险——类别是唯一数据源。

### 3.3 提取仅限 extract_* 类别（单一职责）

forward / whitelist / blacklist / dynamic **不再具备提取能力**。决策层移除了这些分支的 `extractionFlagsFor` 调用——即使行上残留提取标志（历史数据），也不会触发提取。每个类别单一职责：

| 类别 | 职责 |
|------|------|
| forward | 转发到指定/默认地址 |
| extract_verification | 转发 + 提取验证码 |
| extract_discount | 转发 + 提取折扣码 |
| whitelist | 放行到默认地址 |
| blacklist | 丢弃 |
| dynamic | 系统自动生成，丢弃 |

### 3.4 决策优先级

```
1. forward              → 转发（更具体的路由意图，优先）
2. extract_verification → 转发 + 提取验证码
3. extract_discount     → 转发 + 提取折扣码
4. whitelist            → 转发到默认地址
5. blacklist            → 丢弃
6. dynamic              → 丢弃
7. 无匹配               → 转发到默认地址
```

extract_* 介于 forward 与 whitelist 之间：forward 是更具体的路由意图优先；extract 是"转发+提取"的便利类别，优先于被动放行的 whitelist。

### 3.5 字段显隐矩阵（表单）

管理面板「添加/编辑规则」按类别控制字段显隐，单一数据源为 `applyCategoryVisibility()`：

| 类别 | 转发地址 | 提取正则设置 |
|------|---------|-------------|
| extract_verification / extract_discount | 选填（留空走默认）| ✅ 显示 |
| forward | 选填（留空走默认）| ❌ |
| whitelist / blacklist | ❌ 不配置 | ❌ |

动态规则由系统生成，不在添加表单出现。

## 4. 实现要点

### 4.1 数据层（schema + 迁移）

- `filter_rules.category` 的 CHECK 约束加入 `'extract_verification'`, `'extract_discount'`。
- 迁移 `migrateFilterRulesExtractCategory`（`run-migrations.ts`）重建表更新 CHECK 约束，**新表包含全部 16 列**（含 extract_*/code_pattern/link_anchor_pattern，这些列由后续 ALTER 加入，重建时必须显式包含否则丢失）。仿 `migrateFilterRulesForwardCategory` 先例，幂等（检测 CHECK 已含则 skip）。

### 4.2 校验层（rules.ts）

- `VALID_CATEGORIES` 加入两个新值。
- `validateCreateRule`：extract_* 类别强制对应标志；非 extract 类别带提取标志 → 400 拒绝。
- `validateUpdateRule`：切换到 extract_* 强制标志；切换到非 extract 清零标志并拒绝带提取标志的更新。

### 4.3 决策层（filter.service.ts）

- `groupRulesByCategory` 加 `extract` 分组（extract_verification + extract_discount 合并处理）。
- 新增 `matchesExtractList` + extract 决策分支（forward 动作 + 提取标记）。
- 移除 forward/whitelist/blacklist/dynamic 分支的提取调用。
- `extractionFlagsFor` 简化：仅凭 category 产出标记，只在 extract 分支调用。

### 4.4 前端（frontend.ts）

- 规则类型下拉：提取验证码 / 提取折扣码 / 转发名单 / 白名单 / 黑名单（动态不出现）。
- `applyCategoryVisibility()` 按矩阵控制字段显隐（单一数据源）。
- 移除提取勾选框（类别决定提取类型）。
- 提交逻辑：提取标志仅 extract_* 提交（`category === 'extract_verification'` 等）。

## 5. 迁移与兼容

- 重建表迁移幂等，生产 197 条规则数据通过显式列名复制保全。
- **历史数据兼容**：第 2 阶段创建的"forward + extractVerification=true"规则仍存在，但提取不再生效（forward 类别不提取）。如需保留提取，应将这些规则的 category 改为 `extract_verification`。这是预期的语义收窄。
- email-worker 无需改动（只看 decision 提取标记）。

## 6. 测试覆盖

- `routes/rules-validation.test.ts`：extract_* 强制标志、非 extract 类别拒绝提取标志。
- `services/filter.service.test.ts`：extract_* 触发提取并转发、非 extract 类别不提取（即使行上有残留标志）、优先级（forward > extract > whitelist）。
