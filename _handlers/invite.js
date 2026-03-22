// api/invite.js — система инвайтов для бета-тестеров
// POST /api/invite {email}       — создать инвайт (только admin)
// GET  /api/invite?code=xxx      — проверить инвайт
// POST /api/invite {action:'use', code, email, password} — использовать инвайт

import { getSupabaseAdmin } from '../lib/supabase.js'
import { sendEmail } from './email.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const supabase = getSupabaseAdmin()

  // ── GET: проверить инвайт по коду ─────────────────────
  if (req.method === 'GET') {
    const { code } = req.query
    if (!code) return res.status(400).json({ error: 'code обязателен' })

    const { data } = await supabase
      .from('invites')
      .select('code, email, used, expires_at, plan')
      .eq('code', code)
      .single()

    if (!data) return res.status(404).json({ valid: false, error: 'Инвайт не найден' })
    if (data.used) return res.status(400).json({ valid: false, error: 'Инвайт уже использован' })
    if (new Date(data.expires_at) < new Date()) {
      return res.status(400).json({ valid: false, error: 'Инвайт истёк' })
    }
    return res.status(200).json({ valid: true, email: data.email, plan: data.plan })
  }

  if (req.method === 'POST') {
    const { action } = req.body || {}

    // ── CREATE: создать инвайт (только admin) ─────────────
    if (!action || action === 'create') {
      const adminKey = req.headers['x-admin-key']
      if (adminKey !== process.env.ADMIN_KEY) {
        return res.status(401).json({ error: 'Требуется X-Admin-Key' })
      }

      const { email, plan = 'pro', days = 30, note = '' } = req.body
      if (!email) return res.status(400).json({ error: 'email обязателен' })

      const code = generateCode()
      const expiresAt = new Date(Date.now() + days * 86400000).toISOString()

      await supabase.from('invites').insert({ code, email, plan, expires_at: expiresAt, note })

      const appUrl = process.env.APP_URL || 'https://yourdomain.ru'
      const inviteUrl = `${appUrl}/auth/login?invite=${code}`

      // Отправить письмо с инвайтом
      await sendEmail({
        to: email,
        subject: 'Вас приглашают протестировать Т-Профит КП — бета-доступ',
        html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1612;">
  <div style="background:#1A1612;padding:24px 32px;border-radius:8px 8px 0 0;">
    <h1 style="color:#D4AB42;font-size:22px;margin:0;font-weight:300;">Propose<strong>AI</strong></h1>
  </div>
  <div style="background:#FDFAF5;padding:32px;border:1px solid #E8DFC8;border-top:none;border-radius:0 0 8px 8px;">
    <h2 style="font-size:20px;font-weight:400;margin:0 0 16px;">Вас приглашают в бета-тест!</h2>
    <p style="font-size:14px;line-height:1.7;color:#3D3530;margin:0 0 16px;">
      Вы получили эксклюзивный доступ к Т-Профит КП — ИИ-генератору коммерческих предложений.
      Тариф <strong>${plan.charAt(0).toUpperCase() + plan.slice(1)}</strong> активируется автоматически при регистрации.
    </p>
    <a href="${inviteUrl}" style="display:inline-block;background:#B8922A;color:#fff;padding:13px 28px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:1px;">Принять приглашение →</a>
    <p style="font-size:12px;color:#7A6F66;margin-top:16px;">Ссылка действительна ${days} дней. Код: <code>${code}</code></p>
  </div>
</div>`,
      })

      return res.status(200).json({ code, inviteUrl, email, plan, expiresAt })
    }

    // ── USE: регистрация по инвайту ───────────────────────
    if (action === 'use') {
      const { code, email, password } = req.body
      if (!code || !email || !password) {
        return res.status(400).json({ error: 'code, email, password обязательны' })
      }

      // Проверить инвайт
      const { data: invite } = await supabase
        .from('invites')
        .select('*')
        .eq('code', code)
        .eq('used', false)
        .single()

      if (!invite) return res.status(400).json({ error: 'Инвайт недействителен' })
      if (new Date(invite.expires_at) < new Date()) {
        return res.status(400).json({ error: 'Инвайт истёк' })
      }

      // Зарегистрировать пользователя
      const supabaseUrl = process.env.SUPABASE_URL
      const supabaseKey = process.env.SUPABASE_ANON_KEY
      const r = await fetch(`${supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: supabaseKey },
        body: JSON.stringify({ email, password }),
      })
      const authData = await r.json()
      if (authData.error) return res.status(400).json({ error: authData.error.message })

      const userId = authData.user?.id
      if (userId) {
        // Активировать план из инвайта
        const trialDays = invite.plan === 'pro' ? 30 : 14
        await supabase.from('users').update({
          plan: invite.plan,
          trial_ends_at: new Date(Date.now() + trialDays * 86400000).toISOString(),
        }).eq('id', userId)

        // Пометить инвайт использованным
        await supabase.from('invites').update({ used: true, used_at: new Date().toISOString(), used_by: userId }).eq('code', code)
      }

      return res.status(200).json({
        message: `Регистрация успешна! Тариф ${invite.plan} активирован.`,
        access_token: authData.session?.access_token,
        user: authData.user,
      })
    }

    return res.status(400).json({ error: `Неизвестный action: ${action}` })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
