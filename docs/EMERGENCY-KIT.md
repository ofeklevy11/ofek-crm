# CRM Disaster Recovery - Emergency Kit

Save these secrets in your password manager **before** you need them.
Without these, you cannot restore from B2 backups.

---

## Tier 1 - Required for any recovery

| Secret | Where to find it |
|--------|-----------------|
| **Age private key** (`age-key.txt`) | `ssh deploy@VPS 'sudo cat /root/backup-keys/age-key.txt'` |
| **B2 Application Key ID** | Backblaze B2 dashboard > App Keys |
| **B2 Application Key** | Backblaze B2 dashboard > App Keys |
| **B2 Bucket name** | `ofekcrm` |
| **SSH public key** | Local `~/.ssh/id_ed25519.pub` |
| **GitHub deploy key** | Repo Settings > Deploy Keys (or generate new) |

## Tier 2 - Needed if configs backup is missing from B2

| Secret | Where to find it |
|--------|-----------------|
| **Complete `.env.production`** | `ssh deploy@VPS 'cat /opt/crm/.env.production'` |

## Tier 3 - Nice to have

| Item | Purpose |
|------|---------|
| Domain registrar login | Update DNS A records to new IP |
| Hetzner account login | Provision new VPS |
| Telegram bot token + chat ID | Recovery notifications |

---

## DR Kit File

Before running the disaster recovery script, prepare this file on your laptop:

```env
# /tmp/dr-kit.env -- SCP this to the new VPS before running disaster-recovery.sh

# === Required ===
AGE_KEY_FILE=/tmp/age-key.txt
B2_KEY_ID=your-b2-key-id
B2_APP_KEY=your-b2-application-key
B2_BUCKET=ofekcrm
SSH_PUBLIC_KEY="ssh-ed25519 AAAA... user@host"
DOMAIN=bizlycrm.com
MONITORING_DOMAIN=monitoring.bizlycrm.com
ADMIN_EMAIL=admin@bizlycrm.com

# === Code source (pick one) ===
# Option A: Clone from GitHub
GITHUB_REPO=git@github.com:ofeklevy11/ofek-crm.git
GITHUB_DEPLOY_KEY_FILE=/tmp/github_deploy_key

# Option B: SCP code manually (leave GITHUB_REPO empty, script will prompt)

# === Fallback (only if configs backup missing from B2) ===
ENV_PRODUCTION_FILE=/tmp/.env.production
```

---

## Recovery Steps

1. Provision a fresh Ubuntu 24.04 VPS on Hetzner (4GB+ RAM)
2. Update DNS A records for `bizlycrm.com` and `monitoring.bizlycrm.com` to new IP
3. Prepare the DR kit file above on your laptop
4. Copy the age key and DR kit to the new VPS:
   ```bash
   scp /path/to/age-key.txt root@NEW_IP:/tmp/age-key.txt
   scp /path/to/dr-kit.env root@NEW_IP:/tmp/dr-kit.env
   # If using GitHub deploy key:
   scp ~/.ssh/github_deploy_key root@NEW_IP:/tmp/github_deploy_key
   # If configs backup missing from B2:
   scp .env.production root@NEW_IP:/tmp/.env.production
   ```
5. SSH into the new VPS and run:
   ```bash
   ssh root@NEW_IP
   # Get the script onto the server (either from GitHub or SCP)
   curl -fsSL https://raw.githubusercontent.com/ofeklevy11/ofek-crm/main/scripts/disaster-recovery.sh -o /tmp/disaster-recovery.sh
   # Or: scp scripts/disaster-recovery.sh root@NEW_IP:/tmp/disaster-recovery.sh
   chmod +x /tmp/disaster-recovery.sh
   /tmp/disaster-recovery.sh --kit-file /tmp/dr-kit.env
   ```
6. Wait ~20-30 minutes for full recovery
7. Verify at `https://bizlycrm.com`

### Resume after failure

If the script fails mid-way, it can resume from the last completed phase:
```bash
/tmp/disaster-recovery.sh --kit-file /tmp/dr-kit.env --from-phase 8
```

### Skip SSL (for testing without real domain)

```bash
/tmp/disaster-recovery.sh --kit-file /tmp/dr-kit.env --skip-ssl
```

### Dry run (validate kit file only)

```bash
/tmp/disaster-recovery.sh --kit-file /tmp/dr-kit.env --dry-run
```
