// api/index.js — единый роутер для всех API-эндпоинтов
// Объединяет все handlers в одну Serverless Function для Vercel Hobby plan (лимит 12)
// Vercel rewrite: /api/:slug* → /api/index (slug передаётся через req.url или req.query)

import abTest from './ab-test.js'
import admin from './admin.js'
import analytics from './analytics.js'
import auth from './auth.js'
import billing from './billing.js'
import checkout from './checkout.js'
import cron from './cron.js'
import db from './db.js'
import email from './email.js'
import exportHandler from './export.js'
import generate from './generate.js'
import health from './health.js'
import invite from './invite.js'
import nowpaymentsCheckout from './nowpayments-checkout.js'
import nowpaymentsWebhook from './nowpayments-webhook.js'
import onboarding from './onboarding.js'
import proposals from './proposals.js'
import referral from './referral.js'
import user from './user.js'
import webhook from './webhook.js'
import yookassaCheckout from './yookassa-checkout.js'
import yookassaWebhook from './yookassa-webhook.js'

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
  // При rewrite /api/:slug* → /api/index Vercel передаёт slug в req.query
  // Например: /api/auth → req.query.slug = ['auth']
  // Например: /api/proposals?id=1 → req.query.slug = ['proposals']
  let segment = ''

  if (req.query && req.query.slug) {
    // Vercel передаёт wildcard как массив сегментов
    segment = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug
  } else {
    // Fallback: парсим из req.url
    // req.url может быть '/api/auth' или '/auth' в зависимости от среды
    const urlPath = (req.url || '').split('?')[0]
    const parts = urlPath.replace(/^\/+/, '').split('/')
    // Убираем 'api' если есть
    segment = parts[0] === 'api' ? parts[1] : parts[0]
  }

  segment = (segment || '').toLowerCase()

  const routeHandler = routes[segment]

  if (!routeHandler) {
    return res.status(404).json({ error: `Unknown route: /api/${segment}` })
  }

  // Важно: удаляем служебный параметр slug из query, чтобы не мешал handler-у
  if (req.query && req.query.slug) {
    delete req.query.slug
  }

  return routeHandler(req, res)
}
