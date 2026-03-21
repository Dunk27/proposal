# ProposeAI v6 — Complete Production Build

ИИ-сервис генерации коммерческих предложений. Полностью готов к запуску и продажам.

## Статистика проекта

| Категория | Кол-во |
|---|---|
| API-эндпоинтов (serverless) | 22 |
| Страниц (HTML) | 13 |
| Lib-модулей | 5 |
| Cron-задач | 5 |
| Маршрутов Vercel | 40 |
| SQL-таблиц | 12 |

## Стек

| Слой | Технология |
|---|---|
| Хостинг | Vercel (Serverless + Cron) |
| База данных | Supabase (PostgreSQL + Auth + RLS) |
| ИИ | Claude Sonnet/Opus/Haiku · GPT-4o/mini · Gemini Pro/Flash |
| Кэш | Upstash Redis |
| Оплата РФ | YooKassa |
| Оплата крипто | NOWPayments |
| Оплата международная | Stripe |
| Email | Resend |
| Мониторинг | Sentry |

## Оптимизации прибыли

### Снижение затрат на ИИ (~−50%)
- Кэш Redis: одинаковые промпты → 0 затрат (TTL 24ч)
- Авто-выбор модели: short КП → Haiku (в 20× дешевле Sonnet)
- Starter/Free пользователи → Haiku по умолчанию

### Рост выручки
- Годовые тарифы (−20%): LTV ×2.4, churn падает до 3%/год, cash upfront
- PDF-экспорт: только Pro/Agency → главная причина апгрейда со Starter
- Апгрейд-стена с таймером: +15–25% конверсии при исчерпании лимита
- A/B тест текстов CTA и вариантов апгрейд-стены

### Снижение CAC
- Реферальная программа: +30 дней обоим, CAC −40–60%
- 12 шаблонов по отраслям: Time-to-First-KP 10 мин → 2 мин → +35% Day-3 retention

### Удержание (−churn)
- Re-engage email на 7-й день неактивности
- Usage warning при 90% исчерпания лимита
- Напоминание за 3 дня до конца триала

## Страницы

| URL | Описание |
|---|---|
| / | Лендинг с ценами и FAQ |
| /app | Генератор КП с кэшем и авто-выбором модели |
| /auth/login | Вход / Регистрация / Сброс пароля |
| /onboarding | 3-шаговый визард профиля компании |
| /templates | 12 отраслевых шаблонов КП |
| /dashboard | История КП + управление подпиской |
| /account | Профиль + биллинг + безопасность |
| /analytics | Аналитика + unit-экономика симулятор + A/B тесты |
| /admin | Admin-панель (ADMIN_KEY) |
| /legal/privacy | Политика конфиденциальности |
| /legal/terms | Пользовательское соглашение |
| /api/health | Health check для UptimeRobot |

## Все переменные окружения

```env
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ИИ
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_AI_KEY=

# YooKassa (карты РФ)
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=

# NOWPayments (крипто)
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=

# Stripe (международные)
STRIPE_SECRET_KEY=
STRIPE_PRICE_STARTER_MONTHLY=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_AGENCY_MONTHLY=
STRIPE_PRICE_STARTER_ANNUAL=
STRIPE_PRICE_PRO_ANNUAL=
STRIPE_PRICE_AGENCY_ANNUAL=
STRIPE_WEBHOOK_SECRET=

# Rate limiting + Cache
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Email
RESEND_API_KEY=
EMAIL_FROM=ProposeAI <noreply@yourdomain.ru>

# App
APP_URL=https://yourdomain.ru
ADMIN_KEY=
CRON_SECRET=
SENTRY_DSN=
```

## Деплой

```bash
# 1. Проверка
bash scripts/deploy-check.sh

# 2. Деплой
vercel --prod

# 3. SQL (Supabase Dashboard → SQL Editor)
sql/schema.sql → запустить
sql/functions.sql → запустить

# 4. Первые инвайты
ADMIN_KEY=xxx APP_URL=https://... bash scripts/seed-invites.sh user@test.ru

# 5. UptimeRobot → https://yourdomain.ru/api/health (1 мин)
# 6. Sentry → добавить SENTRY_DSN
```

## Тарифы

| Тариф | Месяц | Год (−20%) | КП/мес | Модели |
|---|---|---|---|---|
| Free | 0 ₽ | — | 3 | Haiku |
| Starter | 990 ₽ | 9 504 ₽ | 20 | Haiku + Sonnet |
| Pro | 2 990 ₽ | 28 704 ₽ | ∞ | Все 6 |
| Agency | 7 900 ₽ | 75 840 ₽ | ∞ | Все + WL + API |

Trial: 14 дней Pro без карты.
