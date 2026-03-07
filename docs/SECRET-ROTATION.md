# Secret Rotation Guide

## Quick Reference

| Secret | Where Used | Rotation Impact | Cadence |
|--------|-----------|-----------------|---------|
| `SESSION_SECRET` | Cookie signing (`lib/auth/`) | **Logs out all users** | Every 6 months or on compromise |
| `DATABASE_URL` (password) | PostgreSQL connection | App restart required | Every 6 months or on compromise |
| `REDIS_PASSWORD` | Redis connection | App + monitoring restart | Every 6 months or on compromise |
| `CRON_SECRET` | Cron job auth (`/api/cron/*`) | Update Prometheus config too | Every 6 months or on compromise |
| `UPLOADTHING_TOKEN` | File uploads | Regenerate in UploadThing dashboard | On compromise only |
| `OPENROUTER_API_KEY` | AI features | Regenerate in OpenRouter dashboard | On compromise only |
| `PDFMONKEY_API_KEY` | PDF generation | Regenerate in PDFMonkey dashboard | On compromise only |
| `RESEND_API_KEY` | Email sending | Regenerate in Resend dashboard | On compromise only |
| `WHATSAPP_APP_SECRET` | WhatsApp OAuth | Regenerate in Meta dashboard | On compromise only |
| `WHATSAPP_TOKEN_ENCRYPTION_KEY` | Encrypts stored WhatsApp tokens | **Requires DB re-encryption** | On compromise only |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp API calls | Regenerate in Meta dashboard | On compromise only |
| `INNGEST_EVENT_KEY` | Background job events | Regenerate in Inngest dashboard | On compromise only |
| `INNGEST_SIGNING_KEY` | Inngest webhook signing | Regenerate in Inngest dashboard | On compromise only |
| `WEBHOOK_SECRET` | Alertmanager -> webhook auth | Update both alertmanager.yml and .env | On compromise only |
| `TELEGRAM_BOT_TOKEN` | Alert notifications | Regenerate via BotFather | On compromise only |
| `GF_SECURITY_ADMIN_PASSWORD` | Grafana admin login | Change in Grafana UI + .env | Every 6 months or on compromise |

## Rotation Procedures

### Standard Secret (most secrets)

1. Generate new value: `openssl rand -hex 32`
2. SSH into VPS: `ssh deploy@46.225.53.137`
3. Edit env file: `nano /opt/crm/.env.production`
4. Replace the old value with the new one
5. Restart the relevant service:
   ```bash
   cd /opt/crm
   COMPOSE="docker compose --env-file .env.production -f docker-compose.production.yml"
   # For app secrets:
   SLOT=$(cat /opt/crm/active-slot)
   $COMPOSE --profile $SLOT restart app-$SLOT
   # For monitoring secrets:
   docker compose --env-file .env.production -f docker-compose.monitoring.yml up -d
   ```
6. Verify the service is healthy

### SESSION_SECRET (special)

**Impact:** All active user sessions are invalidated. Every user must log in again.

1. Generate new value: `openssl rand -hex 32`
2. Plan for a low-traffic window
3. Update `/opt/crm/.env.production`
4. Restart the app (blue/green deploy or manual restart)
5. Verify login works

### WHATSAPP_TOKEN_ENCRYPTION_KEY (special)

**Impact:** All stored WhatsApp tokens become undecryptable. Users must re-authenticate WhatsApp.

1. Generate new key: `openssl rand -hex 32`
2. **Option A (simple):** Update the key, clear encrypted tokens from DB, ask users to re-authenticate
3. **Option B (zero-downtime):** Write a migration script to decrypt with old key and re-encrypt with new key
4. Update `/opt/crm/.env.production`
5. Restart the app

### CRON_SECRET (special)

Must be updated in **two places**:
1. `/opt/crm/.env.production` — used by the app and Prometheus
2. Prometheus picks it up automatically from the environment variable

After updating, restart both the app and the monitoring stack.

### DATABASE_URL / POSTGRES_PASSWORD (special)

1. Connect to PostgreSQL and change the password:
   ```bash
   COMPOSE="docker compose --env-file .env.production -f docker-compose.production.yml"
   $COMPOSE exec postgres psql -U crm_user -d ofek_crm -c "ALTER USER crm_user PASSWORD 'new_password';"
   ```
2. Update `POSTGRES_PASSWORD` in `/opt/crm/.env.production`
3. `DATABASE_URL` is constructed from `POSTGRES_PASSWORD` in docker-compose, so it updates automatically
4. Restart the app

## Rotation Schedule

All secrets with a **6-month cadence** should be rotated on a fixed quarterly schedule:
- **Q1** (January), **Q2** (April), **Q3** (July), **Q4** (October)

Track last rotation dates in `.env.production` using these comment fields:

```bash
# SECRET_ROTATION_TRACKER (update after each rotation)
# SESSION_SECRET_ROTATED_AT=2026-01-01
# POSTGRES_PASSWORD_ROTATED_AT=2026-01-01
# REDIS_PASSWORD_ROTATED_AT=2026-01-01
# CRON_SECRET_ROTATED_AT=2026-01-01
# GF_SECURITY_ADMIN_PASSWORD_ROTATED_AT=2026-01-01
# WEBHOOK_SECRET_ROTATED_AT=2026-01-01
```

An alert fires if no rotation has occurred in 90 days (see `BackupSecretRotationStale` in alert-rules.yml).

## Post-Rotation Checklist

- [ ] New secret is saved in `.env.production` on VPS
- [ ] File permissions are still `600`: `stat -c '%a' /opt/crm/.env.production`
- [ ] Relevant services restarted and healthy
- [ ] Application responds to health check: `curl -sf http://localhost:3000/api/health/ready`
- [ ] No errors in logs: `docker compose -f docker-compose.production.yml logs --tail=50 app-$(cat /opt/crm/active-slot)`
- [ ] Old secret value deleted from any temporary files/notes

## When a Team Member Leaves

1. Rotate **all** secrets that the team member had access to
2. Revoke their VPS SSH access: remove their key from `~/.ssh/authorized_keys`
3. Change the Grafana admin password
4. Review and revoke any personal API keys they may have created in third-party services
