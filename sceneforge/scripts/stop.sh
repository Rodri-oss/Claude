#!/usr/bin/env bash
# Stop SceneForge AI. The worker finishes its current step; interrupted jobs resume on next start.
cd "$(dirname "$0")/.."
for n in worker web; do
  f="data/run/$n.pid"
  if [[ -f "$f" ]]; then
    pid=$(cat "$f")
    # each service runs in its own process group (setsid) — signal the whole group
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    rm -f "$f"
    echo "stopped $n ($pid)"
  fi
done
