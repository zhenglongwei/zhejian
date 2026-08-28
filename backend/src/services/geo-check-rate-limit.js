const buckets = new Map()

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)[0]
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown'
}

function dayKey() {
  return new Date().toISOString().slice(0, 10)
}

function consumeDailyLimit(ip, limit) {
  const cap = Math.max(Number(limit) || 8, 1)
  const day = dayKey()
  const key = `${day}:${ip}`
  const used = Number(buckets.get(key) || 0)
  if (used >= cap) {
    return { allowed: false, used, limit: cap, remaining: 0 }
  }
  buckets.set(key, used + 1)
  if (buckets.size > 5000) {
    const prefix = day
    for (const mapKey of buckets.keys()) {
      if (!String(mapKey).startsWith(prefix)) buckets.delete(mapKey)
    }
  }
  return { allowed: true, used: used + 1, limit: cap, remaining: Math.max(cap - used - 1, 0) }
}

module.exports = { clientIp, consumeDailyLimit }
