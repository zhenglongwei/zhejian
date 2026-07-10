const crypto = require('crypto')
const { config } = require('../config')

const ORIGINAL_UPLOAD_KEY_RE =
  /^uploads\/\d{4}\/\d{2}\/[a-f0-9]{32}(?:_thumb)?\.(?:jpe?g|png|webp)$/i

function getSigningSecret() {
  return config.media.signingSecret || config.jwt.secret || ''
}

function isOriginalUploadObjectKey(objectKey) {
  const key = String(objectKey || '').replace(/\\/g, '/').replace(/^\/+/, '')
  return ORIGINAL_UPLOAD_KEY_RE.test(key)
}

function stripUrlQuery(url) {
  return String(url || '').split('?')[0].trim()
}

function buildMediaSignature(objectKey, exp) {
  const secret = getSigningSecret()
  if (!secret) return ''
  const payload = `${objectKey}:${exp}`
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

function verifyMediaSignature(objectKey, exp, sig) {
  if (!objectKey || !exp || !sig) return false
  const secret = getSigningSecret()
  if (!secret) return false
  const expNum = Number(exp)
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    return false
  }
  const expected = buildMediaSignature(objectKey, expNum)
  try {
    const a = Buffer.from(String(sig), 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch (e) {
    return false
  }
}

function appendMediaAccessQuery(url, objectKey) {
  const base = stripUrlQuery(url)
  if (!base || !isOriginalUploadObjectKey(objectKey)) return base
  if (!config.media.signedUrlsEnabled) return base
  const secret = getSigningSecret()
  if (!secret) return base

  const exp = Math.floor(Date.now() / 1000) + Number(config.media.signedUrlTtlSec || 7200)
  const sig = buildMediaSignature(objectKey, exp)
  const joiner = base.includes('?') ? '&' : '?'
  return `${base}${joiner}exp=${exp}&sig=${sig}`
}

module.exports = {
  isOriginalUploadObjectKey,
  stripUrlQuery,
  buildMediaSignature,
  verifyMediaSignature,
  appendMediaAccessQuery,
}
