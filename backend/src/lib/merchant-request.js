const DEFAULT_STORE = 'store_demo_1'

/** 优先 query/body，其次 JWT 中的 storeId，最后 demo 门店 */
function resolveStoreId(req) {
  return (
    req.query?.storeId ||
    req.body?.storeId ||
    req.auth?.storeId ||
    DEFAULT_STORE
  )
}

module.exports = { resolveStoreId, DEFAULT_STORE }
