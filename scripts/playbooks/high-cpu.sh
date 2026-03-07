#!/usr/bin/env bash
# High CPU remediation playbook
# Level 2: Diagnostic — gather CPU info
# Level 3: Remediate — restart app container if CPU sustained high

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

LEVEL="${1:-2}"
check_lock

log "Running high-cpu playbook at level $LEVEL"

# Level 2: Diagnostic
echo "=== High CPU Diagnostic ==="
echo "--- Top CPU Processes ---"
top -bn1 -o %CPU | head -20 2>/dev/null || ps aux --sort=-%cpu | head -15
echo ""
echo "--- Docker Stats Snapshot ---"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null
echo ""
echo "--- System Load ---"
uptime 2>/dev/null
echo ""

# Level 3: Remediation
if [ "$LEVEL" = "3" ] && [ "${ENABLE_AUTO_REMEDIATION}" = "true" ]; then
  log "Level 3: Attempting app container restart"

  # Find and restart the app container
  APP_CONTAINER=$(docker ps --filter "name=app" --format "{{.Names}}" | head -1)
  if [ -n "$APP_CONTAINER" ]; then
    log "Restarting container: $APP_CONTAINER"
    docker restart "$APP_CONTAINER" --time 30
    log "Container restarted successfully"
  else
    log "Could not find app container to restart"
  fi
fi

release_lock
log "high-cpu playbook completed"
