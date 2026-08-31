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

/**
 * @param {string} ip
 * @param {number} limit
 * @param {string} [scope] 同一 IP 在不同通道上分开计数，例如 'web' / 'browser'
 */
function consumeDailyLimit(ip, limit, scope = 'web') {
  const cap = Math.max(Number(limit) || 8, 1)
  const day = dayKey()
  const key = `${day}:${scope}:${ip}`
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

/**
 * 只看不扣。页面要在用户动手之前告诉他「今天还剩几次」，
 * 不能为了查余额就把次数消耗掉。
 */
function peekDailyUsage(ip, scope = 'web', limit = 0) {
  const day = dayKey()
  const used = Number(buckets.get(`${day}:${scope}:${ip}`) || 0)
  const cap = Math.max(Number(limit) || 0, 0)
  return { used, limit: cap, remaining: cap ? Math.max(cap - used, 0) : 0 }
}

module.exports = { clientIp, consumeDailyLimit, peekDailyUsage }
