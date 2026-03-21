// api/email.js — транзакционные письма через Resend
// Env: RESEND_API_KEY, APP_URL
// Вызывается из webhook'ов и серверных функций

export async function sendEmail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY
  if (!key) { console.warn('RESEND_API_KEY не задан — письмо не отправлено'); return null }

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'ProposeAI <noreply@yourdomain.ru>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || subject,
    }),
  })
  const d = await r.json()
  if (!r.ok) console.error('Resend error:', d)
  return d
}

// ── Шаблоны писем ───────────────────────────────────────

export function welcomeEmail({ email, trialDays = 14 }) {
  return {
    to: email,
    subject: 'Добро пожаловать в ProposeAI — ваш триал начался',
    html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1612;">
  <div style="background:#1A1612;padding:24px 32px;border-radius:8px 8px 0 0;">
    <h1 style="color:#D4AB42;font-size:22px;margin:0;font-weight:300;">Propose<strong>AI</strong></h1>
  </div>
  <div style="background:#FDFAF5;padding:32px;border:1px solid #E8DFC8;border-top:none;border-radius:0 0 8px 8px;">
    <h2 style="font-size:20px;font-weight:400;margin:0 0 16px;">Добро пожаловать!</h2>
    <p style="font-size:14px;line-height:1.7;color:#3D3530;margin:0 0 16px;">У вас есть <strong>${trialDays} дней бесплатного Pro-доступа</strong> — без карты, без ограничений. Создайте первое коммерческое предложение прямо сейчас.</p>
    <a href="${process.env.APP_URL}/app" style="display:inline-block;background:#B8922A;color:#fff;padding:13px 28px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:1px;">Создать первое КП →</a>
    <hr style="border:none;border-top:1px solid #E8DFC8;margin:28px 0;">
    <p style="font-size:12px;color:#7A6F66;margin:0;">Что вы можете делать в ProposeAI: выбирать ИИ-модель (Claude, GPT-4o, Gemini), настраивать тон и структуру, экспортировать в DOCX, хранить историю КП.</p>
  </div>
</div>`,
  }
}

export function trialEndingSoonEmail({ email, daysLeft }) {
  return {
    to: email,
    subject: `⏰ До конца триала осталось ${daysLeft} ${daysLeft === 1 ? 'день' : 'дня'} — ProposeAI`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1612;">
  <div style="background:#1A1612;padding:24px 32px;border-radius:8px 8px 0 0;">
    <h1 style="color:#D4AB42;font-size:22px;margin:0;font-weight:300;">Propose<strong>AI</strong></h1>
  </div>
  <div style="background:#FDFAF5;padding:32px;border:1px solid #E8DFC8;border-top:none;border-radius:0 0 8px 8px;">
    <h2 style="font-size:20px;font-weight:400;margin:0 0 16px;">Триал заканчивается через ${daysLeft} ${daysLeft === 1 ? 'день' : 'дня'}</h2>
    <p style="font-size:14px;line-height:1.7;color:#3D3530;margin:0 0 16px;">После окончания триала вы переходите на Free (3 КП/месяц). Перейдите на Pro прямо сейчас и продолжайте генерировать КП без ограничений.</p>
    <div style="background:#F5F0E8;border:1px solid #E8DFC8;border-radius:6px;padding:16px;margin-bottom:20px;">
      <div style="font-size:12px;color:#7A6F66;margin-bottom:6px;">Pro — 2 990 ₽/мес</div>
      <div style="font-size:13px;color:#1A1612;">✓ Безлимит КП &nbsp; ✓ Все 6 моделей ИИ &nbsp; ✓ Экспорт DOCX &nbsp; ✓ История КП</div>
    </div>
    <a href="${process.env.APP_URL}/dashboard" style="display:inline-block;background:#B8922A;color:#fff;padding:13px 28px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:1px;">Перейти на Pro →</a>
  </div>
</div>`,
  }
}

export function paymentSuccessEmail({ email, plan, amount, currency = 'RUB' }) {
  const planNames = { starter: 'Starter', pro: 'Pro', agency: 'Agency' }
  return {
    to: email,
    subject: `✅ Оплата подтверждена — тариф ${planNames[plan] || plan} активирован`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1612;">
  <div style="background:#1A1612;padding:24px 32px;border-radius:8px 8px 0 0;">
    <h1 style="color:#D4AB42;font-size:22px;margin:0;font-weight:300;">Propose<strong>AI</strong></h1>
  </div>
  <div style="background:#FDFAF5;padding:32px;border:1px solid #E8DFC8;border-top:none;border-radius:0 0 8px 8px;">
    <h2 style="font-size:20px;font-weight:400;margin:0 0 16px;">Оплата прошла успешно</h2>
    <div style="background:#F0F9F6;border:1px solid #27695C33;border-radius:6px;padding:16px;margin-bottom:20px;">
      <div style="font-size:13px;color:#27695C;font-weight:600;">Тариф ${planNames[plan] || plan} активирован</div>
      <div style="font-size:12px;color:#7A6F66;margin-top:4px;">Сумма: ${amount ? (amount / 100).toLocaleString('ru') : '—'} ${currency}</div>
    </div>
    <a href="${process.env.APP_URL}/app" style="display:inline-block;background:#B8922A;color:#fff;padding:13px 28px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:1px;">Перейти в приложение →</a>
    <p style="font-size:11px;color:#7A6F66;margin-top:20px;">Для управления подпиской перейдите в <a href="${process.env.APP_URL}/dashboard" style="color:#B8922A;">личный кабинет</a>.</p>
  </div>
</div>`,
  }
}

export function limitReachedEmail({ email, plan, limit }) {
  return {
    to: email,
    subject: 'Лимит КП исчерпан — обновите тариф',
    html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1612;">
  <div style="background:#1A1612;padding:24px 32px;border-radius:8px 8px 0 0;">
    <h1 style="color:#D4AB42;font-size:22px;margin:0;font-weight:300;">Propose<strong>AI</strong></h1>
  </div>
  <div style="background:#FDFAF5;padding:32px;border:1px solid #E8DFC8;border-top:none;border-radius:0 0 8px 8px;">
    <h2 style="font-size:20px;font-weight:400;margin:0 0 16px;">Вы использовали все ${limit} КП этого месяца</h2>
    <p style="font-size:14px;line-height:1.7;color:#3D3530;margin:0 0 20px;">Перейдите на Pro для безлимитной генерации и доступа ко всем моделям ИИ.</p>
    <a href="${process.env.APP_URL}/dashboard" style="display:inline-block;background:#B8922A;color:#fff;padding:13px 28px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:1px;">Перейти на Pro →</a>
  </div>
</div>`,
  }
}

// HTTP handler для ручной отправки (для тестирования)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { type, data } = req.body || {}
  const templates = { welcome: welcomeEmail, trialEndingSoon: trialEndingSoonEmail, paymentSuccess: paymentSuccessEmail }
  const fn = templates[type]
  if (!fn) return res.status(400).json({ error: 'Неизвестный тип письма' })
  const result = await sendEmail(fn(data))
  return res.status(200).json({ sent: true, result })
}
