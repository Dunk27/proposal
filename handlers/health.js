// api/health.js — health check для uptime мониторинга
// Пинговать через UptimeRobot: https://your.vercel.app/api/health

export default async function handler(req, res) {
  const checks = {}

  // Supabase доступность
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY || '' }
    })
    checks.supabase = r.status < 500 ? 'ok' : 'degraded'
  } catch { checks.supabase = 'error' }

  const allOk = Object.values(checks).every(v => v === 'ok')

  return res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks,
    version: process.env.npm_package_version || '3.0.0',
    ts: new Date().toISOString(),
  })
}
