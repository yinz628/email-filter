#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
get_verification_code.py — 从 extraction-worker 轮询获取指定邮箱的最新验证码。

自包含、零第三方依赖（仅 Python 标准库）。复制这一个文件到任意项目即可使用。

----------------------------------------------------------------------------
快速开始
----------------------------------------------------------------------------
命令行:
    export EXTRACTION_WORKER_URL=https://extraction-worker.<account>.workers.dev
    export EXTRACTION_WORKER_TOKEN=<ADMIN_TOKEN>
    CODE=$(python3 get_verification_code.py user@example.com)
    echo "验证码: $CODE"

Python 模块:
    from get_verification_code import wait_for_code
    result = wait_for_code("user@example.com")
    if result:
        print(result["code"], result["age_seconds"])

完整文档见同目录 get_verification_code.md。

需求: Python 3.7+
作者:  email-filter 项目
----------------------------------------------------------------------------
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, Optional

__version__ = "1.0.0"

# 单次 HTTP 请求超时（秒）。与轮询总超时 timeout 分离。
HTTP_TIMEOUT = 10
# 默认轮询间隔（秒）。
DEFAULT_INTERVAL = 5
# 默认总等待时长（秒）。
DEFAULT_TIMEOUT = 120

# 环境变量名（与 email-filter 项目的 .env.example 保持一致）。
ENV_URL = "EXTRACTION_WORKER_URL"
ENV_TOKEN = "EXTRACTION_WORKER_TOKEN"


# ============================================
# 异常定义
# ============================================

class ConfigError(Exception):
    """配置缺失或非法（URL/TOKEN 未提供、URL 格式错误）。"""


class AuthError(Exception):
    """鉴权失败（401），通常是 token 错误。"""


class ServerError(Exception):
    """服务端返回非 401/404 的错误状态码，或网络异常。"""


# ============================================
# 配置解析
# ============================================

def resolve_config(url: Optional[str], token: Optional[str]) -> str:
    """
    合并显式参数与环境变量，返回 (url, token)。
    优先级: 显式参数 > 环境变量 > 抛 ConfigError。

    url / token 任一未提供且环境变量也为空时，抛 ConfigError 并给出可读提示。
    """
    final_url = (url or os.environ.get(ENV_URL) or "").strip()
    final_token = (token or os.environ.get(ENV_TOKEN) or "").strip()

    missing = []
    if not final_url:
        missing.append(ENV_URL)
    if not final_token:
        missing.append(ENV_TOKEN)
    if missing:
        names = " / ".join(missing)
        raise ConfigError(
            f"缺少配置: {names}。请通过函数参数传入，或设置环境变量 "
            f"{ENV_URL} 与 {ENV_TOKEN}（即 extraction-worker 的访问地址与 ADMIN_TOKEN）。"
        )

    if not final_url.startswith(("http://", "https://")):
        raise ConfigError(
            f"EXTRACTION_WORKER_URL 必须以 http:// 或 https:// 开头，当前值: {final_url!r}"
        )

    # 去掉尾部斜杠，避免拼接路径时出现双斜杠。
    return final_url.rstrip("/"), final_token


# ============================================
# HTTP 调用
# ============================================

def fetch_latest_code(
    url: str,
    token: str,
    recipient: str,
    timeout: float = HTTP_TIMEOUT,
) -> Optional[Dict[str, Any]]:
    """
    单次调用 GET /api/codes/latest/:recipient。

    返回:
        dict — 包含 code/link/received_at/age_seconds 等字段的最新码记录；
        None — 该邮箱暂无任何记录（HTTP 404）。

    异常:
        AuthError   — 401，token 错误。
        ServerError — 其他 4xx/5xx 或网络错误（调用方可据此重试）。
    """
    full_url = f"{url.rstrip('/')}/api/codes/latest/{urllib.parse.quote(recipient, safe='@.')}"
    req = urllib.request.Request(
        full_url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": f"get_verification_code/{__version__}",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            # urlopen 对非 2xx 会抛 HTTPError（见 except 分支），到这说明 2xx。
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise AuthError(
                "鉴权失败（401）。请检查 EXTRACTION_WORKER_TOKEN 是否与 "
                "extraction-worker 的 ADMIN_TOKEN 一致。"
            ) from e
        if e.code == 404:
            return None
        # 其余 4xx/5xx 视为可重试的服务端错误。
        snippet = ""
        try:
            snippet = e.read().decode("utf-8", errors="replace")[:200]
        except Exception:
            pass
        raise ServerError(f"服务端返回 HTTP {e.code}: {snippet}") from e
    except urllib.error.URLError as e:
        # 连接被拒、DNS 失败、超时等。
        raise ServerError(f"无法连接到 {url}: {e.reason}") from e
    except TimeoutError as e:
        raise ServerError(f"请求超时（{timeout}s）: {e}") from e

    try:
        return json.loads(body)
    except ValueError as e:
        raise ServerError(f"响应不是合法 JSON: {body[:200]!r}") from e


# ============================================
# 轮询逻辑
# ============================================

def _fingerprint(record: Dict[str, Any]) -> str:
    """
    计算一条记录的唯一性指纹。
    优先用 message_id；其次 received_at；再辅以 code，避免同时间戳误判。

    收到比基线更新的记录（指纹不同且 received_at 更大）即认定为「新码」。
    received_at 形如 'YYYY-MM-DD HH:MM:SS'（UTC，无时区标记），字典序 == 时间序，
    因此直接字符串比较即可。
    """
    msg_id = str(record.get("message_id") or "")
    received = str(record.get("received_at") or "")
    code = str(record.get("code") or "")
    return f"{msg_id}|{received}|{code}"


def wait_for_code(
    recipient: str,
    url: Optional[str] = None,
    token: Optional[str] = None,
    interval: float = DEFAULT_INTERVAL,
    timeout: float = DEFAULT_TIMEOUT,
    max_age: Optional[float] = None,
    on_poll: Optional[Callable[[str], None]] = None,
) -> Optional[Dict[str, Any]]:
    """
    轮询直到该邮箱出现「比启动时更新的」验证码，或超时。

    「新码」判定（避免把启动前残留的旧码当成新码返回）:
      1. 启动时先取一次当前最新码，记录其指纹作为基线（无记录则基线为 None）。
      2. 之后按 interval 轮询；当返回记录的指纹 != 基线 且 received_at > 基线时间，
         即认为是本次等待期间到达的新码。
      3. 若基线为 None（启动时邮箱完全为空），首次出现的任意码即视为新码。
      4. 可选 max_age：即便有新码，若其 age_seconds > max_age 仍视为无效，继续等待。

    参数:
        recipient — 收件邮箱地址。
        url       — extraction-worker 基址；为 None 时读环境变量。
        token     — ADMIN_TOKEN；为 None 时读环境变量。
        interval  — 轮询间隔（秒），默认 5。
        timeout   — 总等待时长（秒），默认 120。
        max_age   — 可选，码的最大可接受年龄（秒），超过则忽略继续等。
        on_poll   — 可选回调，每次轮询前以一条状态字符串调用（用于打印进度）。

    返回:
        dict — 命中的新码记录（含 code/link/received_at/age_seconds 等）；
        None — 超时未等到新码。

    异常:
        ConfigError — URL/TOKEN 缺失。
        AuthError   — 401。
        （ServerError / 网络错误会被吞掉并在该轮后重试，不打断整体轮询。）
    """
    final_url, final_token = resolve_config(url, token)

    # 1) 建立基线（启动瞬间已存在的最新码）。
    baseline_fp: Optional[str] = None
    baseline_received: str = ""
    try:
        baseline = fetch_latest_code(final_url, final_token, recipient)
        if baseline:
            baseline_fp = _fingerprint(baseline)
            baseline_received = str(baseline.get("received_at") or "")
    except AuthError:
        # 鉴权错误立即上抛，不重试。
        raise
    except ServerError:
        # 建基线时若服务端不可用，视为「无已知旧码」，基线留 None，照常进入轮询。
        baseline_fp = None

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if on_poll:
            on_poll(
                f"轮询 {recipient} 中（剩余 {int(deadline - time.monotonic())}s）..."
            )

        try:
            record = fetch_latest_code(final_url, final_token, recipient)
        except AuthError:
            raise
        except ServerError:
            # 网络/5xx 错误：睡 interval 后重试，不放弃。
            time.sleep(min(interval, max(0.0, deadline - time.monotonic())))
            continue

        if record:
            cur_fp = _fingerprint(record)
            cur_received = str(record.get("received_at") or "")

            # 判定为「新码」: 指纹变化 + 时间戳严格更新（或基线为空）。
            is_new = (
                baseline_fp is None
                or (cur_fp != baseline_fp and cur_received > baseline_received)
            )

            # 码龄过滤（服务端给的 age_seconds 优先）。
            age_ok = True
            if max_age is not None:
                age = record.get("age_seconds")
                if isinstance(age, (int, float)) and age > max_age:
                    age_ok = False

            if is_new and age_ok:
                return record

        time.sleep(interval)

    return None


# ============================================
# CLI
# ============================================

def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="get_verification_code.py",
        description=(
            "从 extraction-worker 轮询获取指定邮箱的最新验证码。"
            " 默认会阻塞等待直到出现「比启动时更新的」新码。"
        ),
        epilog=(
            "示例:\n"
            "  python3 get_verification_code.py user@example.com\n"
            "  python3 get_verification_code.py user@example.com --interval 3 --timeout 60\n"
            "  CODE=$(python3 get_verification_code.py user@example.com --quiet)\n"
            "  python3 get_verification_code.py user@example.com --json\n"
            "\n"
            "环境变量:\n"
            f"  {ENV_URL}    extraction-worker 访问地址\n"
            f"  {ENV_TOKEN}   对应 ADMIN_TOKEN\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "recipient",
        help="收件邮箱地址，例如 user@example.com",
    )
    parser.add_argument(
        "--url",
        default=None,
        help=f"extraction-worker 基址（默认读环境变量 {ENV_URL}）",
    )
    parser.add_argument(
        "--token",
        default=None,
        help=f"ADMIN_TOKEN（默认读环境变量 {ENV_TOKEN}）",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL,
        help=f"轮询间隔秒数（默认 {DEFAULT_INTERVAL}）",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help=f"总等待秒数，超时仍未拿到新码则退出（默认 {DEFAULT_TIMEOUT}）",
    )
    parser.add_argument(
        "--max-age",
        type=float,
        default=None,
        help="可选：仅接受码龄不超过该秒数的码（默认不限制）",
    )
    parser.add_argument(
        "--json",
        dest="as_json",
        action="store_true",
        help="以完整 JSON 对象输出到 stdout（默认只打印裸验证码）",
    )
    parser.add_argument(
        "-q", "--quiet",
        action="store_true",
        help="静默模式：不在 stderr 打印轮询进度",
    )
    parser.add_argument(
        "-V", "--version",
        action="version",
        version=f"get_verification_code {__version__}",
    )
    return parser


def main(argv: Optional[list] = None) -> int:
    args = _build_parser().parse_args(argv)

    def on_poll(msg: str) -> None:
        if not args.quiet:
            print(msg, file=sys.stderr, flush=True)

    try:
        record = wait_for_code(
            recipient=args.recipient,
            url=args.url,
            token=args.token,
            interval=args.interval,
            timeout=args.timeout,
            max_age=args.max_age,
            on_poll=on_poll,
        )
    except ConfigError as e:
        print(f"配置错误: {e}", file=sys.stderr)
        return 2
    except AuthError as e:
        print(f"鉴权错误: {e}", file=sys.stderr)
        return 2

    if record is None:
        if not args.quiet:
            print(
                f"超时：在 {args.timeout}s 内未等到 {args.recipient} 的新验证码。",
                file=sys.stderr,
            )
        return 1

    # 输出到 stdout（pipe 友好）。
    if args.as_json:
        print(json.dumps(record, ensure_ascii=False))
    else:
        code = record.get("code")
        if code:
            print(code)
        else:
            # 提取成功但没有 code（只有 link），退化输出 link。
            print(record.get("link") or "")

    if not args.quiet:
        age = record.get("age_seconds")
        print(f"已获取（age={age}s）", file=sys.stderr)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n已中断（Ctrl-C）。", file=sys.stderr)
        sys.exit(130)
