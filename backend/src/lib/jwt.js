const jwt = require('jsonwebtoken')
const { config } = require('../config')

const ROLES = {
  USER: 'user',
  MERCHANT: 'merchant',
  SYSTEM: 'system',
}

/**
 * 同小程序会话 token：一个 JWT 可同时携带 user + merchant 角色
 * @param {{ userId: string, roles: string[], merchantId?: string, storeId?: string }} session
 */
function signSessionToken(session) {
  const roles = Array.isArray(session.roles) ? session.roles : [ROLES.USER]
  return jwt.sign(
    {
      sub: session.userId,
      roles,
      merchantId: session.merchantId || '',
      storeId: session.storeId || '',
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  )
}

/** @deprecated 使用 signSessionToken */
function signUserToken(userId) {
  return signSessionToken({ userId, roles: [ROLES.USER] })
}

function signMerchantToken(merchantId, staffId) {
  return signSessionToken({
    userId: staffId || merchantId,
    roles: [ROLES.MERCHANT],
    merchantId,
  })
}

function signSystemToken(subject) {
  return jwt.sign(
    { sub: subject || 'system', roles: [ROLES.SYSTEM] },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  )
}

function verifyToken(token) {
  if (!token || !config.jwt.secret) return null
  try {
    return jwt.verify(token, config.jwt.secret)
  } catch (e) {
    return null
  }
}

function normalizeRoles(payload) {
  if (Array.isArray(payload.roles) && payload.roles.length) {
    return payload.roles
  }
  if (payload.role) return [payload.role]
  return [ROLES.USER]
}

module.exports = {
  ROLES,
  signSessionToken,
  signUserToken,
  signMerchantToken,
  signSystemToken,
  verifyToken,
  normalizeRoles,
}
