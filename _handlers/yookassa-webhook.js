// api/yookassa-webhook.js — YooKassa webhook
// v2: поддержка plan_id и period из metadata
import { getSupabaseAdmin }     from '../lib/supabase.js'
import { getPlan, getPlanDurationDays } from '../lib/plans.js'
import { sendEmail, paymentSuccessEmail } from './email.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const event  = req.body?.event
  const object = req.body?.object
  if (!event || !object) return res.status(400).json({ error: 'Invalid payload' })

  const supabase = getSupabaseAdmin()

  try {
    if (event === 'payment.succeeded') {
      const meta    = object.metadata || {}
      const userId  = meta.user_id
      const planId  = meta.plan_id
      const planKey = meta.plan_key

      if (!userId || !planKey) {
        console.error('YooKassa webhook: missing user_id/plan_key', meta)
        return res.status(200).json({ received: true })
      }

      const planData    = getPlan(planId)
      const durationDays = getPlanDurationDays(planId)
      const expiresAt   = new Date(Date.now() + durationDays * 86400000).toISOString()

      // Обновить статус платежа
      await supabase.from('payments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('external_id', object.id)

      // Активировать план
      await supabase.from('users').update({
        plan:          planKey,
        trial_ends_at: expiresAt,
        updated_at:    new Date().toISOString(),
      }).eq('id', userId)

      // Отправить квитанцию
      const { data: userData } = await supabase.from('users').select('email').eq('id', userId).single()
      if (userData?.email) {
        await sendEmail(paymentSuccessEmail({
          email:    userData.email,
          plan:     planKey,
          amount:   Math.round(parseFloat(object.amount?.value || 0) * 100),
          currency: 'RUB',
        }))
      }

      console.log(`✅ YooKassa: ${planId} (${durationDays}d) → ${userId}`)
    }
    else if (event === 'payment.canceled') {
      await supabase.from('payments')
        .update({ status: 'cancelled' })
        .eq('external_id', object.id)
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('YooKassa webhook error:', err)
    return res.status(500).json({ error: err.message })
  }
}
