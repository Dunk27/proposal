// api/user.js — профиль пользователя, план, usage, company profile
import { getUserFromToken, getSupabaseAdmin, checkUserPlan } from '../lib/supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const user = await getUserFromToken(token)
  if (!user) return res.status(401).json({ error: 'Необходима авторизация' })

  const supabase = getSupabaseAdmin()
  const month = new Date().toISOString().slice(0, 7)

  if (req.method === 'GET') {
    const [{ data: userData }, { data: usage }, { data: profile }] = await Promise.all([
      supabase.from('users').select('plan, trial_ends_at, created_at').eq('id', user.id).single(),
      supabase.from('usage').select('count').eq('user_id', user.id).eq('month', month).single(),
      supabase.from('company_profiles').select('*').eq('user_id', user.id).single(),
    ])
    const LIMITS = { free: 3, trial: 999, starter: 20, pro: 9999, agency: 9999 }
    const plan = userData?.plan || 'trial'
    return res.status(200).json({
      email: user.email,
      plan,
      trialEndsAt: userData?.trial_ends_at,
      usage: { used: usage?.count || 0, limit: LIMITS[plan] || 3 },
      companyProfile: profile || null,
    })
  }

  if (req.method === 'POST') {
    const { action, ...data } = req.body || {}
    if (action === 'save-profile') {
      await supabase.from('company_profiles').upsert({
        user_id: user.id,
        ...data,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      return res.status(200).json({ saved: true })
    }
    return res.status(400).json({ error: 'Неизвестный action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
