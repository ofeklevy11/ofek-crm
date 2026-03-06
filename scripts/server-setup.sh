#!/bin/bash
set -euo pipefail

# ============================================
# Hetzner VPS Initial Setup Script
# Run as root on a fresh Ubuntu 22.04/24.04
# Usage: ssh root@YOUR_VPS_IP 'bash -s' < server-setup.sh
# ============================================

echo "=== Updating system ==="
apt update && apt upgrade -y

echo "=== Installing essentials ==="
apt install -y curl git ufw fail2ban

echo "=== Creating deploy user ==="
if ! id "deploy" &>/dev/null; then
    adduser --disabled-password --gecos "" deploy
    mkdir -p /home/deploy/.ssh
    cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
    chown -R deploy:deploy /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh
    chmod 600 /home/deploy/.ssh/authorized_keys
    echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
    echo "Deploy user created with SSH key from root"
fi

echo "=== Hardening SSH ==="
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
# Override cloud-init SSH defaults (cloud-init drops configs in sshd_config.d/ that override main config)
echo "PasswordAuthentication no" > /etc/ssh/sshd_config.d/50-cloud-init.conf
systemctl restart ssh

echo "=== Configuring UFW firewall ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=== Setting up swap ==="
if [ ! -f /swapfile ]; then
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    sysctl -p
    echo "4GB swap created with swappiness=10"
else
    echo "Swap already exists, skipping"
fi

echo "=== Installing Docker ==="
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
systemctl enable docker

echo "=== Installing Nginx ==="
apt install -y nginx
systemctl enable nginx

echo "=== Creating app directories ==="
mkdir -p /opt/crm
mkdir -p /opt/crm-backups
chown -R deploy:deploy /opt/crm
chown -R deploy:deploy /opt/crm-backups

echo "=== Configuring Nginx ==="
rm -f /etc/nginx/sites-enabled/default

# Upstream config for blue-green deployments (deploy script switches between ports)
cat > /etc/nginx/conf.d/crm-upstream.conf << 'UPSTREAM'
upstream crm_backend {
    server 127.0.0.1:3000;
}
UPSTREAM

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

ln -sf /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/crm
nginx -t && systemctl reload nginx

echo "=== Setting up blue-green deployment state ==="
echo "blue" > /opt/crm/active-slot
chown deploy:deploy /opt/crm/active-slot

echo "=== Configuring fail2ban ==="
systemctl enable fail2ban
systemctl start fail2ban

echo ""
echo "============================================"
echo "  VPS Setup Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. SSH as deploy user: ssh deploy@$(curl -s ifconfig.me)"
echo "  2. Copy your project to /opt/crm"
echo "  3. Create .env.production from the template"
echo "  4. Run: docker compose -f docker-compose.production.yml up -d"
echo ""
echo "IMPORTANT: Root SSH login is now DISABLED."
echo "           Use 'deploy' user from now on."
echo ""
