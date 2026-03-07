#!/usr/bin/env bash
# Disk Full remediation playbook
# Level 2: Diagnostic — check disk usage
# Level 3: Remediate — prune Docker, clean old logs/backups

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

LEVEL="${1:-2}"
check_lock

log "Running disk-full playbook at level $LEVEL"

# Level 2: Diagnostic
echo "=== Disk Full Diagnostic ==="
echo "--- Disk Usage ---"
df -h 2>/dev/null
echo ""
echo "--- Largest Directories ---"
du -sh /var/lib/docker/* 2>/dev/null | sort -rh | head -10
echo ""
echo "--- Docker Disk Usage ---"
docker system df 2>/dev/null
echo ""
echo "--- Old Backups ---"
ls -lh /opt/crm-backups/ 2>/dev/null | tail -10
echo ""

# Level 3: Remediation
if [ "$LEVEL" = "3" ] && [ "${ENABLE_AUTO_REMEDIATION}" = "true" ]; then
  log "Level 3: Pruning Docker system"
  docker system prune -f --filter "until=48h" 2>/dev/null
  docker image prune -af --filter "until=168h" 2>/dev/null

  log "Level 3: Removing old backups (>30 days)"
  find /opt/crm-backups/ -name "*.dump" -mtime +30 -delete 2>/dev/null

  log "Level 3: Cleaning old container logs"
  find /var/lib/docker/containers/ -name "*-json.log" -size +50M -exec truncate -s 10M {} \; 2>/dev/null

  log "Disk after cleanup:"
  df -h / 2>/dev/null
fi

release_lock
log "disk-full playbook completed"
