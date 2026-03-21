// api/generate.js — Мульти-ИИ генерация
// v2: кэширование Redis + авто-выбор модели по длине + план-гейт
import { getUserFromToken, checkUserPlan, checkAndIncrementUsage, getSupabaseAdmin } from '../lib/supabase.js'
// Analytics tracked server-side via Supabase directly (no external calls needed)
async function trackEvent(supabase, userId, event, properties = {}) {
  try {
    await supabase.from('analytics_events').insert({ user_id: userId, event, properties })
  } catch (e) { /* non-blocking */ }
}
import { makeCacheKey, getCache, setCache }       from '../lib/cache.js'
import { routeModel, canUseModel, MODEL_COST_RUB } from '../lib/model-router.js'
import { trackEvent, EVENTS }                               from './analytics.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  // ── AUTH ─────────────────────────────────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Необходима авторизация' })

  const user = await getUserFromToken(token)
  if (!user) return res.status(401).json({ error: 'Токен недействителен' })

  // ── ПЛАН ─────────────────────────────────────────────────
  const { plan, reason: planReason } = await checkUserPlan(user.id)
  if (planReason) return res.status(403).json({ error: planReason, upgrade: true })

  const { prompt, model: reqModel = 'auto', length = 'medium', clientName, clientIndustry } = req.body || {}
  if (!prompt) return res.status(400).json({ error: 'Поле prompt обязательно' })

  // ── МАРШРУТИЗАЦИЯ МОДЕЛИ ─────────────────────────────────
  const { model, apiModelId, isAutoSelected, estimatedCostRub } = routeModel(reqModel, length, plan)

  // Проверка доступа к выбранной модели
  if (!canUseModel(model, plan)) {
    return res.status(403).json({
      error:          `Модель ${model} недоступна в тарифе ${plan}`,
      upgrade:        true,
      upgradeMessage: 'Перейдите на Pro для доступа ко всем моделям',
    })
  }

  // ── КЭШИРОВАНИЕ ──────────────────────────────────────────
  // Кэш включается только для одинаковых комбинаций модель+промпт.
  // Персональные данные (имя клиента) попадают в промпт → уникальный хэш.
  // Это работает когда разные пользователи спрашивают схожие КП.
  const cacheKey = makeCacheKey(model, prompt)
  const cached   = await getCache(cacheKey)

  if (cached) {
    // Cache HIT — не тратим API, но всё равно инкрементируем usage и сохраняем в историю
    const { allowed, count, limit, reason: limitReason } = await checkAndIncrementUsage(user.id, plan)
    if (!allowed) {
      return res.status(429).json({
        error:          limitReason,
        upgrade:        true,
        used:           count,
        limit,
        upgradeMessage: `Вы использовали ${limit}/${limit} КП. Перейдите на Pro.`,
      })
    }
    await _saveProposal({ userId: user.id, title: `КП для ${clientName || 'клиента'} — ${new Date().toLocaleDateString('ru-RU')}`, clientName, clientIndustry, model, text: cached.text, wordCount: cached.wordCount })
    await trackEvent(user.id, EVENTS.KP_GENERATED, { model, length, plan, fromCache: true })
    const supabaseForTrack = getSupabaseAdmin()
    await trackEvent(supabaseForTrack, user.id, 'cache_hit', { model })
    await trackEvent(supabaseForTrack, user.id, 'kp_generated', { model, length, fromCache: true })
    return res.status(200).json({ text: cached.text, used: count, limit, plan, model, fromCache: true, savedCost: estimatedCostRub })
  }

  // ── ЛИМИТ ────────────────────────────────────────────────
  const { allowed, count, limit, reason: limitReason } = await checkAndIncrementUsage(user.id, plan)
  if (!allowed) {
    return res.status(429).json({
      error:          limitReason,
      upgrade:        true,
      used:           count,
      limit,
      upgradeMessage: `Вы использовали ${limit}/${limit} КП. Перейдите на Pro для безлимитной генерации.`,
    })
  }

  // ── ВЫЗОВ ИИ ─────────────────────────────────────────────
  try {
    let text = ''

    if (model.startsWith('claude')) {
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) throw new Error('ANTHROPIC_API_KEY не задан')
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body:    JSON.stringify({ model: apiModelId, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error?.message || `Anthropic ${r.status}`)
      text = d.content?.[0]?.text || ''
    }
    else if (model.startsWith('gpt')) {
      const key = process.env.OPENAI_API_KEY
      if (!key) throw new Error('OPENAI_API_KEY не задан')
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body:    JSON.stringify({ model: apiModelId, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error?.message || `OpenAI ${r.status}`)
      text = d.choices?.[0]?.message?.content || ''
    }
    else if (model.startsWith('gemini')) {
      const key = process.env.GOOGLE_AI_KEY
      if (!key) throw new Error('GOOGLE_AI_KEY не задан')
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiModelId}:generateContent?key=${key}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 4096 } }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error?.message || `Gemini ${r.status}`)
      text = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
    }
    else {
      throw new Error(`Неизвестная модель: ${model}`)
    }

    const wordCount = text.split(/\s+/).length

    // Записать в кэш
    await setCache(cacheKey, { text, wordCount })

    // Сохранить в историю
    const title = `КП для ${clientName || 'клиента'} — ${new Date().toLocaleDateString('ru-RU')}`
    await _saveProposal({ userId: user.id, title, clientName, clientIndustry, model, text, wordCount })

    // Track analytics
    await trackEvent(user.id, EVENTS.KP_GENERATED, { model, length, plan, fromCache: false })
    if (count === 1) await trackEvent(user.id, EVENTS.FIRST_KP, { model })

    // Track generation event
    const supabaseTrack = getSupabaseAdmin()
    await trackEvent(supabaseTrack, user.id, 'kp_generated', { model, length, isAutoSelected, estimatedCostRub })
    await trackEvent(supabaseTrack, user.id, 'model_used', { model })

    return res.status(200).json({
      text, used: count, limit, plan,
      model,
      isAutoSelected,
      estimatedCostRub,
      fromCache: false,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

async function _saveProposal({ userId, title, clientName, clientIndustry, model, text, wordCount }) {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('proposals').insert({
      user_id:          userId,
      title,
      client_name:      clientName || null,
      client_industry:  clientIndustry || null,
      model,
      content:          text,
      word_count:       wordCount,
    })
  } catch (e) {
    console.error('_saveProposal:', e.message)
  }
}
