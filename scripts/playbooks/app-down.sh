#!/usr/bin/env bash
# App Down remediation playbook
# Level 2: Diagnostic — check container and dependencies
# Level 3: Remediate — restart app, then all services if needed

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

LEVEL="${1:-2}"
check_lock

log "Running app-down playbook at level $LEVEL"

# Level 2: Diagnostic
echo "=== App Down Diagnostic ==="
echo "--- All Containers ---"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null
echo ""

APP_CONTAINER=$(docker ps -a --filter "name=app" --format "{{.Names}}" | head -1)
if [ -n "$APP_CONTAINER" ]; then
  echo "--- App Container Logs (last 30 lines) ---"
  docker logs --tail 30 "$APP_CONTAINER" 2>&1
  echo ""
  echo "--- App Container Inspect ---"
  docker inspect --format '{{.State.Status}} (ExitCode: {{.State.ExitCode}}, OOMKilled: {{.State.OOMKilled}})' "$APP_CONTAINER" 2>/dev/null
else
  echo "App container not found at all!"
fi
echo ""
echo "--- Port Check ---"
curl -sf --max-time 5 http://localhost:3000/api/health/live 2>/dev/null && echo "Health: OK" || echo "Health: UNREACHABLE"
echo ""

# Level 3: Remediation
if [ "$LEVEL" = "3" ] && [ "${ENABLE_AUTO_REMEDIATION}" = "true" ]; then
  log "Level 3: Attempting app container restart"
  if [ -n "$APP_CONTAINER" ]; then
    docker restart "$APP_CONTAINER" --time 30
    sleep 10

    # Check if it came back
    if curl -sf --max-time 5 http://localhost:3000/api/health/live > /dev/null 2>&1; then
      log "App recovered after restart"
    else
      log "App still down after restart — restarting all services"
      cd /opt/crm && docker compose -f docker-compose.production.yml restart 2>/dev/null
      log "All services restarted"
    fi
  else
    log "No app container found — starting all services"
    cd /opt/crm && docker compose -f docker-compose.production.yml up -d 2>/dev/null
    log "All services started"
  fi
fi

release_lock
log "app-down playbook completed"
