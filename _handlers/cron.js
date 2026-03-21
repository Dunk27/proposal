// api/cron.js — автоматические задачи
// Vercel Cron (vercel.json) вызывает эти эндпоинты по расписанию
// Env: CRON_SECRET — защита от случайных вызовов

import { getSupabaseAdmin }                from '../lib/supabase.js'
import { sendEmail, trialEndingSoonEmail,
         limitReachedEmail }              from './email.js'

export default async function handler(req, res) {
  const secret = req.headers['x-cron-secret'] || req.query.secret
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const job      = req.query.job
  const supabase = getSupabaseAdmin()
  const results  = {}

  // ── 1. Напоминание за 3 дня до конца триала (ежедневно 09:00) ──
  if (!job || job === 'trial-reminder') {
    const target = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    const { data: users } = await supabase
      .from('users')
      .select('id, email, trial_ends_at, plan')
      .eq('plan', 'trial')
      .gte('trial_ends_at', target + 'T00:00:00Z')
      .lte('trial_ends_at', target + 'T23:59:59Z')

    let sent = 0
    for (const u of (users || [])) {
      // Не слать дважды
      const { data: already } = await supabase
        .from('email_log').select('id').eq('user_id', u.id).eq('type', 'trial_reminder_3').single()
      if (already) continue
      const days = Math.ceil((new Date(u.trial_ends_at) - Date.now()) / 86400000)
      await sendEmail(trialEndingSoonEmail({ email: u.email, daysLeft: Math.max(1, days) }))
      await supabase.from('email_log').insert({ user_id: u.id, type: 'trial_reminder_3' })
      sent++
    }
    results['trial-reminder'] = { sent }
  }

  // ── 2. Истечение триала → downgrade на free (ежедневно 03:00) ──
  if (!job || job === 'trial-expire') {
    const { data: expired } = await supabase
      .from('users')
      .select('id, email')
      .eq('plan', 'trial')
      .lt('trial_ends_at', new Date().toISOString())

    let updated = 0
    for (const u of (expired || [])) {
      await supabase.from('users').update({ plan: 'free', trial_ends_at: null }).eq('id', u.id)
      updated++
    }
    results['trial-expire'] = { updated }
  }

  // ── 3. Сброс счётчика использования (1-го числа месяца) ────────
  if (!job || job === 'reset-usage') {
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    const monthStr = lastMonth.toISOString().slice(0, 7)
    await supabase.from('usage').delete().eq('month', monthStr)
    results['reset-usage'] = { deletedMonth: monthStr }
  }

  // ── 4. Re-engagement: письмо неактивным 7+ дней (ежедневно 10:00) ─
  if (!job || job === 're-engage') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    // Найти пользователей без КП за 7 дней у которых есть подписка
    const { data: activeUsers } = await supabase
      .from('users')
      .select('id, email, plan')
      .in('plan', ['trial', 'starter', 'pro', 'agency'])

    let sent = 0
    for (const u of (activeUsers || [])) {
      const { data: recentKP } = await supabase
        .from('proposals')
        .select('id')
        .eq('user_id', u.id)
        .gte('created_at', sevenDaysAgo)
        .limit(1)

      if (recentKP?.length > 0) continue // Активен — пропустить

      // Не слать дважды за 7 дней
      const { data: alreadySent } = await supabase
        .from('email_log')
        .select('id')
        .eq('user_id', u.id)
        .eq('type', 're_engage_7d')
        .gte('sent_at', sevenDaysAgo)
        .single()
      if (alreadySent) continue

      await sendEmail({
        to: u.email,
        subject: 'Есть минута? Создайте КП прямо сейчас 🚀',
        html: reEngageHtml(u),
      })
      await supabase.from('email_log').insert({ user_id: u.id, type: 're_engage_7d' })
      sent++
    }
    results['re-engage'] = { sent }
  }

  // ── 5. Waring за 1 день до исчерпания лимита ─────────────────────
  if (!job || job === 'usage-warning') {
    const month = new Date().toISOString().slice(0, 7)
    const LIMITS = { free: 3, starter: 20 }

    for (const [plan, limit] of Object.entries(LIMITS)) {
      const threshold = Math.floor(limit * 0.9) // 90% исчерпано

      const { data: nearLimit } = await supabase
        .from('usage')
        .select('user_id, count')
        .eq('month', month)
        .gte('count', threshold)
        .lt('count', limit)

      for (const row of (nearLimit || [])) {
        const { data: u } = await supabase.from('users').select('email, plan').eq('id', row.user_id).single()
        if (!u || u.plan !== plan) continue

        const { data: already } = await supabase
          .from('email_log').select('id').eq('user_id', row.user_id).eq('type', `usage_warning_${month}`).single()
        if (already) continue

        await sendEmail(limitReachedEmail({ email: u.email, plan, limit }))
        await supabase.from('email_log').insert({ user_id: row.user_id, type: `usage_warning_${month}` })
      }
    }
    results['usage-warning'] = { checked: true }
  }

  return res.status(200).json({ ok: true, job: job || 'all', results, ts: new Date().toISOString() })
}

function reEngageHtml(user) {
  const appUrl = process.env.APP_URL || 'https://yourdomain.ru'
  return `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1612;">
  <div style="background:#1A1612;padding:24px 32px;border-radius:8px 8px 0 0;">
    <h1 style="color:#D4AB42;font-size:22px;margin:0;font-weight:300;">Propose<strong>AI</strong></h1>
  </div>
  <div style="background:#FDFAF5;padding:32px;border:1px solid #E8DFC8;border-top:none;border-radius:0 0 8px 8px;">
    <h2 style="font-size:18px;font-weight:400;margin:0 0 14px;">Вы не создавали КП уже 7 дней</h2>
    <p style="font-size:14px;line-height:1.7;color:#3D3530;margin:0 0 16px;">Пока вы отдыхаете, конкуренты отправляют предложения клиентам. Создайте КП за 30 секунд — просто введите данные клиента и нажмите кнопку.</p>
    <div style="background:#F5F0E8;border:1px solid #E8DFC8;border-radius:6px;padding:14px;margin-bottom:20px;">
      <div style="font-size:12px;color:#7A6F66;margin-bottom:4px;">Попробуйте новую модель:</div>
      <div style="font-size:14px;font-weight:600;color:#1A1612;">Claude Sonnet 4 — лучшие деловые тексты</div>
    </div>
    <a href="${appUrl}/app" style="display:inline-block;background:#B8922A;color:#fff;padding:13px 28px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:1px;">Создать КП сейчас →</a>
    <p style="font-size:11px;color:#7A6F66;margin-top:20px;"><a href="${appUrl}/unsubscribe?email=${user.email}" style="color:#B8922A;">Отписаться от напоминаний</a></p>
  </div>
</div>`
}
