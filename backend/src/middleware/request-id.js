const { getRequestId } = require('../lib/response')

function requestIdMiddleware(req, res, next) {
  res.locals.requestId = getRequestId(req)
  next()
}

module.exports = { requestIdMiddleware }
