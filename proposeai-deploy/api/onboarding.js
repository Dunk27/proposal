// api/onboarding.js — сохранение/чтение onboarding состояния
import { getUserFromToken, getSupabaseAdmin } from './lib/supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const user = await getUserFromToken(token)
  if (!user) return res.status(401).json({ error: 'Необходима авторизация' })

  const supabase = getSupabaseAdmin()

  if (req.method === 'GET') {
    const { data: profile } = await supabase.from('company_profiles').select('*').eq('user_id', user.id).single()
    const completed = !!(profile?.name && profile?.services)
    return res.status(200).json({ completed, profile: profile || null })
  }

  if (req.method === 'POST') {
    const { name, industry, services, usp, cases } = req.body || {}
    await supabase.from('company_profiles').upsert({
      user_id: user.id, name, industry, services, usp, cases,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    // Отметить что онбординг пройден
    await supabase.from('users').update({ onboarding_done: true }).eq('id', user.id)
    return res.status(200).json({ saved: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
