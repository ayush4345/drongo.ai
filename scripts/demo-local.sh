#!/usr/bin/env bash
set -euo pipefail

pnpm install
pnpm --filter @slate/provider build
pnpm --filter @slate/consumer build

rm -f artifacts/demo-witness.json artifacts/events.jsonl

pnpm --filter @slate/provider start &
PROVIDER_PID=$!
trap 'kill "$PROVIDER_PID" 2>/dev/null || true' EXIT

sleep 2

pnpm --filter @slate/consumer start -- --provider http://localhost:4021 --calls 7431 --out artifacts/demo-witness.json
