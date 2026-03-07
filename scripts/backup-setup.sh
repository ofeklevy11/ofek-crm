#!/bin/bash
# ============================================
# One-time VPS setup for CRM backup system
# Run as root: sudo bash /opt/crm/scripts/backup-setup.sh
# ============================================

set -euo pipefail

CRM_DIR="/opt/crm"
BACKUP_DIR="/opt/crm-backups"
LOG_DIR="/var/log/crm-backup"
PROM_DIR="/var/lib/node-exporter/textfile"
KEY_DIR="/root/backup-keys"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; }

# ── Preflight checks ──

if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root"
    exit 1
fi

if [[ ! -d "$CRM_DIR" ]]; then
    error "/opt/crm does not exist"
    exit 1
fi

info "Starting CRM backup system setup..."

# ── Step 1: Install age ──

if command -v age &>/dev/null; then
    info "age already installed: $(age --version)"
else
    info "Installing age v1.2.1..."
    AGE_URL="https://dl.filippo.io/age/v1.2.1?for=linux/amd64"
    cd /tmp
    curl -fsSL "$AGE_URL" -o age.tar.gz
    tar -xzf age.tar.gz
    mv age/age age/age-keygen /usr/local/bin/
    rm -rf age age.tar.gz
    chmod +x /usr/local/bin/age /usr/local/bin/age-keygen
    info "age installed: $(age --version)"
fi

# ── Step 2: Install rclone ──

if command -v rclone &>/dev/null; then
    info "rclone already installed: $(rclone version | head -1)"
else
    info "Installing rclone..."
    curl -fsSL https://rclone.org/install.sh | bash
    info "rclone installed: $(rclone version | head -1)"
fi

# ── Step 3: Install jq ──

if command -v jq &>/dev/null; then
    info "jq already installed: $(jq --version)"
else
    info "Installing jq..."
    apt-get update -qq && apt-get install -y -qq jq
    info "jq installed: $(jq --version)"
fi

# ── Step 4: Generate age keypair ──

mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

if [[ -f "${KEY_DIR}/age-key.txt" ]]; then
    warn "Age key already exists at ${KEY_DIR}/age-key.txt"
    AGE_PUBLIC_KEY=$(grep "public key:" "${KEY_DIR}/age-key.txt" | awk '{print $NF}')
else
    info "Generating age keypair..."
    age-keygen -o "${KEY_DIR}/age-key.txt" 2>&1 | tee /tmp/age-keygen-output.txt
    chmod 600 "${KEY_DIR}/age-key.txt"
    AGE_PUBLIC_KEY=$(grep "public key:" /tmp/age-keygen-output.txt | awk '{print $NF}')
    rm -f /tmp/age-keygen-output.txt
    info "Age keypair generated."
fi

echo ""
echo -e "${GREEN}Age public key: ${AGE_PUBLIC_KEY}${NC}"
echo -e "${YELLOW}IMPORTANT: Save this public key! It's needed for backup.env.${NC}"
echo -e "${YELLOW}The secret key is at: ${KEY_DIR}/age-key.txt${NC}"
echo ""

# ── Step 5: Create directories ──

info "Creating directories..."
mkdir -p "$BACKUP_DIR" "${BACKUP_DIR}/checksums" "$LOG_DIR" "$PROM_DIR"
chmod 700 "$BACKUP_DIR"
chmod 755 "$LOG_DIR" "$PROM_DIR"

# ── Step 6: Create backup.env template ──

if [[ -f "${CRM_DIR}/backup.env" ]]; then
    warn "backup.env already exists, not overwriting"
else
    info "Creating backup.env template..."
    cat > "${CRM_DIR}/backup.env" << EOF
# CRM Backup Configuration
# Fill in these values after running rclone config and creating a B2 bucket.

# Backblaze B2 (rclone remote name and bucket)
RCLONE_B2_REMOTE=b2
RCLONE_B2_BUCKET=bizlycrm-backups

# Age encryption public key
AGE_PUBLIC_KEY=${AGE_PUBLIC_KEY}

# Telegram (reuse from monitoring stack)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Age secret key path (for restore tests)
AGE_KEY_FILE=${KEY_DIR}/age-key.txt
EOF
    chmod 600 "${CRM_DIR}/backup.env"
    info "Created ${CRM_DIR}/backup.env — fill in TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID"
fi

# ── Step 7: Rclone B2 configuration instructions ──

echo ""
echo "════════════════════════════════════════════════════"
echo "  Backblaze B2 Setup"
echo "════════════════════════════════════════════════════"
echo ""
echo "1. Create a Backblaze B2 account at https://www.backblaze.com/b2"
echo "2. Create a bucket named 'bizlycrm-backups' (or your preferred name)"
echo "   - Set it to Private"
echo "   - Enable Object Lock if you want immutable backups"
echo "3. Create an Application Key with read/write access to the bucket"
echo "4. Run: rclone config"
echo "   - New remote → name: b2"
echo "   - Type: Backblaze B2 (option 6 or search)"
echo "   - Enter your Application Key ID and Application Key"
echo "   - Leave other options as default"
echo "5. Test: rclone lsd b2:"
echo "6. Update RCLONE_B2_BUCKET in ${CRM_DIR}/backup.env if you used a different name"
echo ""
read -p "Press Enter when B2 is configured (or Ctrl+C to configure later)..."

# ── Step 8: Install systemd units ──

info "Installing systemd service and timer units..."

# -- crm-backup (every 12h) --
cat > /etc/systemd/system/crm-backup.service << 'EOF'
[Unit]
Description=CRM Full Backup (PostgreSQL + Redis + Configs)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/opt/crm/scripts/backup-full.sh
User=root
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
StandardOutput=journal
StandardError=journal
TimeoutStartSec=900
EOF

cat > /etc/systemd/system/crm-backup.timer << 'EOF'
[Unit]
Description=CRM PostgreSQL Backup Timer (every 12h)

[Timer]
OnCalendar=*-*-* 02:00:00
OnCalendar=*-*-* 14:00:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF

# -- crm-backup-retention (daily) --
cat > /etc/systemd/system/crm-backup-retention.service << 'EOF'
[Unit]
Description=CRM Backup Retention Cleanup
After=docker.service

[Service]
Type=oneshot
ExecStart=/opt/crm/scripts/backup-retention.sh
User=root
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
StandardOutput=journal
StandardError=journal
TimeoutStartSec=300
EOF

cat > /etc/systemd/system/crm-backup-retention.timer << 'EOF'
[Unit]
Description=CRM Backup Retention Cleanup Timer (daily)

[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

# -- crm-restore-test (weekly Sunday) --
cat > /etc/systemd/system/crm-restore-test.service << 'EOF'
[Unit]
Description=CRM Backup Restore Verification
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/opt/crm/scripts/backup-restore-test.sh
User=root
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
StandardOutput=journal
StandardError=journal
TimeoutStartSec=900
EOF

cat > /etc/systemd/system/crm-restore-test.timer << 'EOF'
[Unit]
Description=CRM Backup Restore Test Timer (weekly Sunday)

[Timer]
OnCalendar=Sun *-*-* 05:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

# ── Step 9: Install logrotate config ──

info "Installing logrotate config..."
cat > /etc/logrotate.d/crm-backup << 'EOF'
/var/log/crm-backup/*.log {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
}
EOF

# ── Step 10: Remove old crontab entry ──

echo ""
warn "If you have an old crontab entry for backup-postgres.sh, remove it:"
echo "  crontab -e"
echo "  # Remove the line: 0 2 * * * /opt/crm/scripts/backup-postgres.sh ..."
echo ""

# ── Step 11: Make scripts executable ──

info "Making scripts executable..."
chmod +x "${CRM_DIR}/scripts/backup-common.sh"
chmod +x "${CRM_DIR}/scripts/backup-postgres.sh"
chmod +x "${CRM_DIR}/scripts/backup-redis.sh"
chmod +x "${CRM_DIR}/scripts/backup-configs.sh"
chmod +x "${CRM_DIR}/scripts/backup-full.sh"
chmod +x "${CRM_DIR}/scripts/backup-retention.sh"
chmod +x "${CRM_DIR}/scripts/backup-restore-test.sh"

# ── Step 12: Enable and start timers ──

info "Enabling systemd timers..."
systemctl daemon-reload
systemctl enable --now crm-backup.timer
systemctl enable --now crm-backup-retention.timer
systemctl enable --now crm-restore-test.timer

info "Timer status:"
systemctl list-timers --all | grep crm || true

# ── Step 13: Test backup ──

echo ""
echo "════════════════════════════════════════════════════"
echo "  Setup Complete!"
echo "════════════════════════════════════════════════════"
echo ""

read -p "Run a test backup now? (y/N) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    info "Running test backup..."
    "${CRM_DIR}/scripts/backup-full.sh"
    info "Test backup complete! Check Telegram for the notification."
else
    info "Skipping test backup. Run manually with:"
    echo "  /opt/crm/scripts/backup-full.sh"
fi

echo ""
info "Setup complete. Summary:"
echo "  - Full backups (PG + Redis + Configs): Every 12h (02:00, 14:00)"
echo "  - Retention cleanup: Daily at 04:00"
echo "  - Restore tests: Sundays at 05:00"
echo "  - Logs: ${LOG_DIR}/backup.log + journalctl -u crm-backup"
echo "  - Config: ${CRM_DIR}/backup.env"
echo "  - Age key: ${KEY_DIR}/age-key.txt"
echo ""
echo "  Next steps:"
echo "  1. Fill in TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in backup.env"
echo "  2. Verify rclone can reach B2: rclone lsd b2:"
echo "  3. Wait for first automated backup or run manually"
