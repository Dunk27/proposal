// api/webhook.js — Stripe Webhook
// v2: активация плана + реферальная награда + аналитика

import { getSupabaseAdmin }       from './lib/supabase.js'
import { getPlan, getPlanDurationDays } from './lib/plans.js'
import { sendEmail, paymentSuccessEmail } from './email.js'
import { trackEvent, EVENTS }    from './analytics.js'

export const config = { api: { bodyParser: true } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const stripeKey     = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  const signature = req.headers['stripe-signature']
  let event

  // Stripe signature verification
  if (webhookSecret && signature) {
    try {
      // Simple HMAC verification without the Stripe SDK
      const { createHmac } = await import('crypto')
      const rawBody = JSON.stringify(req.body)
      const parts   = signature.split(',')
      const ts      = parts.find(p => p.startsWith('t=')).slice(2)
      const v1      = parts.find(p => p.startsWith('v1=')).slice(3)
      const payload = `${ts}.${rawBody}`
      const sig     = createHmac('sha256', webhookSecret).update(payload).digest('hex')
      if (sig !== v1) {
        console.warn('Stripe webhook: invalid signature')
        return res.status(400).json({ error: 'Invalid signature' })
      }
    } catch (e) {
      console.warn('Stripe signature check failed:', e.message)
    }
  }

  event = req.body
  const supabase = getSupabaseAdmin()

  try {
    // ── Оплата успешна ──────────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session  = event.data.object
      const meta     = session.metadata || {}
      const userId   = meta.user_id
      const planId   = meta.plan_id
      const planKey  = meta.plan_key

      if (!userId || !planKey) {
        console.error('Stripe webhook: missing metadata', meta)
        return res.status(200).json({ received: true })
      }

      const durationDays = getPlanDurationDays(planId)
      const expiresAt    = new Date(Date.now() + durationDays * 86400000).toISOString()

      // Сохранить платёж
      await supabase.from('payments').insert({
        user_id:     userId,
        provider:    'stripe',
        external_id: session.id,
        plan:        planKey,
        amount:      session.amount_total || 0,
        currency:    session.currency || 'usd',
        status:      'paid',
        paid_at:     new Date().toISOString(),
      }).onConflict('external_id').ignore()

      // Активировать план
      await supabase.from('users').update({
        plan:                planKey,
        trial_ends_at:       expiresAt,
        stripe_customer_id:  session.customer || null,
        updated_at:          new Date().toISOString(),
      }).eq('id', userId)

      // Квитанция
      const { data: u } = await supabase.from('users').select('email').eq('id', userId).single()
      if (u?.email) {
        await sendEmail(paymentSuccessEmail({
          email:    u.email,
          plan:     planKey,
          amount:   session.amount_total,
          currency: (session.currency || 'usd').toUpperCase(),
        }))
      }

      // Наградить реферера если есть
      await rewardReferrer(supabase, userId)

      // Аналитика
      await trackEvent(userId, EVENTS.UPGRADE_PAID, { plan: planKey, provider: 'stripe', planId })

      console.log(`✅ Stripe: ${planId} (${durationDays}d) → ${userId}`)
    }

    // ── Подписка отменена ───────────────────────────────────
    else if (event.type === 'customer.subscription.deleted') {
      const sub      = event.data.object
      const custId   = sub.customer

      const { data: u } = await supabase
        .from('users')
        .select('id, email')
        .eq('stripe_customer_id', custId)
        .single()

      if (u) {
        await supabase.from('users').update({ plan: 'free', trial_ends_at: null }).eq('id', u.id)
        await trackEvent(u.id, EVENTS.CHURN, { provider: 'stripe', reason: 'subscription_deleted' })
      }
    }

    // ── Платёж не прошёл ────────────────────────────────────
    else if (event.type === 'invoice.payment_failed') {
      const inv    = event.data.object
      const custId = inv.customer
      const { data: u } = await supabase.from('users').select('id, email').eq('stripe_customer_id', custId).single()
      if (u) {
        await sendEmail({
          to:      u.email,
          subject: 'Не удалось списать оплату — обновите карту',
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
            <h2>Проблема с оплатой</h2>
            <p>Не удалось списать платёж за подписку ProposeAI. Пожалуйста, обновите платёжный метод.</p>
            <a href="${process.env.APP_URL}/dashboard" style="display:inline-block;background:#B8922A;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;">Обновить данные →</a>
          </div>`,
        })
      }
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('Stripe webhook error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// Наградить реферера +30 дней после первой оплаты реферала
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
      .from('users')
      .select('trial_ends_at')
      .eq('id', referral.referrer_id)
      .single()

    const base      = (referrer?.trial_ends_at && new Date(referrer.trial_ends_at) > new Date())
      ? new Date(referrer.trial_ends_at) : new Date()
    const newExpiry = new Date(base.getTime() + 30 * 86400000).toISOString()

    await supabase.from('users').update({ trial_ends_at: newExpiry }).eq('id', referral.referrer_id)
    await supabase.from('referrals').update({ rewarded: true, rewarded_at: new Date().toISOString() }).eq('referee_id', refereeId)

    await trackEvent(referral.referrer_id, EVENTS.REFERRAL_SENT, { refereeId, bonus: '30d' })
    console.log(`🎁 Referrer ${referral.referrer_id} rewarded +30 days`)
  } catch (e) {
    console.error('rewardReferrer:', e.message)
  }
}
