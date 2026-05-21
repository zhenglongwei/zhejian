const { config } = require('../config')
const { fail } = require('../lib/response')

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

function optionalAuth(req, res, next) {
  const token = parseBearer(req)
  const clientType = req.headers['x-client-type'] || ''
  req.auth = {
    token,
    role: resolveRole(clientType, token),
    userId: token === config.devTokens.user ? 'user_demo_1' : null,
    merchantId: token === config.devTokens.merchant ? 'merchant_demo_1' : null,
  }
  next()
}

function requireAuth(roles = []) {
  return (req, res, next) => {
    if (!req.auth || !req.auth.token) {
      return fail(res, 100002, '未授权', 401)
    }
    if (roles.length && (!req.auth.role || !roles.includes(req.auth.role))) {
      return fail(res, 100003, '无权限', 403)
    }
    next()
  }
}

module.exports = { optionalAuth, requireAuth, parseBearer }
