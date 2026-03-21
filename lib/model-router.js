// lib/model-router.js — автовыбор ИИ-модели по длине КП и плану
// Логика: дешёвые модели для коротких КП, мощные — для длинных и Pro
//
// Экономия: Haiku в 20× дешевле Sonnet
//   Sonnet 4: $3/1M input + $15/1M output  ≈ 8 ₽/КП
//   Haiku 4:  $0.8/1M input + $4/1M output ≈ 1.5 ₽/КП

const MODEL_API_IDS = {
  'claude-sonnet-4': 'claude-sonnet-4-20250514',
  'claude-opus-4':   'claude-opus-4-20250514',
  'claude-haiku-4':  'claude-haiku-4-5-20251001',
  'gpt-4o':          'gpt-4o',
  'gpt-4o-mini':     'gpt-4o-mini',
  'gemini-pro':      'gemini-1.5-pro',
  'gemini-flash':    'gemini-1.5-flash',
}

// Приблизительная стоимость в рублях за одно КП (при средней длине)
export const MODEL_COST_RUB = {
  'claude-haiku-4':  1.5,
  'gpt-4o-mini':     2.0,
  'gemini-flash':    1.8,
  'claude-sonnet-4': 8.0,
  'gemini-pro':      6.0,
  'gpt-4o':         18.0,
  'claude-opus-4':  35.0,
}

/**
 * Выбрать оптимальную модель:
 * - Если пользователь явно указал модель — уважаем выбор
 * - Если модель 'auto' (или не указана) — выбираем по длине и плану
 *
 * @param {string} requestedModel  — модель из запроса ('auto' | 'claude-sonnet-4' | ...)
 * @param {string} length          — 'short' | 'medium' | 'long'
 * @param {string} plan            — 'free' | 'trial' | 'starter' | 'pro' | 'agency'
 * @returns {{ model: string, apiModelId: string, isAutoSelected: boolean, estimatedCostRub: number }}
 */
export function routeModel(requestedModel, length, plan) {
  const isAuto = !requestedModel || requestedModel === 'auto'

  let model
  if (!isAuto) {
    model = requestedModel
  } else {
    // Автовыбор по длине и плану
    if (length === 'short') {
      // Короткие КП — Haiku всегда справляется
      model = 'claude-haiku-4'
    } else if (length === 'medium') {
      // Средние — Haiku для Free/Starter, Sonnet для Pro
      model = ['pro', 'agency'].includes(plan) ? 'claude-sonnet-4' : 'claude-haiku-4'
    } else {
      // Длинные — Sonnet для всех, Opus только Agency
      model = plan === 'agency' ? 'claude-opus-4' : 'claude-sonnet-4'
    }
  }

  const apiModelId = MODEL_API_IDS[model] || MODEL_API_IDS['claude-sonnet-4']
  const estimatedCostRub = MODEL_COST_RUB[model] || 8

  return { model, apiModelId, isAutoSelected: isAuto, estimatedCostRub }
}

// Проверить что модель доступна для данного плана
export function canUseModel(model, plan) {
  const PLAN_MODELS = {
    free:    ['claude-haiku-4', 'gpt-4o-mini', 'gemini-flash'],
    trial:   ['claude-haiku-4', 'claude-sonnet-4', 'gpt-4o', 'gpt-4o-mini', 'gemini-pro', 'gemini-flash'],
    starter: ['claude-haiku-4', 'claude-sonnet-4', 'gpt-4o-mini', 'gemini-flash'],
    pro:     ['claude-haiku-4', 'claude-sonnet-4', 'claude-opus-4', 'gpt-4o', 'gpt-4o-mini', 'gemini-pro', 'gemini-flash'],
    agency:  ['claude-haiku-4', 'claude-sonnet-4', 'claude-opus-4', 'gpt-4o', 'gpt-4o-mini', 'gemini-pro', 'gemini-flash'],
  }
  return (PLAN_MODELS[plan] || PLAN_MODELS.free).includes(model)
}
