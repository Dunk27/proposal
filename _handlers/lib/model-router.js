// lib/model-router.js — автовыбор ИИ-модели по длине КП и плану
//
// Бесплатные модели (не требуют оплаты):
//   Groq:    llama-3.3-70b, llama-3.1-8b — очень быстрые, бесплатный tier
//   Gemini:  gemini-2.0-flash — бесплатный tier (1500 req/day)
//   Mistral: mistral-small — бесплатный tier (1 req/sec)
//   Cohere:  command-r — бесплатный tier (20 req/min)
//
// Платные модели (для Pro/Agency):
//   Claude Haiku  ≈ 1.5 ₽/КП
//   GPT-4o-mini   ≈ 2.0 ₽/КП
//   Claude Sonnet ≈ 8.0 ₽/КП
//   GPT-4o        ≈ 18  ₽/КП
//   Claude Opus   ≈ 35  ₽/КП

export const MODEL_API_IDS = {
  // ── Бесплатные ──────────────────────────────────────────
  'llama-3.3-70b':    'llama-3.3-70b-versatile',      // Groq
  'llama-3.1-8b':     'llama-3.1-8b-instant',          // Groq (самый быстрый)
  'gemini-2-flash':   'gemini-2.0-flash',               // Google бесплатный
  'mistral-small':    'mistral-small-latest',           // Mistral бесплатный
  'command-r':        'command-r',                      // Cohere бесплатный

  // ── Платные ─────────────────────────────────────────────
  'claude-haiku-4':   'claude-haiku-4-5-20251001',
  'claude-sonnet-4':  'claude-sonnet-4-20250514',
  'claude-opus-4':    'claude-opus-4-20250514',
  'gpt-4o-mini':      'gpt-4o-mini',
  'gpt-4o':           'gpt-4o',
  'gemini-pro':       'gemini-1.5-pro',
  'gemini-flash':     'gemini-1.5-flash',
}

// Приблизительная стоимость в рублях за одно КП
export const MODEL_COST_RUB = {
  // Бесплатные
  'llama-3.3-70b':   0,
  'llama-3.1-8b':    0,
  'gemini-2-flash':  0,
  'mistral-small':   0,
  'command-r':       0,
  // Платные
  'claude-haiku-4':  1.5,
  'gpt-4o-mini':     2.0,
  'gemini-flash':    1.8,
  'gemini-pro':      6.0,
  'claude-sonnet-4': 8.0,
  'gpt-4o':         18.0,
  'claude-opus-4':  35.0,
}

// Какой провайдер у модели
export function getProvider(model) {
  if (model.startsWith('claude'))        return 'anthropic'
  if (model.startsWith('gpt'))           return 'openai'
  if (model.startsWith('gemini'))        return 'google'
  if (model.startsWith('llama'))         return 'groq'
  if (model.startsWith('mistral'))       return 'mistral'
  if (model.startsWith('command'))       return 'cohere'
  return 'unknown'
}

/**
 * Выбрать оптимальную модель автоматически.
 * Логика: сначала бесплатные (если ключ настроен), потом платные.
 */
export function routeModel(requestedModel, length, plan) {
  const isAuto = !requestedModel || requestedModel === 'auto'

  let model
  if (!isAuto) {
    model = requestedModel
  } else {
    if (plan === 'free') {
      // Free план — только бесплатные модели
      model = length === 'long' ? 'llama-3.3-70b' : 'llama-3.1-8b'
    } else if (plan === 'trial' || plan === 'starter') {
      model = length === 'short' ? 'llama-3.1-8b'
            : length === 'medium' ? 'llama-3.3-70b'
            : 'claude-haiku-4'
    } else {
      // Pro / Agency
      model = length === 'short'  ? 'claude-haiku-4'
            : length === 'medium' ? 'claude-sonnet-4'
            : plan === 'agency'   ? 'claude-opus-4'
            :                       'claude-sonnet-4'
    }
  }

  const apiModelId = MODEL_API_IDS[model] || MODEL_API_IDS['llama-3.3-70b']
  const estimatedCostRub = MODEL_COST_RUB[model] ?? 0

  return { model, apiModelId, isAutoSelected: isAuto, estimatedCostRub }
}

// Проверить что модель доступна для данного плана
export function canUseModel(model, plan) {
  const FREE_MODELS = ['llama-3.3-70b', 'llama-3.1-8b', 'gemini-2-flash', 'mistral-small', 'command-r']
  const PLAN_MODELS = {
    free:    FREE_MODELS,
    trial:   [...FREE_MODELS, 'claude-haiku-4', 'claude-sonnet-4', 'gpt-4o-mini', 'gemini-flash'],
    starter: [...FREE_MODELS],  // только бесплатные модели
    pro:     [...FREE_MODELS, 'claude-haiku-4', 'claude-sonnet-4', 'claude-opus-4', 'gpt-4o', 'gpt-4o-mini', 'gemini-pro', 'gemini-flash'],
    agency:  [...FREE_MODELS, 'claude-haiku-4', 'claude-sonnet-4', 'claude-opus-4', 'gpt-4o', 'gpt-4o-mini', 'gemini-pro', 'gemini-flash'],
  }
  return (PLAN_MODELS[plan] || PLAN_MODELS.free).includes(model)
}
