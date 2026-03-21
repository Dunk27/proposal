// api/yookassa-webhook.js — YooKassa Webhook v3
// + реферальная награда + аналитика

import { getSupabaseAdmin }           from './lib/supabase.js'
import { getPlan, getPlanDurationDays } from './lib/plans.js'
import { sendEmail, paymentSuccessEmail } from './email.js'
import { trackEvent, EVENTS }         from './analytics.js'

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
        console.error('YooKassa: missing metadata', meta)
        return res.status(200).json({ received: true })
      }

      const durationDays = getPlanDurationDays(planId)
      const expiresAt    = new Date(Date.now() + durationDays * 86400000).toISOString()

      // Обновить платёж
      await supabase.from('payments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('external_id', object.id)

      // Активировать план
      await supabase.from('users').update({
        plan:          planKey,
        trial_ends_at: expiresAt,
        updated_at:    new Date().toISOString(),
      }).eq('id', userId)

      // Квитанция
      const { data: u } = await supabase.from('users').select('email').eq('id', userId).single()
      if (u?.email) {
        await sendEmail(paymentSuccessEmail({
          email:    u.email,
          plan:     planKey,
          amount:   Math.round(parseFloat(object.amount?.value || 0) * 100),
          currency: 'RUB',
        }))
      }

      // Наградить реферера
      await rewardReferrer(supabase, userId)

      // Аналитика
      await trackEvent(userId, EVENTS.UPGRADE_PAID, {
        plan: planKey, provider: 'yookassa', planId,
        period: meta.period || 'monthly',
        amount: object.amount?.value,
      })

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

async function rewardReferrer(supabase, refereeId) {
  try {
    const { data: referral } = await supabase
      .from('referrals')
      .select('referrer_id, rewarded')
      .eq('referee_id', refereeId)
      .eq('rewarded', false)
      .single()

    if (!referral) return

    const { data: referrer } = await supabase
      .from('users').select('trial_ends_at').eq('id', referral.referrer_id).single()

    const base      = (referrer?.trial_ends_at && new Date(referrer.trial_ends_at) > new Date())
      ? new Date(referrer.trial_ends_at) : new Date()
    const newExpiry = new Date(base.getTime() + 30 * 86400000).toISOString()

    await supabase.from('users').update({ trial_ends_at: newExpiry }).eq('id', referral.referrer_id)
    await supabase.from('referrals').update({ rewarded: true, rewarded_at: new Date().toISOString() }).eq('referee_id', refereeId)
    await trackEvent(referral.referrer_id, EVENTS.REFERRAL_SENT, { refereeId, bonus: '30d' })
    console.log(`🎁 YooKassa: referrer ${referral.referrer_id} rewarded +30d`)
  } catch (e) {
    console.error('rewardReferrer:', e.message)
  }
}
