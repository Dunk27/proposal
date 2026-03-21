# ProposeAI v4 — Production-ready

ИИ-сервис генерации коммерческих предложений. Готов к деплою и продажам.

## Стек

| Слой | Технология |
|---|---|
| Хостинг | Vercel (Serverless + Edge) |
| База данных | Supabase (PostgreSQL + Auth + Storage) |
| ИИ | Claude Sonnet/Opus/Haiku, GPT-4o/mini, Gemini Pro/Flash |
| Оплата РФ | YooKassa |
| Оплата крипто | NOWPayments |
| Оплата международная | Stripe |
| Email | Resend |
| Rate Limiting | Upstash Redis |
| Мониторинг | Sentry |

## Структура

```
propose-ai/
├── api/                          ← 18 Serverless функций
│   ├── auth.js                   регистрация, логин, выход, сброс пароля
│   ├── generate.js               мульти-ИИ генерация + auth + лимиты
│   ├── user.js                   профиль, план, usage, компания
│   ├── proposals.js              история КП (GET, DELETE)
│   ├── export.js                 экспорт в DOCX
│   ├── billing.js                подписка, Stripe portal, отмена
│   ├── email.js                  транзакционные письма (Resend)
│   ├── cron.js                   автозадачи (триал, reset usage)
│   ├── onboarding.js             профиль компании при онбординге
│   ├── invite.js                 система инвайтов для бета-теста
│   ├── admin.js                  admin-статистика (закрыт ADMIN_KEY)
│   ├── health.js                 healthcheck для UptimeRobot
│   ├── checkout.js               Stripe checkout
│   ├── webhook.js                Stripe webhook
│   ├── yookassa-checkout.js      YooKassa создание платежа
│   ├── yookassa-webhook.js       YooKassa webhook → активация плана
│   ├── nowpayments-checkout.js   NOWPayments инвойс
│   └── nowpayments-webhook.js    NOWPayments IPN → активация плана
├── lib/
│   └── supabase.js               общие утилиты: getUserFromToken, checkPlan, usage
├── middleware/
│   └── auth.js                   Edge Middleware: JWT + rate limiting
├── public/
│   ├── landing.html              / — лендинг с ценами, FAQ, CTA
│   ├── index.html                /app — генератор КП
│   ├── dashboard.html            /dashboard — история + оплата
│   ├── account/index.html        /account — профиль, биллинг, безопасность
│   ├── auth/login.html           /auth/login — вход, регистрация, сброс
│   ├── onboarding/index.html     /onboarding — 3-шаговый визард
│   ├── admin/index.html          /admin — панель администратора
│   └── legal/
│       ├── privacy.html          /legal/privacy — политика конф.
│       └── terms.html            /legal/terms — пользовательское соглашение
├── sql/
│   ├── schema.sql                полная схема + RLS + триггеры
│   └── functions.sql             increment_usage()
├── scripts/
│   ├── deploy-check.sh           проверка перед деплоем
│   └── seed-invites.sh           создание инвайтов для бета-тестеров
├── vercel.json                   маршруты + 3 cron-задачи
├── package.json
├── .env.example                  все переменные с комментариями
└── README.md
```

## Быстрый старт

### 1. Supabase
1. Создать проект на https://supabase.com
2. SQL Editor → запустить `sql/schema.sql`
3. SQL Editor → запустить `sql/functions.sql`
4. Скопировать Project URL, anon key, service_role key

### 2. YooKassa (карты РФ)
1. Зарегистрироваться на https://yookassa.ru
2. Подключить магазин (нужен ИП или ООО)
3. Настройки → API → создать секретный ключ
4. HTTP-уведомления → добавить URL: `https://yourdomain.ru/api/yookassa-webhook`

### 3. NOWPayments (крипто)
1. Зарегистрироваться на https://nowpayments.io
2. Store Settings → API Keys → создать ключ
3. Store Settings → IPN → добавить URL: `https://yourdomain.ru/api/nowpayments-webhook`

### 4. Stripe (международные карты, опционально)
1. https://dashboard.stripe.com → Products → создать 3 продукта
2. Скопировать Price IDs (price_xxx)
3. Webhooks → добавить endpoint: `https://yourdomain.ru/api/stripe-webhook`
4. Events: `checkout.session.completed`, `customer.subscription.deleted`

### 5. Resend (транзакционная почта)
1. Зарегистрироваться на https://resend.com
2. Добавить и верифицировать домен
3. Создать API Key
4. Supabase Dashboard → Settings → Auth → SMTP → вставить данные Resend

### 6. Upstash Redis (rate limiting)
1. Зарегистрироваться на https://upstash.com
2. Create Database → REST API → скопировать URL и TOKEN

### 7. Деплой
```bash
# Проверка перед деплоем
bash scripts/deploy-check.sh

# Деплой
npm install -g vercel
vercel --prod
```

### 8. После деплоя
```bash
# Проверить что всё работает
curl https://yourdomain.ru/api/health

# Создать первые инвайты для бета-тестеров
ADMIN_KEY=your_key APP_URL=https://yourdomain.ru \
  bash scripts/seed-invites.sh beta1@test.ru beta2@test.ru

# Зарегистрировать UptimeRobot
# URL: https://yourdomain.ru/api/health
# Интервал: 1 минута
```

## Переменные окружения (все)

```env
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ИИ
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_AI_KEY=

# Платежи
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
STRIPE_SECRET_KEY=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_PRO=
STRIPE_PRICE_AGENCY=
STRIPE_WEBHOOK_SECRET=

# Email
RESEND_API_KEY=
EMAIL_FROM=ProposeAI <noreply@yourdomain.ru>

# Rate limiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Приложение
APP_URL=https://yourdomain.ru
ADMIN_KEY=
CRON_SECRET=
SENTRY_DSN=
```

## Тарифы

| Тариф | Цена | КП/мес | Модели |
|---|---|---|---|
| Free | 0 ₽ | 3 | Claude Haiku |
| Starter | 990 ₽/мес | 20 | Sonnet + Haiku |
| Pro | 2 990 ₽/мес | ∞ | Все 6 моделей |
| Agency | 7 900 ₽/мес | ∞ | Все + White-label |

Trial: 14 дней Pro без карты.

## Маршруты страниц

| URL | Страница |
|---|---|
| / | Лендинг |
| /app | Генератор КП |
| /auth/login | Вход / Регистрация |
| /onboarding | Первичная настройка |
| /dashboard | История КП |
| /account | Профиль + биллинг |
| /admin | Панель администратора |
| /legal/privacy | Политика конф. |
| /legal/terms | Пользовательское соглашение |
| /api/health | Health check |
