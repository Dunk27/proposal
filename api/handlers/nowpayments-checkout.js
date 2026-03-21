// api/nowpayments-checkout.js — NOWPayments крипто-оплата
// USDT, BTC, ETH, TON и 300+ монет
// Документация: https://nowpayments.io/payment-tools/api-payment
// Env vars: NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET

import { getUserFromToken } from './lib/supabase.js'

const PLANS_USD = {
  starter: { amount: 11, description: 'ProposeAI Starter — 20 КП/месяц' },
  pro:     { amount: 33, description: 'ProposeAI Pro — безлимит + все модели ИИ' },
  agency:  { amount: 88, description: 'ProposeAI Agency — White-label + API' },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.NOWPAYMENTS_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'NOWPAYMENTS_API_KEY не задан в Vercel env' })
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const user = await getUserFromToken(token)
  if (!user) return res.status(401).json({ error: 'Необходима авторизация' })

  const { plan, currency = 'usdttrc20' } = req.body || {}
  const planData = PLANS_USD[plan]
  if (!planData) return res.status(400).json({ error: `Неизвестный тариф: ${plan}` })

  const appUrl = process.env.APP_URL || 'https://yourdomain.ru'

  try {
    // Создать платёж через NOWPayments Invoice API
    const r = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        price_amount: planData.amount,
        price_currency: 'usd',
        pay_currency: currency,   // usdt, btc, eth, ton, ...
        order_id: `${user.id}-${plan}-${Date.now()}`,
        order_description: planData.description,
        ipn_callback_url: `${appUrl}/api/nowpayments-webhook`,
        success_url: `${appUrl}/?payment=success&provider=crypto`,
        cancel_url: `${appUrl}/?payment=cancel`,
        is_fixed_rate: true,
        is_fee_paid_by_user: false,
      }),
    })

    const invoice = await r.json()
    if (!r.ok) throw new Error(invoice.message || `NOWPayments error ${r.status}`)

    // Сохранить в БД
    const { getSupabaseAdmin } = await import('../lib/supabase.js')
    const supabase = getSupabaseAdmin()
    await supabase.from('payments').insert({
      user_id: user.id,
      provider: 'nowpayments',
      external_id: invoice.id,
      plan,
      amount: Math.round(planData.amount * 100),
      currency: 'usd',
      status: 'pending',
    })

    return res.status(200).json({
      invoiceId: invoice.id,
      invoiceUrl: invoice.invoice_url,   // Редирект клиента на эту страницу
      amount: planData.amount,
      currency,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
