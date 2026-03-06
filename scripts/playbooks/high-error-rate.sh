#!/usr/bin/env bash
# High Error Rate remediation playbook
# Level 2: Diagnostic — check recent error logs
# Level 3: Remediate — restart app container

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

LEVEL="${1:-2}"
check_lock

log "Running high-error-rate playbook at level $LEVEL"

# Level 2: Diagnostic
echo "=== High Error Rate Diagnostic ==="
echo "--- Recent App Errors (last 50 lines) ---"
APP_CONTAINER=$(docker ps --filter "name=app" --format "{{.Names}}" | head -1)
if [ -n "$APP_CONTAINER" ]; then
  docker logs --tail 50 --since 5m "$APP_CONTAINER" 2>&1 | grep -i '"level":"error"' | tail -20
else
  echo "App container not found"
fi
echo ""
echo "--- Container Status ---"
docker ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null
echo ""
echo "--- DB Connectivity Check ---"
docker exec "$APP_CONTAINER" wget -qO- http://localhost:3000/api/health/ready 2>/dev/null || echo "Health check failed"
echo ""

# Level 3: Remediation
if [ "$LEVEL" = "3" ] && [ "${ENABLE_AUTO_REMEDIATION}" = "true" ]; then
  log "Level 3: Restarting app container"
  if [ -n "$APP_CONTAINER" ]; then
    docker restart "$APP_CONTAINER" --time 30
    log "Container restarted"
  fi
fi

release_lock
log "high-error-rate playbook completed"
