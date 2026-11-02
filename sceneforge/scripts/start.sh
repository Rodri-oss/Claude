#!/usr/bin/env bash
# Start SceneForge AI (web app + background worker). Usage: scripts/start.sh [--dev]
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/run
PORT="${PORT:-3000}"
if [[ "${1:-}" == "--dev" ]]; then
  setsid nohup npx next dev -p "$PORT" > data/run/web.log 2>&1 &
else
  [[ -d .next ]] || npx next build
  setsid nohup npx next start -p "$PORT" > data/run/web.log 2>&1 &
fi
echo $! > data/run/web.pid
setsid nohup npx tsx worker/index.ts > data/run/worker.log 2>&1 &
echo $! > data/run/worker.pid
echo "SceneForge AI starting on http://localhost:$PORT (logs in data/run/)"
