// api/billing.js — управление подпиской, отмена, смена плана
// GET  /api/billing         — текущий план + история платежей
// POST /api/billing {action:'cancel'}   — отмена подписки
// POST /api/billing {action:'portal'}   — Stripe customer portal
import { getUserFromToken, getSupabaseAdmin } from '../lib/supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const user = await getUserFromToken(token)
  if (!user) return res.status(401).json({ error: 'Необходима авторизация' })

  const supabase = getSupabaseAdmin()

  // ── GET: текущий план + история платежей ───────────────
  if (req.method === 'GET') {
    const [{ data: userData }, { data: payments }] = await Promise.all([
      supabase.from('users').select('plan, trial_ends_at, stripe_customer_id, yookassa_customer_id, created_at').eq('id', user.id).single(),
      supabase.from('payments').select('provider, plan, amount, currency, status, paid_at, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    ])
    return res.status(200).json({ plan: userData?.plan, trialEndsAt: userData?.trial_ends_at, payments: payments || [] })
  }

  // ── POST: действия ────────────────────────────────────
  if (req.method === 'POST') {
    const { action } = req.body || {}

    // Stripe billing portal
    if (action === 'portal') {
      const stripeKey = process.env.STRIPE_SECRET_KEY
      if (!stripeKey) return res.status(500).json({ error: 'Stripe не настроен' })
      const { data: userData } = await supabase.from('users').select('stripe_customer_id').eq('id', user.id).single()
      if (!userData?.stripe_customer_id) return res.status(400).json({ error: 'Нет Stripe-подписки для управления' })
      const body = new URLSearchParams({
        customer: userData.stripe_customer_id,
        return_url: (process.env.APP_URL || 'https://yourdomain.ru') + '/dashboard',
      })
      const r = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Bearer ${stripeKey}` },
        body: body.toString(),
      })
      const session = await r.json()
      if (!r.ok) throw new Error(session.error?.message)
      return res.status(200).json({ url: session.url })
    }

    // Даунгрейд до free (отмена триала)
    if (action === 'cancel') {
      await supabase.from('users').update({ plan: 'free', trial_ends_at: null }).eq('id', user.id)
      return res.status(200).json({ message: 'Подписка отменена. Тариф: Free.' })
    }

    return res.status(400).json({ error: `Неизвестный action: ${action}` })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
