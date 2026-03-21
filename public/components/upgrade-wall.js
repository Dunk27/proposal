// public/components/upgrade-wall.js
// Апгрейд-стена с таймером и переключением месяц/год
// Вызов: UpgradeWall.show({ used, limit, plan })

window.UpgradeWall = (() => {
  const TK = 'uw_deadline'

  function show({ used = 0, limit = 3, plan = 'free' } = {}) {
    remove()
    const overlay = document.createElement('div')
    overlay.id = 'upgrade-wall'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(26,22,18,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);'

    const saved    = parseInt(localStorage.getItem(TK) || '0')
    const deadline = (saved > Date.now()) ? saved : Date.now() + 86400000
    if (saved <= Date.now()) localStorage.setItem(TK, deadline)

    const PLAN_NAMES = { free:'Free', trial:'Trial', starter:'Starter', pro:'Pro', agency:'Agency' }

    overlay.innerHTML = `
<style>
#uwc{background:#FAFCFF;border-radius:12px;max-width:480px;width:100%;border:1px solid rgba(184,146,42,.3);overflow:hidden;font-family:'DM Sans',sans-serif;animation:uwIn .22s ease}
@keyframes uwIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
#uwt{background:#111827;padding:26px 30px 22px;position:relative}
#uwx{position:absolute;top:12px;right:14px;background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.5);width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center}
#uwx:hover{color:#fff}
#uwh{font-family:'Cormorant Garamond',serif;font-size:25px;font-weight:300;color:#FAFCFF;margin-bottom:5px}
#uws{font-size:12px;color:rgba(253,250,245,.55);line-height:1.6}
#uwtimer{display:flex;align-items:center;gap:7px;margin-top:12px}
.utd{width:6px;height:6px;border-radius:50%;background:#5584CC;animation:utp 1.5s infinite}
@keyframes utp{0%,100%{opacity:1}50%{opacity:.4}}
#utlbl{font-size:10px;color:#5584CC;font-weight:700;letter-spacing:.5px}
#utime{font-family:monospace;font-size:13px;color:#5584CC}
#uwb{padding:22px 30px 26px}
#uwbar-row{display:flex;justify-content:space-between;font-size:11px;color:#6B7280;margin-bottom:5px}
#uwbar{height:5px;background:#D6E3F5;border-radius:3px;overflow:hidden;margin-bottom:18px}
#uwbarfill{height:100%;background:#C0392B;border-radius:3px;width:${Math.min(100,Math.round(used/Math.max(limit,1)*100))}%}
#uwperiod{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:14px;font-size:12px;color:#6B7280}
#uwtog{position:relative;width:34px;height:18px;background:#D6E3F5;border-radius:9px;cursor:pointer;transition:background .2s;flex-shrink:0}
#uwtog.on{background:#3D6FBF}
#uwtog::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;background:#fff;border-radius:50%;transition:transform .2s}
#uwtog.on::after{transform:translateX(16px)}
#uwplans{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
.uwp{padding:13px;border:1.5px solid #D6E3F5;border-radius:8px;cursor:pointer;transition:all .18s}
.uwp:hover{border-color:#5584CC}
.uwp.sel{border-color:#3D6FBF;background:rgba(184,146,42,.07)}
.uwpn{font-size:11px;font-weight:700;color:#374151;margin-bottom:2px}
.uwp.sel .uwpn{color:#3D6FBF}
.uwpp{font-size:18px;font-weight:600;color:#111827;font-family:'Cormorant Garamond',serif}
.uwpd{font-size:10px;color:#6B7280;margin-top:2px}
.uwbadge{display:inline-block;padding:1px 7px;background:#3D6FBF;color:#fff;border-radius:99px;font-size:9px;font-weight:700;margin-bottom:4px}
#uwcta{width:100%;padding:14px;background:linear-gradient(135deg,#3D6FBF,#5584CC);color:#fff;border:none;border-radius:4px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;transition:opacity .2s}
#uwcta:hover{opacity:.9}
#uwnote{text-align:center;font-size:10px;color:#6B7280;margin-top:9px;line-height:1.6}
</style>
<div id="uwc">
  <div id="uwt">
    <button id="uwx">×</button>
    <div id="uwh">Лимит исчерпан</div>
    <div id="uws">Использовано <strong style="color:#5584CC">${used}/${limit}</strong> КП на тарифе <strong style="color:#5584CC">${PLAN_NAMES[plan]||plan}</strong>. Перейдите на Pro для безлимитной генерации.</div>
    <div id="uwtimer"><div class="utd"></div><span id="utlbl">ПРЕДЛОЖЕНИЕ ДЕЙСТВУЕТ:</span><span id="utime">—</span></div>
  </div>
  <div id="uwb">
    <div id="uwbar-row"><span>КП в этом месяце</span><span>${used} / ${limit}</span></div>
    <div id="uwbar"><div id="uwbarfill"></div></div>
    <div id="uwperiod">
      <span>Месячный</span>
      <div id="uwtog" onclick="uwTog()"></div>
      <span>Годовой <strong style="color:#3D6FBF">−20%</strong></span>
    </div>
    <div id="uwplans">
      <div class="uwp" id="uwp-starter" onclick="uwSel('starter')">
        <div class="uwpn">Starter</div>
        <div class="uwpp" id="uwp-starter-price">990 ₽<span style="font-size:11px;font-weight:300">/мес</span></div>
        <div class="uwpd">20 КП · Claude Sonnet</div>
      </div>
      <div class="uwp sel" id="uwp-pro" onclick="uwSel('pro')">
        <div class="uwbadge">Лучший</div>
        <div class="uwpn">Pro</div>
        <div class="uwpp" id="uwp-pro-price">2 990 ₽<span style="font-size:11px;font-weight:300">/мес</span></div>
        <div class="uwpd">Безлимит · Все 6 моделей</div>
      </div>
    </div>
    <button id="uwcta" onclick="uwPay()">💳 Оплатить — Карты РФ</button>
    <div id="uwnote">Visa · МИР · Mastercard · Крипто · Stripe · Отмена в любой момент</div>
  </div>
</div>`

    document.body.appendChild(overlay)
    overlay.addEventListener('click', e => { if (e.target === overlay) remove() })
    document.getElementById('uwx').addEventListener('click', remove)

    // countdown
    const tick = () => {
      const left = Math.max(0, deadline - Date.now())
      const h = String(Math.floor(left / 3600000)).padStart(2,'0')
      const m = String(Math.floor(left % 3600000 / 60000)).padStart(2,'0')
      const s = String(Math.floor(left % 60000 / 1000)).padStart(2,'0')
      const el = document.getElementById('utime')
      if (el) el.textContent = `${h}:${m}:${s}`
      if (left > 0 && document.getElementById('utime')) setTimeout(tick, 1000)
    }
    tick()

    window._uwPlan   = 'pro'
    window._uwAnnual = false

    window.uwSel = p => {
      window._uwPlan = p
      document.querySelectorAll('.uwp').forEach(el => el.classList.toggle('sel', el.id === `uwp-${p}`))
    }
    window.uwTog = () => {
      window._uwAnnual = !window._uwAnnual
      document.getElementById('uwtog').classList.toggle('on', window._uwAnnual)
      document.getElementById('uwp-starter-price').innerHTML = window._uwAnnual
        ? '792 ₽<span style="font-size:11px;font-weight:300">/мес</span>'
        : '990 ₽<span style="font-size:11px;font-weight:300">/мес</span>'
      document.getElementById('uwp-pro-price').innerHTML = window._uwAnnual
        ? '2 392 ₽<span style="font-size:11px;font-weight:300">/мес</span>'
        : '2 990 ₽<span style="font-size:11px;font-weight:300">/мес</span>'
    }
    window.uwPay = async () => {
      const planId = `${window._uwPlan}_${window._uwAnnual ? 'annual' : 'monthly'}`
      const TOKEN  = localStorage.getItem('sb-token')
      const btn    = document.getElementById('uwcta')
      btn.disabled = true; btn.textContent = 'Создаём платёж…'
      try {
        const r = await fetch('/api/yookassa-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify({ planId, returnUrl: location.origin + '/dashboard?payment=success' }),
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Ошибка')
        if (d.confirmationUrl) location.href = d.confirmationUrl
      } catch(e) {
        alert('Ошибка: ' + e.message)
        btn.disabled = false; btn.innerHTML = '💳 Оплатить — Карты РФ'
      }
    }
  }

  function remove() {
    const el = document.getElementById('upgrade-wall')
    if (el) el.remove()
  }

  return { show, remove }
})()
