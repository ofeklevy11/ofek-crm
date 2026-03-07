#!/bin/bash
# ============================================
# CRM Disaster Recovery Bootstrap Script
# Takes a fresh Ubuntu 22.04/24.04 VPS and restores
# the full production environment from B2 backups.
#
# Usage:
#   /tmp/disaster-recovery.sh --kit-file /tmp/dr-kit.env
#   /tmp/disaster-recovery.sh --kit-file /tmp/dr-kit.env --from-phase 8
#   /tmp/disaster-recovery.sh --kit-file /tmp/dr-kit.env --skip-ssl
#   /tmp/disaster-recovery.sh --kit-file /tmp/dr-kit.env --dry-run
#
# Recovery Targets:
#   RTO (Recovery Time Objective): < 4 hours (fresh VPS to full service)
#   RPO (Recovery Point Objective): < 12 hours (backup cadence: every 12h)
# ============================================

set -euo pipefail

# ── Constants ──

CRM_DIR="/opt/crm"
BACKUP_DIR="/opt/crm-backups"
LOG_DIR="/var/log/crm-backup"
PROM_DIR="/var/lib/node-exporter/textfile"
KEY_DIR="/root/backup-keys"
STATE_FILE="/opt/crm/.dr-phase"
RESTORE_TMP="/tmp/dr-restore"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_START=$(date +%s)

# ── Helpers ──

info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; }

phase_header() {
    local num="$1" title="$2"
    echo ""
    echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}  Phase ${num}: ${title}${NC}"
    echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════${NC}"
    echo ""
}

phase_done() {
    local num="$1"
    local elapsed=$(( $(date +%s) - SCRIPT_START ))
    echo "$num" > "$STATE_FILE" 2>/dev/null || true
    info "Phase ${num} complete (${elapsed}s elapsed)"
}

cleanup_on_failure() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        echo ""
        error "Script failed with exit code ${exit_code}"
        error "Resume with: $0 --kit-file $KIT_FILE --from-phase $(cat "$STATE_FILE" 2>/dev/null || echo 0)"
    fi
    rm -rf "$RESTORE_TMP" 2>/dev/null || true
}

trap cleanup_on_failure EXIT

# ── Parse arguments ──

KIT_FILE=""
FROM_PHASE=0
SKIP_SSL=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --kit-file)   KIT_FILE="$2"; shift 2 ;;
        --from-phase) FROM_PHASE="$2"; shift 2 ;;
        --skip-ssl)   SKIP_SSL=true; shift ;;
        --dry-run)    DRY_RUN=true; shift ;;
        -h|--help)
            echo "Usage: $0 --kit-file /tmp/dr-kit.env [--from-phase N] [--skip-ssl] [--dry-run]"
            exit 0
            ;;
        *) error "Unknown argument: $1"; exit 1 ;;
    esac
done

if [[ -z "$KIT_FILE" ]]; then
    error "Missing required --kit-file argument"
    echo "Usage: $0 --kit-file /tmp/dr-kit.env"
    exit 1
fi

# ── Load DR kit ──

if [[ ! -f "$KIT_FILE" ]]; then
    error "DR kit file not found: ${KIT_FILE}"
    exit 1
fi

set -a
source "$KIT_FILE"
set +a

# ══════════════════════════════════════════════════
#  Phase 0: Preflight Validation
# ══════════════════════════════════════════════════

run_phase_0() {
    phase_header 0 "Preflight Validation"

    # Must be root
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root"
        exit 1
    fi

    # Check Ubuntu version
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        if [[ "$ID" != "ubuntu" ]]; then
            error "This script requires Ubuntu (found: ${ID})"
            exit 1
        fi
        info "OS: ${PRETTY_NAME}"
    else
        warn "Cannot detect OS version, proceeding anyway"
    fi

    # Validate required DR kit fields
    local missing=()
    [[ -z "${AGE_KEY_FILE:-}" ]] && missing+=("AGE_KEY_FILE")
    [[ -z "${B2_KEY_ID:-}" ]] && missing+=("B2_KEY_ID")
    [[ -z "${B2_APP_KEY:-}" ]] && missing+=("B2_APP_KEY")
    [[ -z "${B2_BUCKET:-}" ]] && missing+=("B2_BUCKET")
    [[ -z "${SSH_PUBLIC_KEY:-}" ]] && missing+=("SSH_PUBLIC_KEY")
    [[ -z "${DOMAIN:-}" ]] && missing+=("DOMAIN")
    [[ -z "${MONITORING_DOMAIN:-}" ]] && missing+=("MONITORING_DOMAIN")
    [[ -z "${ADMIN_EMAIL:-}" ]] && missing+=("ADMIN_EMAIL")

    if [[ ${#missing[@]} -gt 0 ]]; then
        error "Missing required DR kit fields: ${missing[*]}"
        exit 1
    fi
    info "DR kit fields: all required fields present"

    # Validate age key file exists
    if [[ ! -f "$AGE_KEY_FILE" ]]; then
        error "Age key file not found: ${AGE_KEY_FILE}"
        exit 1
    fi
    info "Age key file: found at ${AGE_KEY_FILE}"

    # Validate SSH public key format
    if [[ ! "$SSH_PUBLIC_KEY" =~ ^ssh- ]]; then
        error "SSH_PUBLIC_KEY doesn't look like a valid SSH public key"
        exit 1
    fi
    info "SSH public key: valid format"

    # Check DNS (informational only)
    local current_ip
    current_ip=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "unknown")
    info "Current VPS IP: ${current_ip}"

    local dns_ip
    dns_ip=$(dig +short "$DOMAIN" 2>/dev/null | head -1 || echo "unresolvable")
    if [[ "$dns_ip" == "$current_ip" ]]; then
        info "DNS: ${DOMAIN} -> ${dns_ip} (matches this VPS)"
    else
        warn "DNS: ${DOMAIN} -> ${dns_ip} (does NOT match ${current_ip})"
        warn "Update DNS before Phase 7 (SSL) or use --skip-ssl"
    fi

    # Summary
    echo ""
    echo -e "${BOLD}Recovery Plan:${NC}"
    echo "  Domain:     ${DOMAIN}"
    echo "  Monitoring: ${MONITORING_DOMAIN}"
    echo "  B2 Bucket:  ${B2_BUCKET}"
    echo "  Code:       ${GITHUB_REPO:-SCP (manual)}"
    echo "  Skip SSL:   ${SKIP_SSL}"
    echo ""

    if $DRY_RUN; then
        info "Dry run complete. Kit file is valid."
        exit 0
    fi

    phase_done 0
}

# ══════════════════════════════════════════════════
#  Phase 1: OS Setup
# ══════════════════════════════════════════════════

run_phase_1() {
    phase_header 1 "OS Setup"

    info "Updating system packages..."
    apt update && apt upgrade -y

    info "Installing essentials..."
    apt install -y curl git ufw fail2ban jq dnsutils

    # Create deploy user
    if ! id "deploy" &>/dev/null; then
        info "Creating deploy user..."
        adduser --disabled-password --gecos "" deploy
        mkdir -p /home/deploy/.ssh
        echo "$SSH_PUBLIC_KEY" > /home/deploy/.ssh/authorized_keys
        chown -R deploy:deploy /home/deploy/.ssh
        chmod 700 /home/deploy/.ssh
        chmod 600 /home/deploy/.ssh/authorized_keys
        echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
        info "Deploy user created"
    else
        info "Deploy user already exists"
        # Ensure SSH key is set
        mkdir -p /home/deploy/.ssh
        echo "$SSH_PUBLIC_KEY" > /home/deploy/.ssh/authorized_keys
        chown -R deploy:deploy /home/deploy/.ssh
        chmod 700 /home/deploy/.ssh
        chmod 600 /home/deploy/.ssh/authorized_keys
    fi

    # SSH hardening
    info "Hardening SSH..."
    sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
    sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
    echo "PasswordAuthentication no" > /etc/ssh/sshd_config.d/50-cloud-init.conf
    systemctl restart ssh

    # UFW firewall
    info "Configuring firewall..."
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable

    # Swap
    if [[ ! -f /swapfile ]]; then
        info "Creating 4GB swap..."
        fallocate -l 4G /swapfile
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
        echo 'vm.swappiness=10' >> /etc/sysctl.conf
        sysctl -p
    else
        info "Swap already exists"
    fi

    # Docker
    info "Installing Docker..."
    if ! command -v docker &>/dev/null; then
        curl -fsSL https://get.docker.com | sh
    fi
    usermod -aG docker deploy
    systemctl enable docker

    # Nginx
    info "Installing Nginx..."
    apt install -y nginx libnginx-mod-http-headers-more-filter
    systemctl enable nginx

    # App directories
    info "Creating app directories..."
    mkdir -p "$CRM_DIR" "$BACKUP_DIR"
    chown -R deploy:deploy "$CRM_DIR"
    chown -R deploy:deploy "$BACKUP_DIR"

    phase_done 1
}

# ══════════════════════════════════════════════════
#  Phase 2: Backup Tools
# ══════════════════════════════════════════════════

run_phase_2() {
    phase_header 2 "Backup Tools"

    # Install age
    if ! command -v age &>/dev/null; then
        info "Installing age v1.2.1..."
        cd /tmp
        curl -fsSL "https://dl.filippo.io/age/v1.2.1?for=linux/amd64" -o age.tar.gz
        tar -xzf age.tar.gz
        mv age/age age/age-keygen /usr/local/bin/
        rm -rf age age.tar.gz
        chmod +x /usr/local/bin/age /usr/local/bin/age-keygen
    fi
    info "age: $(age --version)"

    # Install rclone
    if ! command -v rclone &>/dev/null; then
        info "Installing rclone..."
        curl -fsSL https://rclone.org/install.sh | bash
    fi
    info "rclone: $(rclone version | head -1)"

    # Place age private key
    info "Installing age private key..."
    mkdir -p "$KEY_DIR"
    chmod 700 "$KEY_DIR"
    cp "$AGE_KEY_FILE" "${KEY_DIR}/age-key.txt"
    chmod 600 "${KEY_DIR}/age-key.txt"

    # Extract public key from private key
    AGE_PUBLIC_KEY=$(grep "public key:" "${KEY_DIR}/age-key.txt" | awk '{print $NF}')
    if [[ -z "$AGE_PUBLIC_KEY" ]]; then
        error "Could not extract public key from age key file"
        exit 1
    fi
    info "Age public key: ${AGE_PUBLIC_KEY}"

    # Configure rclone for B2
    info "Configuring rclone for B2..."
    rclone config create b2 b2 account="$B2_KEY_ID" key="$B2_APP_KEY" --non-interactive

    # Verify B2 access
    info "Verifying B2 access..."
    if ! rclone lsd "b2:${B2_BUCKET}" &>/dev/null; then
        error "Cannot access B2 bucket: ${B2_BUCKET}"
        error "Check B2_KEY_ID and B2_APP_KEY in your DR kit"
        exit 1
    fi
    info "B2 access verified: ${B2_BUCKET}"

    # Create backup directories
    mkdir -p "$BACKUP_DIR" "${BACKUP_DIR}/checksums" "$LOG_DIR" "$PROM_DIR"
    chmod 700 "$BACKUP_DIR"
    chmod 755 "$LOG_DIR" "$PROM_DIR"

    phase_done 2
}

# ══════════════════════════════════════════════════
#  Phase 3: Discover Available Backups
# ══════════════════════════════════════════════════

# Globals set by phase 3
LATEST_PG=""
LATEST_PG_CHECKSUM=""
LATEST_REDIS=""
LATEST_REDIS_CHECKSUM=""
LATEST_CONFIGS=""
LATEST_CONFIGS_CHECKSUM=""

run_phase_3() {
    phase_header 3 "Discover Available Backups"

    mkdir -p "$RESTORE_TMP"

    # PostgreSQL backups
    info "Checking PostgreSQL backups on B2..."
    LATEST_PG=$(rclone lsjson "b2:${B2_BUCKET}/postgres/" --no-mimetype 2>/dev/null \
        | jq -r '[.[] | select(.Name | test("^crm_.*\\.dump\\.age$"))] | sort_by(.Name) | last | .Name // empty' || true)

    if [[ -n "$LATEST_PG" ]]; then
        local pg_size
        pg_size=$(rclone lsjson "b2:${B2_BUCKET}/postgres/${LATEST_PG}" --no-mimetype 2>/dev/null \
            | jq -r '.[0].Size // 0' || echo 0)
        pg_size_human=$(numfmt --to=iec-i --suffix=B "$pg_size" 2>/dev/null || echo "${pg_size} bytes")
        info "PostgreSQL: ${LATEST_PG} (${pg_size_human})"

        LATEST_PG_CHECKSUM="${LATEST_PG%.age}.sha256"
    else
        warn "PostgreSQL: no backups found on B2"
    fi

    # Redis backups
    info "Checking Redis backups on B2..."
    LATEST_REDIS=$(rclone lsjson "b2:${B2_BUCKET}/redis/" --no-mimetype 2>/dev/null \
        | jq -r '[.[] | select(.Name | test("^crm_.*\\.rdb\\.age$"))] | sort_by(.Name) | last | .Name // empty' || true)

    if [[ -n "$LATEST_REDIS" ]]; then
        local redis_size
        redis_size=$(rclone lsjson "b2:${B2_BUCKET}/redis/${LATEST_REDIS}" --no-mimetype 2>/dev/null \
            | jq -r '.[0].Size // 0' || echo 0)
        redis_size_human=$(numfmt --to=iec-i --suffix=B "$redis_size" 2>/dev/null || echo "${redis_size} bytes")
        info "Redis: ${LATEST_REDIS} (${redis_size_human})"

        LATEST_REDIS_CHECKSUM="${LATEST_REDIS%.age}.sha256"
    else
        warn "Redis: no backups found on B2"
    fi

    # Config backups
    info "Checking config backups on B2..."
    LATEST_CONFIGS=$(rclone lsjson "b2:${B2_BUCKET}/configs/" --no-mimetype 2>/dev/null \
        | jq -r '[.[] | select(.Name | test("^crm_.*\\.configs\\.tar\\.gz\\.age$"))] | sort_by(.Name) | last | .Name // empty' || true)

    if [[ -n "$LATEST_CONFIGS" ]]; then
        local cfg_size
        cfg_size=$(rclone lsjson "b2:${B2_BUCKET}/configs/${LATEST_CONFIGS}" --no-mimetype 2>/dev/null \
            | jq -r '.[0].Size // 0' || echo 0)
        cfg_size_human=$(numfmt --to=iec-i --suffix=B "$cfg_size" 2>/dev/null || echo "${cfg_size} bytes")
        info "Configs: ${LATEST_CONFIGS} (${cfg_size_human})"

        LATEST_CONFIGS_CHECKSUM="${LATEST_CONFIGS%.age}.sha256"
    else
        warn "Configs: no backups found on B2"
    fi

    # Summary
    echo ""
    local strategy="fresh"
    [[ -n "$LATEST_PG" ]] && strategy="pg-only"
    [[ -n "$LATEST_PG" && -n "$LATEST_CONFIGS" ]] && strategy="pg+configs"
    [[ -n "$LATEST_PG" && -n "$LATEST_REDIS" && -n "$LATEST_CONFIGS" ]] && strategy="full"
    info "Restore strategy: ${strategy}"

    phase_done 3
}

# ══════════════════════════════════════════════════
#  Phase 4: Get Application Code
# ══════════════════════════════════════════════════

run_phase_4() {
    phase_header 4 "Get Application Code"

    if [[ -f "${CRM_DIR}/package.json" ]]; then
        info "Code already exists at ${CRM_DIR}, skipping clone"
    elif [[ -n "${GITHUB_REPO:-}" ]]; then
        info "Cloning from GitHub: ${GITHUB_REPO}"

        # Setup deploy key if provided
        if [[ -n "${GITHUB_DEPLOY_KEY_FILE:-}" && -f "${GITHUB_DEPLOY_KEY_FILE}" ]]; then
            mkdir -p /root/.ssh
            cp "$GITHUB_DEPLOY_KEY_FILE" /root/.ssh/github_deploy_key
            chmod 600 /root/.ssh/github_deploy_key
            ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts 2>/dev/null
            export GIT_SSH_COMMAND="ssh -i /root/.ssh/github_deploy_key -o StrictHostKeyChecking=no"
        fi

        git clone "$GITHUB_REPO" "$CRM_DIR"

        # Clean up deploy key
        rm -f /root/.ssh/github_deploy_key 2>/dev/null || true
        unset GIT_SSH_COMMAND 2>/dev/null || true
    else
        warn "No GITHUB_REPO in DR kit and no code in ${CRM_DIR}"
        echo ""
        echo "Please SCP the code to this server now:"
        echo "  scp -r /path/to/my-app/* root@$(curl -s --max-time 5 ifconfig.me 2>/dev/null):${CRM_DIR}/"
        echo ""
        read -p "Press Enter when code is in place..."

        if [[ ! -f "${CRM_DIR}/package.json" ]]; then
            error "No package.json found in ${CRM_DIR}"
            exit 1
        fi
    fi

    # Fix CRLF line endings
    info "Fixing CRLF line endings..."
    find "${CRM_DIR}/scripts" -name '*.sh' -exec sed -i 's/\r$//' {} + 2>/dev/null || true
    chmod +x "${CRM_DIR}/scripts/"*.sh "${CRM_DIR}/scripts/playbooks/"*.sh 2>/dev/null || true

    # Set ownership
    chown -R deploy:deploy "$CRM_DIR"

    phase_done 4
}

# ══════════════════════════════════════════════════
#  Phase 5: Restore/Create Configs
# ══════════════════════════════════════════════════

run_phase_5() {
    phase_header 5 "Restore/Create Configs"

    mkdir -p "$RESTORE_TMP"

    if [[ -n "$LATEST_CONFIGS" ]]; then
        info "Downloading config backup from B2..."
        rclone copy "b2:${B2_BUCKET}/configs/${LATEST_CONFIGS}" "$RESTORE_TMP/"

        # Download checksum
        rclone copy "b2:${B2_BUCKET}/configs/checksums/${LATEST_CONFIGS_CHECKSUM}" "$RESTORE_TMP/" 2>/dev/null || true

        # Decrypt
        info "Decrypting config backup..."
        local decrypted="${RESTORE_TMP}/configs.tar.gz"
        age -d -i "${KEY_DIR}/age-key.txt" -o "$decrypted" "${RESTORE_TMP}/${LATEST_CONFIGS}"

        # Verify checksum if available
        if [[ -f "${RESTORE_TMP}/${LATEST_CONFIGS_CHECKSUM}" ]]; then
            local expected actual
            expected=$(awk '{print $1}' "${RESTORE_TMP}/${LATEST_CONFIGS_CHECKSUM}")
            actual=$(sha256sum "$decrypted" | awk '{print $1}')
            if [[ "$expected" == "$actual" ]]; then
                info "Checksum verified"
            else
                warn "Checksum mismatch! Expected: ${expected}, Got: ${actual}"
                warn "Proceeding anyway (backup may still be valid)"
            fi
        fi

        # Extract (preserving absolute paths)
        info "Extracting config files..."
        tar -xzf "$decrypted" -P 2>/dev/null || tar -xzf "$decrypted" -C / 2>/dev/null || true

        info "Config backup restored"

        # Re-configure rclone with DR kit B2 creds (takes precedence)
        info "Re-configuring rclone with DR kit credentials..."
        rclone config create b2 b2 account="$B2_KEY_ID" key="$B2_APP_KEY" --non-interactive

    else
        warn "No config backup found on B2"

        # Try to use ENV_PRODUCTION_FILE from DR kit
        if [[ -n "${ENV_PRODUCTION_FILE:-}" && -f "$ENV_PRODUCTION_FILE" ]]; then
            info "Using .env.production from DR kit: ${ENV_PRODUCTION_FILE}"
            cp "$ENV_PRODUCTION_FILE" "${CRM_DIR}/.env.production"
            chmod 600 "${CRM_DIR}/.env.production"
            chown deploy:deploy "${CRM_DIR}/.env.production"
        elif [[ ! -f "${CRM_DIR}/.env.production" ]]; then
            error "No configs backup on B2 and no ENV_PRODUCTION_FILE in DR kit"
            error "Cannot proceed without .env.production"
            error "Set ENV_PRODUCTION_FILE in your DR kit file and re-run"
            exit 1
        fi
    fi

    # Ensure .env.production exists
    if [[ ! -f "${CRM_DIR}/.env.production" ]]; then
        error ".env.production not found at ${CRM_DIR}/.env.production after config restore"
        exit 1
    fi
    info ".env.production: present"
    chmod 600 "${CRM_DIR}/.env.production"

    # Generate backup.env if missing
    if [[ ! -f "${CRM_DIR}/backup.env" ]]; then
        info "Generating backup.env..."
        local age_pub
        age_pub=$(grep "public key:" "${KEY_DIR}/age-key.txt" | awk '{print $NF}')

        # Try to get Telegram creds from .env.production
        local tg_token="" tg_chat=""
        if [[ -f "${CRM_DIR}/.env.production" ]]; then
            tg_token=$(grep '^TELEGRAM_BOT_TOKEN=' "${CRM_DIR}/.env.production" | cut -d= -f2- || true)
            tg_chat=$(grep '^TELEGRAM_CHAT_ID=' "${CRM_DIR}/.env.production" | cut -d= -f2- || true)
        fi

        cat > "${CRM_DIR}/backup.env" << BENV
RCLONE_B2_REMOTE=b2
RCLONE_B2_BUCKET=${B2_BUCKET}
AGE_PUBLIC_KEY=${age_pub}
TELEGRAM_BOT_TOKEN=${tg_token}
TELEGRAM_CHAT_ID=${tg_chat}
AGE_KEY_FILE=${KEY_DIR}/age-key.txt
BENV
        chmod 600 "${CRM_DIR}/backup.env"
        chown deploy:deploy "${CRM_DIR}/backup.env"
        info "Generated backup.env"
    else
        info "backup.env: already present"
    fi

    # Clean up restore temp
    rm -rf "$RESTORE_TMP"

    phase_done 5
}

# ══════════════════════════════════════════════════
#  Phase 6: Configure Nginx
# ══════════════════════════════════════════════════

run_phase_6() {
    phase_header 6 "Configure Nginx"

    # Remove default site
    rm -f /etc/nginx/sites-enabled/default

    # Upstream config
    info "Creating upstream config..."
    echo 'upstream crm_backend { server 127.0.0.1:3000; }' > /etc/nginx/conf.d/crm-upstream.conf

    # Copy hardening config from repo if available
    if [[ -f "${CRM_DIR}/nginx/crm-hardening.conf" ]]; then
        cp "${CRM_DIR}/nginx/crm-hardening.conf" /etc/nginx/conf.d/crm-hardening.conf
        info "Installed crm-hardening.conf"
    fi

    # Custom error pages
    mkdir -p /etc/nginx/custom-errors
    for errfile in 429.json 502.json 503.json 504.json; do
        if [[ -f "${CRM_DIR}/nginx/${errfile}" ]]; then
            cp "${CRM_DIR}/nginx/${errfile}" "/etc/nginx/custom-errors/${errfile}"
        fi
    done
    info "Installed custom error pages"

    # Fail2ban configs
    if [[ -d "${CRM_DIR}/nginx/fail2ban" ]]; then
        cp "${CRM_DIR}/nginx/fail2ban/nginx-ratelimit.conf" /etc/fail2ban/jail.d/ 2>/dev/null || true
        cp "${CRM_DIR}/nginx/fail2ban/nginx-badbots.conf" /etc/fail2ban/jail.d/ 2>/dev/null || true
        cp "${CRM_DIR}/nginx/fail2ban/filter-ratelimit.conf" /etc/fail2ban/filter.d/nginx-ratelimit.conf 2>/dev/null || true
        cp "${CRM_DIR}/nginx/fail2ban/filter-badbots.conf" /etc/fail2ban/filter.d/nginx-badbots.conf 2>/dev/null || true
        info "Installed fail2ban configs"
    fi

    # Hide Server header
    echo 'more_clear_headers Server;' > /etc/nginx/conf.d/crm-headers-more.conf

    # Patch nginx.conf
    info "Patching nginx.conf..."
    local NGINX_CONF="/etc/nginx/nginx.conf"
    sed -i '/limit_req_zone.*zone=api/d' "$NGINX_CONF"
    sed -i '/limit_req_zone.*zone=login/d' "$NGINX_CONF"
    sed -i 's/ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;/ssl_protocols TLSv1.2 TLSv1.3;/' "$NGINX_CONF"
    sed -i 's/worker_connections 768;/worker_connections 4096;/' "$NGINX_CONF"
    sed -i 's/# multi_accept on;/multi_accept on;/' "$NGINX_CONF"

    # Create temporary HTTP-only site config (for certbot / pre-SSL)
    if $SKIP_SSL; then
        # Use the basic HTTP proxy config from server-setup.sh
        cat > /etc/nginx/sites-available/crm << 'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://crm_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location ~ /\. {
        deny all;
    }
}
NGINX
    else
        # HTTP-only config that will be replaced by certbot
        cat > /etc/nginx/sites-available/crm << NGINX
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 50M;

    location / {
        proxy_pass http://crm_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location ~ /\\. {
        deny all;
    }
}

server {
    listen 80;
    server_name ${MONITORING_DOMAIN};

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
    fi

    ln -sf /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/crm

    nginx -t && systemctl reload nginx
    info "Nginx configured and reloaded"

    # Start fail2ban
    systemctl enable fail2ban
    systemctl start fail2ban

    phase_done 6
}

# ══════════════════════════════════════════════════
#  Phase 7: SSL Certificates
# ══════════════════════════════════════════════════

run_phase_7() {
    phase_header 7 "SSL Certificates"

    if $SKIP_SSL; then
        warn "Skipping SSL (--skip-ssl flag set)"
        phase_done 7
        return
    fi

    # Install certbot
    info "Installing certbot..."
    apt install -y certbot python3-certbot-nginx

    # Check DNS
    local current_ip dns_ip
    current_ip=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "unknown")
    dns_ip=$(dig +short "$DOMAIN" 2>/dev/null | head -1 || echo "")

    if [[ "$dns_ip" != "$current_ip" ]]; then
        error "DNS for ${DOMAIN} points to ${dns_ip:-nothing}, not ${current_ip}"
        error "Update DNS A records and re-run with --from-phase 7"
        error "Or skip with --skip-ssl"
        exit 1
    fi

    # Obtain main cert
    info "Obtaining SSL certificate for ${DOMAIN}..."
    certbot --nginx -d "$DOMAIN" -d "www.${DOMAIN}" \
        --non-interactive --agree-tos -m "$ADMIN_EMAIL"

    # Obtain monitoring cert
    local mon_dns
    mon_dns=$(dig +short "$MONITORING_DOMAIN" 2>/dev/null | head -1 || echo "")
    if [[ "$mon_dns" == "$current_ip" ]]; then
        info "Obtaining SSL certificate for ${MONITORING_DOMAIN}..."
        certbot --nginx -d "$MONITORING_DOMAIN" \
            --non-interactive --agree-tos -m "$ADMIN_EMAIL"
    else
        warn "DNS for ${MONITORING_DOMAIN} not pointing here, skipping its cert"
    fi

    # Now install the full production nginx config from repo
    if [[ -f "${CRM_DIR}/nginx/default.conf" ]]; then
        info "Installing production nginx config..."
        cp "${CRM_DIR}/nginx/default.conf" /etc/nginx/sites-available/crm
        nginx -t && systemctl reload nginx
    fi

    # Verify auto-renewal
    info "Verifying certbot auto-renewal..."
    certbot renew --dry-run

    phase_done 7
}

# ══════════════════════════════════════════════════
#  Phase 8: Start Core Services
# ══════════════════════════════════════════════════

run_phase_8() {
    phase_header 8 "Start Core Services"

    cd "$CRM_DIR"

    local COMPOSE="docker compose --env-file .env.production -f docker-compose.production.yml"

    # Build app image
    info "Building Docker image (this may take a few minutes)..."
    docker build -t crm-app:latest -f Dockerfile.production .

    # Start infrastructure
    info "Starting postgres, redis, inngest, autoheal..."
    $COMPOSE up -d postgres redis inngest autoheal

    # Wait for PostgreSQL
    info "Waiting for PostgreSQL to be ready..."
    local retries=0
    until $COMPOSE exec -T postgres pg_isready -U crm_user -q 2>/dev/null; do
        ((retries++))
        if [[ $retries -ge 30 ]]; then
            error "PostgreSQL not ready after 60s"
            exit 1
        fi
        sleep 2
    done
    info "PostgreSQL ready (${retries} attempts)"

    # Wait for Redis
    info "Waiting for Redis to be ready..."
    retries=0
    until $COMPOSE exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
        ((retries++))
        if [[ $retries -ge 15 ]]; then
            error "Redis not ready after 30s"
            exit 1
        fi
        sleep 2
    done
    info "Redis ready"

    phase_done 8
}

# ══════════════════════════════════════════════════
#  Phase 9: Restore PostgreSQL
# ══════════════════════════════════════════════════

run_phase_9() {
    phase_header 9 "Restore PostgreSQL"

    if [[ -z "$LATEST_PG" ]]; then
        warn "No PostgreSQL backup to restore - database will be empty"
        warn "Migrations in Phase 11 will create the schema"
        phase_done 9
        return
    fi

    mkdir -p "$RESTORE_TMP"
    cd "$CRM_DIR"

    local COMPOSE="docker compose --env-file .env.production -f docker-compose.production.yml"

    # Load DB credentials
    set -a
    source .env.production
    set +a

    # Download backup
    info "Downloading PostgreSQL backup: ${LATEST_PG}..."
    rclone copy "b2:${B2_BUCKET}/postgres/${LATEST_PG}" "$RESTORE_TMP/"

    # Download checksum
    rclone copy "b2:${B2_BUCKET}/postgres/checksums/${LATEST_PG_CHECKSUM}" "$RESTORE_TMP/" 2>/dev/null || true

    # Decrypt
    info "Decrypting..."
    local dump_file="${RESTORE_TMP}/restore.dump"
    age -d -i "${KEY_DIR}/age-key.txt" -o "$dump_file" "${RESTORE_TMP}/${LATEST_PG}"

    # Verify checksum
    if [[ -f "${RESTORE_TMP}/${LATEST_PG_CHECKSUM}" ]]; then
        local expected actual
        expected=$(awk '{print $1}' "${RESTORE_TMP}/${LATEST_PG_CHECKSUM}")
        actual=$(sha256sum "$dump_file" | awk '{print $1}')
        if [[ "$expected" == "$actual" ]]; then
            info "Checksum verified"
        else
            warn "Checksum mismatch (expected: ${expected}, got: ${actual})"
        fi
    fi

    # Restore
    info "Restoring PostgreSQL database..."
    $COMPOSE exec -T postgres pg_restore \
        -U "${POSTGRES_USER:-crm_user}" \
        -d "${POSTGRES_DB:-ofek_crm}" \
        --no-owner --no-acl \
        < "$dump_file" || true
    # pg_restore returns non-zero on warnings, which is normal

    # Validate
    info "Validating restored data..."
    local table_count company_count user_count migration_count
    table_count=$($COMPOSE exec -T postgres psql -U "${POSTGRES_USER:-crm_user}" -d "${POSTGRES_DB:-ofek_crm}" -tAc \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" | tr -d '[:space:]')
    company_count=$($COMPOSE exec -T postgres psql -U "${POSTGRES_USER:-crm_user}" -d "${POSTGRES_DB:-ofek_crm}" -tAc \
        "SELECT count(*) FROM \"Company\";" 2>/dev/null | tr -d '[:space:]' || echo 0)
    user_count=$($COMPOSE exec -T postgres psql -U "${POSTGRES_USER:-crm_user}" -d "${POSTGRES_DB:-ofek_crm}" -tAc \
        "SELECT count(*) FROM \"User\";" 2>/dev/null | tr -d '[:space:]' || echo 0)
    migration_count=$($COMPOSE exec -T postgres psql -U "${POSTGRES_USER:-crm_user}" -d "${POSTGRES_DB:-ofek_crm}" -tAc \
        "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;" 2>/dev/null | tr -d '[:space:]' || echo 0)

    info "Validation: tables=${table_count} companies=${company_count} users=${user_count} migrations=${migration_count}"

    if [[ "${table_count:-0}" -lt 10 ]]; then
        warn "Low table count (${table_count}) - restore may be incomplete"
    fi

    # Clean up
    rm -rf "$RESTORE_TMP"

    phase_done 9
}

# ══════════════════════════════════════════════════
#  Phase 10: Restore Redis
# ══════════════════════════════════════════════════

run_phase_10() {
    phase_header 10 "Restore Redis"

    if [[ -z "$LATEST_REDIS" ]]; then
        warn "No Redis backup to restore - Redis starts fresh (caches rebuild naturally)"
        phase_done 10
        return
    fi

    mkdir -p "$RESTORE_TMP"
    cd "$CRM_DIR"

    local COMPOSE="docker compose --env-file .env.production -f docker-compose.production.yml"

    # Download backup
    info "Downloading Redis backup: ${LATEST_REDIS}..."
    rclone copy "b2:${B2_BUCKET}/redis/${LATEST_REDIS}" "$RESTORE_TMP/"

    # Decrypt
    info "Decrypting..."
    local rdb_file="${RESTORE_TMP}/dump.rdb"
    age -d -i "${KEY_DIR}/age-key.txt" -o "$rdb_file" "${RESTORE_TMP}/${LATEST_REDIS}"

    # Stop Redis, replace RDB, restart
    info "Stopping Redis for RDB restore..."
    $COMPOSE stop redis

    # Find the Redis container name (might be stopped)
    local redis_container
    redis_container=$($COMPOSE ps -a --format '{{.Name}}' redis 2>/dev/null | head -1)

    if [[ -n "$redis_container" ]]; then
        docker cp "$rdb_file" "${redis_container}:/data/dump.rdb"
        info "RDB file copied into container"
    else
        warn "Could not find Redis container, skipping RDB restore"
    fi

    info "Starting Redis..."
    $COMPOSE start redis

    # Wait for Redis
    local retries=0
    until $COMPOSE exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
        ((retries++))
        if [[ $retries -ge 15 ]]; then
            warn "Redis not responding after RDB restore"
            break
        fi
        sleep 2
    done

    # Clean up
    rm -rf "$RESTORE_TMP"

    phase_done 10
}

# ══════════════════════════════════════════════════
#  Phase 11: Deploy Application
# ══════════════════════════════════════════════════

run_phase_11() {
    phase_header 11 "Deploy Application"

    cd "$CRM_DIR"

    local COMPOSE="docker compose --env-file .env.production -f docker-compose.production.yml"

    # Set active slot
    echo "blue" > /opt/crm/active-slot
    chown deploy:deploy /opt/crm/active-slot

    # Run Prisma migrations
    info "Running database migrations..."
    $COMPOSE --profile migration run --rm migrator npx prisma migrate deploy

    # Start blue app
    info "Starting app-blue..."
    $COMPOSE --profile blue up -d app-blue

    # Health check loop
    info "Health checking app-blue on port 3000..."
    local healthy=false
    for i in $(seq 1 20); do
        sleep 3
        if curl -sf -o /dev/null http://localhost:3000/api/health/ready 2>/dev/null; then
            info "Health check PASSED (attempt ${i})"
            healthy=true
            break
        fi
        echo "  Attempt ${i}/20 failed, retrying..."
    done

    if [[ "$healthy" != "true" ]]; then
        error "Health check failed after 20 attempts"
        error "Check logs: docker compose --env-file .env.production -f docker-compose.production.yml --profile blue logs app-blue"
        exit 1
    fi

    # Update nginx upstream
    echo "upstream crm_backend { server 127.0.0.1:3000; }" > /etc/nginx/conf.d/crm-upstream.conf
    nginx -t && nginx -s reload
    info "Nginx updated to serve app-blue on port 3000"

    phase_done 11
}

# ══════════════════════════════════════════════════
#  Phase 12: Start Monitoring Stack
# ══════════════════════════════════════════════════

run_phase_12() {
    phase_header 12 "Start Monitoring Stack"

    cd "$CRM_DIR"

    if [[ ! -f "docker-compose.monitoring.yml" ]]; then
        warn "docker-compose.monitoring.yml not found, skipping monitoring"
        phase_done 12
        return
    fi

    local COMPOSE="docker compose --env-file .env.production -f docker-compose.monitoring.yml"

    info "Starting monitoring stack..."
    $COMPOSE up -d

    # Wait for Grafana
    info "Waiting for Grafana..."
    local retries=0
    until curl -sf http://localhost:3001/api/health &>/dev/null; do
        ((retries++))
        if [[ $retries -ge 30 ]]; then
            warn "Grafana not ready after 60s (monitoring may still be starting)"
            break
        fi
        sleep 2
    done
    if [[ $retries -lt 30 ]]; then
        info "Grafana ready"
    fi

    # Wait for Prometheus
    info "Waiting for Prometheus..."
    retries=0
    until curl -sf http://localhost:9090/-/ready &>/dev/null; do
        ((retries++))
        if [[ $retries -ge 30 ]]; then
            warn "Prometheus not ready after 60s"
            break
        fi
        sleep 2
    done
    if [[ $retries -lt 30 ]]; then
        info "Prometheus ready"
    fi

    phase_done 12
}

# ══════════════════════════════════════════════════
#  Phase 13: Setup Backup System
# ══════════════════════════════════════════════════

run_phase_13() {
    phase_header 13 "Setup Backup System"

    # Install systemd timer units
    info "Installing systemd backup units..."

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
Description=CRM Backup Timer (every 12h)

[Timer]
OnCalendar=*-*-* 02:00:00
OnCalendar=*-*-* 14:00:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF

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

    # Install logrotate config
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

    # Enable timers
    systemctl daemon-reload
    systemctl enable --now crm-backup.timer crm-backup-retention.timer crm-restore-test.timer

    info "Backup timers enabled:"
    systemctl list-timers --all | grep crm || true

    phase_done 13
}

# ══════════════════════════════════════════════════
#  Phase 14: Verification
# ══════════════════════════════════════════════════

run_phase_14() {
    phase_header 14 "Verification"

    cd "$CRM_DIR"

    local COMPOSE="docker compose --env-file .env.production -f docker-compose.production.yml"
    local pass=0 fail=0

    check() {
        local name="$1" result="$2"
        if [[ "$result" == "PASS" ]]; then
            echo -e "  ${GREEN}PASS${NC}  ${name}"
            ((pass++))
        else
            echo -e "  ${RED}FAIL${NC}  ${name}"
            ((fail++))
        fi
    }

    # Load DB credentials
    set -a
    source .env.production
    set +a

    # 1. App health
    if curl -sf http://localhost:3000/api/health/ready &>/dev/null; then
        check "App health (localhost)" "PASS"
    else
        check "App health (localhost)" "FAIL"
    fi

    # 2. App via domain (HTTPS)
    if ! $SKIP_SSL; then
        if curl -sf "https://${DOMAIN}/api/health/ready" &>/dev/null; then
            check "App health (https://${DOMAIN})" "PASS"
        else
            check "App health (https://${DOMAIN})" "FAIL"
        fi
    fi

    # 3. Database tables
    local table_count
    table_count=$($COMPOSE exec -T postgres psql -U "${POSTGRES_USER:-crm_user}" -d "${POSTGRES_DB:-ofek_crm}" -tAc \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" 2>/dev/null | tr -d '[:space:]' || echo 0)
    if [[ "${table_count:-0}" -ge 10 ]]; then
        check "Database tables (${table_count})" "PASS"
    else
        check "Database tables (${table_count})" "FAIL"
    fi

    # 4. Redis ping
    if $COMPOSE exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
        check "Redis ping" "PASS"
    else
        check "Redis ping" "FAIL"
    fi

    # 5. Grafana
    if curl -sf http://localhost:3001/api/health &>/dev/null; then
        check "Grafana health" "PASS"
    else
        check "Grafana health" "FAIL"
    fi

    # 6. Container count
    local running
    running=$(docker ps --filter status=running --format '{{.Names}}' | wc -l)
    if [[ "$running" -ge 10 ]]; then
        check "Running containers (${running})" "PASS"
    else
        check "Running containers (${running})" "FAIL"
    fi

    # 7. Backup timer
    if systemctl is-active crm-backup.timer &>/dev/null; then
        check "Backup timer active" "PASS"
    else
        check "Backup timer active" "FAIL"
    fi

    # 8. Fail2ban
    if systemctl is-active fail2ban &>/dev/null; then
        check "Fail2ban active" "PASS"
    else
        check "Fail2ban active" "FAIL"
    fi

    # 9. UFW
    if ufw status 2>/dev/null | grep -q "Status: active"; then
        check "UFW firewall active" "PASS"
    else
        check "UFW firewall active" "FAIL"
    fi

    echo ""
    info "Verification: ${pass} passed, ${fail} failed"

    phase_done 14
}

# ══════════════════════════════════════════════════
#  Phase 15: Recovery Notification
# ══════════════════════════════════════════════════

run_phase_15() {
    phase_header 15 "Recovery Notification"

    local elapsed=$(( $(date +%s) - SCRIPT_START ))
    local elapsed_min=$(( elapsed / 60 ))
    local current_ip
    current_ip=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "unknown")

    local running_containers
    running_containers=$(docker ps --filter status=running --format '{{.Names}}' | sort | tr '\n' ', ' | sed 's/,$//')

    # Try sending Telegram notification
    if [[ -f "${CRM_DIR}/backup.env" ]]; then
        set -a
        source "${CRM_DIR}/backup.env"
        set +a
    fi

    if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
        local text="🔄 <b>Disaster Recovery Complete</b>

Domain: ${DOMAIN}
IP: ${current_ip}
Duration: ${elapsed_min}m ${elapsed_sec:-$((elapsed % 60))}s
PG Backup: ${LATEST_PG:-none}
Redis Backup: ${LATEST_REDIS:-none}
Config Backup: ${LATEST_CONFIGS:-none}
Containers: ${running_containers}
Host: $(hostname)"

        curl -s --max-time 10 -X POST \
            "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d chat_id="$TELEGRAM_CHAT_ID" \
            -d parse_mode="HTML" \
            -d text="$text" \
            -d disable_web_page_preview="true" > /dev/null 2>&1 || true

        info "Telegram notification sent"
    else
        warn "Telegram not configured, skipping notification"
    fi

    # Clean up DR kit and temp secrets
    info "Cleaning up temporary files..."
    rm -f "$AGE_KEY_FILE" 2>/dev/null || true
    rm -f "$KIT_FILE" 2>/dev/null || true
    rm -f "${GITHUB_DEPLOY_KEY_FILE:-/dev/null}" 2>/dev/null || true
    rm -f "${ENV_PRODUCTION_FILE:-/dev/null}" 2>/dev/null || true
    rm -rf "$RESTORE_TMP" 2>/dev/null || true

    # Final summary
    echo ""
    echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  Disaster Recovery Complete!${NC}"
    echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  Domain:        ${DOMAIN}"
    echo "  Monitoring:    ${MONITORING_DOMAIN}"
    echo "  VPS IP:        ${current_ip}"
    echo "  Duration:      ${elapsed_min}m $((elapsed % 60))s"
    echo "  PG backup:     ${LATEST_PG:-none}"
    echo "  Redis backup:  ${LATEST_REDIS:-none}"
    echo "  Config backup: ${LATEST_CONFIGS:-none}"
    echo "  Containers:    ${running_containers}"
    echo ""
    echo "  Next steps:"
    echo "    1. Verify the app at https://${DOMAIN}"
    echo "    2. Test login and data integrity"
    echo "    3. Verify monitoring at https://${MONITORING_DOMAIN}"
    echo ""

    phase_done 15
}

# ══════════════════════════════════════════════════
#  Main: Run phases
# ══════════════════════════════════════════════════

echo -e "${BOLD}CRM Disaster Recovery Bootstrap${NC}"
echo "Starting from phase: ${FROM_PHASE}"
echo ""

# Run phases 0-3 always (they set globals needed by later phases)
# but skip actual execution if resuming past them
if [[ $FROM_PHASE -le 0 ]]; then run_phase_0; fi
if [[ $FROM_PHASE -le 1 ]]; then run_phase_1; fi
if [[ $FROM_PHASE -le 2 ]]; then run_phase_2; fi

# Phase 3 sets globals needed by phases 5, 9, 10, 15
# Always run discovery even when resuming past phase 3
if [[ $FROM_PHASE -le 3 ]]; then
    run_phase_3
elif [[ $FROM_PHASE -gt 3 ]]; then
    # Re-discover backups for later phases
    info "Re-discovering backups for resume..."
    LATEST_PG=$(rclone lsjson "b2:${B2_BUCKET}/postgres/" --no-mimetype 2>/dev/null \
        | jq -r '[.[] | select(.Name | test("^crm_.*\\.dump\\.age$"))] | sort_by(.Name) | last | .Name // empty' || true)
    [[ -n "$LATEST_PG" ]] && LATEST_PG_CHECKSUM="${LATEST_PG%.age}.sha256"

    LATEST_REDIS=$(rclone lsjson "b2:${B2_BUCKET}/redis/" --no-mimetype 2>/dev/null \
        | jq -r '[.[] | select(.Name | test("^crm_.*\\.rdb\\.age$"))] | sort_by(.Name) | last | .Name // empty' || true)
    [[ -n "$LATEST_REDIS" ]] && LATEST_REDIS_CHECKSUM="${LATEST_REDIS%.age}.sha256"

    LATEST_CONFIGS=$(rclone lsjson "b2:${B2_BUCKET}/configs/" --no-mimetype 2>/dev/null \
        | jq -r '[.[] | select(.Name | test("^crm_.*\\.configs\\.tar\\.gz\\.age$"))] | sort_by(.Name) | last | .Name // empty' || true)
    [[ -n "$LATEST_CONFIGS" ]] && LATEST_CONFIGS_CHECKSUM="${LATEST_CONFIGS%.age}.sha256"
fi

if [[ $FROM_PHASE -le 4 ]]; then run_phase_4; fi
if [[ $FROM_PHASE -le 5 ]]; then run_phase_5; fi
if [[ $FROM_PHASE -le 6 ]]; then run_phase_6; fi
if [[ $FROM_PHASE -le 7 ]]; then run_phase_7; fi
if [[ $FROM_PHASE -le 8 ]]; then run_phase_8; fi
if [[ $FROM_PHASE -le 9 ]]; then run_phase_9; fi
if [[ $FROM_PHASE -le 10 ]]; then run_phase_10; fi
if [[ $FROM_PHASE -le 11 ]]; then run_phase_11; fi
if [[ $FROM_PHASE -le 12 ]]; then run_phase_12; fi
if [[ $FROM_PHASE -le 13 ]]; then run_phase_13; fi
if [[ $FROM_PHASE -le 14 ]]; then run_phase_14; fi
if [[ $FROM_PHASE -le 15 ]]; then run_phase_15; fi
