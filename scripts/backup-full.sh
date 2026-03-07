#!/bin/bash
# ============================================
# Full Snapshot Backup Orchestrator
# Runs PostgreSQL, Redis, and Config backups
# with a shared timestamp. Each sub-script is
# independent — one failure won't block others.
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/backup-common.sh"

# Do NOT use set -e — we handle failures per-component
set +e

CURRENT_STEP="load_env"
load_env
check_deps

mkdir -p "$LOG_DIR"

# Shared timestamp for all sub-backups
export BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
# Suppress individual Telegram messages — orchestrator sends one summary
export BACKUP_QUIET=1

START_TIME=$(date +%s)
log_json "info" "full_backup_start" "Starting full backup orchestration" "timestamp=${BACKUP_TIMESTAMP}"

SUCCESSES=()
FAILURES=()

run_component() {
    local name="$1" script="$2"

    log_json "info" "component_start" "Starting ${name} backup"
    CURRENT_STEP="${name}"

    if bash "$script"; then
        SUCCESSES+=("$name")
        log_json "info" "component_done" "${name} backup succeeded"
    else
        local exit_code=$?
        FAILURES+=("$name")
        log_json "error" "component_failed" "${name} backup failed" "exit_code=${exit_code}"
    fi
}

# ── Run each component sequentially ──

run_component "PostgreSQL" "${SCRIPT_DIR}/backup-postgres.sh"
run_component "Redis" "${SCRIPT_DIR}/backup-redis.sh"
run_component "Configs" "${SCRIPT_DIR}/backup-configs.sh"

# ── Summary ──

CURRENT_STEP="summary"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

TOTAL=$((${#SUCCESSES[@]} + ${#FAILURES[@]}))
SUCCESS_LIST=$(IFS=', '; echo "${SUCCESSES[*]}")
FAILURE_LIST=$(IFS=', '; echo "${FAILURES[*]}")

if [[ ${#FAILURES[@]} -eq 0 ]]; then
    write_prom_metric "crm_backup_full_last_success_timestamp" "$END_TIME"

    send_telegram "V" "Full Backup Complete" "All ${TOTAL}/3 components succeeded
Timestamp: ${BACKUP_TIMESTAMP}
Components: ${SUCCESS_LIST}
Duration: ${DURATION}s
Host: $(hostname)"

    log_json "info" "full_backup_complete" "Full backup succeeded" \
        "duration=${DURATION}" "successes=${SUCCESS_LIST}"
    exit 0
else
    BODY="Succeeded: ${#SUCCESSES[@]}/3 — ${SUCCESS_LIST:-none}
Failed: ${#FAILURES[@]}/3 — ${FAILURE_LIST}
Timestamp: ${BACKUP_TIMESTAMP}
Duration: ${DURATION}s
Host: $(hostname)"

    send_telegram "!!!" "Full Backup Partial Failure" "$BODY"

    log_json "error" "full_backup_partial" "Full backup had failures" \
        "duration=${DURATION}" "successes=${SUCCESS_LIST:-none}" "failures=${FAILURE_LIST}"
    exit 1
fi
