// api/index.js — ЕДИНСТВЕННАЯ Serverless Function
// Все остальные handlers лежат в api/handlers/ и НЕ являются функциями Vercel
// Маршрутизация: /api/<name> → api/handlers/<name>.js

import abTest             from './handlers/ab-test.js'
import admin              from './handlers/admin.js'
import analytics          from './handlers/analytics.js'
import auth               from './handlers/auth.js'
import billing            from './handlers/billing.js'
import checkout           from './handlers/checkout.js'
import cron               from './handlers/cron.js'
import db                 from './handlers/db.js'
import email              from './handlers/email.js'
import exportHandler      from './handlers/export.js'
import generate           from './handlers/generate.js'
import health             from './handlers/health.js'
import invite             from './handlers/invite.js'
import nowpaymentsCheckout from './handlers/nowpayments-checkout.js'
import nowpaymentsWebhook  from './handlers/nowpayments-webhook.js'
import onboarding         from './handlers/onboarding.js'
import proposals          from './handlers/proposals.js'
import referral           from './handlers/referral.js'
import user               from './handlers/user.js'
import webhook            from './handlers/webhook.js'
import yookassaCheckout   from './handlers/yookassa-checkout.js'
import yookassaWebhook    from './handlers/yookassa-webhook.js'

const routes = {
  'ab-test':              abTest,
  'admin':                admin,
  'analytics':            analytics,
  'auth':                 auth,
  'billing':              billing,
  'checkout':             checkout,
  'cron':                 cron,
  'db':                   db,
  'email':                email,
  'export':               exportHandler,
  'generate':             generate,
  'health':               health,
  'invite':               invite,
  'nowpayments-checkout': nowpaymentsCheckout,
  'nowpayments-webhook':  nowpaymentsWebhook,
  'onboarding':           onboarding,
  'proposals':            proposals,
  'referral':             referral,
  'user':                 user,
  'webhook':              webhook,
  'yookassa-checkout':    yookassaCheckout,
  'yookassa-webhook':     yookassaWebhook,
}

export default async function handler(req, res) {
  // Vercel передаёт slug через query при rewrite /api/:slug* → /api/index?slug=:slug*
  let segment = ''

  if (req.query?.slug) {
    segment = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug
    delete req.query.slug
  } else {
    // Fallback: парсим из URL
    const urlPath = (req.url || '').split('?')[0]
    const parts = urlPath.replace(/^\/+/, '').split('/')
    segment = parts[0] === 'api' ? (parts[1] || '') : parts[0]
  }

  segment = segment.toLowerCase()

  const routeHandler = routes[segment]
  if (!routeHandler) {
    return res.status(404).json({ error: `Unknown API route: /api/${segment}` })
  }

  return routeHandler(req, res)
}
