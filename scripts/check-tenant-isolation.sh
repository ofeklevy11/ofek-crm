#!/usr/bin/env bash
# CI script: detect Prisma queries that may be missing companyId.
# Run from the project root: bash scripts/check-tenant-isolation.sh
# Exit code 0 = clean, 1 = potential violations found.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

VIOLATIONS=0

echo "=== Tenant Isolation Check ==="
echo ""

# 1. Check for Prisma query methods without companyId in the same statement block.
#    This is a heuristic — it flags files/lines for human review, not a guarantee of a bug.

# Models exempt from companyId check (no companyId field)
EXEMPT_MODELS="Company|WorkflowStage|QuoteItem|TicketComment|TicketActivityLog|NurtureSubscriber|PaymentMethodInternal|TaskSheetItem"

# Prisma methods that require WHERE with companyId
PRISMA_METHODS="findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|findMany|update|updateMany|delete|deleteMany|count|groupBy|aggregate"

echo "Checking for Prisma queries without companyId..."

# Find prisma.<model>.<method> calls and check if companyId appears within 10 lines
while IFS=: read -r file line_num content; do
  # Extract model name
  model=$(echo "$content" | grep -oP 'prisma\.(\w+)\.' | head -1 | sed 's/prisma\.\(.*\)\./\1/')

  # Skip exempt models
  if echo "$model" | grep -qP "^($EXEMPT_MODELS)$"; then
    continue
  fi

  # Skip if it's a create/createMany (companyId is in data, not where)
  if echo "$content" | grep -qP '\.(create|createMany)\('; then
    continue
  fi

  # Check if companyId appears within the next 15 lines
  end_line=$((line_num + 15))
  block=$(sed -n "${line_num},${end_line}p" "$file" 2>/dev/null || true)

  if ! echo "$block" | grep -q "companyId"; then
    echo -e "${YELLOW}  WARN${NC} $file:$line_num — $model query may be missing companyId"
    echo "        $content"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done < <(grep -rn --include='*.ts' --include='*.tsx' -P "prisma\.\w+\.($PRISMA_METHODS)\(" \
  app/ lib/ \
  2>/dev/null | grep -vP "prisma\.(\\\$transaction|\\\$queryRaw|\\\$executeRaw)" || true)

echo ""

# 2. Check for getCachedMetric calls that don't pass companyId as first arg
echo "Checking cache service calls..."
while IFS=: read -r file line_num content; do
  # The new signature expects companyId (number) as first arg
  # Flag calls that pass a string as first arg (old signature pattern)
  if echo "$content" | grep -qP 'getCachedMetric\(\s*["`'"'"']'; then
    echo -e "${YELLOW}  WARN${NC} $file:$line_num — getCachedMetric may be using old string-key signature"
    echo "        $content"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done < <(grep -rn --include='*.ts' --include='*.tsx' "getCachedMetric(" app/ lib/ 2>/dev/null || true)

echo ""

# 3. Check for inngest.send() calls missing companyId in data
echo "Checking Inngest event sends..."
while IFS=: read -r file line_num content; do
  end_line=$((line_num + 10))
  block=$(sed -n "${line_num},${end_line}p" "$file" 2>/dev/null || true)

  if ! echo "$block" | grep -q "companyId"; then
    # Check if it's a known global event (no companyId required)
    if echo "$block" | grep -qP '(meeting-reminders|manual-scan)'; then
      continue
    fi
    echo -e "${YELLOW}  WARN${NC} $file:$line_num — inngest.send() may be missing companyId"
    echo "        $content"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done < <(grep -rn --include='*.ts' --include='*.tsx' "inngest\.send(" app/ lib/ 2>/dev/null || true)

echo ""
echo "=== Results ==="

if [ "$VIOLATIONS" -eq 0 ]; then
  echo -e "${GREEN}No tenant isolation violations detected.${NC}"
  exit 0
else
  echo -e "${RED}Found $VIOLATIONS potential violation(s). Please review above.${NC}"
  exit 1
fi
