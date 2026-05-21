const { fail } = require('../lib/response')

function notFoundHandler(req, res) {
  fail(res, 100004, '资源不存在', 404)
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err)
  const status = err.status || 500
  const code = err.code || (status === 409 ? 100007 : 100006)
  const message = err.message || '系统繁忙'
  console.error('[api-error]', res.locals.requestId, err)
  fail(res, code, message, status)
}

module.exports = { notFoundHandler, errorHandler }
