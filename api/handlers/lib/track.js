// lib/track.js — клиентская утилита трекинга событий
// Подключить через <script src="/lib/track.js"> или инлайн
// Вызов: Track.event('kp_generated', { model: 'claude-sonnet-4', length: 'medium' })

window.Track = (() => {
  const SESSION_KEY = 'kp_session_id'

  function getSessionId() {
    let sid = sessionStorage.getItem(SESSION_KEY)
    if (!sid) {
      sid = Math.random().toString(36).slice(2, 10)
      sessionStorage.setItem(SESSION_KEY, sid)
    }
    return sid
  }

  async function event(name, properties = {}) {
    const token = localStorage.getItem('sb-token')
    try {
      await fetch('/api/analytics', {
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'x-session-id':   getSessionId(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ event: name, properties }),
      })
    } catch (e) {
      // Не блокируем UX из-за аналитики
    }
  }

  // Авто-трекинг pageview
  function pageview() {
    event('pageview', { path: location.pathname }).catch(() => {})
  }

  return { event, pageview, getSessionId }
})()
