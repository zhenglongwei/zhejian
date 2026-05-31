const { config } = require('../config')
const { fail } = require('../lib/response')
const { verifyToken, normalizeRoles, ROLES } = require('../lib/jwt')

const DEV_USER_ID = 'user_demo_1'
const DEV_MERCHANT_ID = 'merchant_demo_1'
const DEV_STORE_ID = 'store_demo_1'

function parseBearer(req) {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function isDevUserToken(token) {
  return config.devAuthEnabled && token === config.devTokens.user
}

function isDevMerchantToken(token) {
  return config.devAuthEnabled && token === config.devTokens.merchant
}

function emptyAuth(token = '') {
  return {
    token,
    roles: [],
    userId: null,
    merchantId: null,
    storeId: null,
    isDevToken: false,
  }
}

function resolveDevAuth(token) {
  if (!config.devAuthEnabled) return null

  if (token === config.devTokens.user) {
    return {
      token,
      roles: [ROLES.USER, ROLES.MERCHANT],
      userId: DEV_USER_ID,
      merchantId: DEV_MERCHANT_ID,
      storeId: DEV_STORE_ID,
      isDevToken: true,
    }
  }

  if (token === config.devTokens.merchant) {
    return {
      token,
      roles: [ROLES.MERCHANT],
      userId: null,
      merchantId: DEV_MERCHANT_ID,
      storeId: DEV_STORE_ID,
      isDevToken: true,
    }
  }

  if (token === config.devTokens.system || token === config.devTokens.admin) {
    return {
      token,
      roles: [ROLES.SYSTEM],
      userId: 'admin_system',
      merchantId: null,
      storeId: null,
      isDevToken: true,
    }
  }

  return null
}

function resolveJwtAuth(token) {
  const payload = verifyToken(token)
  if (!payload || !payload.sub) return null

  const roles = normalizeRoles(payload)
  const merchantId = payload.merchantId || null
  const storeId = payload.storeId || null

  if (merchantId && !roles.includes(ROLES.MERCHANT)) {
    roles.push(ROLES.MERCHANT)
  }

  return {
    token,
    roles,
    userId: payload.sub,
    merchantId: merchantId || null,
    storeId: storeId || null,
    isDevToken: false,
  }
}

function resolveAuth(token) {
  if (!token) return emptyAuth()

  const jwtAuth = resolveJwtAuth(token)
  if (jwtAuth) return jwtAuth

  const devAuth = resolveDevAuth(token)
  if (devAuth) return devAuth

  return emptyAuth(token)
}

function hasRole(auth, role) {
  return Array.isArray(auth.roles) && auth.roles.includes(role)
}

/** 同小程序双角色：user JWT 带 merchantId 即可访问商家 API */
function canAccessRole(req, roles) {
  if (!roles.length) return true
  const auth = req.auth

  return roles.some((role) => {
    if (role === ROLES.USER) {
      return Boolean(auth.userId) && hasRole(auth, ROLES.USER)
    }
    if (role === ROLES.MERCHANT) {
      return Boolean(auth.merchantId) && hasRole(auth, ROLES.MERCHANT)
    }
    if (role === ROLES.SYSTEM) {
      return hasRole(auth, ROLES.SYSTEM)
    }
    return false
  })
}

function optionalAuth(req, res, next) {
  const token = parseBearer(req)
  req.auth = resolveAuth(token)
  next()
}

function requireAuth(roles = []) {
  return (req, res, next) => {
    const auth = req.auth
    if (!auth || !auth.token || !auth.roles.length) {
      return fail(res, 100002, '未授权', 401)
    }
    if (roles.length && !canAccessRole(req, roles)) {
      return fail(res, 100003, '无权限', 403)
    }
    if (roles.includes(ROLES.USER) && !auth.userId) {
      return fail(res, 100002, '登录已失效，请重新登录', 401)
    }
    if (roles.includes(ROLES.MERCHANT) && !auth.merchantId) {
      return fail(res, 100003, '尚未开通商家身份', 403)
    }
    next()
  }
}

module.exports = { optionalAuth, requireAuth, parseBearer, resolveAuth, hasRole }
