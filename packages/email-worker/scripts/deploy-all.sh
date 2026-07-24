#!/usr/bin/env bash
# Deploy all email-worker instances + the extraction-worker they depend on.
#
# Service bindings require the CALLEE (extraction-worker) to exist in the same
# Cloudflare account before the CALLER (email-worker) is deployed. So we deploy
# extraction-worker FIRST, then each email-worker instance.
#
# Usage:
#   cd packages/email-worker
#   bash scripts/deploy-all.sh           # deploy everything
#   bash scripts/deploy-all.sh workers   # skip extraction-worker (already deployed)
#
# Requires: wrangler logged in (npx wrangler login) to the account where both
# extraction-worker and the email-worker instances live.

set -euo pipefail

# Resolve the monorepo root from this script's location.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$WORKER_DIR/../.." && pwd)"
EXTRACTION_DIR="$ROOT_DIR/packages/extraction-worker"

SKIP_EXTRACTION="${1:-}"

deploy_extraction() {
  if [[ "$SKIP_EXTRACTION" == "workers" ]]; then
    echo ">>> Skipping extraction-worker (already deployed)"
    return
  fi
  echo ">>> Deploying extraction-worker (service binding target)..."
  cd "$EXTRACTION_DIR"
  npx wrangler deploy
  echo ""
}

deploy_workers() {
  echo ">>> Deploying email-worker instances..."
  cd "$WORKER_DIR"
  # Deploy the default wrangler.toml, then each per-domain config.
  # Skip wrangler-test.toml (subject diagnostics — no extraction binding).
  for config in wrangler.toml wrangler.*.toml; do
    if [[ "$config" == *"test"* ]]; then
      echo "  SKIP $config (test worker)"
      continue
    fi
    echo "  deploying $config ..."
    npx wrangler deploy --config "$config"
  done
}

deploy_extraction
deploy_workers

echo ""
echo "=== All deployments complete ==="
echo "Remember: each domain's Email Routing catch-all/rules must point to its"
echo "email-filter-forwarder-* worker (configured in Cloudflare Dashboard)."
