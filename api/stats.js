import { Redis } from '@upstash/redis'

const STATS_KEYS = {
  visit: 'gridwright:stats:visits',
  download: 'gridwright:stats:downloads',
}

let redis

function getRedis() {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN

    if (!url || !token) {
      throw new Error('Missing Upstash Redis environment variables.')
    }

    redis = new Redis({ url, token })
  }

  return redis
}

function json(response, statusCode, body) {
  response.status(statusCode).json(body)
}

function safeCount(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

async function readStats(client) {
  const [visits, downloads] = await client.mget(STATS_KEYS.visit, STATS_KEYS.download)

  return {
    visits: safeCount(visits),
    downloads: safeCount(downloads),
  }
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')

  let client

  try {
    client = getRedis()
  } catch (error) {
    json(response, 503, { error: 'Usage stats are not configured.' })
    return
  }

  if (request.method === 'GET') {
    try {
      json(response, 200, await readStats(client))
    } catch (error) {
      json(response, 500, { error: 'Could not read usage stats.' })
    }
    return
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST')
    json(response, 405, { error: 'Method not allowed.' })
    return
  }

  const event = request.body?.event
  const key = STATS_KEYS[event]

  if (!key) {
    json(response, 400, { error: 'Unsupported stats event.' })
    return
  }

  try {
    await client.incr(key)
    json(response, 200, await readStats(client))
  } catch (error) {
    json(response, 500, { error: 'Could not update usage stats.' })
  }
}
