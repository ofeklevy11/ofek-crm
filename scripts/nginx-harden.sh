#!/bin/bash
set -euo pipefail

# ============================================
# Nginx Hardening — One-time deployment script
# SCPs hardening configs + fail2ban rules to VPS
# Also patches nginx.conf to remove conflicts
# Usage: bash scripts/nginx-harden.sh
# ============================================

VPS_USER="deploy"
VPS_IP="46.225.53.137"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Deploying nginx hardening configs ==="

# Copy nginx configs
scp $SSH_OPTS "$PROJECT_DIR/nginx/crm-hardening.conf" "${VPS_USER}@${VPS_IP}:/tmp/crm-hardening.conf"
scp $SSH_OPTS "$PROJECT_DIR/nginx/cloudflare-realip.conf" "${VPS_USER}@${VPS_IP}:/tmp/cloudflare-realip.conf"
scp $SSH_OPTS "$PROJECT_DIR/nginx/meta-webhook-allow.conf" "${VPS_USER}@${VPS_IP}:/tmp/meta-webhook-allow.conf"
scp $SSH_OPTS "$PROJECT_DIR/nginx/429.json" "${VPS_USER}@${VPS_IP}:/tmp/429.json"
scp $SSH_OPTS "$PROJECT_DIR/nginx/502.json" "${VPS_USER}@${VPS_IP}:/tmp/502.json"
scp $SSH_OPTS "$PROJECT_DIR/nginx/503.json" "${VPS_USER}@${VPS_IP}:/tmp/503.json"
scp $SSH_OPTS "$PROJECT_DIR/nginx/504.json" "${VPS_USER}@${VPS_IP}:/tmp/504.json"
scp $SSH_OPTS "$PROJECT_DIR/nginx/default.conf" "${VPS_USER}@${VPS_IP}:/tmp/crm-default.conf"

# Copy fail2ban configs
scp $SSH_OPTS "$PROJECT_DIR/nginx/fail2ban/nginx-ratelimit.conf" "${VPS_USER}@${VPS_IP}:/tmp/nginx-ratelimit.conf"
scp $SSH_OPTS "$PROJECT_DIR/nginx/fail2ban/nginx-badbots.conf" "${VPS_USER}@${VPS_IP}:/tmp/nginx-badbots.conf"
scp $SSH_OPTS "$PROJECT_DIR/nginx/fail2ban/filter-ratelimit.conf" "${VPS_USER}@${VPS_IP}:/tmp/filter-ratelimit.conf"
scp $SSH_OPTS "$PROJECT_DIR/nginx/fail2ban/filter-badbots.conf" "${VPS_USER}@${VPS_IP}:/tmp/filter-badbots.conf"

echo "=== Installing configs on VPS ==="

ssh $SSH_OPTS "${VPS_USER}@${VPS_IP}" 'bash -s' << 'REMOTE'
set -euo pipefail

# ── Patch nginx.conf to remove conflicts ──

NGINX_CONF="/etc/nginx/nginx.conf"

# Remove duplicate rate limit zones (now defined in crm-hardening.conf)
echo "Removing duplicate rate limit zones from nginx.conf..."
sudo sed -i '/limit_req_zone.*zone=api/d' "$NGINX_CONF"
sudo sed -i '/limit_req_zone.*zone=login/d' "$NGINX_CONF"

# Fix insecure TLS defaults (remove TLSv1 and TLSv1.1)
echo "Fixing ssl_protocols in nginx.conf..."
sudo sed -i 's/ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;/ssl_protocols TLSv1.2 TLSv1.3;/' "$NGINX_CONF"

# Increase worker_connections from 768 to 4096
echo "Increasing worker_connections to 4096..."
sudo sed -i 's/worker_connections 768;/worker_connections 4096;/' "$NGINX_CONF"

# Enable multi_accept
echo "Enabling multi_accept..."
sudo sed -i 's/# multi_accept on;/multi_accept on;/' "$NGINX_CONF"

# ── Install headers-more module to fully hide Server header ──

echo "Installing libnginx-mod-http-headers-more-filter..."
sudo apt-get install -y libnginx-mod-http-headers-more-filter

# Create a separate config for headers-more (not managed by CI/CD)
echo 'more_clear_headers Server;' | sudo tee /etc/nginx/conf.d/crm-headers-more.conf > /dev/null

# ── Install configs ──

# Nginx configs
sudo cp /tmp/crm-hardening.conf /etc/nginx/conf.d/crm-hardening.conf
sudo cp /tmp/cloudflare-realip.conf /etc/nginx/conf.d/cloudflare-realip.conf
sudo mkdir -p /etc/nginx/snippets
sudo cp /tmp/meta-webhook-allow.conf /etc/nginx/snippets/meta-webhook-allow.conf
sudo cp /tmp/crm-default.conf /etc/nginx/sites-available/crm
sudo mkdir -p /etc/nginx/custom-errors
sudo cp /tmp/429.json /etc/nginx/custom-errors/429.json
sudo cp /tmp/502.json /etc/nginx/custom-errors/502.json
sudo cp /tmp/503.json /etc/nginx/custom-errors/503.json
sudo cp /tmp/504.json /etc/nginx/custom-errors/504.json

# Fail2ban configs
sudo cp /tmp/nginx-ratelimit.conf /etc/fail2ban/jail.d/nginx-ratelimit.conf
sudo cp /tmp/nginx-badbots.conf /etc/fail2ban/jail.d/nginx-badbots.conf
sudo cp /tmp/filter-ratelimit.conf /etc/fail2ban/filter.d/nginx-ratelimit.conf
sudo cp /tmp/filter-badbots.conf /etc/fail2ban/filter.d/nginx-badbots.conf

# Test and reload nginx
echo "Testing nginx config..."
sudo nginx -t || { echo "ERROR: Nginx config test failed"; exit 1; }
sudo nginx -s reload
echo "Nginx reloaded."

# Reload fail2ban
sudo systemctl restart fail2ban
echo "Fail2ban restarted."

# Verify
echo ""
echo "=== Verification ==="
sudo fail2ban-client status nginx-ratelimit 2>/dev/null && echo "nginx-ratelimit jail: OK" || echo "nginx-ratelimit jail: FAILED"
sudo fail2ban-client status nginx-badbots 2>/dev/null && echo "nginx-badbots jail: OK" || echo "nginx-badbots jail: FAILED"
echo ""
echo "nginx.conf checks:"
grep 'worker_connections' "$NGINX_CONF"
grep 'ssl_protocols' "$NGINX_CONF"
grep 'multi_accept' "$NGINX_CONF"
echo "Rate limit zones in nginx.conf (should be empty):"
grep 'limit_req_zone' "$NGINX_CONF" || echo "(none — good)"

# Cleanup temp files
rm -f /tmp/crm-hardening.conf /tmp/cloudflare-realip.conf /tmp/meta-webhook-allow.conf
rm -f /tmp/429.json /tmp/502.json /tmp/503.json /tmp/504.json /tmp/crm-default.conf
rm -f /tmp/nginx-ratelimit.conf /tmp/nginx-badbots.conf /tmp/filter-ratelimit.conf /tmp/filter-badbots.conf
REMOTE

echo ""
echo "=== Nginx hardening deployment complete ==="
