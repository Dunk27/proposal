// lib/supabase.js — Supabase клиент для серверных функций
// Использует SERVICE_ROLE_KEY для обхода RLS в API-роутах
// Клиентский код использует ANON_KEY

export function getSupabaseAdmin() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Получить пользователя из JWT токена
export async function getUserFromToken(token) {
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return user
}

// Получить план пользователя и проверить лимиты
export async function checkUserPlan(userId) {
  const supabase = getSupabaseAdmin()
  const { data: user } = await supabase
    .from('users')
    .select('plan, trial_ends_at')
    .eq('id', userId)
    .single()

  if (!user) return { allowed: false, plan: 'none', reason: 'Пользователь не найден' }

  // Проверить истечение триала
  if (user.plan === 'trial' && new Date(user.trial_ends_at) < new Date()) {
    await supabase.from('users').update({ plan: 'free' }).eq('id', userId)
    return { allowed: true, plan: 'free', reason: null }
  }

  return { allowed: true, plan: user.plan, reason: null }
}

// Проверить и инкрементировать счётчик использования
export async function checkAndIncrementUsage(userId, plan) {
  const LIMITS = { free: 3, trial: 999, starter: 20, pro: 9999, agency: 9999 }
  const limit = LIMITS[plan] ?? 3

  const supabase = getSupabaseAdmin()
  const month = new Date().toISOString().slice(0, 7) // '2026-03'

  // Upsert счётчика
  const { data } = await supabase.rpc('increment_usage', { p_user_id: userId, p_month: month })
  const count = data || 1

  if (count > limit) {
    return { allowed: false, count, limit, reason: `Достигнут лимит ${limit} КП/месяц` }
  }
  return { allowed: true, count, limit, reason: null }
}
