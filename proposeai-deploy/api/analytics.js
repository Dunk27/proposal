// api/analytics.js — внутренняя аналитика без внешних сервисов
// Трекает ключевые события: регистрация, первое КП, апгрейд, отток
// GET /api/analytics?period=30d  → метрики за период
// POST /api/analytics {event, meta} → записать событие

import { getUserFromToken, getSupabaseAdmin } from './lib/supabase.js'

// Ключевые события
export const EVENTS = {
  REGISTER:       'register',
  FIRST_KP:       'first_kp',
  KP_GENERATED:   'kp_generated',
  UPGRADE_VIEWED: 'upgrade_viewed',
  UPGRADE_PAID:   'upgrade_paid',
  TEMPLATE_USED:  'template_used',
  EXPORT_DOCX:    'export_docx',
  EXPORT_PDF:     'export_pdf',
  REFERRAL_SENT:  'referral_sent',
  REFERRAL_USED:  'referral_used',
  CHURN:          'churn',
}

export async function trackEvent(userId, event, meta = {}) {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('analytics_events').insert({
      user_id:    userId,
      event,
      meta:       JSON.stringify(meta),
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    console.error('trackEvent:', e.message)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const supabase = getSupabaseAdmin()

  // ── POST: записать событие ────────────────────────────────
  if (req.method === 'POST') {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user  = await getUserFromToken(token)
    const { event, meta = {} } = req.body || {}
    if (!event) return res.status(400).json({ error: 'event обязателен' })
    await trackEvent(user?.id || null, event, meta)
    return res.status(200).json({ recorded: true })
  }

  // ── GET: аналитический дашборд (только admin) ────────────
  if (req.method === 'GET') {
    const adminKey = req.headers['x-admin-key']
    if (adminKey !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' })

    const { period = '30' } = req.query
    const since = new Date(Date.now() - parseInt(period) * 86400000).toISOString()

    const [
      { data: events },
      { count: newUsers },
      { count: activeUsers },
      { data: topTemplates },
    ] = await Promise.all([
      supabase.from('analytics_events').select('event, created_at').gte('created_at', since),
      supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', since),
      supabase.from('proposals').select('user_id', { count: 'exact', head: true }).gte('created_at', since),
      supabase.from('analytics_events')
        .select('meta')
        .eq('event', EVENTS.TEMPLATE_USED)
        .gte('created_at', since),
    ])

    // Агрегация событий
    const eventCounts = {}
    for (const e of (events || [])) {
      eventCounts[e.event] = (eventCounts[e.event] || 0) + 1
    }

    // Топ шаблонов
    const templateCounts = {}
    for (const e of (topTemplates || [])) {
      try {
        const m = JSON.parse(e.meta || '{}')
        if (m.templateId) templateCounts[m.templateId] = (templateCounts[m.templateId] || 0) + 1
      } catch {}
    }
    const topTemplatesSorted = Object.entries(templateCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ id, count }))

    // Ключевые воронки
    const views  = eventCounts[EVENTS.UPGRADE_VIEWED] || 0
    const paid   = eventCounts[EVENTS.UPGRADE_PAID]   || 0
    const firstKp = eventCounts[EVENTS.FIRST_KP]      || 0
    const reg    = newUsers || 0

    return res.status(200).json({
      period: `${period}d`,
      summary: {
        newUsers:    reg,
        activeUsers: activeUsers || 0,
        kpGenerated: eventCounts[EVENTS.KP_GENERATED] || 0,
        upgradesPaid: paid,
        docxExports:  eventCounts[EVENTS.EXPORT_DOCX] || 0,
        pdfExports:   eventCounts[EVENTS.EXPORT_PDF]  || 0,
        referralsSent: eventCounts[EVENTS.REFERRAL_SENT] || 0,
      },
      funnels: {
        activation:  reg > 0 ? ((firstKp / reg) * 100).toFixed(1) + '%' : '—',
        upgradeConv: views > 0 ? ((paid / views) * 100).toFixed(1) + '%' : '—',
      },
      topTemplates: topTemplatesSorted,
      eventCounts,
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
