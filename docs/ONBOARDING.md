# Developer Onboarding

## Getting Secrets

1. Copy the example env file:
   ```bash
   cp .env.example .env
   ```

2. Generate required secrets:
   ```bash
   # SESSION_SECRET (min 32 characters)
   openssl rand -hex 32

   # CRON_SECRET
   openssl rand -hex 16

   # WHATSAPP_TOKEN_ENCRYPTION_KEY (must be exactly 64 hex chars)
   openssl rand -hex 32
   ```

3. Get API keys from the team lead. **Never share secrets via:**
   - Slack / Discord / Teams messages
   - Email
   - Git commits

   **Instead use:**
   - [onetimesecret.com](https://onetimesecret.com) (self-destructing links)
   - In-person / screen share

4. Fill in `.env` with the generated and received values.

## Setting Up Secret Scanning

Install gitleaks to prevent accidentally committing secrets:

**Windows:**
```bash
winget install Gitleaks
```

**macOS:**
```bash
brew install gitleaks
```

**Linux:**
```bash
# Download from https://github.com/gitleaks/gitleaks/releases
```

Then enable the pre-commit hook:
```bash
git config core.hooksPath .githooks
```

Verify it works:
```bash
gitleaks detect --source . --config .gitleaks.toml
```

## Production Access

Production secrets are stored in `/opt/crm/.env.production` on the VPS. Only team members with SSH access to the `deploy` user can view or modify them.

- Never copy production secrets to your local `.env`
- Never commit production secret values anywhere
- If you need to debug a production issue, use Grafana dashboards and logs

## When You Leave the Team

Notify the team lead so they can:
1. Revoke your SSH access
2. Rotate any secrets you had access to
3. Remove your API keys from third-party services

See [SECRET-ROTATION.md](./SECRET-ROTATION.md) for the full rotation procedure.
