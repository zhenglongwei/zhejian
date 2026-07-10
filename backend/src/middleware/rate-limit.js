const rateLimit = require('express-rate-limit')
const { config } = require('../config')

function buildLimiter(options = {}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: options.skip,
    handler(req, res) {
      res.status(429).json({
        code: 100429,
        message: options.message || '操作过于频繁，请稍后再试',
        data: null,
      })
    },
  })
}

function createRateLimiters() {
  const cfg = config.rateLimit

  const globalLimiter = buildLimiter({
    windowMs: 60 * 1000,
    max: cfg.globalPerMin,
    message: '请求过于频繁，请稍后再试',
  })

  const loginLimiter = buildLimiter({
    windowMs: 15 * 60 * 1000,
    max: cfg.loginPer15Min,
    message: '登录尝试过于频繁，请 15 分钟后再试',
  })

  const uploadLimiter = buildLimiter({
    windowMs: 60 * 1000,
    max: cfg.uploadPerMin,
    message: '上传过于频繁，请稍后再试',
  })

  const desensitizeLimiter = buildLimiter({
    windowMs: 60 * 1000,
    max: cfg.desensitizePerMin,
    message: '脱敏请求过于频繁，请稍后再试',
  })

  const payNotifyLimiter = buildLimiter({
    windowMs: 60 * 1000,
    max: cfg.payNotifyPerMin,
    message: '回调过于频繁',
  })

  return {
    globalLimiter,
    loginLimiter,
    uploadLimiter,
    desensitizeLimiter,
    payNotifyLimiter,
  }
}

function applyRateLimits(app) {
  if (!config.rateLimit.enabled) return

  const {
    globalLimiter,
    loginLimiter,
    uploadLimiter,
    desensitizeLimiter,
    payNotifyLimiter,
  } = createRateLimiters()

  app.use('/api/v1/pay/wechat/notify', payNotifyLimiter)
  app.use('/api/v1/admin/auth/login', loginLimiter)
  app.use('/api/v1/user/auth/wechat-login', loginLimiter)
  app.use('/api/v1/merchant/auth/dev-login', loginLimiter)
  app.use('/api/v1/media/upload', uploadLimiter)
  app.use('/api/v1/desensitize', desensitizeLimiter)
  app.use('/api/', globalLimiter)
}

module.exports = { applyRateLimits, createRateLimiters }
