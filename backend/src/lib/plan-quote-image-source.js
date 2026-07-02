const fs = require('fs')
const path = require('path')
const {
  rewriteMediaUrlForCurrentBase,
  assertPersistentImageUrl,
  resolveMediaFilePathFromPublicUrl,
} = require('./media-storage')

const MAX_BASE64_BYTES = 10 * 1024 * 1024

function guessImageMime(filePath) {
  const ext = path.extname(filePath).toLowerCase()
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
 * 报价表/OCR/LLM 共用：优先本机 media 落盘（与 OCR body 同源），否则公网 URL。
 * LLM 使用 base64 可避免「OCR 读本地、云端拉不到 127.0.0.1」的矛盾。
 */
function resolvePlanQuoteImageSources(imageUrl) {
  const persistent = assertPersistentImageUrl(imageUrl)
  const publicUrl = rewriteMediaUrlForCurrentBase(persistent)
  const imagePath = resolveMediaFilePathFromPublicUrl(publicUrl)

  if (imagePath && fs.existsSync(imagePath)) {
    const stat = fs.statSync(imagePath)
    if (stat.size <= MAX_BASE64_BYTES) {
      const mime = guessImageMime(imagePath)
      const base64 = fs.readFileSync(imagePath).toString('base64')
      return {
        publicUrl,
        imagePath,
        visionUrl: `data:${mime};base64,${base64}`,
        visionMode: 'base64',
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
    imagePath: imagePath || '',
    visionUrl: publicUrl,
    visionMode: 'url',
  }
}

module.exports = {
  resolvePlanQuoteImageSources,
  isLikelyUnreachablePublicUrl,
}
