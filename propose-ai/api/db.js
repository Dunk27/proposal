// api/db.js — Proposals database (Vercel KV / Redis / Supabase)
// DATABASE PATH: process.env.DATABASE_URL  (Supabase Postgres or Vercel KV)
// Local fallback: in-memory store (resets on cold start — only for dev)

// ── Supabase client (if DATABASE_URL is a Postgres URL) ──────────────────────
async function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  // Dynamic import for edge compatibility
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  return createClient(url, key);
}

// ── In-memory fallback (dev only) ─────────────────────────────────────────────
const memStore = { proposals: [] };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Simple admin token check
  const adminToken = process.env.ADMIN_TOKEN;
  const authHeader = req.headers.authorization;
  if (adminToken && authHeader !== `Bearer ${adminToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { action, proposal, id, userId } = req.body || {};
  const qAction = req.query.action;
  const qUserId = req.query.userId;

  try {
    const sb = await getSupabase();

    // ── SAVE proposal ────────────────────────────────────────────────────────
    if (req.method === 'POST' && (action === 'save' || !action)) {
      const record = {
        id: proposal.id || `kp_${Date.now()}`,
        user_id: proposal.userId || 'anonymous',
        client_name: proposal.clientName || '',
        company_name: proposal.companyName || '',
        ai_provider: proposal.aiProvider || 'claude',
        text: proposal.text || '',
        meta: JSON.stringify(proposal.meta || {}),
        created_at: new Date().toISOString()
      };

      if (sb) {
        const { error } = await sb.from('proposals').upsert(record);
        if (error) throw new Error(error.message);
      } else {
        memStore.proposals = memStore.proposals.filter(p => p.id !== record.id);
        memStore.proposals.unshift(record);
      }
      return res.status(200).json({ success: true, id: record.id });
    }

    // ── LIST proposals ───────────────────────────────────────────────────────
    if (req.method === 'GET' || (req.method === 'POST' && action === 'list')) {
      const filterUser = qUserId || userId;
      if (sb) {
        let q = sb.from('proposals').select('*').order('created_at', { ascending: false });
        if (filterUser) q = q.eq('user_id', filterUser);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return res.status(200).json({ proposals: data || [] });
      } else {
        const data = filterUser ? memStore.proposals.filter(p => p.user_id === filterUser) : memStore.proposals;
        return res.status(200).json({ proposals: data });
      }
    }

    // ── DELETE proposal ──────────────────────────────────────────────────────
    if (req.method === 'DELETE' || (req.method === 'POST' && action === 'delete')) {
      const delId = id || req.query.id;
      if (sb) {
        const { error } = await sb.from('proposals').delete().eq('id', delId);
        if (error) throw new Error(error.message);
      } else {
        memStore.proposals = memStore.proposals.filter(p => p.id !== delId);
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
