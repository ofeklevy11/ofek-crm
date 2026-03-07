# CRM Backup System

Automated full-snapshot backup pipeline: PostgreSQL + Redis + config files, with encryption, off-site storage (Backblaze B2), restore verification, and Telegram alerts.

## Architecture

```
backup-full.sh (orchestrator, shared BACKUP_TIMESTAMP)
├── backup-postgres.sh   pg_dump -> SHA-256 -> age encrypt -> B2 upload
├── backup-redis.sh      BGSAVE -> copy RDB -> SHA-256 -> age encrypt -> B2 upload
└── backup-configs.sh    tar.gz configs -> SHA-256 -> age encrypt -> B2 upload
                                                            |
                                               Telegram summary notification
                                               Prometheus metrics
```

Each sub-script can also run standalone (generates its own timestamp if `BACKUP_TIMESTAMP` is not set).

- **Schedule**: Every 12h (02:00, 14:00) via systemd timers
- **Retention cleanup**: Daily at 04:00
- **Restore verification**: Sundays at 05:00
- **Encryption**: `age` (public-key, single binary)
- **Off-site storage**: Backblaze B2 via `rclone`

## B2 Storage Layout

```
b2:bizlycrm-backups/
├── postgres/       crm_YYYYMMDD_HHMMSS.dump.age
│   └── checksums/  crm_YYYYMMDD_HHMMSS.dump.sha256
├── redis/          crm_YYYYMMDD_HHMMSS.rdb.age
│   └── checksums/  crm_YYYYMMDD_HHMMSS.rdb.sha256
└── configs/        crm_YYYYMMDD_HHMMSS.configs.tar.gz.age
    └── checksums/  crm_YYYYMMDD_HHMMSS.configs.tar.gz.sha256
```

## Setup

Run once on the VPS as root:

```bash
sudo bash /opt/crm/scripts/backup-setup.sh
```

This installs `age`, `rclone`, `jq`, generates an encryption keypair, creates systemd timers, and walks you through B2 configuration.

## Manual Operations

### Run a full backup (all components)

```bash
sudo /opt/crm/scripts/backup-full.sh
```

### Run individual backups

```bash
sudo /opt/crm/scripts/backup-postgres.sh
sudo /opt/crm/scripts/backup-redis.sh
sudo /opt/crm/scripts/backup-configs.sh
```

### Run retention cleanup

```bash
sudo /opt/crm/scripts/backup-retention.sh
```

### Run a restore test

```bash
sudo /opt/crm/scripts/backup-restore-test.sh
```

### Check logs

```bash
# Systemd journal
journalctl -u crm-backup --since "1 hour ago"
journalctl -u crm-backup-retention --since today
journalctl -u crm-restore-test --since "7 days ago"

# Structured log file
tail -20 /var/log/crm-backup/backup.log | jq .

# Timer status
systemctl list-timers --all | grep crm
```

## Emergency Restore

### PostgreSQL

```bash
# 1. Find the latest backup
ls -lt /opt/crm-backups/crm_*.dump.age | head -5

# Or list B2 backups:
rclone ls b2:bizlycrm-backups/postgres/ | tail -5

# 2. Download from B2 if needed
rclone copy b2:bizlycrm-backups/postgres/crm_YYYYMMDD_HHMMSS.dump.age /tmp/

# 3. Decrypt
age -d -i /root/backup-keys/age-key.txt -o /tmp/restore.dump /opt/crm-backups/crm_YYYYMMDD_HHMMSS.dump.age

# 4. Verify checksum (optional but recommended)
sha256sum /tmp/restore.dump
cat /opt/crm-backups/checksums/crm_YYYYMMDD_HHMMSS.dump.sha256

# 5. Stop the app (keep Postgres running)
docker compose -f /opt/crm/docker-compose.production.yml --env-file /opt/crm/.env.production stop app

# 6. Restore (drops and recreates all objects)
docker compose -f /opt/crm/docker-compose.production.yml --env-file /opt/crm/.env.production exec -T postgres \
    pg_restore -U crm_user -d ofek_crm --clean --if-exists --no-owner --no-acl < /tmp/restore.dump

# 7. Restart the app
docker compose -f /opt/crm/docker-compose.production.yml --env-file /opt/crm/.env.production start app

# 8. Clean up
rm /tmp/restore.dump
```

### Redis

```bash
# 1. Find the latest backup
ls -lt /opt/crm-backups/crm_*.rdb.age | head -5
# Or: rclone ls b2:bizlycrm-backups/redis/ | tail -5

# 2. Download from B2 if needed
rclone copy b2:bizlycrm-backups/redis/crm_YYYYMMDD_HHMMSS.rdb.age /tmp/

# 3. Decrypt
age -d -i /root/backup-keys/age-key.txt -o /tmp/restore.rdb crm_YYYYMMDD_HHMMSS.rdb.age

# 4. Stop Redis, replace dump.rdb, restart
docker compose -f /opt/crm/docker-compose.production.yml --env-file /opt/crm/.env.production stop redis
docker compose -f /opt/crm/docker-compose.production.yml --env-file /opt/crm/.env.production cp /tmp/restore.rdb redis:/data/dump.rdb
docker compose -f /opt/crm/docker-compose.production.yml --env-file /opt/crm/.env.production start redis

# 5. Clean up
rm /tmp/restore.rdb
```

### Config Files

```bash
# 1. Find the latest backup
ls -lt /opt/crm-backups/crm_*.configs.tar.gz.age | head -5
# Or: rclone ls b2:bizlycrm-backups/configs/ | tail -5

# 2. Download from B2 if needed
rclone copy b2:bizlycrm-backups/configs/crm_YYYYMMDD_HHMMSS.configs.tar.gz.age /tmp/

# 3. Decrypt
age -d -i /root/backup-keys/age-key.txt -o /tmp/configs.tar.gz crm_YYYYMMDD_HHMMSS.configs.tar.gz.age

# 4. Inspect contents before restoring
tar -tzf /tmp/configs.tar.gz

# 5. Restore (overwrites existing files — absolute paths preserved)
tar -xzf /tmp/configs.tar.gz -P

# 6. Clean up
rm /tmp/configs.tar.gz
```

## Retention Policy

| Period | Kept | Frequency |
|--------|------|-----------|
| 0-7 days | All | Every 12h (~14 files) |
| 8-28 days | 1/day | Daily (~21 files) |
| 29-90 days | 1/week | Weekly (~8 files) |
| 91+ days | 1/month | Monthly |

Applied separately to each backup type (postgres, redis, configs).
Local storage: Only 7 days of encrypted `.age` files.

## Credential Rotation

### Rotate age encryption keys

```bash
# Generate new keypair
age-keygen -o /root/backup-keys/age-key-new.txt

# Update AGE_PUBLIC_KEY in /opt/crm/backup.env with the new public key
# Keep the old key to decrypt old backups

# After verifying new backups work, archive old key:
mv /root/backup-keys/age-key.txt /root/backup-keys/age-key-old-$(date +%Y%m%d).txt
mv /root/backup-keys/age-key-new.txt /root/backup-keys/age-key.txt
```

### Rotate B2 credentials

```bash
# Create a new Application Key in B2 console
# Then update rclone config:
rclone config update b2 key <new-key>
# Test: rclone lsd b2:
```

## Configuration

All settings are in `/opt/crm/backup.env`:

| Variable | Description |
|----------|-------------|
| `RCLONE_B2_REMOTE` | rclone remote name (default: `b2`) |
| `RCLONE_B2_BUCKET` | B2 bucket name |
| `AGE_PUBLIC_KEY` | age encryption public key |
| `AGE_KEY_FILE` | Path to age secret key (for restore tests) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Telegram chat ID |

## Monitoring

- **Prometheus metrics** (via node-exporter textfile collector):
  - `crm_backup_last_success_timestamp` - epoch of last successful Postgres backup
  - `crm_backup_last_size_bytes` - size of last Postgres backup
  - `crm_backup_duration_seconds` - duration of last Postgres backup
  - `crm_backup_redis_last_success_timestamp` - epoch of last successful Redis backup
  - `crm_backup_redis_last_size_bytes` - size of last Redis backup
  - `crm_backup_redis_duration_seconds` - duration of last Redis backup
  - `crm_backup_configs_last_success_timestamp` - epoch of last successful config backup
  - `crm_backup_configs_last_size_bytes` - size of last config backup
  - `crm_backup_full_last_success_timestamp` - epoch of last successful full backup
  - `crm_restore_test_last_success_timestamp` - epoch of last successful restore test
- **Alerts**:
  - `BackupStale` (critical) - no backup in 14 hours
  - `BackupRestoreTestStale` (warning) - no restore test in 10 days

## Troubleshooting

**Backup fails with "deps_missing"**: Run `backup-setup.sh` to install missing tools.

**"backup.env not found"**: Create it from the template or re-run `backup-setup.sh`.

**B2 upload fails**: Check `rclone lsd b2:` to verify B2 connectivity. Check credentials in `rclone config show`.

**Restore test fails "container_not_ready"**: Docker may be overloaded. Check `docker ps` and system resources.

**No Telegram notifications**: Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `backup.env`. Test with: `curl -s "https://api.telegram.org/bot<TOKEN>/sendMessage" -d chat_id=<CHAT_ID> -d text=test`

**Timer not firing**: Check `systemctl status crm-backup.timer` and `journalctl -u crm-backup.timer`.

**Redis BGSAVE timeout**: Check Redis memory usage with `docker compose exec redis redis-cli INFO memory`. Large datasets may need longer timeout.
