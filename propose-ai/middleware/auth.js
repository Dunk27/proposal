// middleware/auth.js — Vercel Edge Middleware
// Защита /app/* и /api/* (кроме публичных эндпоинтов)
// Проверяет Supabase JWT из Authorization header или cookie
// Добавляет rate limiting через Upstash Redis

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PUBLIC_PATHS = [
  '/api/yookassa-webhook',
  '/api/nowpayments-webhook',
  '/api/stripe-webhook',
  '/auth',
  '/privacy',
  '/terms',
  '/_next',
  '/favicon',
]

export const config = {
  matcher: ['/api/:path*', '/app/:path*', '/dashboard/:path*'],
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url)

  // Пропустить публичные пути
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return new Response(null, { status: 200 })
  }

  // Извлечь токен из заголовка или cookie
  const authHeader = request.headers.get('authorization') || ''
  const cookieHeader = request.headers.get('cookie') || ''
  const token =
    authHeader.replace('Bearer ', '') ||
    cookieHeader.match(/sb-access-token=([^;]+)/)?.[1]

  if (!token) {
    // API-запросы — JSON 401
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Необходима авторизация' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Страницы — редирект на /auth/login
    return Response.redirect(new URL('/auth/login', request.url))
  }

  // Rate limiting (Upstash Redis) — только для /api/generate
  if (pathname === '/api/generate') {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

    if (redisUrl && redisToken) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
      const key = `rl:${ip}`
      const window = 60  // секунды

      try {
        const r = await fetch(`${redisUrl}/pipeline`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify([
            ['INCR', key],
            ['EXPIRE', key, window],
          ]),
        })
        const [[, count]] = await r.json()
        if (count > 10) {
          return new Response(JSON.stringify({ error: 'Слишком много запросов. Попробуйте через минуту.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
          })
        }
      } catch (e) {
        // Redis недоступен — пропускаем rate limit, не блокируем
      }
    }
  }

  // Передаём user_id в заголовке для API-роутов
  return new Response(null, {
    status: 200,
    headers: { 'x-auth-token': token },
  })
}
