#!/bin/bash
# ============================================
# Backup Retention Cleanup
# Local: 7 days. Remote (B2): tiered retention.
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
B2_PATH="${B2_REMOTE}:${B2_BUCKET}/postgres"

log_json "info" "retention_start" "Starting retention cleanup"

# ── Local retention: delete files older than 7 days ──

CURRENT_STEP="local_retention"
LOCAL_DELETED=0

while IFS= read -r -d '' file; do
    log_json "info" "local_delete" "Removing old local file: $(basename "$file")"
    rm -f "$file"
    ((LOCAL_DELETED++))
done < <(find "$BACKUP_DIR" -maxdepth 1 -name "crm_*.dump.age" -mtime +7 -print0 2>/dev/null)

while IFS= read -r -d '' file; do
    log_json "info" "local_delete" "Removing old local checksum: $(basename "$file")"
    rm -f "$file"
    ((LOCAL_DELETED++))
done < <(find "$CHECKSUM_DIR" -maxdepth 1 -name "crm_*.dump.sha256" -mtime +7 -print0 2>/dev/null)

log_json "info" "local_retention_done" "Local cleanup complete" "deleted=${LOCAL_DELETED}"

# ── Remote retention: tiered cleanup on B2 ──

CURRENT_STEP="remote_retention"

# Get all remote backup files as JSON
REMOTE_JSON=$(rclone lsjson "${B2_PATH}/" --no-mimetype --no-modtime 2>/dev/null || echo "[]")

# Filter only .age files and extract dates
REMOTE_FILES=$(echo "$REMOTE_JSON" | jq -r '
    [.[] | select(.Name | test("^crm_.*\\.dump\\.age$")) |
     {name: .Name, date: (.Name | capture("crm_(?<d>[0-9]{8})_") | .d), size: .Size}]
    | sort_by(.date, .name)
')

TOTAL_REMOTE=$(echo "$REMOTE_FILES" | jq 'length')
log_json "info" "remote_files_listed" "Found ${TOTAL_REMOTE} backup files on B2"

if [[ "$TOTAL_REMOTE" -eq 0 ]]; then
    log_json "info" "retention_complete" "No remote files to process"
    exit 0
fi

NOW_EPOCH=$(date +%s)

# Build the keep set using jq
KEEP_SET=$(echo "$REMOTE_FILES" | jq --argjson now "$NOW_EPOCH" '
    def epoch(datestr):
        (datestr[0:4] | tonumber) as $y |
        (datestr[4:6] | tonumber) as $m |
        (datestr[6:8] | tonumber) as $d |
        # Approximate epoch calculation (good enough for day-level retention)
        (($y - 1970) * 365.25 * 86400 + ($m - 1) * 30.44 * 86400 + ($d - 1) * 86400) | floor;

    def age_days(datestr):
        (($now - epoch(datestr)) / 86400) | floor;

    def week_key(datestr):
        # ISO year-week approximation
        ((epoch(datestr) / 604800) | floor);

    def month_key(datestr):
        datestr[0:6];

    # Categorize each file
    [.[] | . + {age: age_days(.date)}] |

    # Days 0-7: keep all
    [.[] | select(.age <= 7)] as $recent |

    # Days 8-28: keep first per day
    [.[] | select(.age > 7 and .age <= 28)] | group_by(.date) | [.[] | sort_by(.name) | .[0]] | . // [] as $daily |

    # Days 29-90: keep first per week
    [.[] | select(.age > 28 and .age <= 90)] | group_by(week_key(.date)) | [.[] | sort_by(.name) | .[0]] | . // [] as $weekly |

    # Days 91+: keep first per month
    [.[] | select(.age > 90)] | group_by(month_key(.date)) | [.[] | sort_by(.name) | .[0]] | . // [] as $monthly |

    # Combine all keepers
    ($recent + $daily + $weekly + $monthly) | [.[].name] | unique
')

KEEP_COUNT=$(echo "$KEEP_SET" | jq 'length')
log_json "info" "retention_keep_set" "Keeping ${KEEP_COUNT} of ${TOTAL_REMOTE} remote files"

# Find files to delete (not in keep set)
DELETE_SET=$(echo "$REMOTE_FILES" | jq --argjson keep "$KEEP_SET" '
    [.[] | select(.name as $n | $keep | index($n) | not) | .name]
')

DELETE_COUNT=$(echo "$DELETE_SET" | jq 'length')

if [[ "$DELETE_COUNT" -gt 0 ]]; then
    log_json "info" "remote_delete_start" "Deleting ${DELETE_COUNT} remote files"

    echo "$DELETE_SET" | jq -r '.[]' | while read -r filename; do
        log_json "info" "remote_delete" "Deleting from B2: ${filename}"
        rclone deletefile "${B2_PATH}/${filename}" 2>/dev/null || true

        # Also delete corresponding checksum
        local_checksum="${filename%.age}.sha256"
        rclone deletefile "${B2_PATH}/checksums/${local_checksum}" 2>/dev/null || true
    done

    send_telegram "V" "Retention Cleanup" "Local deleted: ${LOCAL_DELETED}
Remote deleted: ${DELETE_COUNT}
Remote kept: ${KEEP_COUNT}
Host: $(hostname)"
fi

log_json "info" "retention_complete" "Retention cleanup finished" \
    "local_deleted=${LOCAL_DELETED}" "remote_deleted=${DELETE_COUNT}" "remote_kept=${KEEP_COUNT}"
