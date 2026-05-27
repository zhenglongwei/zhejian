const { config } = require('../config')
const { fail } = require('../lib/response')

const DEV_USER_ID = 'user_demo_1'
const DEV_MERCHANT_ID = 'merchant_demo_1'

const CLIENT_ROLE = {
  'weapp_user': 'user',
  'user-miniapp': 'user',
  merchant: 'merchant',
  'merchant-miniapp': 'merchant',
  admin: 'admin',
  system: 'system',
}

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

function resolveRole(clientType, token) {
  if (!config.devAuthEnabled) {
    return null
  }
  if (token === config.devTokens.user) return 'user'
  if (token === config.devTokens.merchant) return 'merchant'
  if (token === config.devTokens.system) return 'system'
  if (CLIENT_ROLE[clientType]) return CLIENT_ROLE[clientType]
  return null
}

/** 联调期：同小程序内用户 dev token 可访问商家 API（映射 demo 商家） */
function canAccessRole(req, roles) {
  if (!roles.length) return true
  const { role, token } = req.auth
  if (role && roles.includes(role)) return true
  if (roles.includes('merchant') && isDevUserToken(token)) return true
  return false
}

function optionalAuth(req, res, next) {
  const token = parseBearer(req)
  const clientType = req.headers['x-client-type'] || ''
  req.auth = {
    token,
    role: resolveRole(clientType, token),
    userId: isDevUserToken(token) ? DEV_USER_ID : null,
    merchantId:
      isDevMerchantToken(token) || isDevUserToken(token) ? DEV_MERCHANT_ID : null,
  }
  next()
}

function requireAuth(roles = []) {
  return (req, res, next) => {
    if (!req.auth || !req.auth.token) {
      return fail(res, 100002, '未授权', 401)
    }
    if (roles.length && !canAccessRole(req, roles)) {
      return fail(res, 100003, '无权限', 403)
    }
    next()
  }
}

module.exports = { optionalAuth, requireAuth, parseBearer }
