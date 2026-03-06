#!/usr/bin/env bash
# High Memory remediation playbook
# Level 2: Diagnostic — gather memory info
# Level 3: Remediate — prune Docker, restart app if OOM-like

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

LEVEL="${1:-2}"
check_lock

log "Running high-memory playbook at level $LEVEL"

# Level 2: Diagnostic
echo "=== High Memory Diagnostic ==="
echo "--- System Memory ---"
free -h 2>/dev/null || cat /proc/meminfo | head -10
echo ""
echo "--- Per-Container Memory ---"
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null
echo ""
echo "--- Largest Processes ---"
ps aux --sort=-%mem | head -10 2>/dev/null
echo ""

# Level 3: Remediation
if [ "$LEVEL" = "3" ] && [ "${ENABLE_AUTO_REMEDIATION}" = "true" ]; then
  log "Level 3: Pruning Docker build cache"
  docker builder prune -f --filter "until=24h" 2>/dev/null
  docker image prune -f 2>/dev/null

  log "Level 3: Attempting app container restart"
  APP_CONTAINER=$(docker ps --filter "name=app" --format "{{.Names}}" | head -1)
  if [ -n "$APP_CONTAINER" ]; then
    log "Restarting container: $APP_CONTAINER"
    docker restart "$APP_CONTAINER" --time 30
    log "Container restarted"
  fi
fi

release_lock
log "high-memory playbook completed"
