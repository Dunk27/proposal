// lib/cache.js — Redis-кэш для ИИ-ответов через Upstash REST API
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// TTL: 24 часа. Ключ = sha256(model + normalised_prompt)

import { createHash } from 'crypto'

const TTL_SECONDS = 86400 // 24 часа

function redis() {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url, token }
}

async function redisCmd(cmds) {
  const r = redis()
  if (!r) return null
  try {
    const res = await fetch(`${r.url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(cmds),
    })
    return await res.json()
  } catch { return null }
}

// Нормализуем промпт: убираем конкретные даты/имена которые не влияют на структуру
function normalise(prompt) {
  return prompt
    .replace(/\d{1,2}\.\d{1,2}\.\d{4}/g, 'DATE')   // даты
    .replace(/\b\d{4,}\b/g, 'NUM')                  // длинные числа
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function makeCacheKey(model, prompt) {
  const hash = createHash('sha256')
    .update(model + '::' + normalise(prompt))
    .digest('hex')
    .slice(0, 32)
  return `kp:${hash}`
}

export async function getCache(key) {
  const res = await redisCmd([['GET', key]])
  if (!res?.[0]?.result) return null
  try { return JSON.parse(res[0].result) } catch { return null }
}

export async function setCache(key, value) {
  await redisCmd([
    ['SET', key, JSON.stringify(value)],
    ['EXPIRE', key, TTL_SECONDS],
  ])
}

// Статистика кэша для admin
export async function getCacheStats() {
  const r = redis()
  if (!r) return { enabled: false }
  try {
    const res = await fetch(`${r.url}/dbsize`, {
      headers: { Authorization: `Bearer ${r.token}` },
    })
    const d = await res.json()
    return { enabled: true, keys: d.result }
  } catch { return { enabled: true, keys: 'unknown' } }
}
