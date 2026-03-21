// api/checkout.js — Stripe checkout (месячные + годовые)
// v2: поддержка annual-планов + getUserFromToken
import { getUserFromToken } from '../lib/supabase.js'
import { getPlan }          from '../lib/plans.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return res.status(500).json({ error: 'STRIPE_SECRET_KEY не задан' })

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const user  = await getUserFromToken(token)
  if (!user) return res.status(401).json({ error: 'Необходима авторизация' })

  const { planId, successUrl, cancelUrl } = req.body || {}
  if (!planId) return res.status(400).json({ error: 'planId обязателен' })

  const plan = getPlan(planId)
  if (!plan) return res.status(400).json({ error: `Неизвестный тариф: ${planId}` })

  // Stripe Price ID из env
  const priceId = process.env[plan.stripeEnv]
  if (!priceId) {
    return res.status(400).json({
      error: `Stripe Price ID для ${planId} не задан. Добавьте ${plan.stripeEnv} в Vercel env.`,
    })
  }

  const appUrl = process.env.APP_URL || 'https://yourdomain.ru'

  try {
    const body = new URLSearchParams({
      mode:                    'subscription',
      'line_items[0][price]':  priceId,
      'line_items[0][quantity]': '1',
      customer_email:          user.email,
      success_url:             successUrl || `${appUrl}/dashboard?payment=success`,
      cancel_url:              cancelUrl  || `${appUrl}/dashboard`,
      'metadata[user_id]':     user.id,
      'metadata[plan_id]':     planId,
      'metadata[plan_key]':    plan.planKey,
      // Параметры триала: для годовых — без триала (платят сразу)
      ...(plan.period === 'monthly' ? {
        'subscription_data[trial_period_days]': '0',
      } : {}),
    })

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${stripeKey}`,
      },
      body: body.toString(),
    })
    const session = await r.json()
    if (!r.ok) throw new Error(session.error?.message || `Stripe error ${r.status}`)

    return res.status(200).json({ url: session.url, sessionId: session.id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
