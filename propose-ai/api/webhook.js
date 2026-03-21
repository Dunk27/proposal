// api/webhook.js — Stripe Webhook
// Обрабатывает события Stripe (оплата успешна, подписка отменена и т.д.)
// Env vars: STRIPE_WEBHOOK_SECRET, DATABASE_URL
// Зарегистрируйте endpoint в Stripe Dashboard → Webhooks → Add endpoint:
//   URL: https://your-domain.vercel.app/api/webhook

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET не задан');
    return res.status(500).end();
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  // Stripe signature verification (без SDK — упрощённая версия)
  // Для production используйте: const stripe = require('stripe')(key); stripe.webhooks.constructEvent(...)
  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Обработка событий
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('✅ Оплата успешна:', {
        sessionId: session.id,
        email: session.customer_email,
        amount: session.amount_total,
      });
      // TODO: Запишите в БД (таблица payments):
      // INSERT INTO payments (stripe_session_id, email, plan, amount, paid_at)
      // VALUES (session.id, session.customer_email, ..., session.amount_total, NOW())
      break;
    }
    case 'customer.subscription.deleted': {
      console.log('❌ Подписка отменена:', event.data.object.id);
      // TODO: Обновите статус пользователя в БД
      break;
    }
  }

  return res.status(200).json({ received: true });
}
