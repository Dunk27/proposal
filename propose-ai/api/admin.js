// api/admin.js — внутренняя admin-панель
// Защищён ADMIN_KEY (задать в Vercel env)
// Только GET — никаких деструктивных операций через API

import { getSupabaseAdmin } from '../lib/supabase.js'

export default async function handler(req, res) {
  const adminKey = req.headers['x-admin-key']
  if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  const [
    { count: totalUsers },
    { count: trialUsers },
    { count: paidUsers },
    { count: proposalsToday },
    { data: recentUsers },
    { data: recentPayments },
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('plan', 'trial'),
    supabase.from('users').select('*', { count: 'exact', head: true }).in('plan', ['starter', 'pro', 'agency']),
    supabase.from('proposals').select('*', { count: 'exact', head: true }).gte('created_at', today + 'T00:00:00Z'),
    supabase.from('users').select('id, email, plan, created_at').order('created_at', { ascending: false }).limit(20),
    supabase.from('payments').select('user_id, plan, amount, currency, provider, status, paid_at, created_at').eq('status', 'paid').order('paid_at', { ascending: false }).limit(20),
  ])

  // Обогатить пользователей количеством КП
  const userIds = (recentUsers || []).map(u => u.id)
  const { data: usageCounts } = await supabase.from('proposals').select('user_id').in('user_id', userIds)
  const countMap = {}
  for (const row of (usageCounts || [])) {
    countMap[row.user_id] = (countMap[row.user_id] || 0) + 1
  }

  // Добавить email к платежам
  const payUserIds = [...new Set((recentPayments || []).map(p => p.user_id).filter(Boolean))]
  const { data: payUsers } = await supabase.from('users').select('id, email').in('id', payUserIds)
  const emailMap = Object.fromEntries((payUsers || []).map(u => [u.id, u.email]))

  return res.status(200).json({
    stats: { totalUsers, trialUsers, paidUsers, proposalsToday },
    users: (recentUsers || []).map(u => ({ ...u, proposal_count: countMap[u.id] || 0 })),
    payments: (recentPayments || []).map(p => ({ ...p, email: emailMap[p.user_id] || '—' })),
  })
}
