# get_verification_code.py — 验证码获取脚本

从 [extraction-worker](../packages/extraction-worker) 端**轮询等待**指定邮箱的新验证码，供其他项目集成使用。单文件、零第三方依赖（仅 Python 标准库）。

> 适用场景：在自动化脚本里触发某网站发送验证码邮件，然后**阻塞等待**直到这次的新验证码到达，取出后自动填表/继续流程。

---

## 目录

- [前置条件](#前置条件)
- [快速开始](#快速开始)
- [转移到其他项目](#转移到其他项目)  ← 只想拿去用，看这一节
- [CLI 参数详解](#cli-参数详解)
- [配置（URL / Token）](#配置url--token)
- [Python 模块 API](#python-模块-api)
- [典型场景示例](#典型场景示例)
- [退出码](#退出码)
- [工作原理：如何判定「新码」](#工作原理如何判定新码)
- [排障](#排障)

---

## 前置条件

| 项目 | 要求 |
|------|------|
| Python | **3.7+**（仅用标准库，无需 pip 安装任何包） |
| extraction-worker | 已部署并可外网访问，记录了验证码（命中 forward 规则 + 勾选 `extractVerification`） |
| 凭据 | extraction-worker 的访问 URL + `ADMIN_TOKEN`（见 [配置](#配置url--token)） |

确认 extraction-worker 能正常返回数据（替换为你的真实值）：

```bash
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" \
  "https://extraction-worker.<account>.workers.dev/api/codes/latest/user@example.com"
```

返回 `{"code":"123456","received_at":"...","age_seconds":12}` 即正常；返回 `{"error":"no code found"}`（404）说明该邮箱暂无记录。

---

## 快速开始

```bash
# 1) 配置（二选一：环境变量 或 命令行参数）
export EXTRACTION_WORKER_URL=https://extraction-worker.<account>.workers.dev
export EXTRACTION_WORKER_TOKEN=<ADMIN_TOKEN>

# 2) 等待 user@example.com 的新验证码（默认最多等 120 秒，每 5 秒查一次）
python3 get_verification_code.py user@example.com
```

输出（stdout 为裸验证码，进度走 stderr，方便管道捕获）：

```
轮询 user@example.com 中（剩余 115s）...     ← stderr
452017                                         ← stdout（即验证码）
已获取（age=3s）                                ← stderr
```

把验证码存进 Shell 变量：

```bash
CODE=$(python3 get_verification_code.py user@example.com --quiet)
echo "验证码是: $CODE"
```

---

## 转移到其他项目

本脚本设计为**单文件自包含**，拷贝到任何项目即可使用，无需引入 pip 依赖，也不依赖本仓库的任何其他文件。

### 步骤 1：复制文件

只需复制 **1 个文件**：

```
scripts/get_verification_code.py   →   <你的项目>/任意位置/get_verification_code.py
```

（可选）连同本文档一起复制，方便其他成员查阅：

```
scripts/get_verification_code.py
scripts/get_verification_code.md
```

### 步骤 2：确认运行环境

```bash
python3 --version    # 需要 3.7+
python3 -c "import urllib.request, json, argparse; print('ok')"
```

两条命令都成功即可——**没有 `pip install` 这一步**。

### 步骤 3：提供配置

两种方式，任选其一（命令行参数优先级更高）：

**方式 A — 环境变量**（推荐，凭据不进命令历史/进程列表）：

```bash
export EXTRACTION_WORKER_URL=https://extraction-worker.<account>.workers.dev
export EXTRACTION_WORKER_TOKEN=<ADMIN_TOKEN>
python3 get_verification_code.py user@example.com
```

**方式 B — 命令行参数**：

```bash
python3 get_verification_code.py user@example.com \
  --url https://extraction-worker.<account>.workers.dev \
  --token <ADMIN_TOKEN>
```

### 集成方式

#### 集成方式 1：Shell / 任意语言调用 CLI（最通用）

无论你的项目用 Bash、Node、Go、Java……只要能起子进程、读 stdout，都能用：

```bash
# Bash
CODE=$(python3 get_verification_code.py user@example.com --quiet)
if [ $? -eq 0 ]; then
    echo "拿到码: $CODE"
else
    echo "未拿到（超时或鉴权失败）"
fi
```

```javascript
// Node.js
import { execFileSync } from 'node:child_process';
const code = execFileSync('python3',
  ['get_verification_code.py', 'user@example.com', '--quiet'],
  { encoding: 'utf-8' }
).trim();
```

#### 集成方式 2：Python 项目直接 import

```python
from get_verification_code import wait_for_code

result = wait_for_code("user@example.com")   # 阻塞直到新码到达或超时
if result:
    print(result["code"], result["age_seconds"])
else:
    print("超时未拿到")
```

把脚本放进你的 Python 项目（或加入 `sys.path`），按普通模块 import 即可，无需打包成 pip 包。

---

## CLI 参数详解

```
python3 get_verification_code.py <recipient> [options]
```

| 参数 | 类型 | 默认 | 环境变量 | 说明 |
|------|------|------|---------|------|
| `recipient`（位置参数） | str | — | — | 收件邮箱地址，必填 |
| `--url` | str | — | `EXTRACTION_WORKER_URL` | extraction-worker 基址 |
| `--token` | str | — | `EXTRACTION_WORKER_TOKEN` | ADMIN_TOKEN |
| `--interval` | float | `5` | — | 轮询间隔（秒） |
| `--timeout` | float | `120` | — | 总等待上限（秒），超时退出 |
| `--max-age` | float | 不限 | — | 仅接受码龄不超过该秒数的码 |
| `--json` | flag | off | — | stdout 输出完整 JSON 而非裸验证码 |
| `-q, --quiet` | flag | off | — | 不在 stderr 打印轮询进度 |
| `-V, --version` | — | — | — | 打印版本号 |
| `-h, --help` | — | — | — | 查看帮助 |

> **优先级**：命令行参数 > 环境变量。即给了 `--url` 就忽略环境变量里的 URL。

### stdout / stderr 分离（管道友好）

| 流 | 内容 |
|----|------|
| **stdout** | 默认：裸验证码（如 `452017`）；`--json` 时为完整 JSON 对象 |
| **stderr** | 进度提示、错误信息、`age` 提示 |

这样 `$(...)` 能干净地只拿到验证码本身，进度信息不会污染捕获结果。

---

## 配置（URL / Token）

脚本需要两个凭据，对应 extraction-worker 的部署配置：

| 脚本侧 | 对应 extraction-worker 配置 | 获取方式 |
|---------|---------------------------|---------|
| `EXTRACTION_WORKER_URL` | workers.dev 域名或自定义域 | 部署后 `wrangler deploy` 输出的 URL，形如 `https://extraction-worker.<account>.workers.dev` |
| `EXTRACTION_WORKER_TOKEN` | wrangler.toml 里的 `ADMIN_TOKEN` | extraction-worker 的 `wrangler.toml` → `[vars] ADMIN_TOKEN` |

> **安全建议**：优先用环境变量传递 token，避免出现在命令行参数（会被 `ps`/shell history 看到）。CI/CD 里用 secret 注入。

---

## Python 模块 API

导入即用（脚本无需安装，放在同目录或加入 `sys.path`）：

```python
from get_verification_code import wait_for_code, fetch_latest_code
```

### `wait_for_code(...)`

```python
wait_for_code(
    recipient: str,
    url: str | None = None,        # 为 None 时读环境变量
    token: str | None = None,      # 为 None 时读环境变量
    interval: float = 5,           # 轮询间隔（秒）
    timeout: float = 120,          # 总等待上限（秒）
    max_age: float | None = None,  # 码的最大可接受年龄（秒）
    on_poll: Callable[[str], None] | None = None,  # 每轮回调
) -> dict | None
```

**返回**：命中新码时返回字典，含 `code` / `link` / `received_at` / `age_seconds` 等字段；超时返回 `None`。

**异常**：
- `ConfigError` — URL/TOKEN 缺失或非法。
- `AuthError` — 401，token 错误。
- 网络/5xx 错误**不会抛出**，会被吞掉并在下一轮重试（不打断轮询）。

### `fetch_latest_code(...)`

单次查询，不轮询。适合「只看一眼当前最新码」的场景：

```python
fetch_latest_code(
    url: str,
    token: str,
    recipient: str,
    timeout: float = 10,
) -> dict | None
```

**返回**：最新码记录；该邮箱无任何记录（404）时返回 `None`。异常同上。

---

## 典型场景示例

### 场景 1：等登录验证码并自动填表（Python）

```python
import time
from get_verification_code import wait_for_code

# 1) 在你的自动化里触发网站发送验证码（伪代码）
trigger_send_verification("user@example.com")

# 2) 阻塞等待这次的新码（最多 90 秒）
code = wait_for_code("user@example.com", timeout=90, interval=3)
if not code:
    raise RuntimeError("验证码迟迟未到")

# 3) 填回页面
fill_input("#otp-input", code["code"])
print(f"已填入验证码 {code['code']}（age={code['age_seconds']}s）")
```

### 场景 2：Shell 自动化取码

```bash
#!/usr/bin/env bash
set -euo pipefail
export EXTRACTION_WORKER_URL=https://extraction-worker.xgf911128.workers.dev
export EXTRACTION_WORKER_TOKEN=xxxxx

trigger_login "user@example.com"            # 你的逻辑
CODE=$(python3 get_verification_code.py user@example.com --quiet --timeout 90) || {
    echo "未拿到验证码" >&2; exit 1;
}
echo "验证码: $CODE"
```

### 场景 3：只接受 60 秒内的新鲜码

```bash
python3 get_verification_code.py user@example.com --max-age 60 --timeout 120
```

含义：最多等 120 秒；期间一旦有新码且其 `age_seconds ≤ 60` 才返回，否则继续等。

### 场景 4：自定义轮询进度回调

```python
from get_verification_code import wait_for_code

def progress(msg):
    # 接入你项目的日志系统，而非打印到 stderr
    my_logger.info(msg)

result = wait_for_code("user@example.com", on_poll=progress)
```

### 场景 5：拿到完整记录（含链接、发件人等）

```bash
python3 get_verification_code.py user@example.com --json
```

```json
{"code":"452017","link":null,"received_at":"2026-07-23T12:02:35.504Z","age_seconds":8}
```

---

## 退出码

| 退出码 | 含义 |
|--------|------|
| `0` | 成功取到新码 |
| `1` | 超时未取到新码（邮箱没收到新邮件） |
| `2` | 配置错误（URL/TOKEN 缺失）或鉴权失败（401） |
| `130` | 被 Ctrl-C 中断 |

脚本被 `$(...)` 捕获时，记得检查退出码（见 [场景 2](#场景-2shell-自动化取码)）。

---

## 工作原理：如何判定「新码」

直接「取最新码」有个陷阱：邮箱里可能残留一封几分钟前的旧码，脚本一启动就会立即返回它——但你真正想要的是**这次触发后**才到达的新码。

本脚本的策略：

1. **启动瞬间**先取一次当前最新码，记录其指纹（`message_id` + `received_at` + `code`）作为**基线**。
   - 若此时邮箱为空（404），基线为空。
2. 之后按 `--interval` 轮询。
3. 当返回记录的**指纹与基线不同**且 `received_at` 严格大于基线时间戳，即认定为本次的新码，立即返回。
4. 若启动时基线为空，则首次出现的任意码即视为新码。
5. 可选 `--max-age`：即便识别为新码，若码龄超过该值仍忽略，继续等待。

> `received_at` 为 UTC 时间，SQLite `datetime('now')` 格式（`YYYY-MM-DD HH:MM:SS`），字典序与时间序一致，可直接字符串比较。

---

## 排障

### `配置错误: 缺少配置: EXTRACTION_WORKER_URL / EXTRACTION_WORKER_TOKEN`

URL 或 Token 既没通过参数传，也没设环境变量。检查：

```bash
echo "$EXTRACTION_WORKER_URL"    # 应为 https://...
echo "$EXTRACTION_WORKER_TOKEN"  # 应非空
```

### `鉴权错误（401）`

`EXTRACTION_WORKER_TOKEN` 与 extraction-worker 的 `wrangler.toml` 里 `ADMIN_TOKEN` 不一致。去 extraction-worker 部署目录核对，或临时用 `--token` 显式传入。

### `无法连接到 https://...: ...` / `请求超时`

- extraction-worker 未部署或域名拼错。
- 当前网络无法访问 Cloudflare（防火墙/代理）。
- 用前置条件里的 `curl` 命令独立验证连通性。

### `超时：在 Ns 内未等到 ... 的新验证码`

- 邮件确实没到：确认发件方已发送、且该邮箱命中了勾选 `extractVerification` 的 forward 规则（否则不会被提取存库）。
- 邮件到了但旧码还在前：脚本判定为「非新码」。若你就是想取当前最新码（不区分新旧），改用 `fetch_latest_code()` 函数单次查询。
- 调大 `--timeout` 或减小 `--interval`。

### 验证码取出来了但网站提示「已过期」

配合 `--max-age` 过滤掉过旧的码；或缩短 `--interval` 让脚本更快响应。

---

## 相关

- extraction-worker 源码与 API 总表：[`packages/extraction-worker/src/index.ts`](../packages/extraction-worker/src/index.ts)
- 提取结果读取 API 设计规格：[`docs/specs/2026-07-23-extraction-api-spec.md`](../docs/specs/2026-07-23-extraction-api-spec.md)
- 项目总览：[`README.md`](../README.md)
