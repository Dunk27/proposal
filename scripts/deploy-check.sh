#!/usr/bin/env bash
# scripts/deploy-check.sh — финальная проверка перед деплоем
# Запустить: bash scripts/deploy-check.sh
# Проверяет что все env-переменные заданы в .env.local

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'
PASS=0; FAIL=0; WARN=0

ok()   { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}!${NC} $1"; ((WARN++)); }

echo ""
echo -e "${BOLD}ProposeAI — Pre-deploy checklist${NC}"
echo "=================================="

# Загрузить .env.local если есть
[ -f .env.local ] && export $(grep -v '^#' .env.local | xargs) 2>/dev/null

echo ""
echo -e "${BOLD}1. SUPABASE${NC}"
[ -n "$SUPABASE_URL" ]             && ok "SUPABASE_URL" || fail "SUPABASE_URL не задан"
[ -n "$SUPABASE_ANON_KEY" ]        && ok "SUPABASE_ANON_KEY" || fail "SUPABASE_ANON_KEY не задан"
[ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && ok "SUPABASE_SERVICE_ROLE_KEY" || fail "SUPABASE_SERVICE_ROLE_KEY не задан"

echo ""
echo -e "${BOLD}2. ИИ-МОДЕЛИ (хотя бы одна)${NC}"
[ -n "$ANTHROPIC_API_KEY" ] && ok "ANTHROPIC_API_KEY (Claude)" || warn "ANTHROPIC_API_KEY не задан — Claude недоступен"
[ -n "$OPENAI_API_KEY" ]    && ok "OPENAI_API_KEY (GPT-4o)" || warn "OPENAI_API_KEY не задан — GPT-4o недоступен"
[ -n "$GOOGLE_AI_KEY" ]     && ok "GOOGLE_AI_KEY (Gemini)" || warn "GOOGLE_AI_KEY не задан — Gemini недоступен"
if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ] && [ -z "$GOOGLE_AI_KEY" ]; then
  fail "Ни один API-ключ ИИ не задан!"; fi

echo ""
echo -e "${BOLD}3. ПЛАТЕЖИ${NC}"
[ -n "$YOOKASSA_SHOP_ID" ] && [ -n "$YOOKASSA_SECRET_KEY" ] \
  && ok "YooKassa (карты РФ)" || warn "YooKassa не настроена — карты РФ недоступны"
[ -n "$NOWPAYMENTS_API_KEY" ] \
  && ok "NOWPayments (крипто)" || warn "NOWPayments не настроен — крипто недоступна"
[ -n "$STRIPE_SECRET_KEY" ] && [ -n "$STRIPE_PRICE_PRO" ] \
  && ok "Stripe (международные)" || warn "Stripe не настроен — международные карты недоступны"
if [ -z "$YOOKASSA_SHOP_ID" ] && [ -z "$NOWPAYMENTS_API_KEY" ] && [ -z "$STRIPE_SECRET_KEY" ]; then
  fail "Ни один платёжный провайдер не настроен!"; fi

echo ""
echo -e "${BOLD}4. EMAIL и ИНФРА${NC}"
[ -n "$RESEND_API_KEY" ] && ok "Resend (email)" || fail "RESEND_API_KEY не задан — письма не отправляются"
[ -n "$APP_URL" ]        && ok "APP_URL: $APP_URL" || warn "APP_URL не задан — используется localhost"
[ -n "$ADMIN_KEY" ]      && ok "ADMIN_KEY (admin-панель)" || warn "ADMIN_KEY не задан — admin-панель открыта для всех!"
[ -n "$CRON_SECRET" ]    && ok "CRON_SECRET (cron-задачи)" || warn "CRON_SECRET не задан — cron эндпоинты незащищены"

echo ""
echo -e "${BOLD}5. ФАЙЛЫ ПРОЕКТА${NC}"
for f in api/generate.js api/auth.js api/yookassa-checkout.js api/nowpayments-checkout.js \
          api/billing.js api/cron.js api/email.js api/export.js api/user.js api/proposals.js \
          api/admin.js api/invite.js api/health.js lib/supabase.js middleware/auth.js \
          public/landing.html public/index.html public/dashboard.html public/account/index.html \
          public/auth/login.html public/onboarding/index.html \
          public/legal/privacy.html public/legal/terms.html \
          sql/schema.sql vercel.json package.json .env.example; do
  [ -f "$f" ] && ok "$f" || fail "$f отсутствует!"
done

echo ""
echo -e "${BOLD}6. VERCEL.JSON${NC}"
command -v python3 &>/dev/null && python3 -c "import json; json.load(open('vercel.json'))" \
  && ok "vercel.json валидный JSON" || fail "vercel.json невалидный!"

echo ""
echo "=================================="
echo -e "${GREEN}✓ Пройдено: $PASS${NC}  ${RED}✗ Ошибок: $FAIL${NC}  ${YELLOW}! Предупреждений: $WARN${NC}"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}Исправьте ошибки перед деплоем!${NC}"; exit 1
else
  echo -e "${GREEN}Готово к деплою! Запустите: vercel --prod${NC}"; fi

echo ""
echo -e "${BOLD}7. НОВЫЕ МОДУЛИ (v6)${NC}"
for f in api/ab-test.js api/analytics.js api/referral.js \
          lib/cache.js lib/model-router.js lib/plans.js lib/templates.js \
          public/account/referral.html public/templates/index.html \
          public/admin/analytics.html public/components/upgrade-wall.js; do
  [ -f "$f" ] && ok "$f" || fail "$f отсутствует!"
done

echo ""
echo "=================================="
echo -e "${GREEN}✓ Пройдено: $PASS${NC}  ${RED}✗ Ошибок: $FAIL${NC}  ${YELLOW}! Предупреждений: $WARN${NC}"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}Исправьте ошибки перед деплоем!${NC}"; exit 1
else
  echo -e "${GREEN}Готово к деплою! Запустите: vercel --prod${NC}"; fi
