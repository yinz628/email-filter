#!/usr/bin/env python3
"""Deploy the email-filter (Node/pnpm workspace) backend to the ssh2 test VPS.

Unlike deploy_backend.py (which targets a Go project "resin"), this script
deploys the email-filter vps-api: it syncs the pnpm workspace root (packages/,
docker-compose.yml, pnpm-lock, etc.), then runs `docker compose build/up api`
on the remote host.

Usage:
    # password via env var (preferred — not echoed in shell history)
    SMOKE_SSH_PASSWORD='...' python ssh2/deploy_email_filter.py

    # or interactive prompt
    python ssh2/deploy_email_filter.py

The remote service is `api` (per docker-compose.yml), container `email-filter-api`,
port 3000. Health is probed via the compose healthcheck + a GET /health curl.
"""

from __future__ import annotations

import argparse
import getpass
import os
import shlex
import shutil
import socket
import sys
import tarfile
import tempfile
import time
from pathlib import Path

import paramiko


DEFAULT_HOST = "208.66.229.102"
DEFAULT_PORT = 22
DEFAULT_USER = "root"
DEFAULT_REMOTE_PATH = "/opt/email-filter"
DEFAULT_SERVICE = "api"  # docker-compose.yml service name for vps-api
DEFAULT_TIMEOUT = 15
DEFAULT_HEALTH_TIMEOUT = 300  # pnpm install + better-sqlite3 build is slow

# What gets synced to the remote build context. Matches the files referenced by
# packages/vps-api/Dockerfile COPY directives + docker-compose.yml.
DEFAULT_SYNC_PATHS = (
    "package.json",
    "pnpm-workspace.yaml",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "docker-compose.yml",
    ".env.example",
    ".dockerignore",
    "packages/shared",
    "packages/vps-api",
)
EXCLUDED_PARTS = {
    ".git",
    ".pytest_cache",
    "__pycache__",
    "dist",
    "node_modules",
    ".wrangler",
    # Only packages/shared and packages/vps-api are synced (see DEFAULT_SYNC_PATHS),
    # so other workers' sources never enter the archive in the first place.
    # Test files (*.test.ts) are harmless in the image and kept for simplicity.
}
# Text suffixes whose CRLF is normalized to LF for cross-platform builds.
NORMALIZE_TEXT_SUFFIXES = {
    ".css", ".dockerignore", ".env", ".example", ".html", ".js", ".json",
    ".jsx", ".md", ".ps1", ".sh", ".sql", ".ts", ".tsx", ".txt", ".yaml", ".yml",
}
NORMALIZE_TEXT_NAMES = {".dockerignore", "Dockerfile"}

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Deploy email-filter vps-api to the ssh2 test VPS via docker compose.",
    )
    parser.add_argument("--host", default=os.getenv("SMOKE_SSH_HOST", DEFAULT_HOST))
    parser.add_argument("--port", type=int,
                        default=int(os.getenv("SMOKE_SSH_PORT", str(DEFAULT_PORT))))
    parser.add_argument("--user", default=os.getenv("SMOKE_SSH_USER", DEFAULT_USER))
    parser.add_argument("--password", default=os.getenv("SMOKE_SSH_PASSWORD"))
    parser.add_argument("--remote-path",
                        default=os.getenv("SMOKE_REMOTE_PATH", DEFAULT_REMOTE_PATH))
    parser.add_argument("--service", default=DEFAULT_SERVICE)
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    parser.add_argument("--health-timeout", type=int, default=DEFAULT_HEALTH_TIMEOUT)
    parser.add_argument("--keep-archive", action="store_true")
    return parser.parse_args()


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def should_skip_path(path: Path) -> bool:
    return any(part in EXCLUDED_PARTS for part in path.parts)


def should_normalize_text(path: Path) -> bool:
    if path.name in NORMALIZE_TEXT_NAMES:
        return True
    return path.suffix.lower() in NORMALIZE_TEXT_SUFFIXES


def copy_with_normalized_text(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    data = source.read_bytes()
    if should_normalize_text(source):
        data = data.replace(b"\r\n", b"\n")
    destination.write_bytes(data)
    shutil.copystat(source, destination)


def stage_sync_tree(root: Path, staging_root: Path) -> list[str]:
    included: list[str] = []
    for relative in DEFAULT_SYNC_PATHS:
        source = root / relative
        if not source.exists():
            continue
        included.append(relative)
        if source.is_file():
            copy_with_normalized_text(source, staging_root / relative)
            continue
        for child in source.rglob("*"):
            rel = child.relative_to(root)
            if should_skip_path(rel):
                continue
            if child.is_dir():
                (staging_root / rel).mkdir(parents=True, exist_ok=True)
                continue
            copy_with_normalized_text(child, staging_root / rel)
    return included


def build_archive(root: Path, archive_path: Path) -> list[str]:
    with tempfile.TemporaryDirectory(prefix="email-filter-stage-") as temp_dir:
        staging_root = Path(temp_dir)
        included = stage_sync_tree(root, staging_root)
        with tarfile.open(archive_path, "w:gz") as tar:
            for child in staging_root.rglob("*"):
                arcname = child.relative_to(staging_root).as_posix()
                tar.add(child, arcname=arcname, recursive=False)
    return included


def tcp_probe(host: str, port: int, timeout: int) -> None:
    with socket.create_connection((host, port), timeout=timeout):
        return


def run_remote(client: paramiko.SSHClient, command: str, timeout: int) -> tuple[int, str, str]:
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    del stdin
    code = stdout.channel.recv_exit_status()
    return (code, stdout.read().decode("utf-8", "ignore"), stderr.read().decode("utf-8", "ignore"))


def build_remote_command(
    app_root: str,
    remote_archive: str,
    service: str,
    health_timeout: int,
) -> str:
    quoted_root = shlex.quote(app_root)
    quoted_archive = shlex.quote(remote_archive)
    quoted_service = shlex.quote(service)
    return f"""set -e
cd {quoted_root}
# Extract the new build context over the existing tree (overwrites sources).
tar -xzf {quoted_archive} -C {quoted_root}
# Ensure a .env exists (compose interpolates from it). Copy example if absent.
if [ ! -f {quoted_root}/.env ]; then cp {quoted_root}/.env.example {quoted_root}/.env; fi
echo "=== docker compose build ==="
docker compose build {quoted_service}
echo "=== docker compose up -d ==="
docker compose up -d {quoted_service}
container_id="$(docker compose ps -q {quoted_service})"
if [ -z "$container_id" ]; then
  echo "container id for service {service} not found" >&2
  exit 1
fi
deadline=$((SECONDS + {health_timeout}))
status=""
while [ "$SECONDS" -lt "$deadline" ]; do
  status="$(docker inspect -f '{{{{if .State.Health}}}}{{{{.State.Health.Status}}}}{{{{else}}}}{{{{.State.Status}}}}{{{{end}}}}' "$container_id" 2>/dev/null || echo unknown)"
  echo "HEALTH_STATUS=$status"
  if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
    break
  fi
  sleep 3
done
status="$(docker inspect -f '{{{{if .State.Health}}}}{{{{.State.Health.Status}}}}{{{{else}}}}{{{{.State.Status}}}}{{{{end}}}}' "$container_id" 2>/dev/null || echo unknown)"
if [ "$status" != "healthy" ] && [ "$status" != "running" ]; then
  echo "container did not become healthy/running in time: $status" >&2
  docker compose ps >&2 || true
  docker logs --tail 80 "$container_id" >&2 || true
  exit 1
fi
echo "=== /health probe ==="
curl -fsS http://localhost:3000/health || echo "(health endpoint probe failed, but container is running)"
echo
docker compose ps
rm -f {quoted_archive}
"""


def main() -> int:
    args = parse_args()
    password = args.password or getpass.getpass(
        f"SSH password for {args.user}@{args.host}: "
    )

    root = repo_root()
    with tempfile.NamedTemporaryFile(
        prefix="email-filter-deploy-", suffix=".tar.gz", delete=False
    ) as tmp:
        local_archive = Path(tmp.name)

    try:
        included = build_archive(root, local_archive)
        size_mb = local_archive.stat().st_size / (1024 * 1024)
        print(f"[1/6] Built archive {local_archive} ({size_mb:.2f} MiB)")
        print("Included paths:")
        for item in included:
            print(f"  - {item}")

        print(f"[2/6] TCP probing {args.host}:{args.port} ...")
        tcp_probe(args.host, args.port, args.timeout)
        print("TCP probe ok")

        print(f"[3/6] SSH connecting {args.user}@{args.host} ...")
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=args.host, port=args.port, username=args.user, password=password,
            timeout=args.timeout, banner_timeout=args.timeout, auth_timeout=args.timeout,
            look_for_keys=False, allow_agent=False,
        )
        try:
            print(f"[4/6] Ensuring remote path {args.remote_path} exists ...")
            run_remote(client, f"mkdir -p {shlex.quote(args.remote_path)}", args.timeout)
            remote_archive = f"/tmp/email-filter-deploy-{int(time.time())}.tar.gz"

            print(f"[5/6] Uploading archive to {remote_archive} ...")
            sftp = client.open_sftp()
            try:
                sftp.put(str(local_archive), remote_archive)
            finally:
                sftp.close()

            print("[6/6] Building and restarting remote service ...")
            command = build_remote_command(
                app_root=args.remote_path, remote_archive=remote_archive,
                service=args.service, health_timeout=args.health_timeout,
            )
            code, stdout, stderr = run_remote(
                client, command, timeout=max(args.health_timeout + 300, 600)
            )
            if stdout.strip():
                print(stdout.strip())
            if stderr.strip():
                print(stderr.strip(), file=sys.stderr)
            if code != 0:
                print(f"Remote deploy failed with exit code {code}", file=sys.stderr)
                return code
        finally:
            client.close()
    finally:
        if not args.keep_archive and local_archive.exists():
            local_archive.unlink()

    print("Deploy completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
