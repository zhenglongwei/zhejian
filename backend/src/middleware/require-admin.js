const { config } = require('../config')
const { fail } = require('../lib/response')
const { ROLES } = require('../lib/jwt')
const { hasRole } = require('./auth')

/** 运营台：system 角色 + 建议 X-Client-Type: admin */
function requireAdmin(req, res, next) {
  const auth = req.auth
  if (!auth?.token || !hasRole(auth, ROLES.SYSTEM)) {
    return fail(res, 100003, '无运营权限', 403)
  }
  const clientType = String(req.headers['x-client-type'] || '').toLowerCase()
  if (
    config.nodeEnv === 'production' &&
    clientType &&
    clientType !== 'admin'
  ) {
    return fail(res, 100003, '客户端类型无效', 403)
  }
  req.admin = {
    reviewerId: auth.userId || 'admin_system',
    roles: auth.roles || [],
  }
  next()
}

module.exports = { requireAdmin }
