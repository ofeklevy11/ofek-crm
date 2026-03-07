#!/bin/bash
# ============================================
# Backup Retention Cleanup
# Local: 7 days. Remote (B2): tiered retention.
# Handles postgres, redis, and config backups.
# Runs daily at 04:00 via systemd timer.
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/backup-common.sh"

trap cleanup_on_error EXIT

CURRENT_STEP="load_env"
load_env
check_deps

mkdir -p "$LOG_DIR"

B2_REMOTE="${RCLONE_B2_REMOTE:-b2}"
B2_BUCKET="${RCLONE_B2_BUCKET:-bizlycrm-backups}"

log_json "info" "retention_start" "Starting retention cleanup"

TOTAL_LOCAL_DELETED=0
TOTAL_REMOTE_DELETED=0
TOTAL_REMOTE_KEPT=0

run_retention_for_type() {
    local type_name="$1"      # e.g. "postgres"
    local b2_subpath="$2"     # e.g. "postgres"
    local file_ext="$3"       # e.g. ".dump.age"
    local checksum_ext="$4"   # e.g. ".dump.sha256"
    local file_regex="$5"     # jq regex for .Name matching

    local b2_path="${B2_REMOTE}:${B2_BUCKET}/${b2_subpath}"
    local local_deleted=0

    log_json "info" "retention_type_start" "Processing retention for ${type_name}"

    # ── Local retention: delete files older than 7 days ──

    while IFS= read -r -d '' file; do
        log_json "info" "local_delete" "Removing old local file: $(basename "$file")"
        rm -f "$file"
        ((local_deleted++)) || true
    done < <(find "$BACKUP_DIR" -maxdepth 1 -name "crm_*${file_ext}" -mtime +7 -print0 2>/dev/null)

    while IFS= read -r -d '' file; do
        log_json "info" "local_delete" "Removing old local checksum: $(basename "$file")"
        rm -f "$file"
        ((local_deleted++)) || true
    done < <(find "$CHECKSUM_DIR" -maxdepth 1 -name "crm_*${checksum_ext}" -mtime +7 -print0 2>/dev/null)

    TOTAL_LOCAL_DELETED=$((TOTAL_LOCAL_DELETED + local_deleted))
    log_json "info" "local_retention_done" "${type_name} local cleanup: deleted ${local_deleted}"

    # ── Remote retention: tiered cleanup on B2 ──

    local remote_json
    remote_json=$(rclone lsjson "${b2_path}/" --no-mimetype --no-modtime 2>/dev/null || echo "[]")

    local remote_files
    remote_files=$(echo "$remote_json" | jq -r --arg regex "$file_regex" '
        [.[] | select(.Name | test($regex)) |
         {name: .Name, date: (.Name | capture("crm_(?<d>[0-9]{8})_") | .d), size: .Size}]
        | sort_by(.date, .name)
    ')

    local total_remote
    total_remote=$(echo "$remote_files" | jq 'length')
    log_json "info" "remote_files_listed" "${type_name}: found ${total_remote} files on B2"

    if [[ "$total_remote" -eq 0 ]]; then
        return 0
    fi

    local now_epoch
    now_epoch=$(date +%s)

    local keep_set
    keep_set=$(echo "$remote_files" | jq --argjson now "$now_epoch" '
        def epoch(datestr):
            (datestr[0:4] | tonumber) as $y |
            (datestr[4:6] | tonumber) as $m |
            (datestr[6:8] | tonumber) as $d |
            (($y - 1970) * 365.25 * 86400 + ($m - 1) * 30.44 * 86400 + ($d - 1) * 86400) | floor;

        def age_days(datestr):
            (($now - epoch(datestr)) / 86400) | floor;

        def week_key(datestr):
            ((epoch(datestr) / 604800) | floor);

        def month_key(datestr):
            datestr[0:6];

        [.[] | . + {age: age_days(.date)}] |

        [.[] | select(.age <= 7)] as $recent |
        [.[] | select(.age > 7 and .age <= 28)] | group_by(.date) | [.[] | sort_by(.name) | .[0]] | . // [] as $daily |
        [.[] | select(.age > 28 and .age <= 90)] | group_by(week_key(.date)) | [.[] | sort_by(.name) | .[0]] | . // [] as $weekly |
        [.[] | select(.age > 90)] | group_by(month_key(.date)) | [.[] | sort_by(.name) | .[0]] | . // [] as $monthly |

        ($recent + $daily + $weekly + $monthly) | [.[].name] | unique
    ')

    local keep_count
    keep_count=$(echo "$keep_set" | jq 'length')
    TOTAL_REMOTE_KEPT=$((TOTAL_REMOTE_KEPT + keep_count))
    log_json "info" "retention_keep_set" "${type_name}: keeping ${keep_count} of ${total_remote} remote files"

    local delete_set
    delete_set=$(echo "$remote_files" | jq --argjson keep "$keep_set" '
        [.[] | select(.name as $n | $keep | index($n) | not) | .name]
    ')

    local delete_count
    delete_count=$(echo "$delete_set" | jq 'length')
    TOTAL_REMOTE_DELETED=$((TOTAL_REMOTE_DELETED + delete_count))

    if [[ "$delete_count" -gt 0 ]]; then
        log_json "info" "remote_delete_start" "${type_name}: deleting ${delete_count} remote files"

        echo "$delete_set" | jq -r '.[]' | while read -r filename; do
            log_json "info" "remote_delete" "Deleting from B2: ${filename}"
            rclone deletefile "${b2_path}/${filename}" 2>/dev/null || true

            # Also delete corresponding checksum
            local base="${filename%${file_ext}}"
            rclone deletefile "${b2_path}/checksums/${base}${checksum_ext}" 2>/dev/null || true
        done
    fi

    log_json "info" "retention_type_done" "${type_name} retention complete" \
        "local_deleted=${local_deleted}" "remote_deleted=${delete_count}" "remote_kept=${keep_count}"
}

# ── Run retention for each backup type ──

run_retention_for_type "postgres" "postgres" ".dump.age" ".dump.sha256" \
    "^crm_.*\\.dump\\.age$"

run_retention_for_type "redis" "redis" ".rdb.age" ".rdb.sha256" \
    "^crm_.*\\.rdb\\.age$"

run_retention_for_type "configs" "configs" ".configs.tar.gz.age" ".configs.tar.gz.sha256" \
    "^crm_.*\\.configs\\.tar\\.gz\\.age$"

# ── Summary ──

if [[ $TOTAL_REMOTE_DELETED -gt 0 || $TOTAL_LOCAL_DELETED -gt 0 ]]; then
    send_telegram "V" "Retention Cleanup" "Local deleted: ${TOTAL_LOCAL_DELETED}
Remote deleted: ${TOTAL_REMOTE_DELETED}
Remote kept: ${TOTAL_REMOTE_KEPT}
Types: postgres, redis, configs
Host: $(hostname)"
fi

log_json "info" "retention_complete" "Retention cleanup finished" \
    "local_deleted=${TOTAL_LOCAL_DELETED}" "remote_deleted=${TOTAL_REMOTE_DELETED}" \
    "remote_kept=${TOTAL_REMOTE_KEPT}"
