// api/nowpayments-webhook.js — NOWPayments IPN Webhook
// Подпись проверяется через HMAC-SHA512
// URL зарегистрировать в NOWPayments Dashboard → Store Settings → IPN

import { createHmac } from 'crypto'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET
  if (!ipnSecret) return res.status(500).json({ error: 'NOWPAYMENTS_IPN_SECRET не задан' })

  // Верификация подписи
  const receivedSig = req.headers['x-nowpayments-sig']
  if (receivedSig) {
    const sortedBody = JSON.stringify(sortObject(req.body))
    const expectedSig = createHmac('sha512', ipnSecret).update(sortedBody).digest('hex')
    if (receivedSig !== expectedSig) {
      console.error('NOWPayments: неверная подпись')
      return res.status(400).json({ error: 'Invalid signature' })
    }
  }

  const { payment_status, order_id, actually_paid } = req.body || {}

  if (payment_status === 'finished' || payment_status === 'confirmed') {
    // order_id формат: '{userId}-{plan}-{timestamp}'
    const parts = (order_id || '').split('-')
    const userId = parts.slice(0, 5).join('-')  // UUID имеет 5 частей
    const plan = parts[5]

    if (!userId || !plan) {
      console.error('NOWPayments webhook: неверный order_id', order_id)
      return res.status(200).json({ received: true })
    }

    const { getSupabaseAdmin } = await import('../lib/supabase.js')
    const supabase = getSupabaseAdmin()

    // Обновить платёж
    await supabase.from('payments')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('provider', 'nowpayments')
      .like('external_id', `%${order_id.split('-').pop()}%`)

    // Активировать план
    await supabase.from('users')
      .update({ plan, trial_ends_at: null, updated_at: new Date().toISOString() })
      .eq('id', userId)

    console.log(`✅ NOWPayments: криптоплатёж подтверждён, план ${plan} активирован для ${userId}`)
  }

  return res.status(200).json({ received: true })
}

function sortObject(obj) {
  return Object.keys(obj).sort().reduce((r, k) => ({ ...r, [k]: obj[k] }), {})
}
