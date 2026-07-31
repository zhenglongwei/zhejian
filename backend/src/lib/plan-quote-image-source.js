const path = require('path')
const {
  rewriteMediaUrlForCurrentBase,
  assertPersistentImageUrl,
  parseObjectKeyFromPublicUrl,
  parseDesensitizedObjectKeyFromPublicUrl,
} = require('./media-storage')
const { readMediaBuffer, objectKeyFromPublicUrl } = require('./media-blob')
const { isOssEnabled, signObjectUrl, ossConfig } = require('./oss-client')

const MAX_BASE64_BYTES = 10 * 1024 * 1024

function guessImageMime(objectKeyOrPath) {
  const ext = path.extname(String(objectKeyOrPath || '')).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

function isLikelyUnreachablePublicUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      return true
    }
    return false
  } catch (e) {
    return false
  }
}

/**
 * 报价表/OCR/LLM 共用：优先媒体落盘或 OSS Buffer→base64，否则公网 URL。
 */
async function resolvePlanQuoteImageSources(imageUrl) {
  const persistent = assertPersistentImageUrl(imageUrl)
  const publicUrl = rewriteMediaUrlForCurrentBase(persistent)
  const objectKey =
    objectKeyFromPublicUrl(publicUrl) ||
    parseObjectKeyFromPublicUrl(publicUrl) ||
    parseDesensitizedObjectKeyFromPublicUrl(publicUrl)

  if (objectKey) {
    try {
      const buf = await readMediaBuffer(objectKey)
      if (buf && buf.length && buf.length <= MAX_BASE64_BYTES) {
        const mime = guessImageMime(objectKey)
        return {
          publicUrl,
          imagePath: '',
          visionUrl: `data:${mime};base64,${buf.toString('base64')}`,
          visionMode: 'base64',
        }
      }
    } catch (e) {
      /* fall through */
    }
    if (isOssEnabled()) {
      try {
        const signed = await signObjectUrl(objectKey, {
          expires: Number((ossConfig() && ossConfig().signedUrlTtlSec) || 7200),
        })
        return {
          publicUrl: signed,
          imagePath: '',
          visionUrl: signed,
          visionMode: 'url',
        }
      } catch (e) {
        /* fall through */
      }
    }
  }

  if (!publicUrl.startsWith('http')) {
    const err = new Error('报价表图片地址无效，请保存相册后重试')
    err.status = 400
    throw err
  }

  if (isLikelyUnreachablePublicUrl(publicUrl)) {
    const err = new Error('报价表图片尚未落盘或仅本地可访问，请先保存相册后再识别')
    err.status = 400
    throw err
  }

  return {
    publicUrl,
    imagePath: '',
    visionUrl: publicUrl,
    visionMode: 'url',
  }
}

module.exports = {
  resolvePlanQuoteImageSources,
  isLikelyUnreachablePublicUrl,
}
