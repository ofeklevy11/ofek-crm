#!/bin/bash
set -euo pipefail

# ============================================
# PostgreSQL Backup Script
# Add to crontab: 0 2 * * * /opt/crm/scripts/backup-postgres.sh >> /var/log/crm-backup.log 2>&1
# ============================================

BACKUP_DIR="/opt/crm-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMPOSE_FILE="/opt/crm/docker-compose.production.yml"
ENV_FILE="/opt/crm/.env.production"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "[$(date)] Starting PostgreSQL backup..."

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-crm_user}" -d "${POSTGRES_DB:-ofek_crm}" --format=custom \
    > "${BACKUP_DIR}/crm_${TIMESTAMP}.dump"

# Validate backup is not empty
BACKUP_FILE="${BACKUP_DIR}/crm_${TIMESTAMP}.dump"
if [ ! -s "$BACKUP_FILE" ]; then
    echo "[$(date)] ERROR: Backup file is empty! Removing."
    rm -f "$BACKUP_FILE"
    exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup created: crm_${TIMESTAMP}.dump (${BACKUP_SIZE})"

# Keep last 30 daily backups
echo "[$(date)] Cleaning old backups..."
find "$BACKUP_DIR" -name "crm_*.dump" -mtime +30 -delete

echo "[$(date)] Backup complete."
