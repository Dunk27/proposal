#!/usr/bin/env bash
# scripts/seed-invites.sh — создать инвайты для бета-тестеров
# Использование: ADMIN_KEY=xxx APP_URL=https://... bash scripts/seed-invites.sh email1@test.ru email2@test.ru

set -e
ADMIN_KEY="${ADMIN_KEY:-}"
APP_URL="${APP_URL:-http://localhost:3000}"

if [ -z "$ADMIN_KEY" ]; then echo "Задайте ADMIN_KEY=xxx"; exit 1; fi
if [ $# -eq 0 ]; then echo "Укажите email'ы: bash scripts/seed-invites.sh user@test.ru"; exit 1; fi

for EMAIL in "$@"; do
  echo -n "Создаём инвайт для $EMAIL ... "
  RESP=$(curl -s -X POST "$APP_URL/api/invite" \
    -H "Content-Type: application/json" \
    -H "X-Admin-Key: $ADMIN_KEY" \
    -d "{\"email\":\"$EMAIL\",\"plan\":\"pro\",\"days\":30,\"note\":\"beta\"}")
  CODE=$(echo $RESP | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('code','ERROR'))" 2>/dev/null || echo "ERROR")
  URL=$(echo $RESP | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('inviteUrl',''))" 2>/dev/null || echo "")
  if [ "$CODE" != "ERROR" ]; then
    echo "✓ Код: $CODE"
    echo "  URL: $URL"
  else
    echo "✗ $RESP"
  fi
done
