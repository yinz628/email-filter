# 功能统一开关升级 Task List

> 参考规格：`F:\tools\email-filter\docs\specs\2026-05-17-feature-toggle-upgrade-spec.md`
>
> 面向实施人：本清单用于指导后续升级实施、测试验证与上线准备。状态跟踪使用 `- [ ]` 复选框。

**目标：** 为 `campaignAnalytics`、`signalMonitoring`、`subjectTracking` 三项功能建立统一的系统级开关治理模型，确保“关闭即停止后台处理、隐藏页面入口、禁止对应 API 访问”，且不影响核心邮件过滤主链。

**架构：** 引入独立的 `feature_settings` 持久化表与 `FeatureSettingsService`，统一计算 `envEnabled`、`systemEnabled`、`effectiveEnabled` 和 `reason`。所有前端可见性、Webhook 入队、API 访问和监控调度均改为依赖同一套有效状态。

**技术栈：** TypeScript、Fastify、better-sqlite3、Vitest、前端管理页（服务端路由渲染）

---

## 1. 实施范围

### 1.1 本次必须完成

- [ ] 为 `campaignAnalytics`、`signalMonitoring`、`subjectTracking` 新增统一系统级开关
- [ ] 新增 `feature_settings` 数据表与迁移逻辑
- [ ] 引入 `FeatureSettingsService` 统一状态计算
- [ ] 改造 Webhook 入队逻辑，按 `effectiveEnabled` 控制 `campaign` / `monitoring` / `subject`
- [ ] 为营销分析、信号监控、邮件主题 API 增加统一 feature guard
- [ ] 让 `signalMonitoring` 的 heartbeat/check 在系统级关闭时 no-op
- [ ] 改造设置页与页面 tab 可见性逻辑
- [ ] 废弃这三项功能在 `user_settings` 中的“用户偏好”语义
- [ ] 补齐升级测试、回归测试与上线检查项

### 1.2 本次明确不做

- [ ] 不补采关闭期间的历史数据
- [ ] 不清理已有历史营销分析 / 信号监控 / 邮件主题数据
- [ ] 不改动核心邮件过滤规则、转发链路和主决策逻辑
- [ ] 不扩展多用户权限模型

## 2. 影响文件清单

### 2.1 后端配置与入口

- [ ] `F:\tools\email-filter\packages\vps-api\src\config.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\index.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\routes\index.ts`

### 2.2 数据层与迁移

- [ ] `F:\tools\email-filter\packages\vps-api\src\db\index.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\db\migrate-campaign.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\db\migrate-campaign.test.ts`
- [ ] 新增：`F:\tools\email-filter\packages\vps-api\src\db\feature-settings-repository.ts`
- [ ] 新增：`F:\tools\email-filter\packages\vps-api\src\db\feature-settings-repository.test.ts`

### 2.3 服务层

- [ ] 新增：`F:\tools\email-filter\packages\vps-api\src\services\feature-settings.service.ts`
- [ ] 新增：`F:\tools\email-filter\packages\vps-api\src\services\feature-settings.service.test.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\services\index.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\services\task-processors.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\services\user-settings.service.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\services\user-settings.service.test.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\services\monitoring\scheduler.service.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\services\monitoring\heartbeat.service.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\services\monitoring\heartbeat.service.test.ts`

### 2.4 路由层

- [ ] `F:\tools\email-filter\packages\vps-api\src\routes\webhook.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\routes\frontend.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\routes\campaign.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\routes\monitoring.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\routes\subjects.ts`
- [ ] `F:\tools\email-filter\packages\vps-api\src\routes\user-settings.ts`
- [ ] 新增：`F:\tools\email-filter\packages\vps-api\src\routes\admin-features.ts`
- [ ] 新增：`F:\tools\email-filter\packages\vps-api\src\middleware\feature-guard.ts`
- [ ] 新增：`F:\tools\email-filter\packages\vps-api\src\routes\admin-features.test.ts`

### 2.5 前端页面与文档

- [ ] `F:\tools\email-filter\docs\specs\2026-05-17-feature-toggle-upgrade-spec.md`
- [ ] 新增：实现说明或发布说明（路径按实施时决定）

## 3. 执行顺序总览

- [ ] Phase 1：数据层与配置层基线
- [ ] Phase 2：统一状态服务与管理员接口
- [ ] Phase 3：运行时接管（Webhook / API / Scheduler）
- [ ] Phase 4：前端设置页与页面入口切换
- [ ] Phase 5：迁移清理与兼容收尾
- [ ] Phase 6：测试回归与上线准备

## 4. 详细任务清单

### 任务 1：补齐部署级配置基线

**目标：** 将三项功能统一映射到 env 能力层，并为后续状态服务提供标准输入。

**涉及文件：**

- 修改：`F:\tools\email-filter\packages\vps-api\src\config.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\index.ts`

**输出物：**

- 新增 `SUBJECT_TRACKING_ENABLED`
- 将三项功能的 env 读取统一命名、统一默认值、统一导出
- 启动日志或诊断信息中可区分部署级是否启用

**验收条件：**

- [ ] `campaignAnalytics`、`signalMonitoring`、`subjectTracking` 均能从配置层读取到 `envEnabled`
- [ ] 默认值均为 `true`
- [ ] env 为 `false` 时，后续状态服务能拿到明确的部署禁用态

**依赖：** 无

### 任务 2：新增 `feature_settings` 数据表与仓储

**目标：** 为系统级开关提供独立持久化存储，不再依赖 `user_settings` 承担后台启停语义。

**涉及文件：**

- 修改：`F:\tools\email-filter\packages\vps-api\src\db\index.ts`
- 新增：`F:\tools\email-filter\packages\vps-api\src\db\feature-settings-repository.ts`
- 新增：`F:\tools\email-filter\packages\vps-api\src\db\feature-settings-repository.test.ts`

**输出物：**

- `feature_settings` 表创建逻辑
- 读写 `feature_settings` 的 Repository
- 支持按 `key` 查询、全量查询、upsert 更新

**验收条件：**

- [ ] 表结构满足 `key / enabled / updated_at`
- [ ] 三个功能 key 可被正确保存与读取
- [ ] 数据库中无记录时，调用方可识别“默认系统级开启”

**依赖：** 任务 1

### 任务 3：编写升级迁移脚本

**目标：** 将旧设置中的营销分析和信号监控开关迁移到新表，并为邮件主题补齐默认系统级状态。

**涉及文件：**

- 修改：`F:\tools\email-filter\packages\vps-api\src\db\migrate-campaign.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\db\migrate-campaign.test.ts`
- 可能修改：`F:\tools\email-filter\packages\vps-api\src\db\index.ts`

**输出物：**

- 创建 `feature_settings` 的迁移步骤
- 从 `user_settings` 迁移 `campaignAnalyticsEnabled`
- 从 `user_settings` 迁移 `signalMonitoringEnabled`
- 为 `subjectTracking` 写入默认 `true`

**验收条件：**

- [ ] 老实例执行迁移后，三项功能在 `feature_settings` 中都有初始记录
- [ ] 迁移是幂等的，重复执行不会写坏数据
- [ ] 迁移后旧字段不再参与后台行为判定

**依赖：** 任务 2

### 任务 4：实现统一状态服务

**目标：** 在服务层统一计算 `envEnabled`、`systemEnabled`、`effectiveEnabled` 与 `reason`。

**涉及文件：**

- 新增：`F:\tools\email-filter\packages\vps-api\src\services\feature-settings.service.ts`
- 新增：`F:\tools\email-filter\packages\vps-api\src\services\feature-settings.service.test.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\services\index.ts`

**输出物：**

- `getAllStatuses()`
- `getStatus(key)`
- `isEnabled(key)`
- `setEnabled(key, enabled)`

**验收条件：**

- [ ] `env=true + system=true` 返回 `enabled`
- [ ] `env=true + system=false` 返回 `system_disabled`
- [ ] `env=false + system=true/false` 返回 `env_disabled`
- [ ] 数据库无记录时，`systemEnabled` 默认视为 `true`

**依赖：** 任务 1、任务 2、任务 3

### 任务 5：新增管理员功能开关接口

**目标：** 提供设置页可调用的统一查询与更新接口，替代对 `user_settings` 的旧写法。

**涉及文件：**

- 新增：`F:\tools\email-filter\packages\vps-api\src\routes\admin-features.ts`
- 新增：`F:\tools\email-filter\packages\vps-api\src\routes\admin-features.test.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\routes\index.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\index.ts`

**输出物：**

- `GET /api/admin/features`
- `PATCH /api/admin/features/:key`
- 统一返回 `FeatureStatus`

**验收条件：**

- [ ] 可获取三项功能状态列表
- [ ] 可修改系统级开关
- [ ] 当 env 为 `false` 时，更新接口拒绝“强行开启”
- [ ] 错误响应可区分参数非法、功能不存在、部署禁用

**依赖：** 任务 4

### 任务 6：实现统一 feature guard 中间件

**目标：** 让营销分析、信号监控、邮件主题的 API 都能共享同一套禁用态控制。

**涉及文件：**

- 新增：`F:\tools\email-filter\packages\vps-api\src\middleware\feature-guard.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\middleware\index.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\routes\campaign.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\routes\monitoring.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\routes\subjects.ts`

**输出物：**

- 可按 `FeatureKey` 复用的 guard
- 统一错误结构：`error / feature / reason`

**验收条件：**

- [ ] 功能关闭时，对应 API 返回统一禁用态
- [ ] `reason` 能区分 `system_disabled` 和 `env_disabled`
- [ ] 非受控 API 不受影响

**依赖：** 任务 4、任务 5

### 任务 7：改造 Webhook 异步入队逻辑

**目标：** 让功能关闭真正停止后台采集与后续处理。

**涉及文件：**

- 修改：`F:\tools\email-filter\packages\vps-api\src\routes\webhook.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\services\task-processors.ts`

**输出物：**

- `campaign` 入队受 `campaignAnalytics` 控制
- `monitoring` 入队受 `signalMonitoring` 控制
- `subject` 入队受 `subjectTracking` 控制
- `stats / log / watch` 保持现状

**验收条件：**

- [ ] 系统关闭营销分析后，不再 enqueue `campaign`
- [ ] 系统关闭信号监控后，不再 enqueue `monitoring`
- [ ] 系统关闭邮件主题后，不再 enqueue `subject`
- [ ] 主过滤链的 `forward / drop` 决策不变

**依赖：** 任务 4

### 任务 8：改造信号监控 Scheduler Guard

**目标：** 让 `signalMonitoring` 关闭时，Webhook 和定时调度都同时停下来。

**涉及文件：**

- 修改：`F:\tools\email-filter\packages\vps-api\src\services\monitoring\scheduler.service.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\services\monitoring\heartbeat.service.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\services\monitoring\heartbeat.service.test.ts`

**输出物：**

- heartbeat/check 启动前的 feature 状态判断
- 关闭时 no-op 的日志或可观测输出

**验收条件：**

- [ ] `signalMonitoring` 系统关闭后，heartbeat 不再执行业务逻辑
- [ ] `signalMonitoring` 重新开启后，后续调度恢复正常
- [ ] 不需要改 env、不需要重启服务

**依赖：** 任务 4

### 任务 9：清理旧 `user_settings` 语义耦合

**目标：** 删除三项功能对 `user_settings` 的后台控制语义，保留兼容读取或迁移所需的最小代码。

**涉及文件：**

- 修改：`F:\tools\email-filter\packages\vps-api\src\routes\user-settings.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\services\user-settings.service.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\services\user-settings.service.test.ts`

**输出物：**

- 设置页不再通过 `user_settings` 控制这三项功能
- 旧字段仅作为迁移来源或兼容数据，不再驱动业务判断

**验收条件：**

- [ ] 修改用户设置不再影响这三项功能的后台启停
- [ ] 现有其他用户设置能力不受影响
- [ ] 老代码路径中无“假开关”残留判断

**依赖：** 任务 3、任务 5

### 任务 10：改造设置页功能开关展示与交互

**目标：** 将设置页中的营销分析、信号监控、邮件主题开关统一升级为系统级开关。

**涉及文件：**

- 修改：`F:\tools\email-filter\packages\vps-api\src\routes\frontend.ts`

**输出物：**

- 设置页改为读取 `/api/admin/features`
- 新增邮件主题开关
- 三态展示：`已启用` / `系统已关闭` / `部署已关闭`

**验收条件：**

- [ ] 管理员可直接关闭或重新打开系统级开关
- [ ] env 关闭时控件置灰并提示“部署已关闭”
- [ ] 不再出现“页面已关闭但后台仍处理”的误导行为

**依赖：** 任务 5、任务 9

### 任务 11：改造前端 tab 可见性与默认跳转

**目标：** 页面入口和当前页路由都严格受 `effectiveEnabled` 控制。

**涉及文件：**

- 修改：`F:\tools\email-filter\packages\vps-api\src\routes\frontend.ts`

**输出物：**

- `campaign`、`monitoring`、`subjects` tab 统一绑定 `effectiveEnabled`
- 当前页被关闭时自动切回安全默认页

**验收条件：**

- [ ] 功能关闭后，对应 tab 不显示
- [ ] 直接访问页面入口时不会渲染已关闭功能的页面
- [ ] 重新打开后，页面入口恢复可见

**依赖：** 任务 4、任务 10

### 任务 12：更新路由注册与启动行为

**目标：** 统一 env 硬禁用与系统级禁用的运行时边界，避免启动期和运行期行为冲突。

**涉及文件：**

- 修改：`F:\tools\email-filter\packages\vps-api\src\index.ts`
- 修改：`F:\tools\email-filter\packages\vps-api\src\routes\index.ts`
- 可能修改：`F:\tools\email-filter\packages\vps-api\src\routes\campaign.ts`
- 可能修改：`F:\tools\email-filter\packages\vps-api\src\routes\monitoring.ts`
- 可能修改：`F:\tools\email-filter\packages\vps-api\src\routes\subjects.ts`

**输出物：**

- env=false 时的路由注册策略明确化
- env=true 时的运行时 guard 一致化

**验收条件：**

- [ ] 部署禁用时，对应功能不可用且页面显示为 `env_disabled`
- [ ] 系统关闭时无需重启即可立即生效
- [ ] 启动阶段无重复判断或相互打架的逻辑

**依赖：** 任务 5、任务 6、任务 10、任务 11

### 任务 13：补充自动化测试

**目标：** 为新架构建立最小充分测试闭环，覆盖状态计算、接口访问、入队行为和调度控制。

**涉及文件：**

- 新增或修改所有相关 `*.test.ts`

**输出物：**

- 状态服务单测
- 迁移测试
- 管理员接口测试
- Webhook 入队测试
- Scheduler guard 测试
- 前端路由渲染或页面行为测试（若仓库已有测试模式则复用；若暂无，则以服务端 HTML 断言或手工 smoke 为主）

**验收条件：**

- [ ] 测试覆盖三项功能的开启、系统关闭、部署关闭三类状态
- [ ] 关键回归点均有自动化验证或明确的手工补充步骤
- [ ] 测试命名与断言能直接反映业务语义

**依赖：** 任务 1 至任务 12

### 任务 14：文档更新与上线说明

**目标：** 为后续运维和单管理员使用提供可执行说明，避免再次回到“假开关”状态。

**涉及文件：**

- 修改：`F:\tools\email-filter\docs\specs\2026-05-17-feature-toggle-upgrade-spec.md`
- 新增：发布说明 / 升级说明文档（实施时确定文件名）

**输出物：**

- 开关语义说明
- 升级影响说明
- 重新打开功能的操作说明
- 不补采历史数据的明确约束

**验收条件：**

- [ ] 管理员能根据文档完成关闭与重新开启操作
- [ ] 文档明确说明 env 与 system 两层开关职责
- [ ] 文档明确说明升级不会改变主过滤链逻辑

**依赖：** 任务 13

## 5. 测试任务清单

### 5.1 单元测试

- [ ] 为 `FeatureSettingsService` 添加状态计算测试
  - 覆盖 `enabled`
  - 覆盖 `system_disabled`
  - 覆盖 `env_disabled`
  - 覆盖“数据库无记录默认开启”
- [ ] 为 `feature-settings-repository` 添加 CRUD / upsert 测试
- [ ] 为 `migrate-campaign.ts` 添加迁移幂等性测试
- [ ] 为 `heartbeat` 或 `scheduler` 添加 `signalMonitoring` 关闭时 no-op 测试

### 5.2 接口测试

- [ ] 测试 `GET /api/admin/features` 返回三项功能状态
- [ ] 测试 `PATCH /api/admin/features/:key` 可以关闭并重新打开功能
- [ ] 测试 env 关闭时接口拒绝“强开”
- [ ] 测试 `/api/campaign/*` 在功能关闭时返回统一禁用态
- [ ] 测试 `/api/monitoring/*` 在功能关闭时返回统一禁用态
- [ ] 测试 `/api/subjects/*` 在功能关闭时返回统一禁用态

### 5.3 Webhook / 任务链路测试

- [ ] 测试 `campaignAnalytics=false` 时不 enqueue `campaign`
- [ ] 测试 `signalMonitoring=false` 时不 enqueue `monitoring`
- [ ] 测试 `subjectTracking=false` 时不 enqueue `subject`
- [ ] 测试 `stats / log / watch` 在任一功能关闭时仍保持原行为
- [ ] 测试主过滤链 `forward / drop` 判定结果与升级前一致

### 5.4 前端行为测试 / Smoke

- [ ] 测试设置页能展示三项功能状态
- [ ] 测试系统关闭后 tab 被隐藏
- [ ] 测试部署关闭后展示 `部署已关闭` 且开关不可操作
- [ ] 测试当前已进入页面时，关闭功能会回退到安全默认页
- [ ] 测试重新打开后 tab 恢复展示

### 5.5 手工回归测试

- [ ] 关闭营销分析后，发送新邮件，不再产生新的营销分析数据
- [ ] 关闭信号监控后，发送新邮件，不再产生新的监控命中数据
- [ ] 关闭邮件主题后，发送新邮件，不再产生新的主题统计数据
- [ ] 重新开启任一功能后，只对新邮件恢复生效
- [ ] 关闭任一功能后，历史数据仍可保留查看（若页面仍有历史列表入口）
- [ ] 在三项功能全部关闭时，基础邮件过滤与转发链路仍正常工作

## 6. 推荐测试命令

### 6.1 定向测试

- [ ] `pnpm --filter @email-filter/vps-api test -- feature-settings.service.test.ts`
- [ ] `pnpm --filter @email-filter/vps-api test -- admin-features.test.ts`
- [ ] `pnpm --filter @email-filter/vps-api test -- webhook`
- [ ] `pnpm --filter @email-filter/vps-api test -- heartbeat.service.test.ts`
- [ ] `pnpm --filter @email-filter/vps-api test -- migrate-campaign.test.ts`

### 6.2 全量验证

- [ ] `pnpm --filter @email-filter/vps-api test`
- [ ] `pnpm --filter @email-filter/vps-api typecheck`
- [ ] `pnpm lint`
- [ ] 必要时执行：`pnpm test`

## 7. 依赖关系与实施建议

### 7.1 严格前置依赖

- [ ] 任务 2 依赖任务 1
- [ ] 任务 3 依赖任务 2
- [ ] 任务 4 依赖任务 1、2、3
- [ ] 任务 5、6、7、8 依赖任务 4
- [ ] 任务 10、11 依赖任务 5
- [ ] 任务 12 依赖任务 5、6、10、11
- [ ] 任务 13 依赖任务 1 至任务 12 基本完成
- [ ] 任务 14 依赖任务 13

### 7.2 推荐执行节奏

- [ ] 先完成“状态模型闭环”：任务 1 到任务 5
- [ ] 再完成“后端行为接管”：任务 6 到任务 8
- [ ] 再完成“前端切换与旧逻辑清理”：任务 9 到任务 12
- [ ] 最后统一补测试、回归、文档和上线说明：任务 13、任务 14

## 8. 风险与检查点

### 8.1 主要风险

- [ ] 旧 `user_settings` 逻辑未完全摘除，导致新旧状态源并存
- [ ] `signalMonitoring` 只停了 Webhook，未停 scheduler
- [ ] 前端只隐藏 tab，但直接请求 API 仍可访问
- [ ] env 和 system 两层判断顺序不一致，导致页面与后台认知不一致
- [ ] 测试只覆盖 API，不覆盖真实入队与调度链路

### 8.2 关键检查点

- [ ] 检查所有 `campaign` 入队点是否都已接管
- [ ] 检查所有 `monitoring` 入队点与 heartbeat/check 是否都已接管
- [ ] 检查所有 `subject` 入队点是否都已接管
- [ ] 检查页面 tab、页面入口、API guard 是否都依赖同一状态服务
- [ ] 检查主过滤链是否未引入行为变化

## 9. 上线前检查清单

- [ ] 已完成数据库迁移脚本验证
- [ ] 已确认 `feature_settings` 在老数据集上能正确初始化
- [ ] 已确认三个功能的默认 env 为开启
- [ ] 已确认设置页可关闭并重新打开功能，无需重启
- [ ] 已确认关闭后只影响新邮件，不补采关闭期间数据
- [ ] 已完成 `vps-api` 定向测试与全量测试
- [ ] 已完成主过滤链 smoke test
- [ ] 已准备升级说明，明确本次升级不会影响核心过滤主链

## 10. 完成定义（Definition of Done）

- [ ] 三项功能都具备统一系统级开关
- [ ] 关闭功能后，后台采集停止、页面入口隐藏、对应 API 不可访问
- [ ] 重新开启功能无需修改 env、无需重启服务
- [ ] `signalMonitoring` 关闭后，Webhook 与 Scheduler 都停止业务处理
- [ ] `subjectTracking` 拥有与另外两项一致的治理能力
- [ ] 核心邮件过滤主链回归通过
- [ ] 升级说明与操作说明已补齐
