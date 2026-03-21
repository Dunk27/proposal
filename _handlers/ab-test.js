// api/ab-test.js — A/B тестирование апгрейд-стены и цен
// Хранит результаты в Supabase, позволяет сравнивать варианты по конверсии
// GET  /api/ab-test?experiment=upgrade-wall    → вернуть вариант для пользователя
// POST /api/ab-test {experiment, variant, event} → записать событие (view/click/paid)

import { getUserFromToken, getSupabaseAdmin } from '../lib/supabase.js'

// Определения экспериментов
const EXPERIMENTS = {
  'upgrade-wall': {
    variants: ['control', 'timer', 'social-proof'],
    weights:  [34, 33, 33], // %
    description: 'Тест апгрейд-стены: контроль vs таймер vs соц.доказательства',
  },
  'pricing-page': {
    variants: ['monthly-first', 'annual-first'],
    weights:  [50, 50],
    description: 'Тест страницы цен: месячные vs годовые по умолчанию',
  },
  'cta-text': {
    variants: ['upgrade-now', 'try-pro', 'get-unlimited'],
    weights:  [34, 33, 33],
    description: 'Тест текста кнопки апгрейда',
  },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const user  = await getUserFromToken(token)
  const supabase = getSupabaseAdmin()

  // ── GET: получить вариант для пользователя ───────────────
  if (req.method === 'GET') {
    const { experiment } = req.query
    if (!experiment || !EXPERIMENTS[experiment]) {
      return res.status(400).json({ error: `Неизвестный эксперимент: ${experiment}` })
    }

    const exp = EXPERIMENTS[experiment]

    // Детерминированный выбор: для одного userId всегда одна и та же группа
    let variant
    if (user) {
      const hash = hashUserId(user.id + experiment)
      const idx  = weightedIndex(exp.weights, hash)
      variant = exp.variants[idx]
    } else {
      // Аноним — случайный, но сохраняем в куки
      const anonKey = `ab_${experiment}`
      const savedVariant = req.headers.cookie?.match(new RegExp(`${anonKey}=([^;]+)`))?.[1]
      variant = savedVariant || exp.variants[Math.floor(Math.random() * exp.variants.length)]
      res.setHeader('Set-Cookie', `${anonKey}=${variant}; Path=/; Max-Age=2592000; SameSite=Lax`)
    }

    return res.status(200).json({ experiment, variant, variants: exp.variants })
  }

  // ── POST: записать событие ───────────────────────────────
  if (req.method === 'POST') {
    const { experiment, variant, event, meta = {} } = req.body || {}
    if (!experiment || !variant || !event) {
      return res.status(400).json({ error: 'experiment, variant, event обязательны' })
    }

    await supabase.from('ab_events').insert({
      user_id:    user?.id || null,
      experiment,
      variant,
      event,      // 'view' | 'click' | 'paid' | 'closed'
      meta:       JSON.stringify(meta),
      created_at: new Date().toISOString(),
    })

    return res.status(200).json({ recorded: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── GET admin: статистика экспериментов ─────────────────────
// Добавить в api/admin.js или вызвать отдельно с ADMIN_KEY

function hashUserId(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i)
  return Math.abs(h) % 100
}

function weightedIndex(weights, rand) {
  let sum = 0
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i]
    if (rand < sum) return i
  }
  return weights.length - 1
}

export async function getAbStats(experiment) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('ab_events')
    .select('variant, event')
    .eq('experiment', experiment)

  const stats = {}
  for (const row of (data || [])) {
    if (!stats[row.variant]) stats[row.variant] = { view: 0, click: 0, paid: 0, closed: 0 }
    stats[row.variant][row.event] = (stats[row.variant][row.event] || 0) + 1
  }

  // Рассчитать конверсии
  for (const [variant, s] of Object.entries(stats)) {
    s.clickRate = s.view > 0 ? ((s.click / s.view) * 100).toFixed(1) + '%' : '—'
    s.paidRate  = s.view > 0 ? ((s.paid  / s.view) * 100).toFixed(1) + '%' : '—'
  }

  return stats
}
