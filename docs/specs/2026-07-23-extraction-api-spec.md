# 提取结果 API 设计 — 外部程序读取规格

> 状态：设计中（待实现）
> 日期：2026-07-23
> 依赖：
> - `2026-07-23-extraction-worker-architecture-spec.md`（路由总表 §5，本文是其 API 部分的详细契约）
> - `2026-07-23-discount-code-extraction-spec.md`（discount_codes 表字段定义，决定 API 响应体格式）
> - `2026-07-24-discount-regex-generator-spec.md`（正则生成/测试端点的请求/响应格式）

## 1. 概述

extraction-worker 提供两类 API 供外部程序读取提取结果（验证码/验证链接、折扣码/优惠链接）。本文规划**读取 API**（`/api/codes`、`/api/discounts`）的认证、端点、请求/响应格式、使用示例。

> **写入端点**（`/extract` service binding、`/api/rules` 推送）的契约见架构 spec §8.1（/extract 请求体格式）和 §9.3（规则推送格式），本文不重复。

## 2. 认证

### 2.1 Bearer Token

所有 `/api/*` 端点需 Bearer token 认证：

```
Authorization: Bearer <ADMIN_TOKEN>
```

`ADMIN_TOKEN` 在 extraction-worker 的 wrangler.toml `[vars]` 配置。

### 2.2 只读 API Token（可选增强）

若需给外部程序更低权限的 token（只读，不能删除），可增加：
- `READ_TOKEN`：仅允许 GET，不允许 DELETE。
- 检查逻辑：GET 请求接受 ADMIN_TOKEN 或 READ_TOKEN；DELETE 仅接受 ADMIN_TOKEN。

## 3. 验证码 API

### 3.1 按邮箱查验证码（主要使用场景）

外部程序最常见的操作：**给定邮箱，拿最新的验证码**。

```
GET /api/codes?recipient=JEFFREY19KD@GLTEMAIL.COM&limit=1
Authorization: Bearer <TOKEN>
```

**响应：**
```json
{
  "records": [
    {
      "id": 42,
      "recipient": "JEFFREY19KD@GLTEMAIL.COM",
      "sender": "noreply@google.com",
      "subject": "Your verification code",
      "code": "452017",
      "link": null,
      "message_id": "<xxx@mail.gmail.com>",
      "received_at": "2026-07-23T12:02:35.504Z"
    }
  ],
  "pagination": { "total": 3, "limit": 1, "offset": 0 }
}
```

### 3.2 端点清单

| 端点 | 方法 | 查询参数 | 说明 |
|------|------|---------|------|
| `/api/codes` | GET | `recipient`, `sender`, `search`, `limit`(默认50,最大200), `offset` | 列表查询 |
| `/api/codes/:id` | GET | — | 单条查询 |
| `/api/codes/:id` | DELETE | — | 删除单条 |
| `/api/codes/latest/:recipient` | GET | — | **便捷端点**：直接返回该邮箱最新一条的 code/link |

### 3.3 便捷端点（为外部程序优化）

外部程序通常只需"最新验证码"，无需处理分页：

```
GET /api/codes/latest/JEFFREY19KD@GLTEMAIL.COM
Authorization: Bearer <TOKEN>
```

**响应（精简，直接给值）：**
```json
{
  "code": "452017",
  "link": null,
  "received_at": "2026-07-23T12:02:35.504Z",
  "age_seconds": 45
}
```

- `age_seconds`：距提取的秒数，外部程序可据此判断码是否过期。
- 若无记录返回 `404` + `{"error": "no code found"}`。

## 4. 折扣码 API

### 4.1 端点清单

| 端点 | 方法 | 查询参数 | 说明 |
|------|------|---------|------|
| `/api/discounts` | GET | `recipient`, `sender_domain`(商户), `search`, `limit`, `offset` | 列表查询 |
| `/api/discounts/:id` | GET | — | 单条查询 |
| `/api/discounts/:id` | DELETE | — | 删除单条 |
| `/api/discounts/by-merchant/:domain` | GET | `limit`, `offset` | 按商户查折扣码 |

### 4.2 按商户查折扣码

```
GET /api/discounts/by-merchant/amazon.com?limit=10
Authorization: Bearer <TOKEN>
```

**响应：**
```json
{
  "records": [
    {
      "id": 15,
      "recipient": "user@gltemail.com",
      "sender": "deals@amazon.com",
      "sender_domain": "amazon.com",
      "subject": "20% off your next order!",
      "code": "SAVE20",
      "link": "https://amazon.com/promo/xxx",
      "discount_value": "20% OFF",
      "received_at": "2026-07-23T10:00:00.000Z"
    }
  ],
  "pagination": { "total": 5, "limit": 10, "offset": 0 }
}
```

## 5. 外部程序使用示例

### 5.1 自动获取验证码（Python）

```python
import requests

WORKER_URL = "https://extraction-worker.xgf911128.workers.dev"
TOKEN = "<ADMIN_TOKEN>"
MAILBOX = "JEFFREY19KD@GLTEMAIL.COM"

resp = requests.get(
    f"{WORKER_URL}/api/codes/latest/{MAILBOX}",
    headers={"Authorization": f"Bearer {TOKEN}"},
    timeout=10,
)
if resp.status_code == 200:
    data = resp.json()
    print(f"验证码: {data['code']}")
    print(f"已过去: {data['age_seconds']}秒")
else:
    print("暂无验证码")
```

### 5.2 轮询最新验证码（带过期判断）

```python
import requests, time

def wait_for_code(mailbox, max_wait=120, interval=5):
    """轮询直到拿到新验证码（age_seconds < max_wait）"""
    deadline = time.time() + max_wait
    while time.time() < deadline:
        resp = requests.get(
            f"{WORKER_URL}/api/codes/latest/{mailbox}",
            headers={"Authorization": f"Bearer {TOKEN}"},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("code") and data["age_seconds"] < max_wait:
                return data["code"]
        time.sleep(interval)
    return None
```

### 5.3 查某商户所有折扣码（curl）

```bash
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://extraction-worker.xgf911128.workers.dev/api/discounts/by-merchant/amazon.com" \
  | jq '.records[] | {code, discount_value, received_at}'
```

## 6. 限流与防护

### 6.1 速率限制
- Worker 免费版无原生限流，但 Cloudflare 可配 Rate Limiting Rules。
- 建议：单 IP 每分钟 ≤60 次请求（验证码轮询 5 秒间隔 = 12 次/分钟，足够）。
- 超限返回 `429 Too Many Requests`。

### 6.2 查询保护
- `limit` 参数上限 200（防止一次拉取过多）。
- D1 查询走索引（recipient+received_at），O(log n)。
- 不返回原始邮件正文（只返回提取的 code/link/元数据）。

### 6.3 数据保留
- 验证码：可配定时清理（如保留 24 小时，过期自动删）。
- 折扣码：长期保留（有价值的码不自动删，由用户手动管理）。

## 7. Worker 访问地址

extraction-worker 部署后有两个访问入口：
- **workers.dev 域名**：`https://extraction-worker.xgf911128.workers.dev`（外部程序 + 面板用）
- **service binding**：email-worker 内部调用 `env.EXTRACTION_WORKER.fetch()`（无需认证）

外部程序统一用 workers.dev 域名 + Bearer token。

## 8. 错误响应

| HTTP 状态 | 场景 | 响应体 |
|-----------|------|--------|
| 400 | 参数错误（如 limit 非数字） | `{"error": "invalid limit"}` |
| 401 | 缺少/错误 token | `{"error": "unauthorized"}` |
| 404 | 无记录（latest 端点） | `{"error": "no code found"}` |
| 429 | 限流 | `{"error": "rate limited", "retry_after": 60}` |
| 500 | 内部错误 | `{"error": "internal error"}` |
