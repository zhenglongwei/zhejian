const { randomUUID } = require('crypto')

function ok(res, data, message = 'success') {
  return res.json({
    code: 0,
    message,
    data,
    request_id: res.locals.requestId,
  })
}

function fail(res, code, message, status = 400) {
  return res.status(status).json({
    code,
    message,
    data: null,
    request_id: res.locals.requestId,
  })
}

function getRequestId(req) {
  return req.headers['x-request-id'] || `req_${randomUUID().replace(/-/g, '').slice(0, 16)}`
}

module.exports = { ok, fail, getRequestId }
