// api/index.js — единственная Serverless Function на Vercel
// Handlers лежат в _handlers/ (вне папки api/, чтобы Vercel их не трогал)

import abTest              from '../_handlers/ab-test.js'
import admin               from '../_handlers/admin.js'
import analytics           from '../_handlers/analytics.js'
import auth                from '../_handlers/auth.js'
import billing             from '../_handlers/billing.js'
import checkout            from '../_handlers/checkout.js'
import cron                from '../_handlers/cron.js'
import db                  from '../_handlers/db.js'
import email               from '../_handlers/email.js'
import exportHandler       from '../_handlers/export.js'
import generate            from '../_handlers/generate.js'
import health              from '../_handlers/health.js'
import invite              from '../_handlers/invite.js'
import nowpaymentsCheckout from '../_handlers/nowpayments-checkout.js'
import nowpaymentsWebhook  from '../_handlers/nowpayments-webhook.js'
import onboarding          from '../_handlers/onboarding.js'
import proposals           from '../_handlers/proposals.js'
import referral            from '../_handlers/referral.js'
import user                from '../_handlers/user.js'
import webhook             from '../_handlers/webhook.js'
import yookassaCheckout    from '../_handlers/yookassa-checkout.js'
import yookassaWebhook     from '../_handlers/yookassa-webhook.js'

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
  let segment = ''

  if (req.query?.slug) {
    segment = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug
    delete req.query.slug
  } else {
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
