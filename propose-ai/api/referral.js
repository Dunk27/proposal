// api/referral.js — реферальная программа
// GET  /api/referral              — получить реф. код и статистику
// POST /api/referral {action:'apply', refCode} — применить чужой реф. код
// Механика: 1 бесплатный месяц реферу + 1 месяц тому кто пригласил

import { getUserFromToken, getSupabaseAdmin } from '../lib/supabase.js'

function generateRefCode(userId) {
  // Короткий детерминированный код из userId
  const h = userId.replace(/-/g, '').slice(0, 6).toUpperCase()
  return `REF${h}`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const user  = await getUserFromToken(token)
  if (!user) return res.status(401).json({ error: 'Необходима авторизация' })

  const supabase  = getSupabaseAdmin()
  const myRefCode = generateRefCode(user.id)
  const appUrl    = process.env.APP_URL || 'https://yourdomain.ru'

  // ── GET: мой реф. код и статистика ──────────────────────
  if (req.method === 'GET') {
    const { count: referralCount } = await supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', user.id)
      .eq('rewarded', true)

    const { count: pendingCount } = await supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', user.id)
      .eq('rewarded', false)

    return res.status(200).json({
      refCode:       myRefCode,
      refUrl:        `${appUrl}/auth/login?ref=${myRefCode}`,
      rewarded:      referralCount || 0,
      pending:       pendingCount  || 0,
      bonusPerRef:   '1 месяц Pro',
    })
  }

  // ── POST: применить реф. код ─────────────────────────────
  if (req.method === 'POST') {
    const { action, refCode } = req.body || {}

    if (action === 'apply') {
      if (!refCode) return res.status(400).json({ error: 'refCode обязателен' })
      const normalised = refCode.trim().toUpperCase()

      // Не применять свой собственный код
      if (normalised === myRefCode) {
        return res.status(400).json({ error: 'Нельзя использовать собственный реферальный код' })
      }

      // Проверить что код ещё не был применён этим пользователем
      const { data: existing } = await supabase
        .from('referrals')
        .select('id')
        .eq('referee_id', user.id)
        .single()

      if (existing) {
        return res.status(400).json({ error: 'Вы уже использовали реферальный код' })
      }

      // Найти реферера по коду
      const { data: allUsers } = await supabase.from('users').select('id')
      const referrer = allUsers?.find(u => generateRefCode(u.id) === normalised)

      if (!referrer) {
        return res.status(404).json({ error: 'Реферальный код не найден' })
      }

      // Записать реферал
      await supabase.from('referrals').insert({
        referrer_id: referrer.id,
        referee_id:  user.id,
        ref_code:    normalised,
        rewarded:    false,
      })

      // Дать бонус рефери: +30 дней к текущей подписке
      const { data: userData } = await supabase.from('users').select('plan, trial_ends_at').eq('id', user.id).single()
      const base = (userData?.trial_ends_at && new Date(userData.trial_ends_at) > new Date())
        ? new Date(userData.trial_ends_at)
        : new Date()
      const newExpiry = new Date(base.getTime() + 30 * 86400000).toISOString()

      await supabase.from('users').update({
        plan:          userData?.plan === 'free' ? 'trial' : userData?.plan,
        trial_ends_at: newExpiry,
      }).eq('id', user.id)

      return res.status(200).json({
        success:  true,
        message:  'Реферальный код применён! +30 дней добавлено к вашей подписке.',
        newExpiry,
      })
    }

    // Вызывается из webhook после первой оплаты реферала
    if (action === 'reward-referrer') {
      const adminKey = req.headers['x-admin-key']
      if (adminKey !== process.env.ADMIN_KEY) return res.status(401).end()

      const { refereeId } = req.body
      const { data: referral } = await supabase
        .from('referrals')
        .select('referrer_id, rewarded')
        .eq('referee_id', refereeId)
        .eq('rewarded', false)
        .single()

      if (!referral) return res.status(200).json({ skipped: true })

      // Дать реферу +30 дней
      const { data: referrerData } = await supabase.from('users').select('plan, trial_ends_at').eq('id', referral.referrer_id).single()
      const base = (referrerData?.trial_ends_at && new Date(referrerData.trial_ends_at) > new Date())
        ? new Date(referrerData.trial_ends_at)
        : new Date()
      const newExpiry = new Date(base.getTime() + 30 * 86400000).toISOString()

      await supabase.from('users').update({ trial_ends_at: newExpiry }).eq('id', referral.referrer_id)
      await supabase.from('referrals').update({ rewarded: true, rewarded_at: new Date().toISOString() }).eq('referee_id', refereeId)

      return res.status(200).json({ rewarded: true, referrerId: referral.referrer_id })
    }

    return res.status(400).json({ error: `Неизвестный action: ${action}` })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
