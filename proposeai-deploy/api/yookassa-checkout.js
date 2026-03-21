// api/yookassa-checkout.js — YooKassa оплата (месячные + годовые)
// v2: поддержка annual-планов из lib/plans.js
import { getUserFromToken, getSupabaseAdmin } from './lib/supabase.js'
import { getPlan }                            from './lib/plans.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const shopId    = process.env.YOOKASSA_SHOP_ID
  const secretKey = process.env.YOOKASSA_SECRET_KEY
  if (!shopId || !secretKey) {
    return res.status(500).json({ error: 'YooKassa не настроена' })
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const user  = await getUserFromToken(token)
  if (!user) return res.status(401).json({ error: 'Необходима авторизация' })

  const { planId, returnUrl } = req.body || {}
  const plan = getPlan(planId)
  if (!plan) return res.status(400).json({ error: `Неизвестный тариф: ${planId}` })

  const appUrl = process.env.APP_URL || 'https://yourdomain.ru'
  const idempotenceKey = `${user.id}-${planId}-${Math.floor(Date.now() / 60000)}` // уникален в пределах 1 мин

  try {
    const r = await fetch('https://api.yookassa.ru/v3/payments', {
      method:  'POST',
      headers: {
        'Content-Type':     'application/json',
        'Idempotence-Key':  idempotenceKey,
        'Authorization':    `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: {
          value:    plan.priceRub.toFixed(2),
          currency: 'RUB',
        },
        confirmation: {
          type:       'redirect',
          return_url: returnUrl || `${appUrl}/dashboard?payment=success&provider=yookassa`,
        },
        capture:     true,
        description: plan.yooDesc,
        metadata: {
          user_id:  user.id,
          plan_id:  planId,
          plan_key: plan.planKey,
          period:   plan.period,
          email:    user.email,
        },
        receipt: {
          customer: { email: user.email },
          items: [{
            description:     plan.yooDesc,
            quantity:        '1.00',
            amount:          { value: plan.priceRub.toFixed(2), currency: 'RUB' },
            vat_code:        1,
            payment_mode:    'full_payment',
            payment_subject: 'service',
          }],
        },
      }),
    })

    const payment = await r.json()
    if (!r.ok) throw new Error(payment.description || `YooKassa error ${r.status}`)

    // Сохранить pending-платёж
    const supabase = getSupabaseAdmin()
    await supabase.from('payments').insert({
      user_id:     user.id,
      provider:    'yookassa',
      external_id: payment.id,
      plan:        plan.planKey,
      amount:      Math.round(plan.priceRub * 100),
      currency:    'rub',
      status:      'pending',
    })

    return res.status(200).json({
      paymentId:       payment.id,
      confirmationUrl: payment.confirmation.confirmation_url,
      status:          payment.status,
      period:          plan.period,
      priceRub:        plan.priceRub,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
