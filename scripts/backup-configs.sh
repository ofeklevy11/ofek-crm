#!/bin/bash
# ============================================
# Config Files Backup Pipeline
# Tars config files, checksums, encrypts, uploads to B2
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
TAR_FILE="${BACKUP_DIR}/crm_${TIMESTAMP}.configs.tar.gz"
CHECKSUM_FILE="${CHECKSUM_DIR}/crm_${TIMESTAMP}.configs.tar.gz.sha256"
ENCRYPTED_FILE="${BACKUP_DIR}/crm_${TIMESTAMP}.configs.tar.gz.age"
TEMP_FILES="${TAR_FILE}"

START_TIME=$(date +%s)
log_json "info" "configs_backup_start" "Starting config files backup" "timestamp=${TIMESTAMP}"

# ── Step 1: Collect config files ──

CURRENT_STEP="collect_configs"

CONFIG_PATHS=(
    /opt/crm/.env.production
    /opt/crm/backup.env
    /etc/nginx/sites-available/crm
    /etc/nginx/conf.d/crm-upstream.conf
    /root/.config/rclone/rclone.conf
)

# Systemd units (glob patterns)
SYSTEMD_PATTERNS=(
    "/etc/systemd/system/crm-backup.*"
    "/etc/systemd/system/crm-backup-retention.*"
    "/etc/systemd/system/crm-restore-test.*"
)

FOUND_FILES=()

for path in "${CONFIG_PATHS[@]}"; do
    if [[ -f "$path" ]]; then
        FOUND_FILES+=("$path")
        log_json "info" "config_found" "Including: ${path}"
    else
        log_json "warn" "config_missing" "Skipping missing file: ${path}"
    fi
done

for pattern in "${SYSTEMD_PATTERNS[@]}"; do
    for file in $pattern; do
        if [[ -f "$file" ]]; then
            FOUND_FILES+=("$file")
            log_json "info" "config_found" "Including: ${file}"
        fi
    done
done

if [[ ${#FOUND_FILES[@]} -eq 0 ]]; then
    log_json "error" "no_configs" "No config files found to back up"
    exit 1
fi

log_json "info" "configs_collected" "Found ${#FOUND_FILES[@]} config files"

# ── Step 2: Create tar.gz (preserving absolute paths) ──

CURRENT_STEP="tar_create"
tar -czf "$TAR_FILE" -P "${FOUND_FILES[@]}"

TAR_SIZE=$(stat -c%s "$TAR_FILE" 2>/dev/null || stat -f%z "$TAR_FILE" 2>/dev/null)
TAR_SIZE_HUMAN=$(numfmt --to=iec-i --suffix=B "$TAR_SIZE" 2>/dev/null || echo "${TAR_SIZE} bytes")
log_json "info" "tar_created" "Config archive created: ${TAR_SIZE_HUMAN}" "size_bytes=${TAR_SIZE}"

# ── Step 3: SHA-256 checksum ──

CURRENT_STEP="checksum"
sha256sum "$TAR_FILE" > "$CHECKSUM_FILE"
log_json "info" "checksum_created" "SHA-256 checksum written" "file=${CHECKSUM_FILE}"

# ── Step 4: Encrypt with age ──

CURRENT_STEP="encrypt"
if [[ -z "${AGE_PUBLIC_KEY:-}" ]]; then
    log_json "error" "no_age_key" "AGE_PUBLIC_KEY not set in backup.env"
    exit 1
fi

age -r "$AGE_PUBLIC_KEY" -o "$ENCRYPTED_FILE" "$TAR_FILE"
TEMP_FILES="${TAR_FILE} ${ENCRYPTED_FILE}"

ENC_SIZE=$(stat -c%s "$ENCRYPTED_FILE" 2>/dev/null || stat -f%z "$ENCRYPTED_FILE" 2>/dev/null)
ENC_SIZE_HUMAN=$(numfmt --to=iec-i --suffix=B "$ENC_SIZE" 2>/dev/null || echo "${ENC_SIZE} bytes")
log_json "info" "encrypted" "Encrypted config backup: ${ENC_SIZE_HUMAN}" "size_bytes=${ENC_SIZE}"

# ── Step 5: Upload to B2 ──

CURRENT_STEP="b2_upload"
B2_REMOTE="${RCLONE_B2_REMOTE:-b2}"
B2_BUCKET="${RCLONE_B2_BUCKET:-bizlycrm-backups}"
B2_PATH="${B2_REMOTE}:${B2_BUCKET}/configs"

log_json "info" "upload_start" "Uploading to B2: ${B2_PATH}"

rclone copy "$ENCRYPTED_FILE" "${B2_PATH}/" --progress=false --stats=0
rclone copy "$CHECKSUM_FILE" "${B2_PATH}/checksums/" --progress=false --stats=0

# ── Step 6: Verify upload ──

CURRENT_STEP="b2_verify"
if ! rclone lsjson "${B2_PATH}/crm_${TIMESTAMP}.configs.tar.gz.age" --no-mimetype --no-modtime 2>/dev/null | jq -e 'length > 0' > /dev/null 2>&1; then
    log_json "error" "upload_verify_failed" "Encrypted config archive not found on B2 after upload"
    exit 1
fi
log_json "info" "upload_verified" "Upload verified on B2"

# ── Step 7: Remove unencrypted tar ──

CURRENT_STEP="cleanup_tar"
rm -f "$TAR_FILE"
TEMP_FILES="${ENCRYPTED_FILE}"
log_json "info" "tar_removed" "Unencrypted config archive removed"

# ── Step 8: Write Prometheus metrics ──

CURRENT_STEP="metrics"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

write_prom_metric "crm_backup_configs_last_success_timestamp" "$END_TIME"
write_prom_metric "crm_backup_configs_last_size_bytes" "$ENC_SIZE"

# ── Step 9: Send success notification ──

CURRENT_STEP="notify"
if [[ -z "${BACKUP_QUIET:-}" ]]; then
    send_telegram "V" "Config Backup Complete" "Files: ${#FOUND_FILES[@]}
Size: ${ENC_SIZE_HUMAN}
Duration: ${DURATION}s
File: crm_${TIMESTAMP}.configs.tar.gz.age
Host: $(hostname)"
fi

log_json "info" "configs_backup_complete" "Config backup pipeline finished successfully" \
    "duration=${DURATION}" "size_bytes=${ENC_SIZE}" "files=${#FOUND_FILES[@]}" \
    "file=crm_${TIMESTAMP}.configs.tar.gz.age"

TEMP_FILES=""
exit 0
