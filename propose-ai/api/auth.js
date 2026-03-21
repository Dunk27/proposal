// api/auth.js — регистрация, логин, сброс пароля через Supabase Auth

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, email, password } = req.body || {}
  if (!action) return res.status(400).json({ error: 'action обязателен' })

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase не настроена' })
  }

  const headers = { 'Content-Type': 'application/json', 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` }

  try {
    // РЕГИСТРАЦИЯ
    if (action === 'register') {
      if (!email || !password) return res.status(400).json({ error: 'email и password обязательны' })
      const r = await fetch(`${supabaseUrl}/auth/v1/signup`, {
        method: 'POST', headers,
        body: JSON.stringify({ email, password }),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error.message || d.msg)
      return res.status(200).json({ user: d.user, session: d.session, message: 'Проверьте почту для подтверждения' })
    }

    // ЛОГИН
    if (action === 'login') {
      if (!email || !password) return res.status(400).json({ error: 'email и password обязательны' })
      const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers,
        body: JSON.stringify({ email, password }),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error.message || d.msg || 'Неверный email или пароль')
      return res.status(200).json({ user: d.user, access_token: d.access_token, refresh_token: d.refresh_token })
    }

    // СБРОС ПАРОЛЯ
    if (action === 'reset') {
      if (!email) return res.status(400).json({ error: 'email обязателен' })
      const appUrl = process.env.APP_URL || 'https://yourdomain.ru'
      const r = await fetch(`${supabaseUrl}/auth/v1/recover`, {
        method: 'POST', headers,
        body: JSON.stringify({ email, redirect_to: `${appUrl}/auth/update-password` }),
      })
      return res.status(200).json({ message: 'Письмо для сброса пароля отправлено' })
    }

    // ВЫХОД
    if (action === 'logout') {
      const userToken = (req.headers.authorization || '').replace('Bearer ', '')
      if (userToken) {
        await fetch(`${supabaseUrl}/auth/v1/logout`, {
          method: 'POST',
          headers: { ...headers, Authorization: `Bearer ${userToken}` },
        })
      }
      return res.status(200).json({ message: 'Выход выполнен' })
    }

    return res.status(400).json({ error: `Неизвестный action: ${action}` })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
}
