# Worker 主题获取回退升级 Task List

> 参考规格：
> - `F:\tools\email-filter\docs\specs\2026-05-19-worker-subject-fallback-upgrade-requirements.md`
> - `F:\tools\email-filter\docs\specs\2026-05-19-worker-subject-fallback-upgrade-spec.md`

**目标：** 将 Worker 主题获取逻辑回退到旧版高性能主链路，保留轻量解码能力，移除 `message.raw` 兜底，并用统一占位值承接空主题邮件，且不修改 API 端代码。

**范围约束：**

- 只改 Worker 侧
- 不改 `packages/vps-api`
- 不改共享接口结构
- 不改数据库

---

## 1. 实施范围

### 1.1 本次必须完成

- [ ] 移除 Worker 端 `message.raw` 主题提取逻辑
- [ ] 回退为 `message.headers.get('subject')` 主链路
- [ ] 保留轻量 `normalizeSubject()` 能力
- [ ] 为空主题引入统一占位值 `[NO_SUBJECT]`
- [ ] 保留 `subjectSource` 元信息，并收敛为 `header/missing`
- [ ] 校正测试用例
- [ ] 执行 Worker 侧定向测试、构建验证与部署后 smoke test

### 1.2 本次明确不做

- [ ] 不改 VPS API 过滤逻辑
- [ ] 不改 `packages/shared` 类型定义
- [ ] 不新增数据库字段或配置表
- [ ] 不改管理后台前端
- [ ] 不做多阶段邮件 MIME 深度解析

## 2. 影响文件清单

### 2.1 必改文件

- [ ] `F:\tools\email-filter\packages\email-worker\src\index.ts`
- [ ] `F:\tools\email-filter\packages\email-worker\src\index.test.ts`

### 2.2 可能改动文件

- [ ] `F:\tools\email-filter\packages\email-worker\wrangler.toml`
- [ ] `F:\tools\email-filter\docker-compose.yml`
- [ ] `F:\tools\email-filter\.env.example`
- [ ] Worker 部署脚本或发布说明文档

## 3. 执行顺序总览

- [ ] Phase 1：梳理并收敛主题解析逻辑
- [ ] Phase 2：实现空主题占位与元数据语义收敛
- [ ] Phase 3：修正测试
- [ ] Phase 4：本地验证
- [ ] Phase 5：VPS 部署与线上 smoke test

## 4. 详细任务清单

### 任务 1：识别并移除 raw fallback 代码路径

**目标：** 从 Worker 热路径移除所有 `message.raw` 主题提取逻辑。

**涉及文件：**

- `F:\tools\email-filter\packages\email-worker\src\index.ts`

**输出物：**

- 删除 `extractSubjectFromRawHeaders()` 或将其彻底废弃
- 删除 `resolveSubject()` 中的 `raw-header-fallback` 分支
- 确保代码中不再存在 `message.raw.getReader()` 调用

**验收条件：**

- [ ] `rg -n "message\\.raw|getReader\\(" packages/email-worker/src/index.ts` 无业务使用残留
- [ ] Worker 主题解析路径只依赖 `message.headers`

### 任务 2：实现轻量主题解析函数

**目标：** 用单一轻量函数替代当前多分支主题解析逻辑。

**涉及文件：**

- `F:\tools\email-filter\packages\email-worker\src\index.ts`

**输出物：**

- 基于 `headers.get('subject')` 的轻量解析函数
- 保留 `normalizeSubject()` 调用
- 新增统一占位值常量，如 `MISSING_SUBJECT_PLACEHOLDER`

**验收条件：**

- [ ] 正常 header 主题可正确返回
- [ ] 编码主题可解码
- [ ] 缺失主题返回 `[NO_SUBJECT]`

### 任务 3：收敛 payload 语义

**目标：** 保持 API 协议兼容，同时统一 Worker 产出语义。

**涉及文件：**

- `F:\tools\email-filter\packages\email-worker\src\index.ts`

**输出物：**

- `subjectSource` 仅产出 `header` 或 `missing`
- `subjectRawHeader` 仅在 `header` 场景设置
- payload 结构保持不变

**验收条件：**

- [ ] payload 仍包含原有字段
- [ ] 不再产出 `raw-header-fallback`
- [ ] `missing` 场景下 `subjectRawHeader` 为空

### 任务 4：校正调试日志与配置

**目标：** 避免调试输出放大高流量 Worker 压力。

**涉及文件：**

- `F:\tools\email-filter\packages\email-worker\src\index.ts`
- `F:\tools\email-filter\packages\email-worker\wrangler.toml`
- 视部署方式决定是否同步：
  - `F:\tools\email-filter\docker-compose.yml`
  - `F:\tools\email-filter\.env.example`

**输出物：**

- 保留必要日志字段：`Subject`、`Subject Source`
- 生产默认关闭 `DEBUG_LOGGING`

**验收条件：**

- [ ] 默认配置不会开启高成本调试
- [ ] 无依赖 raw 提取的调试日志残留

### 任务 5：修正 Worker 单元测试

**目标：** 将测试从 raw fallback 模型切换到 header-only 模型。

**涉及文件：**

- `F:\tools\email-filter\packages\email-worker\src\index.test.ts`

**输出物：**

- 删除或改写 raw fallback 相关测试
- 新增 `[NO_SUBJECT]` 占位值测试
- 新增 `subjectSource=missing` 断言

**验收条件：**

- [ ] 所有主题相关单测符合新语义
- [ ] 不再依赖 `raw-header-fallback` 断言

### 任务 6：执行本地定向验证

**目标：** 在本地确认 Worker 逻辑变更未破坏主链路。

**涉及范围：**

- Worker 单元测试
- Worker typecheck / build

**建议命令：**

- [ ] `pnpm --filter @email-filter/email-worker test -- index.test.ts`
- [ ] `pnpm --filter @email-filter/email-worker test`
- [ ] `pnpm --filter @email-filter/email-worker typecheck`
- [ ] `pnpm --filter @email-filter/email-worker build`

**验收条件：**

- [ ] 相关测试通过
- [ ] 构建通过
- [ ] 无类型错误

### 任务 7：部署到 VPS

**目标：** 将 Worker 新版本部署到现网使用的 VPS / Cloudflare 配置链路。

**涉及范围：**

- 现网部署目录
- Worker 发布流程

**输出物：**

- 新 Worker 版本已发布
- 部署前有备份或明确回滚点

**验收条件：**

- [ ] 部署完成
- [ ] 若包含配置变更，配置同步完成
- [ ] 可回退到部署前版本

### 任务 8：执行线上 smoke test

**目标：** 验证新 Worker 行为与现网 API 协议兼容，并观察异常是否缓解。

**建议检查项：**

- [ ] 发送普通主题邮件，确认主题正常进入 API 日志
- [ ] 发送 RFC2047 编码主题邮件，确认能解码或至少稳定传递
- [ ] 发送空主题邮件，确认 API 侧收到 `[NO_SUBJECT]`
- [ ] 观察转发/拦截动作是否正常
- [ ] 观察 Worker 日志是否不再出现 raw fallback 相关分支
- [ ] 观察 Cloudflare 事件中发送失败/拒绝是否下降

**验收条件：**

- [ ] 主链路正常
- [ ] 空主题可识别
- [ ] 未发现新的明显回归

## 5. 测试任务清单

### 5.1 单元测试

- [ ] `decodeMimeEncodedWord()` Base64 UTF-8 解码
- [ ] `decodeMimeEncodedWord()` Q 编码 UTF-8 解码
- [ ] `normalizeSubject()` 去空白与解码
- [ ] header 正常主题解析
- [ ] header 缺失返回 `[NO_SUBJECT]`
- [ ] header 为空白返回 `[NO_SUBJECT]`
- [ ] `subjectSource=header`
- [ ] `subjectSource=missing`
- [ ] `subjectRawHeader` 在 missing 时为空

### 5.2 回归测试

- [ ] payload 构建不变
- [ ] `getFilterDecision()` 调用链不变
- [ ] `decision.action === 'forward'` 时仍可正常 `message.forward()`
- [ ] `decision.action === 'drop'` 时仍 silent drop
- [ ] `decision === null` 时仍 fallback forward

### 5.3 线上验证

- [ ] 发送少量邮件，确认基础行为正常
- [ ] 观察一段高流量时段，确认发送失败/拒绝未继续扩大
- [ ] 对比升级前后 Worker 日志和 API 记录

## 6. 风险与检查点

### 6.1 主要风险

- [ ] 原本依赖 raw fallback 补回的真实主题将退化为 `[NO_SUBJECT]`
- [ ] 现有规则若未覆盖 `[NO_SUBJECT]`，空主题邮件可能需要补规则
- [ ] 调试配置若仍默认开启，可能掩盖一部分优化收益

### 6.2 关键检查点

- [ ] 确认 Worker 代码中没有任何 `message.raw` 主题读取残留
- [ ] 确认 `subjectSource` 新数据不再出现 `raw-header-fallback`
- [ ] 确认 API 无需改动即可处理新 payload
- [ ] 确认占位主题值在日志和规则中可识别

## 7. 上线前检查清单

- [ ] 已完成本地测试
- [ ] 已确认部署路径和回滚方式
- [ ] 已确认生产 `DEBUG_LOGGING` 默认关闭
- [ ] 已准备一组正常主题、编码主题、空主题样本用于 smoke
- [ ] 已明确 `[NO_SUBJECT]` 为标准占位值

## 8. 完成定义（Definition of Done）

- [ ] Worker 主热路径不再读取 `message.raw`
- [ ] Worker 仅基于 header 获取主题
- [ ] 空主题统一变为 `[NO_SUBJECT]`
- [ ] `subjectSource` 收敛为 `header/missing`
- [ ] 本地验证通过
- [ ] 部署完成并通过线上 smoke test
