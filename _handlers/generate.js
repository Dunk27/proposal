// _handlers/generate.js — Мульти-ИИ генерация
// Поддерживает: Anthropic, OpenAI, Google, Groq (бесплатно), Mistral (бесплатно), Cohere (бесплатно)

import { getUserFromToken, checkUserPlan, checkAndIncrementUsage, getSupabaseAdmin } from '../lib/supabase.js'
import { makeCacheKey, getCache, setCache }                                           from '../lib/cache.js'
import { routeModel, canUseModel, MODEL_COST_RUB, MODEL_API_IDS, getProvider }       from '../lib/model-router.js'

async function trackEvent(supabase, userId, event, properties = {}) {
  try { await supabase.from('analytics_events').insert({ user_id: userId, event, properties }) }
  catch (e) { /* non-blocking */ }
}

// ── Вызов нужного провайдера ──────────────────────────────────────────────────
async function callAI(model, apiModelId, prompt) {
  const provider = getProvider(model)

  // ANTHROPIC (Claude)
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) throw new Error('ANTHROPIC_API_KEY не задан')
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: apiModelId, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error?.message || `Anthropic ${r.status}`)
    return d.content?.[0]?.text || ''
  }

  // OPENAI (GPT)
  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error('OPENAI_API_KEY не задан')
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: apiModelId, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error?.message || `OpenAI ${r.status}`)
    return d.choices?.[0]?.message?.content || ''
  }

  // GOOGLE (Gemini)
  if (provider === 'google') {
    const key = process.env.GOOGLE_AI_KEY
    if (!key) throw new Error('GOOGLE_AI_KEY не задан')
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiModelId}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 4096 } }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error?.message || `Gemini ${r.status}`)
    return d.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  // GROQ (Llama — бесплатно)
  if (provider === 'groq') {
    const key = process.env.GROQ_API_KEY
    if (!key) throw new Error('GROQ_API_KEY не задан — зарегистрируйтесь на console.groq.com')
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: apiModelId, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error?.message || `Groq ${r.status}`)
    return d.choices?.[0]?.message?.content || ''
  }

  // MISTRAL (бесплатно)
  if (provider === 'mistral') {
    const key = process.env.MISTRAL_API_KEY
    if (!key) throw new Error('MISTRAL_API_KEY не задан — зарегистрируйтесь на console.mistral.ai')
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: apiModelId, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error?.message || `Mistral ${r.status}`)
    return d.choices?.[0]?.message?.content || ''
  }

  // COHERE (бесплатно)
  if (provider === 'cohere') {
    const key = process.env.COHERE_API_KEY
    if (!key) throw new Error('COHERE_API_KEY не задан — зарегистрируйтесь на dashboard.cohere.com')
    const r = await fetch('https://api.cohere.com/v2/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'X-Client-Name': 'propose-ai' },
      body: JSON.stringify({ model: apiModelId, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.message || `Cohere ${r.status}`)
    return d.message?.content?.[0]?.text || ''
  }

  throw new Error(`Неизвестный провайдер для модели: ${model}`)
}

// ── Fallback: перебрать бесплатные модели если основная упала ─────────────────
async function callWithFallback(model, apiModelId, prompt) {
  try {
    return await callAI(model, apiModelId, prompt)
  } catch (primaryErr) {
    console.warn(`Основная модель ${model} упала: ${primaryErr.message}. Пробуем fallback...`)

    const FALLBACK_CHAIN = [
      { model: 'llama-3.3-70b', key: 'GROQ_API_KEY' },
      { model: 'gemini-2-flash', key: 'GOOGLE_AI_KEY' },
      { model: 'mistral-small',  key: 'MISTRAL_API_KEY' },
      { model: 'command-r',      key: 'COHERE_API_KEY' },
    ]

    for (const fb of FALLBACK_CHAIN) {
      if (fb.model === model) continue           // не повторяем упавшую
      if (!process.env[fb.key]) continue        // нет ключа — пропускаем
      try {
        const text = await callAI(fb.model, MODEL_API_IDS[fb.model], prompt)
        console.log(`Fallback успешен: ${fb.model}`)
        return { text, usedModel: fb.model }
      } catch (e) {
        console.warn(`Fallback ${fb.model} тоже упал: ${e.message}`)
      }
    }

    throw new Error(`Все модели недоступны. Последняя ошибка: ${primaryErr.message}`)
  }
}

// ── Основной handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Необходима авторизация' })

  const user = await getUserFromToken(token)
  if (!user) return res.status(401).json({ error: 'Токен недействителен' })

  const { plan, reason: planReason } = await checkUserPlan(user.id)
  if (planReason) return res.status(403).json({ error: planReason, upgrade: true })

  const { prompt, model: reqModel = 'auto', length = 'medium', clientName, clientIndustry } = req.body || {}
  if (!prompt) return res.status(400).json({ error: 'Поле prompt обязательно' })

  const { model, apiModelId, isAutoSelected, estimatedCostRub } = routeModel(reqModel, length, plan)

  if (!canUseModel(model, plan)) {
    return res.status(403).json({
      error: `Модель ${model} недоступна в тарифе ${plan}`,
      upgrade: true,
      upgradeMessage: 'Перейдите на Pro для доступа ко всем моделям',
    })
  }

  const cacheKey = makeCacheKey(model, prompt)
  const cached   = await getCache(cacheKey)

  if (cached) {
    const { allowed, count, limit, reason: limitReason } = await checkAndIncrementUsage(user.id, plan)
    if (!allowed) return res.status(429).json({ error: limitReason, upgrade: true, used: count, limit })
    await _saveProposal({ userId: user.id, clientName, clientIndustry, model, text: cached.text, wordCount: cached.wordCount })
    return res.status(200).json({ text: cached.text, used: count, limit, plan, model, fromCache: true, savedCost: estimatedCostRub })
  }

  const { allowed, count, limit, reason: limitReason } = await checkAndIncrementUsage(user.id, plan)
  if (!allowed) return res.status(429).json({ error: limitReason, upgrade: true, used: count, limit })

  try {
    const result = await callWithFallback(model, apiModelId, prompt)
    const text       = typeof result === 'string' ? result : result.text
    const usedModel  = typeof result === 'string' ? model  : result.usedModel
    const wordCount  = text.split(/\s+/).length

    await setCache(cacheKey, { text, wordCount })
    await _saveProposal({ userId: user.id, clientName, clientIndustry, model: usedModel, text, wordCount })

    const supabase = getSupabaseAdmin()
    await trackEvent(supabase, user.id, 'kp_generated', { model: usedModel, length, isAutoSelected, estimatedCostRub })

    return res.status(200).json({
      text, used: count, limit, plan,
      model: usedModel,
      requestedModel: model,
      isAutoSelected,
      estimatedCostRub,
      fromCache: false,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

async function _saveProposal({ userId, clientName, clientIndustry, model, text, wordCount }) {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('proposals').insert({
      user_id:         userId,
      title:           `КП для ${clientName || 'клиента'} — ${new Date().toLocaleDateString('ru-RU')}`,
      client_name:     clientName || null,
      client_industry: clientIndustry || null,
      model,
      content:         text,
      word_count:      wordCount,
    })
  } catch (e) {
    console.error('_saveProposal:', e.message)
  }
}
