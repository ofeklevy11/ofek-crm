#!/bin/bash
# ============================================
# Shared functions for CRM backup scripts
# Source this file: source "$(dirname "$0")/backup-common.sh"
# ============================================

set -euo pipefail

BACKUP_DIR="/opt/crm-backups"
CHECKSUM_DIR="${BACKUP_DIR}/checksums"
LOG_DIR="/var/log/crm-backup"
LOG_FILE="${LOG_DIR}/backup.log"
PROM_DIR="/var/lib/node-exporter/textfile"
PROM_FILE="${PROM_DIR}/crm_backup.prom"
COMPOSE_FILE="/opt/crm/docker-compose.production.yml"
ENV_FILE="/opt/crm/.env.production"
BACKUP_ENV_FILE="/opt/crm/backup.env"

# ── Load environment ──

load_env() {
    if [[ -f "$BACKUP_ENV_FILE" ]]; then
        set -a
        source "$BACKUP_ENV_FILE"
        set +a
    else
        log_json "error" "env_missing" "backup.env not found at ${BACKUP_ENV_FILE}"
        exit 1
    fi

    if [[ -f "$ENV_FILE" ]]; then
        set -a
        source "$ENV_FILE"
        set +a
    fi
}

# ── JSON structured logging ──

log_json() {
    local level="$1" event="$2" message="$3"
    shift 3

    local extras=""
    for kv in "$@"; do
        local key="${kv%%=*}"
        local val="${kv#*=}"
        extras="${extras},\"${key}\":\"${val}\""
    done

    local ts
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local line="{\"ts\":\"${ts}\",\"level\":\"${level}\",\"event\":\"${event}\",\"msg\":\"${message}\"${extras}}"

    echo "$line" >> "$LOG_FILE" 2>/dev/null || true
    echo "$line"
}

# ── Telegram notifications ──

send_telegram() {
    local emoji="$1" title="$2" body="$3"

    if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
        log_json "warn" "telegram_skip" "Telegram credentials not configured"
        return 0
    fi

    local text="${emoji} <b>${title}</b>
${body}"

    local url="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"

    for attempt in 1 2; do
        if curl -s --max-time 10 -X POST "$url" \
            -d chat_id="$TELEGRAM_CHAT_ID" \
            -d parse_mode="HTML" \
            -d text="$text" \
            -d disable_web_page_preview="true" > /dev/null 2>&1; then
            return 0
        fi
        [[ $attempt -eq 1 ]] && sleep 2
    done

    log_json "warn" "telegram_fail" "Failed to send Telegram notification after 2 attempts"
    return 0
}

# ── Prometheus metrics ──

write_prom_metric() {
    local metric_name="$1" value="$2"
    shift 2

    local labels=""
    if [[ $# -gt 0 ]]; then
        labels="{"
        local first=true
        for kv in "$@"; do
            local key="${kv%%=*}"
            local val="${kv#*=}"
            if $first; then
                first=false
            else
                labels="${labels},"
            fi
            labels="${labels}${key}=\"${val}\""
        done
        labels="${labels}}"
    fi

    mkdir -p "$PROM_DIR"

    local tmp_file="${PROM_FILE}.$$"

    # Preserve existing metrics from the prom file (other than the one we're updating)
    if [[ -f "$PROM_FILE" ]]; then
        grep -v "^${metric_name}" "$PROM_FILE" > "$tmp_file" 2>/dev/null || true
    else
        : > "$tmp_file"
    fi

    echo "${metric_name}${labels} ${value}" >> "$tmp_file"
    mv "$tmp_file" "$PROM_FILE"
}

# ── Dependency check ──

check_deps() {
    local missing=()
    for cmd in docker rclone age sha256sum jq; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_json "error" "deps_missing" "Missing dependencies: ${missing[*]}"
        send_telegram "!!!" "Backup Failed" "Missing dependencies: ${missing[*]}"
        exit 1
    fi
}

# ── Error trap handler ──

cleanup_on_error() {
    local exit_code=$?
    local step="${CURRENT_STEP:-unknown}"

    if [[ $exit_code -ne 0 ]]; then
        log_json "error" "script_failed" "Failed at step: ${step}" "exit_code=${exit_code}"
        send_telegram "!!!" "Backup Failed" "Step: ${step}
Exit code: ${exit_code}
Host: $(hostname)
Time: $(date '+%Y-%m-%d %H:%M:%S')"

        # Clean up partial files
        if [[ -n "${TEMP_FILES:-}" ]]; then
            for f in $TEMP_FILES; do
                rm -f "$f" 2>/dev/null || true
            done
        fi
    fi
}

# ── Docker Compose helper ──

docker_compose_exec() {
    local service="$1"; shift
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T "$service" "$@"
}

# Track current step for error reporting
CURRENT_STEP="init"
TEMP_FILES=""
