#!/bin/bash
# ============================================
# Redis Backup Pipeline
# BGSAVE, copy RDB, checksum, encrypt, upload to B2
# Can run standalone or via backup-full.sh
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/backup-common.sh"

trap cleanup_on_error EXIT

# ── Setup ──

CURRENT_STEP="load_env"
load_env
check_deps

mkdir -p "$BACKUP_DIR" "$CHECKSUM_DIR" "$LOG_DIR"
chmod 700 "$BACKUP_DIR"

TIMESTAMP="${BACKUP_TIMESTAMP:-$(date +%Y%m%d_%H%M%S)}"
RDB_FILE="${BACKUP_DIR}/crm_${TIMESTAMP}.rdb"
CHECKSUM_FILE="${CHECKSUM_DIR}/crm_${TIMESTAMP}.rdb.sha256"
ENCRYPTED_FILE="${BACKUP_DIR}/crm_${TIMESTAMP}.rdb.age"
TEMP_FILES="${RDB_FILE}"

START_TIME=$(date +%s)
log_json "info" "redis_backup_start" "Starting Redis backup" "timestamp=${TIMESTAMP}"

# ── Step 1: Trigger BGSAVE ──

CURRENT_STEP="bgsave"

REDIS_AUTH_ARGS=()
if [[ -n "${REDIS_PASSWORD:-}" ]]; then
    REDIS_AUTH_ARGS=(-a "$REDIS_PASSWORD" --no-auth-warning)
fi

LASTSAVE_BEFORE=$(docker_compose_exec redis redis-cli "${REDIS_AUTH_ARGS[@]}" LASTSAVE | tr -d '[:space:]')
log_json "info" "bgsave_trigger" "Triggering BGSAVE" "lastsave_before=${LASTSAVE_BEFORE}"

docker_compose_exec redis redis-cli "${REDIS_AUTH_ARGS[@]}" BGSAVE > /dev/null

# ── Step 2: Wait for BGSAVE to complete ──

CURRENT_STEP="bgsave_wait"
WAITED=0
MAX_WAIT=60

while [[ $WAITED -lt $MAX_WAIT ]]; do
    LASTSAVE_NOW=$(docker_compose_exec redis redis-cli "${REDIS_AUTH_ARGS[@]}" LASTSAVE | tr -d '[:space:]')
    if [[ "$LASTSAVE_NOW" != "$LASTSAVE_BEFORE" ]]; then
        log_json "info" "bgsave_done" "BGSAVE completed after ${WAITED}s"
        break
    fi
    sleep 1
    ((WAITED++))
done

if [[ $WAITED -ge $MAX_WAIT ]]; then
    log_json "error" "bgsave_timeout" "BGSAVE did not complete within ${MAX_WAIT}s"
    exit 1
fi

# Brief pause to ensure RDB is fully flushed to disk
sleep 1

# ── Step 3: Copy RDB out of container ──

CURRENT_STEP="copy_rdb"
REDIS_VOLUME_PATH="/var/lib/docker/volumes/crm_redis_data/_data"

if [[ -f "${REDIS_VOLUME_PATH}/dump.rdb" ]]; then
    log_json "info" "copy_method" "Copying RDB from host volume path"
    cp "${REDIS_VOLUME_PATH}/dump.rdb" "$RDB_FILE"
else
    log_json "warn" "copy_fallback" "Volume path not found, falling back to docker compose cp"
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" cp redis:/data/dump.rdb "$RDB_FILE"
fi

# Verify copied size matches in-container size
CONTAINER_RDB_SIZE=$(docker_compose_exec redis stat -c%s /data/dump.rdb 2>/dev/null || echo "0")
HOST_RDB_SIZE=$(stat -c%s "$RDB_FILE" 2>/dev/null || echo "0")
if [[ "$HOST_RDB_SIZE" -ne "$CONTAINER_RDB_SIZE" ]]; then
    log_json "error" "rdb_size_mismatch" "Size mismatch: container=${CONTAINER_RDB_SIZE}, copied=${HOST_RDB_SIZE}"
    exit 1
fi

# ── Step 4: Validate RDB ──

CURRENT_STEP="validate_rdb"
RDB_SIZE=$(stat -c%s "$RDB_FILE" 2>/dev/null || stat -f%z "$RDB_FILE" 2>/dev/null)

if [[ "$RDB_SIZE" -lt 100 ]]; then
    log_json "error" "rdb_too_small" "RDB file is only ${RDB_SIZE} bytes" "file=${RDB_FILE}"
    exit 1
fi

RDB_SIZE_HUMAN=$(numfmt --to=iec-i --suffix=B "$RDB_SIZE" 2>/dev/null || echo "${RDB_SIZE} bytes")
log_json "info" "rdb_copied" "RDB copied: ${RDB_SIZE_HUMAN}" "size_bytes=${RDB_SIZE}"

# ── Step 5: SHA-256 checksum ──

CURRENT_STEP="checksum"
sha256sum "$RDB_FILE" > "$CHECKSUM_FILE"
log_json "info" "checksum_created" "SHA-256 checksum written" "file=${CHECKSUM_FILE}"

# ── Step 6: Encrypt with age ──

CURRENT_STEP="encrypt"
if [[ -z "${AGE_PUBLIC_KEY:-}" ]]; then
    log_json "error" "no_age_key" "AGE_PUBLIC_KEY not set in backup.env"
    exit 1
fi

age -r "$AGE_PUBLIC_KEY" -o "$ENCRYPTED_FILE" "$RDB_FILE"
TEMP_FILES="${RDB_FILE} ${ENCRYPTED_FILE}"

ENC_SIZE=$(stat -c%s "$ENCRYPTED_FILE" 2>/dev/null || stat -f%z "$ENCRYPTED_FILE" 2>/dev/null)
ENC_SIZE_HUMAN=$(numfmt --to=iec-i --suffix=B "$ENC_SIZE" 2>/dev/null || echo "${ENC_SIZE} bytes")
log_json "info" "encrypted" "Encrypted Redis backup: ${ENC_SIZE_HUMAN}" "size_bytes=${ENC_SIZE}"

# ── Step 7: Upload to B2 ──

CURRENT_STEP="b2_upload"
B2_REMOTE="${RCLONE_B2_REMOTE:-b2}"
B2_BUCKET="${RCLONE_B2_BUCKET:-bizlycrm-backups}"
B2_PATH="${B2_REMOTE}:${B2_BUCKET}/redis"

log_json "info" "upload_start" "Uploading to B2: ${B2_PATH}"

rclone copy "$ENCRYPTED_FILE" "${B2_PATH}/" --progress=false --stats=0
rclone copy "$CHECKSUM_FILE" "${B2_PATH}/checksums/" --progress=false --stats=0

# ── Step 8: Verify upload ──

CURRENT_STEP="b2_verify"
if ! rclone lsjson "${B2_PATH}/crm_${TIMESTAMP}.rdb.age" --no-mimetype --no-modtime 2>/dev/null | jq -e 'length > 0' > /dev/null 2>&1; then
    log_json "error" "upload_verify_failed" "Encrypted RDB not found on B2 after upload"
    exit 1
fi
log_json "info" "upload_verified" "Upload verified on B2"

# ── Step 9: Remove unencrypted RDB ──

CURRENT_STEP="cleanup_rdb"
rm -f "$RDB_FILE"
TEMP_FILES="${ENCRYPTED_FILE}"
log_json "info" "rdb_removed" "Unencrypted RDB removed"

# ── Step 10: Write Prometheus metrics ──

CURRENT_STEP="metrics"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

write_prom_metric "crm_backup_redis_last_success_timestamp" "$END_TIME"
write_prom_metric "crm_backup_redis_last_size_bytes" "$ENC_SIZE"
write_prom_metric "crm_backup_redis_duration_seconds" "$DURATION"

# ── Step 11: Send success notification ──

CURRENT_STEP="notify"
if [[ -z "${BACKUP_QUIET:-}" ]]; then
    send_telegram "V" "Redis Backup Complete" "Size: ${ENC_SIZE_HUMAN}
Duration: ${DURATION}s
File: crm_${TIMESTAMP}.rdb.age
B2: ${B2_PATH}/crm_${TIMESTAMP}.rdb.age
Host: $(hostname)"
fi

log_json "info" "redis_backup_complete" "Redis backup pipeline finished successfully" \
    "duration=${DURATION}" "size_bytes=${ENC_SIZE}" "file=crm_${TIMESTAMP}.rdb.age"

TEMP_FILES=""
exit 0
