// Реферальный виджет для страницы /account
// Вставить: <div id="ref-widget"></div><script src="/account/referral-widget.js"></script>

(async function() {
  const TOKEN = localStorage.getItem('sb-token')
  const el    = document.getElementById('ref-widget')
  if (!el || !TOKEN) return

  try {
    const r = await fetch('/api/referral', { headers: { Authorization: `Bearer ${TOKEN}` } })
    const d = await r.json()
    if (!r.ok) return

    const { refUrl, refCode, rewarded, pending, bonusPerRef } = d

    el.innerHTML = `
<div style="background:#F5F0E8;border:1px solid rgba(184,146,42,.25);border-radius:8px;padding:20px 24px;margin-top:16px;">
  <div style="font-size:13px;font-weight:600;color:#1A1612;margin-bottom:4px;">Реферальная программа</div>
  <div style="font-size:12px;color:#7A6F66;margin-bottom:14px;line-height:1.6;">
    Пригласите коллегу — оба получите <strong style="color:#B8922A">${bonusPerRef || '1 месяц Pro'}</strong> бесплатно.
  </div>
  <div style="display:flex;gap:8px;margin-bottom:12px;">
    <input id="ref-url-input" type="text" value="${refUrl}" readonly
      style="flex:1;background:#FDFAF5;border:1px solid #E8DFC8;border-radius:4px;padding:9px 12px;font-size:12px;font-family:'DM Mono',monospace;color:#1A1612;outline:none;">
    <button onclick="copyRef()" id="ref-copy-btn"
      style="padding:9px 16px;background:#1A1612;color:#F5F0E8;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap;">
      Копировать
    </button>
  </div>
  <div style="display:flex;gap:20px;font-size:12px;color:#7A6F66;">
    <span>✓ Подтверждено: <strong style="color:#27695C">${rewarded}</strong></span>
    <span>⏳ Ожидает оплаты: <strong style="color:#B8922A">${pending}</strong></span>
  </div>
  <div style="margin-top:12px;font-size:11px;color:#7A6F66;">
    Ваш код: <code style="background:#E8DFC8;padding:2px 6px;border-radius:3px;font-size:11px;">${refCode}</code>
  </div>
</div>`

    window.copyRef = () => {
      navigator.clipboard.writeText(refUrl).then(() => {
        const btn = document.getElementById('ref-copy-btn')
        btn.textContent = '✓ Скопировано!'
        btn.style.background = '#27695C'
        setTimeout(() => { btn.textContent = 'Копировать'; btn.style.background = '#1A1612' }, 2000)
        // Трекинг
        if (window.Track) Track.event('referral_shared', { code: refCode })
      })
    }

    // Применить реф-код из localStorage (пришёл по ссылке)
    const savedRef = localStorage.getItem('kp_ref_code')
    if (savedRef && savedRef !== refCode) {
      try {
        const applyRes = await fetch('/api/referral', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
          body:    JSON.stringify({ action: 'apply', refCode: savedRef }),
        })
        const applyData = await applyRes.json()
        if (applyRes.ok && applyData.success) {
          localStorage.removeItem('kp_ref_code')
          const notice = document.createElement('div')
          notice.style.cssText = 'background:rgba(39,105,92,.12);border:1px solid rgba(39,105,92,.3);border-radius:6px;padding:10px 14px;margin-top:10px;font-size:12px;color:#27695C;'
          notice.textContent = '✓ ' + applyData.message
          el.appendChild(notice)
        }
      } catch (e) {}
    }

  } catch (e) {
    console.error('ref-widget:', e)
  }
})()
