# Monitoring Stack - BizlyCRM

## Quick Start

### Prerequisites
- Main application stack running: `docker compose -f docker-compose.production.yml up -d`
- Environment variables set in `.env.production`:
  - `TELEGRAM_BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
  - `TELEGRAM_CHAT_ID` — target chat/group (use [@userinfobot](https://t.me/userinfobot) to get ID)
  - `WEBHOOK_SECRET` — `openssl rand -hex 16`
  - `GF_SECURITY_ADMIN_PASSWORD` — strong password for Grafana admin
  - `CRON_SECRET` — already set for the app

### Start Monitoring Stack

```bash
cd /opt/crm
docker compose -f docker-compose.production.yml -f docker-compose.monitoring.yml up -d
```

### Stop Monitoring (without affecting the app)

```bash
docker compose -f docker-compose.production.yml -f docker-compose.monitoring.yml stop grafana prometheus loki promtail alertmanager node-exporter postgres-exporter redis-exporter webhook-receiver
```

## Access

- **Grafana**: https://monitoring.bizlycrm.com (login: admin / your GF_SECURITY_ADMIN_PASSWORD)
- **Prometheus** (internal only): http://prometheus:9090
- **Alertmanager** (internal only): http://alertmanager:9093

## Dashboards

| Dashboard | UID | Description |
|-----------|-----|-------------|
| System Overview | `system-overview` | CPU, RAM, disk, network |
| Application Performance | `app-performance` | Request rate, latency, errors, Node.js heap |
| CRM Business | `crm-business` | DB connections, Redis, Inngest jobs |
| Alerts Overview | `alerts-overview` | Active alerts, history, severity |

## Adding a New Alert Rule

1. Edit `monitoring/prometheus/alert-rules.yml`
2. Add your rule under the appropriate group (infrastructure/application/business)
3. Reload Prometheus: `curl -X POST http://localhost:9090/-/reload`

Example:
```yaml
- alert: MyCustomAlert
  expr: my_metric > threshold
  for: 5m
  labels:
    severity: warning
    category: business
  annotations:
    summary: "Description of what happened"
    action: "What to do about it"
    dashboard: "/d/app-performance"
```

## Testing Telegram Integration

```bash
# From the VPS:
curl -X POST http://localhost:9095/test
```

## Architecture

```
Internet → Nginx → Grafana (:3001)
                  → App (:3000)

Prometheus → scrapes → App /api/metrics
                     → node_exporter
                     → postgres_exporter
                     → redis_exporter

Prometheus → pushes alerts → Alertmanager → webhook-receiver → Telegram
                                                             → Playbooks

Promtail → reads Docker logs → Loki ← Grafana queries
```

## Memory Budget (1.3GB total)

| Service | Limit |
|---------|-------|
| Grafana | 256MB |
| Prometheus | 384MB |
| Loki | 256MB |
| Promtail | 128MB |
| Alertmanager | 64MB |
| node_exporter | 64MB |
| postgres_exporter | 64MB |
| redis_exporter | 32MB |
| webhook-receiver | 64MB |

## Auto-Remediation

Playbooks in `scripts/playbooks/` run automatically when alerts fire:
- Level 2 (warning): Diagnostic snapshot sent to Telegram
- Level 3 (critical): Automated remediation (container restart, cleanup)

Controlled by `ENABLE_AUTO_REMEDIATION=true` in docker-compose.monitoring.yml.
