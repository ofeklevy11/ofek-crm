#!/usr/bin/env bash
# Common functions for remediation playbooks

LOCKDIR="/tmp/playbook-locks"
COOLDOWN_SECONDS=600 # 10 minutes
LOG_FILE="/tmp/playbook-audit.log"

mkdir -p "$LOCKDIR"

timestamp() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

log() {
  local msg="$1"
  echo "[$(timestamp)] [${ALERT_NAME:-unknown}] $msg" | tee -a "$LOG_FILE"
}

# Check if playbook is already running or in cooldown
check_lock() {
  local lockfile="$LOCKDIR/${ALERT_NAME:-unknown}.lock"
  if [ -f "$lockfile" ]; then
    local lock_time
    lock_time=$(cat "$lockfile" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    local diff=$((now - lock_time))
    if [ "$diff" -lt "$COOLDOWN_SECONDS" ]; then
      log "Skipping — cooldown active (${diff}s / ${COOLDOWN_SECONDS}s)"
      exit 0
    fi
  fi
  date +%s > "$lockfile"
}

release_lock() {
  rm -f "$LOCKDIR/${ALERT_NAME:-unknown}.lock"
}

# Collect basic diagnostic info
collect_diagnostics() {
  echo "=== System Diagnostics ==="
  echo "--- Top Processes (CPU) ---"
  top -bn1 | head -15 2>/dev/null || ps aux --sort=-%cpu | head -10
  echo ""
  echo "--- Memory ---"
  free -h 2>/dev/null || cat /proc/meminfo | head -5
  echo ""
  echo "--- Disk ---"
  df -h / 2>/dev/null
  echo ""
  echo "--- Docker Containers ---"
  docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Size}}" 2>/dev/null || echo "Docker not available"
  echo ""
}
