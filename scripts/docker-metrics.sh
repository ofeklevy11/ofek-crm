#!/usr/bin/env bash
# Exports Docker container metrics to node-exporter textfile collector.
# Intended to run via cron every 30s.
set -euo pipefail

TEXTFILE_DIR="/var/lib/node-exporter/textfile"
TMP_FILE="${TEXTFILE_DIR}/docker_containers.prom.tmp"
OUT_FILE="${TEXTFILE_DIR}/docker_containers.prom"

mkdir -p "$TEXTFILE_DIR"

{
  echo "# HELP docker_container_running Whether the container is running (1) or not (0)."
  echo "# TYPE docker_container_running gauge"
  echo "# HELP docker_container_start_time_seconds Container start time as Unix timestamp."
  echo "# TYPE docker_container_start_time_seconds gauge"

  docker ps -a --filter "name=crm-" --format '{{.Names}}\t{{.State}}\t{{.CreatedAt}}' | while IFS=$'\t' read -r name state _created; do
    running=0
    [ "$state" = "running" ] && running=1
    echo "docker_container_running{name=\"${name}\"} ${running}"
  done

  docker inspect --format '{{.Name}} {{.State.StartedAt}}' $(docker ps -a --filter "name=crm-" -q) 2>/dev/null | while read -r name started; do
    name="${name#/}"
    ts=$(date -d "$started" +%s 2>/dev/null || echo 0)
    [ "$ts" -gt 0 ] && echo "docker_container_start_time_seconds{name=\"${name}\"} ${ts}"
  done
} > "$TMP_FILE"

mv "$TMP_FILE" "$OUT_FILE"
