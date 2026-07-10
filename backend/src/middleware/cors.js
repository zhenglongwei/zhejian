const cors = require('cors')
const { config } = require('../config')

function createCorsMiddleware() {
  const allowed = config.cors.allowedOrigins || []

  if (config.nodeEnv !== 'production' || !allowed.length) {
    return cors({ origin: true, credentials: true })
  }

  const allowedSet = new Set(allowed)

  return cors({
    origin(origin, callback) {
      // 小程序 / curl / 同源请求可能无 Origin
      if (!origin) return callback(null, true)
      if (allowedSet.has(origin)) return callback(null, true)
      return callback(new Error(`CORS origin not allowed: ${origin}`))
    },
    credentials: true,
  })
}

module.exports = { createCorsMiddleware }
