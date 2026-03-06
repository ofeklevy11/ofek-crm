#!/bin/bash
# ============================================
# PostgreSQL Backup Pipeline
# Dumps, checksums, encrypts, uploads to B2
# Runs via systemd timer every 12h (02:00, 14:00)
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

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="${BACKUP_DIR}/crm_${TIMESTAMP}.dump"
CHECKSUM_FILE="${CHECKSUM_DIR}/crm_${TIMESTAMP}.dump.sha256"
ENCRYPTED_FILE="${BACKUP_DIR}/crm_${TIMESTAMP}.dump.age"
TEMP_FILES="${DUMP_FILE}"

START_TIME=$(date +%s)
log_json "info" "backup_start" "Starting PostgreSQL backup" "timestamp=${TIMESTAMP}"

# ── Step 1: pg_dump ──

CURRENT_STEP="pg_dump"
log_json "info" "pg_dump_start" "Running pg_dump via docker compose"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-crm_user}" -d "${POSTGRES_DB:-ofek_crm}" --format=custom \
    > "$DUMP_FILE"

# ── Step 2: Validate dump ──

CURRENT_STEP="validate_dump"
DUMP_SIZE=$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE" 2>/dev/null)

if [[ "$DUMP_SIZE" -lt 1024 ]]; then
    log_json "error" "dump_too_small" "Backup file is only ${DUMP_SIZE} bytes" "file=${DUMP_FILE}"
    exit 1
fi

DUMP_SIZE_HUMAN=$(numfmt --to=iec-i --suffix=B "$DUMP_SIZE" 2>/dev/null || echo "${DUMP_SIZE} bytes")
log_json "info" "dump_created" "Dump created: ${DUMP_SIZE_HUMAN}" "size_bytes=${DUMP_SIZE}"

# ── Step 3: SHA-256 checksum ──

CURRENT_STEP="checksum"
sha256sum "$DUMP_FILE" > "$CHECKSUM_FILE"
log_json "info" "checksum_created" "SHA-256 checksum written" "file=${CHECKSUM_FILE}"

# ── Step 4: Encrypt with age ──

CURRENT_STEP="encrypt"
if [[ -z "${AGE_PUBLIC_KEY:-}" ]]; then
    log_json "error" "no_age_key" "AGE_PUBLIC_KEY not set in backup.env"
    exit 1
fi

age -r "$AGE_PUBLIC_KEY" -o "$ENCRYPTED_FILE" "$DUMP_FILE"
TEMP_FILES="${DUMP_FILE} ${ENCRYPTED_FILE}"

ENC_SIZE=$(stat -c%s "$ENCRYPTED_FILE" 2>/dev/null || stat -f%z "$ENCRYPTED_FILE" 2>/dev/null)
ENC_SIZE_HUMAN=$(numfmt --to=iec-i --suffix=B "$ENC_SIZE" 2>/dev/null || echo "${ENC_SIZE} bytes")
log_json "info" "encrypted" "Encrypted backup: ${ENC_SIZE_HUMAN}" "size_bytes=${ENC_SIZE}"

# ── Step 5: Upload to B2 ──

CURRENT_STEP="b2_upload"
B2_REMOTE="${RCLONE_B2_REMOTE:-b2}"
B2_BUCKET="${RCLONE_B2_BUCKET:-bizlycrm-backups}"
B2_PATH="${B2_REMOTE}:${B2_BUCKET}/postgres"

log_json "info" "upload_start" "Uploading to B2: ${B2_PATH}"

rclone copy "$ENCRYPTED_FILE" "${B2_PATH}/" --progress=false --stats=0
rclone copy "$CHECKSUM_FILE" "${B2_PATH}/checksums/" --progress=false --stats=0

# ── Step 6: Verify upload ──

CURRENT_STEP="b2_verify"
if ! rclone lsjson "${B2_PATH}/crm_${TIMESTAMP}.dump.age" --no-mimetype --no-modtime 2>/dev/null | jq -e 'length > 0' > /dev/null 2>&1; then
    log_json "error" "upload_verify_failed" "Encrypted file not found on B2 after upload"
    exit 1
fi
log_json "info" "upload_verified" "Upload verified on B2"

# ── Step 7: Remove unencrypted dump ──

CURRENT_STEP="cleanup_dump"
rm -f "$DUMP_FILE"
TEMP_FILES="${ENCRYPTED_FILE}"
log_json "info" "dump_removed" "Unencrypted dump removed"

# ── Step 8: Write Prometheus metrics ──

CURRENT_STEP="metrics"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

write_prom_metric "crm_backup_last_success_timestamp" "$END_TIME"
write_prom_metric "crm_backup_last_size_bytes" "$ENC_SIZE"
write_prom_metric "crm_backup_duration_seconds" "$DURATION"

# ── Step 9: Send success notification ──

CURRENT_STEP="notify"
send_telegram "V" "Backup Complete" "Size: ${ENC_SIZE_HUMAN}
Duration: ${DURATION}s
File: crm_${TIMESTAMP}.dump.age
B2: ${B2_PATH}/crm_${TIMESTAMP}.dump.age
Host: $(hostname)"

log_json "info" "backup_complete" "Backup pipeline finished successfully" \
    "duration=${DURATION}" "size_bytes=${ENC_SIZE}" "file=crm_${TIMESTAMP}.dump.age"

# Clear temp tracking on success
TEMP_FILES=""
exit 0
