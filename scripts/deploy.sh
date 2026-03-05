#!/bin/bash
set -euo pipefail

# ============================================
# Deploy CRM to VPS
# Usage: ./scripts/deploy.sh <VPS_IP>
# ============================================

VPS_IP="${1:?Usage: ./scripts/deploy.sh <VPS_IP>}"
VPS_USER="deploy"
REMOTE_DIR="/opt/crm"

echo "=== Deploying to ${VPS_IP} ==="

echo "=== Syncing files to VPS ==="
rsync -avz --delete \
    --exclude node_modules \
    --exclude .next \
    --exclude .git \
    --exclude pgdata \
    --exclude '.env' \
    --exclude '.env.test' \
    --exclude tests \
    --exclude playwright-report \
    --exclude test-results \
    --exclude coverage \
    ./ "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/"

echo "=== Building and deploying on VPS ==="
ssh "${VPS_USER}@${VPS_IP}" << 'REMOTE'
    set -euo pipefail
    cd /opt/crm

    echo "--- Building Docker image ---"
    docker compose -f docker-compose.production.yml build app

    echo "--- Starting services ---"
    docker compose -f docker-compose.production.yml up -d

    echo "--- Waiting for PostgreSQL to be ready ---"
    sleep 5

    echo "--- Running database migrations ---"
    docker compose -f docker-compose.production.yml exec -T app npx prisma migrate deploy

    echo "--- Restarting app to pick up migrations ---"
    docker compose -f docker-compose.production.yml restart app

    echo "--- Cleaning up old Docker images ---"
    docker image prune -f

    echo "--- Done! ---"
    docker compose -f docker-compose.production.yml ps
REMOTE

echo ""
echo "=== Deployment complete! ==="
echo "Access your CRM at: http://${VPS_IP}"
