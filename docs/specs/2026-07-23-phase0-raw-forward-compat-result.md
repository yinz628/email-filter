# Phase 0 测试结论 — raw/forward 兼容性

## 测试目标

验证 [workerd Issue #1500](https://github.com/cloudflare/workerd/issues/1500) 指出的运行时风险：
**读完邮件完整正文（`message.raw` 流）后，`message.forward()` 是否仍能投递完整邮件？**

`message.raw` 是 ReadableStream，只能消费一次。社区文档对 "forward 内部是否独立于 raw 流" 存在分歧，无法靠读代码定论，必须实测。

## 测试方法

部署独立的 phase0 诊断 worker（`email-filter-forwarder-phase0`），将 gltemail.com 的 catch-all 路由指向它。场景 A：读完整正文 → forward → 报告结果到 VPS（`/api/webhook/phase0-log`，绕过 wrangler tail 的网络限制）。

## 测试结果（2026-07-23）

| 测试项 | 结果 | 证据 |
|--------|------|------|
| 读完整邮件正文 | ✅ 成功 | RAW_READ 报告：8863 字节，未截断 |
| 读完后 `message.forward()` 投递 | ✅ 成功 | 目标 Gmail 收到邮件 |
| 转发的邮件正文完整性 | ✅ 完整 | 验证码内容可见 |

发件：`dinglingling321@gmail.com`
收件：`phase0@gltemail.com` → forward → `wangshengshan5@gmail.com`

## 结论

**场景 A 完全成功。读完完整正文后，`message.forward()` 仍能投递完整邮件。**

workerd #1500 担心的冲突在本环境不成立。Cloudflare 的 `message.forward()` 内部独立投递原始邮件，不依赖 JS 侧的 raw 流游标状态。

## 生产策略（已锁定）

采用场景 A 最简链，无需 `tee()` 分叉或 SEB 重发：

```typescript
async email(message, env, ctx) {
  // 1. 读取完整正文（流耗尽，但 forward 不受影响）
  const rawMime = await readFullBodyCapped(message);
  // 2. 调 extraction-worker 提取验证码（service binding）
  if (decision.verificationRequired && env.EXTRACTION_WORKER) {
    const result = await env.EXTRACTION_WORKER.fetch('https://internal/extract', { method: 'POST', body: rawMime });
    const { code, link } = await result.json();
    ctx.waitUntil(reportVerificationToVps(env, { ...identityFields, code, link }));
  }
  // 3. 原样转发（已验证：读完正文后仍完整投递）
  await message.forward(forwardTo);
}
```

## 测试中发现的关键实现细节

**报告 fetch 必须用 `ctx.waitUntil()`**：email handler 中裸的 fire-and-forget `fetch()`（`void fetch(...)`）会在 handler 返回后被运行时取消。测试中 forward 之后的报告因此丢失。改用 `ctx.waitUntil(promise)` 后报告可靠到达。生产代码中提取结果的上报同样必须用 `ctx.waitUntil`。

## 临时资源（待清理）

测试完成后删除：
- `packages/email-worker/src/index-phase0.ts`
- `packages/email-worker/wrangler-phase0.toml`
- Cloudflare worker `email-filter-forwarder-phase0`
- gltemail.com 的 catch-all 路由指向（恢复或删除）
- VPS `phase0_logs` 表 + `/api/webhook/phase0-log` 端点
- tsconfig.json 中 `src/index-phase0.ts` 的 exclude 条目
