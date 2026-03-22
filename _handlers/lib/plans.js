// lib/plans.js — единый источник правды по тарифам
// Используется в checkout, webhook, лендинге, дашборде

export const PLANS = {
  // ── МЕСЯЧНЫЕ ────────────────────────────────────────────
  starter_monthly: {
    id:          'starter_monthly',
    name:        'Стартовый',
    period:      'monthly',
    priceRub:    990,
    priceUsd:    11,
    kpLimit:     20,
    models:      ['llama-3.3-70b', 'llama-3.1-8b', 'gemini-2-flash', 'mistral-small', 'command-r'],
    features:    ['20 КП/месяц', 'Текст + Инфографика в КП', 'Экспорт TXT и PDF', 'История КП'],
    stripeEnv:   'STRIPE_PRICE_STARTER_MONTHLY',
    yooDesc:     'Т-Профит КП Стартовый — 20 КП/месяц',
    planKey:     'starter',
  },
  pro_monthly: {
    id:          'pro_monthly',
    name:        'Оптимальный',
    period:      'monthly',
    priceRub:    2990,
    priceUsd:    33,
    kpLimit:     50,
    models:      ['llama-3.3-70b', 'llama-3.1-8b', 'gemini-2-flash', 'mistral-small', 'command-r', 'claude-haiku-4', 'claude-sonnet-4', 'gpt-4o', 'gpt-4o-mini', 'gemini-pro', 'gemini-flash'],
    features:    ['50 КП/месяц', 'Текст + Фото + Инфографика', 'Приоритетные модели ИИ', 'Профиль компании', 'Шаблоны 20+ отраслей', 'Экспорт DOCX + PDF'],
    popular:     true,
    stripeEnv:   'STRIPE_PRICE_PRO_MONTHLY',
    yooDesc:     'Т-Профит КП Оптимальный — безлимит КП',
    planKey:     'pro',
  },
  agency_monthly: {
    id:          'agency_monthly',
    name:        'ПРО',
    period:      'monthly',
    priceRub:    7900,
    priceUsd:    88,
    kpLimit:     9999,
    models:      ['claude-haiku-4', 'claude-sonnet-4', 'claude-opus-4', 'gpt-4o', 'gpt-4o-mini', 'gemini-pro', 'gemini-flash'],
    features:    ['Всё из Pro', 'White-label', 'API-доступ', 'Безлимит команда'],
    stripeEnv:   'STRIPE_PRICE_AGENCY_MONTHLY',
    yooDesc:     'Т-Профит КП ПРО',
    planKey:     'agency',
  },

  // ── ГОДОВЫЕ (−20%) ───────────────────────────────────────
  starter_annual: {
    id:          'starter_annual',
    name:        'Стартовый',
    period:      'annual',
    priceRub:    9504,       // 990 × 12 × 0.8
    perMonthRub: 792,
    priceUsd:    106,
    kpLimit:     20,
    models:      ['llama-3.3-70b', 'llama-3.1-8b', 'gemini-2-flash', 'mistral-small', 'command-r'],
    features:    ['20 КП/месяц', 'Llama 3.3 · Gemini · Mistral', 'Только бесплатные ИИ', 'Экспорт TXT', 'История КП', 'Скидка 20%'],
    stripeEnv:   'STRIPE_PRICE_STARTER_ANNUAL',
    yooDesc:     'Т-Профит КП Стартовый Годовой — 20 КП/месяц',
    planKey:     'starter',
    discount:    20,
  },
  pro_annual: {
    id:          'pro_annual',
    name:        'Оптимальный',
    period:      'annual',
    priceRub:    28704,      // 2990 × 12 × 0.8
    perMonthRub: 2392,
    priceUsd:    318,
    kpLimit:     9999,
    models:      ['claude-haiku-4', 'claude-sonnet-4', 'claude-opus-4', 'gpt-4o', 'gpt-4o-mini', 'gemini-pro', 'gemini-flash'],
    features:    ['Безлимит КП', 'Все 6 ИИ-моделей', 'Экспорт DOCX + PDF', 'Автовыбор модели', 'Скидка 20%'],
    popular:     true,
    stripeEnv:   'STRIPE_PRICE_PRO_ANNUAL',
    yooDesc:     'Т-Профит КП Оптимальный Годовой — безлимит КП',
    planKey:     'pro',
    discount:    20,
  },
  agency_annual: {
    id:          'agency_annual',
    name:        'ПРО',
    period:      'annual',
    priceRub:    75840,      // 7900 × 12 × 0.8
    perMonthRub: 6320,
    priceUsd:    843,
    kpLimit:     9999,
    models:      ['claude-haiku-4', 'claude-sonnet-4', 'claude-opus-4', 'gpt-4o', 'gpt-4o-mini', 'gemini-pro', 'gemini-flash'],
    features:    ['Всё из Pro', 'White-label', 'API-доступ', 'Безлимит команда', 'Скидка 20%'],
    stripeEnv:   'STRIPE_PRICE_AGENCY_ANNUAL',
    yooDesc:     'Т-Профит КП ПРО Годовой',
    planKey:     'agency',
    discount:    20,
  },
}

// Утилиты
export function getPlan(planId) { return PLANS[planId] || null }
export function getMonthlyPlans() { return Object.values(PLANS).filter(p => p.period === 'monthly') }
export function getAnnualPlans()  { return Object.values(PLANS).filter(p => p.period === 'annual') }

// Получить duration для активации в БД
export function getPlanDurationDays(planId) {
  const p = PLANS[planId]
  if (!p) return 30
  return p.period === 'annual' ? 365 : 30
}
