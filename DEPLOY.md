# Деплой ProposeAI на Vercel — пошаговая инструкция

## Структура проекта (уже правильная)

```
proposeai-deploy/          ← КОРЕНЬ ДЕПЛОЯ (именно эту папку деплоить)
├── api/                   ← Serverless functions (Vercel подхватывает автоматически)
│   ├── generate.js
│   ├── auth.js
│   ├── lib/               ← Общие утилиты (импортируются как './lib/supabase.js')
│   │   ├── supabase.js
│   │   ├── cache.js
│   │   └── ...
│   └── ...
├── public/                ← Статические файлы (Vercel раздаёт как /)
│   ├── landing.html       → GET /landing.html, перенаправляется с /
│   ├── index.html         → GET /index.html, перенаправляется с /app
│   ├── dashboard.html
│   └── ...
├── vercel.json            ← Только rewrites + crons (не builds!)
└── package.json
```

## Шаг 1 — Установить Vercel CLI и залогиниться

```bash
npm install -g vercel
vercel login
```

## Шаг 2 — Перейти в папку и задеплоить

```bash
cd proposeai-deploy    # ОБЯЗАТЕЛЬНО войти в папку
vercel --prod
```

При первом деплое Vercel спросит:
- "Set up and deploy?" → **Y**
- "Which scope?" → выберите ваш аккаунт
- "Link to existing project?" → **N** (создать новый)
- "What's your project's name?" → **propose-ai**
- "In which directory is your code located?" → **./** (текущая папка)
- "Want to modify these settings?" → **N**

## Шаг 3 — Задать переменные окружения

В Vercel Dashboard → Settings → Environment Variables:

```
SUPABASE_URL               = https://xxxx.supabase.co
SUPABASE_ANON_KEY          = eyJ...
SUPABASE_SERVICE_ROLE_KEY  = eyJ...
ANTHROPIC_API_KEY          = sk-ant-...
YOOKASSA_SHOP_ID           = 123456
YOOKASSA_SECRET_KEY        = test_...
NOWPAYMENTS_API_KEY        = xxx
ADMIN_KEY                  = любая-длинная-строка
APP_URL                    = https://ваш-домен.vercel.app
```

Или через CLI (удобнее):
```bash
vercel env add SUPABASE_URL
vercel env add ANTHROPIC_API_KEY
# и т.д.
```

## Шаг 4 — Запустить SQL в Supabase

В Supabase Dashboard → SQL Editor:
1. Запустить весь файл `sql/schema.sql`
2. Запустить `sql/functions.sql`

## Шаг 5 — Проверить деплой

```bash
curl https://ваш-домен.vercel.app/api/health
# Должен вернуть: {"status":"ok",...}
```

## Диагностика если 404

1. Убедитесь что деплоите из `proposeai-deploy/`, а не из родительской папки
2. Проверьте Vercel Dashboard → Deployments → последний деплой → Functions
   - Должны отображаться все api/*.js файлы
3. Vercel Dashboard → Deployments → последний деплой → Source
   - Должны видеть api/, public/, vercel.json в корне

## Проверка роутов

| URL | Что должно открыться |
|-----|---------------------|
| / | Лендинг (landing.html) |
| /app | Генератор КП (index.html) |
| /auth/login | Страница входа |
| /dashboard | История КП |
| /account | Настройки |
| /api/health | {"status":"ok"} |
