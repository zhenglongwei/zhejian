function buildAuthMetaFromReq(req, clientType = 'miniprogram') {
  const forwarded = req.headers['x-forwarded-for']
  const ip = String(
    req.ip ||
      (Array.isArray(forwarded) ? forwarded[0] : forwarded) ||
      ''
  )
    .split(',')[0]
    .trim()
  return {
    clientType,
    ip: ip.slice(0, 64),
    deviceInfo: JSON.stringify({
      ua: String(req.headers['user-agent'] || '').slice(0, 500),
    }).slice(0, 2000),
  }
}

module.exports = {
  buildAuthMetaFromReq,
}
