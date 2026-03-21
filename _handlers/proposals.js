// api/proposals.js — CRUD для истории КП
import { getUserFromToken, getSupabaseAdmin } from '../lib/supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const user = await getUserFromToken(token)
  if (!user) return res.status(401).json({ error: 'Необходима авторизация' })

  const supabase = getSupabaseAdmin()

  // GET — список КП
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('proposals')
      .select('id, title, client_name, model, word_count, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ proposals: data })
  }

  // DELETE — удалить КП
  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id обязателен' })
    const { error } = await supabase.from('proposals').delete().eq('id', id).eq('user_id', user.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
