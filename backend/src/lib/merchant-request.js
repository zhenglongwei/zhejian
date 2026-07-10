const { config } = require('../config')

const DEFAULT_STORE = 'store_demo_1'

/** 优先 query/body，其次 JWT 中的 storeId；生产环境不回退 demo 门店 */
function resolveStoreId(req) {
  const fromClient = req.query?.storeId || req.body?.storeId
  const fromAuth = req.auth?.storeId
  if (fromClient) return String(fromClient).trim()
  if (fromAuth) return String(fromAuth).trim()
  if (config.devAuthEnabled) return DEFAULT_STORE
  return ''
}

module.exports = { resolveStoreId, DEFAULT_STORE }
