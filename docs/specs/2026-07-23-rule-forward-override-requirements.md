# 规则级转发地址覆写 — 需求规格

## 1. 文档信息

- 文档主题：规则级转发地址覆写与转发名单规则类别
- 适用项目：`email-filter`
- 文档类型：需求规格（Requirements）
- 文档日期：2026-07-23
- 当前状态：已实施
- 关联实现：分支 `codex/rule-forward-override`
  - `packages/vps-api/src/services/filter.service.ts`
  - `packages/vps-api/src/routes/webhook.ts`
  - `packages/vps-api/src/db/migrate.ts`（迁移 669/688/707）

## 2. 背景

原有系统支持四类规则匹配后统一转发到默认地址（`DEFAULT_FORWARD_TO` 或 Worker 配置的 `defaultForwardTo`）。运营中存在两类新诉求：

1. **定向转发**：某类邮件需要转给特定收件人而非默认地址（例如账单邮件转给财务、验证码邮件转给指定账号）。
2. **稳定兜底**：需要一条「保底」规则，命中后无条件转发，优先级高于白名单等常规类别，避免被黑名单/动态规则误杀后丢失。

为此新增 `forward` 规则类别，并为所有规则引入可选的 `forwardTo` 字段实现地址覆写。为防止规则级覆写被滥用，额外引入 Worker 级开关 `ruleForwardEnabled` 形成双层控制。

## 3. 术语表

| 术语 | 含义 |
| --- | --- |
| Forward_Rule | `forward` 规则类别，最高优先级，命中即转发，`forwardTo` 为核心语义 |
| Rule_Forward_Override | 任意规则（白名单等）携带的 `forwardTo`，用于覆盖默认转发地址 |
| Rule_Forward_Enabled | Worker 实例的开关字段，控制该 Worker 是否允许规则级地址覆写生效 |

## 4. 需求

### Requirement 1：新增 forward 规则类别

系统须支持 `forward` 作为过滤规则的 `category` 取值，与 `whitelist`/`blacklist`/`dynamic` 并列。

- **FR 1.1**：`forward` 规则在过滤引擎中享有最高优先级，先于白名单/黑名单/动态规则求值。
- **FR 1.2**：命中 `forward` 规则的邮件必须执行转发动作（`action = forward`），不得丢弃。
- **FR 1.3**：`forward` 规则的 `forwardTo` 字段为**必填**，创建/更新校验须拒绝缺失 `forwardTo` 的 `forward` 规则。

### Requirement 2：规则级转发地址覆写

任意规则（含白名单）可携带可选字段 `forwardTo`，命中后转发到该地址而非默认地址。

- **FR 2.1**：白名单规则命中且携带有效 `forwardTo` 时，转发到该 `forwardTo`，否则转发到默认地址。
- **FR 2.2**：`forwardTo` 为空字符串或纯空白时视为未设置，回退默认地址。

### Requirement 3：Worker 双层开关 ruleForwardEnabled

通过 Worker 实例的 `ruleForwardEnabled` 字段控制规则级覆写是否在本 Worker 生效。

- **FR 3.1**：`ruleForwardEnabled = false`（默认值）时，求值前剥离所有规则的 `forwardTo`，使白名单等规则的地址覆写不生效，所有命中转发回到默认地址。
- **FR 3.2**：`forward` 规则类别**不受**剥离影响 —— 其 `forwardTo` 属于核心语义，剥离会导致 `forward` 规则退化为普通转发，违背 Requirement 1。
- **FR 3.3**：`ruleForwardEnabled` 默认为 `0`（关闭），保证向后兼容，升级后老 Worker 行为不变。

### Requirement 4：数据库迁移

- **FR 4.1**：`filter_rules` 表新增 `forward_to TEXT` 列（可空）。
- **FR 4.2**：`worker_instances` 表新增 `rule_forward_enabled INTEGER NOT NULL DEFAULT 0` 列。
- **FR 4.3**：重建 `filter_rules` 表以将 `forward` 纳入 `category` 的 CHECK 约束。
- **FR 4.4**：所有迁移须幂等（列已存在 / 约束已含 forward 时跳过）。

### Requirement 5：管理面板支持

- **FR 5.1**：规则表单支持选择 `forward` 类别，并在选择 `forward` 时强制填写 `forwardTo`。
- **FR 5.2**：规则表单对非 `forward` 类别允许填写可选的 `forwardTo`（地址覆写）。
- **FR 5.3**：Worker 编辑表单提供 `ruleForwardEnabled` 开关控件。

## 5. 验收标准

- `forward` 规则命中即转发到其 `forwardTo`，不论 Worker 开关状态。
- 白名单携带 `forwardTo` 时：开关开则转发到 `forwardTo`，关则转发到默认地址。
- `forward` 规则缺失 `forwardTo` 时创建接口返回 400。
- 升级已部署库后，未配置 `ruleForwardEnabled` 的 Worker 行为与升级前一致（全部走默认地址）。
