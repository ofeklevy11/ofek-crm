#!/bin/bash
# ============================================
# Automated Restore Verification
# Decrypts latest backup, restores into an
# ephemeral Postgres container, validates data.
# Runs Sunday 05:00 via systemd timer.
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/backup-common.sh"

cleanup_restore_test() {
    # Always stop the test container if it exists
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
    rm -f "$RESTORE_DUMP" 2>/dev/null || true
    cleanup_on_error
}

trap cleanup_restore_test EXIT

CURRENT_STEP="load_env"
load_env
check_deps

mkdir -p "$LOG_DIR"

CONTAINER_NAME="pg-restore-test"
RESTORE_DUMP="/tmp/restore-test.dump"
TEMP_FILES="$RESTORE_DUMP"
AGE_KEY_FILE="${AGE_KEY_FILE:-/root/backup-keys/age-key.txt}"

START_TIME=$(date +%s)
log_json "info" "restore_test_start" "Starting restore verification"

# Ensure no leftover test container
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

# ── Step 1: Find latest encrypted backup ──

CURRENT_STEP="find_backup"

LATEST_AGE=$(find "$BACKUP_DIR" -maxdepth 1 -name "crm_*.dump.age" -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2-)

if [[ -z "$LATEST_AGE" ]]; then
    # Try downloading latest from B2
    B2_REMOTE="${RCLONE_B2_REMOTE:-b2}"
    B2_BUCKET="${RCLONE_B2_BUCKET:-bizlycrm-backups}"
    B2_PATH="${B2_REMOTE}:${B2_BUCKET}/postgres"

    log_json "info" "no_local_backup" "No local .age file found, downloading latest from B2"

    LATEST_REMOTE=$(rclone lsjson "${B2_PATH}/" --no-mimetype 2>/dev/null \
        | jq -r '[.[] | select(.Name | test("^crm_.*\\.dump\\.age$"))] | sort_by(.Name) | last | .Name // empty')

    if [[ -z "$LATEST_REMOTE" ]]; then
        log_json "error" "no_backup_found" "No backup files found locally or on B2"
        exit 1
    fi

    LATEST_AGE="/tmp/${LATEST_REMOTE}"
    TEMP_FILES="${TEMP_FILES} ${LATEST_AGE}"
    rclone copy "${B2_PATH}/${LATEST_REMOTE}" /tmp/
fi

log_json "info" "backup_found" "Using backup: $(basename "$LATEST_AGE")"

# ── Step 2: Decrypt ──

CURRENT_STEP="decrypt"

if [[ ! -f "$AGE_KEY_FILE" ]]; then
    log_json "error" "no_age_key" "Age secret key not found at ${AGE_KEY_FILE}"
    exit 1
fi

age -d -i "$AGE_KEY_FILE" -o "$RESTORE_DUMP" "$LATEST_AGE"
log_json "info" "decrypted" "Backup decrypted successfully"

# ── Step 3: Verify checksum ──

CURRENT_STEP="verify_checksum"

BACKUP_BASENAME=$(basename "$LATEST_AGE" .age)
CHECKSUM_FILE="${CHECKSUM_DIR}/${BACKUP_BASENAME}.sha256"

if [[ -f "$CHECKSUM_FILE" ]]; then
    EXPECTED_HASH=$(awk '{print $1}' "$CHECKSUM_FILE")
    ACTUAL_HASH=$(sha256sum "$RESTORE_DUMP" | awk '{print $1}')

    if [[ "$EXPECTED_HASH" == "$ACTUAL_HASH" ]]; then
        log_json "info" "checksum_ok" "Checksum verified"
    else
        log_json "error" "checksum_mismatch" "Checksum mismatch!" \
            "expected=${EXPECTED_HASH}" "actual=${ACTUAL_HASH}"
        exit 1
    fi
else
    log_json "warn" "checksum_skip" "No checksum file found, skipping verification"
fi

# ── Step 4: Start ephemeral Postgres container ──

CURRENT_STEP="start_container"

docker run --rm -d \
    --name "$CONTAINER_NAME" \
    --network none \
    -e POSTGRES_USER=test \
    -e POSTGRES_PASSWORD=test \
    -e POSTGRES_DB=testdb \
    postgres:15-alpine > /dev/null

log_json "info" "container_started" "Ephemeral Postgres container started"

# Wait for Postgres to be ready
CURRENT_STEP="wait_ready"
RETRIES=0
MAX_RETRIES=30
until docker exec "$CONTAINER_NAME" pg_isready -U test -d testdb > /dev/null 2>&1; do
    ((RETRIES++))
    if [[ $RETRIES -ge $MAX_RETRIES ]]; then
        log_json "error" "container_not_ready" "Postgres not ready after ${MAX_RETRIES}s"
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

log_json "info" "container_ready" "Postgres ready after ${RETRIES}s"

# ── Step 5: Restore dump ──

CURRENT_STEP="pg_restore"

docker exec -i "$CONTAINER_NAME" pg_restore -U test -d testdb --no-owner --no-acl < "$RESTORE_DUMP"
log_json "info" "restore_complete" "pg_restore completed"

# ── Step 6: Validate data ──

CURRENT_STEP="validate"

RESULTS=()
PASS_COUNT=0
FAIL_COUNT=0

run_check() {
    local check_name="$1" query="$2" expected_op="$3" expected_val="$4"

    local result
    result=$(docker exec "$CONTAINER_NAME" psql -U test -d testdb -tAc "$query" 2>/dev/null | tr -d '[:space:]')

    local passed=false
    case "$expected_op" in
        "gte") [[ "$result" -ge "$expected_val" ]] && passed=true ;;
        "gt")  [[ "$result" -gt "$expected_val" ]] && passed=true ;;
        "eq")  [[ "$result" -eq "$expected_val" ]] && passed=true ;;
    esac

    if $passed; then
        RESULTS+=("PASS ${check_name}: ${result}")
        ((PASS_COUNT++))
        log_json "info" "check_pass" "${check_name}: ${result}"
    else
        RESULTS+=("FAIL ${check_name}: ${result} (expected ${expected_op} ${expected_val})")
        ((FAIL_COUNT++))
        log_json "error" "check_fail" "${check_name}: ${result} (expected ${expected_op} ${expected_val})"
    fi
}

run_check "table_count" \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" \
    "gte" "40"

run_check "company_rows" \
    "SELECT count(*) FROM \"Company\";" \
    "gt" "0"

run_check "user_rows" \
    "SELECT count(*) FROM \"User\";" \
    "gt" "0"

run_check "prisma_migrations" \
    "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;" \
    "gt" "0"

# ── Step 7: Cleanup ──

CURRENT_STEP="cleanup"
docker stop "$CONTAINER_NAME" 2>/dev/null || true
rm -f "$RESTORE_DUMP"
# Clean up downloaded backup if we got it from B2
if [[ "$LATEST_AGE" == /tmp/* ]]; then
    rm -f "$LATEST_AGE"
fi
TEMP_FILES=""

# ── Step 8: Report results ──

CURRENT_STEP="report"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

RESULT_TEXT=""
for r in "${RESULTS[@]}"; do
    RESULT_TEXT="${RESULT_TEXT}
${r}"
done

if [[ $FAIL_COUNT -eq 0 ]]; then
    write_prom_metric "crm_restore_test_last_success_timestamp" "$END_TIME"

    send_telegram "V" "Restore Test Passed" "All ${PASS_COUNT} checks passed
Duration: ${DURATION}s
Backup: $(basename "$LATEST_AGE")
${RESULT_TEXT}
Host: $(hostname)"

    log_json "info" "restore_test_passed" "All checks passed" \
        "passed=${PASS_COUNT}" "failed=${FAIL_COUNT}" "duration=${DURATION}"
else
    send_telegram "!!!" "Restore Test FAILED" "${FAIL_COUNT} checks failed, ${PASS_COUNT} passed
Duration: ${DURATION}s
Backup: $(basename "$LATEST_AGE")
${RESULT_TEXT}
Host: $(hostname)"

    log_json "error" "restore_test_failed" "${FAIL_COUNT} checks failed" \
        "passed=${PASS_COUNT}" "failed=${FAIL_COUNT}" "duration=${DURATION}"
    exit 1
fi
