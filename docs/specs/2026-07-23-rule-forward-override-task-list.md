# 规则级转发地址覆写 — 任务清单

## 1. 文档信息

- 文档主题：规则级转发地址覆写与转发名单规则类别
- 适用项目：`email-filter`
- 文档类型：任务清单（Task List）
- 文档日期：2026-07-23
- 当前状态：已实施（分支 `codex/rule-forward-override`）
- 关联：`2026-07-23-rule-forward-override-requirements.md` / `-spec.md`

> 状态标记：✅ 已完成 / ⬜ 待办。本特性代码侧已全部落地，本清单用于回溯核验与文档对齐。

## 2. 数据库层

| # | 任务 | 文件 | 状态 |
| --- | --- | --- | --- |
| 2.1 | 新增迁移 `filter_rules.forward_to` 列 | `db/migrate.ts:669` | ✅ |
| 2.2 | 新增迁移 `worker_instances.rule_forward_enabled` 列 | `db/migrate.ts:688` | ✅ |
| 2.3 | 新增迁移重建 `filter_rules` 表，CHECK 纳入 `forward` | `db/migrate.ts:707` | ✅ |
| 2.4 | `schema.sql` 同步 `forward_to`、`forward` 类别、`rule_forward_enabled` | `db/schema.sql` | ✅ |
| 2.5 | 三个迁移函数幂等性（列存在/约束已含时 skipped） | `db/migrate.ts` | ✅ |

## 3. 共享类型层

| # | 任务 | 文件 | 状态 |
| --- | --- | --- | --- |
| 3.1 | `RuleCategory` 类型加入 `'forward'` | `shared/types/filter-rule.ts:4` | ✅ |
| 3.2 | `FilterRule` 接口加可选 `forwardTo` | `shared/types/filter-rule.ts:27` | ✅ |
| 3.3 | `CreateRuleDTO` / `UpdateRuleDTO` 加可选 `forwardTo` | `shared/types/filter-rule.ts` | ✅ |

## 4. 过滤引擎层

| # | 任务 | 文件 | 状态 |
| --- | --- | --- | --- |
| 4.1 | `GroupedRules` 加 `forward` 分组 | `filter.service.ts:21` | ✅ |
| 4.2 | `groupRulesByCategory` 处理 `forward` 类别 | `filter.service.ts:39` | ✅ |
| 4.3 | `matchesForwardList` 检查函数 | `filter.service.ts:57` | ✅ |
| 4.4 | `filterEmail` 中 forward 优先级最高，命中转发到 `forwardTo` | `filter.service.ts:124-135` | ✅ |
| 4.5 | 白名单分支支持 `forwardTo` 覆写 | `filter.service.ts:141` | ✅ |

## 5. Webhook / 路由层

| # | 任务 | 文件 | 状态 |
| --- | --- | --- | --- |
| 5.1 | `processPhase1` 取规则后按 `ruleForwardEnabled` 剥离 forwardTo | `routes/webhook.ts:106-109` | ✅ |
| 5.2 | 规则创建校验：`forward` 类别必填 `forwardTo` | `routes/rules.ts:48` | ✅ |
| 5.3 | 规则更新校验：`forwardTo` 可清空 | `routes/rules.ts:103-107` | ✅ |
| 5.4 | `VALID_CATEGORIES` 加入 `'forward'` | `routes/rules.ts:18` | ✅ |

## 6. Repository 层

| # | 任务 | 文件 | 状态 |
| --- | --- | --- | --- |
| 6.1 | `RuleRepository` 读写 `forward_to` 字段 | `db/rule-repository.ts` | ✅ |
| 6.2 | `WorkerRepository` 读写 `rule_forward_enabled` 字段 | `db/worker-repository.ts:14,148` | ✅ |
| 6.3 | `CreateWorkerInput` / `UpdateWorkerInput` 加 `ruleForwardEnabled` | `db/worker-repository.ts:20-35` | ✅ |

## 7. 管理面板层

| # | 任务 | 文件 | 状态 |
| --- | --- | --- | --- |
| 7.1 | 规则表单支持 `forward` 类别 + `forwardTo` 字段 | `routes/frontend.ts:1607-1703` | ✅ |
| 7.2 | Worker 编辑表单加 `ruleForwardEnabled` 开关 | `routes/frontend.ts:1482-1520` | ✅ |

## 8. 文档层（本批）

| # | 任务 | 文件 | 状态 |
| --- | --- | --- | --- |
| 8.1 | 新建 docs/specs 转发覆写三件套 | `docs/specs/2026-07-23-*.md` | ✅ |
| 8.2 | 更新 `.kiro/specs/{vps-email-filter,email-filter-management}/design.md` | `.kiro/specs/*/design.md` | ✅ |
| 8.3 | 更新 `.kiro/specs/{vps-email-filter,email-filter-management}/tasks.md` | `.kiro/specs/*/tasks.md` | ✅ |
| 8.4 | DEPLOYMENT.md 转发规则说明细化 | `DEPLOYMENT.md` | ✅ |

## 9. 测试核验建议

- [ ] 规则创建：`forward` + 空 `forwardTo` 返回 400
- [ ] `filterEmail`：forward 规则优先于 blacklist（同时命中时转发）
- [ ] `ruleForwardEnabled=false`：白名单带 `forwardTo` 命中后走默认地址
- [ ] `ruleForwardEnabled=true`：白名单带 `forwardTo` 命中后走 `forwardTo`
- [ ] 迁移幂等：对已含列/约束的库重复执行返回 skipped
