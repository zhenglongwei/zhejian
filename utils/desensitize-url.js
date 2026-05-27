/**
 * 脱敏 URL 识别与构建（mock / API 联调共用）
 */
const { ENV } = require('../services/config')

function isDesensitizedUrl(url) {
  if (!url) return false
  const value = String(url)
  if (value.indexOf('mock://desensitized/') === 0) return true
  if (value.includes('/media/desensitized/')) return true
  return false
}

function buildDesensitizedUrl(rawUrl, albumId, nodeId, index) {
  if (!rawUrl) return ''
  if (ENV.mode === 'mock') {
    return `mock://desensitized/${albumId}/${nodeId}/${index}`
  }
  const base = String(ENV.baseUrl || '').replace(/\/$/, '')
  return `${base}/media/desensitized/${albumId}/${nodeId}/${index}`
}

/** 相对路径补全为可展示 URL */
function resolveMediaUrl(url) {
  if (!url) return ''
  const value = String(url)
  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('mock://')
  ) {
    return value
  }
  if (value.startsWith('/')) {
    const base = String(ENV.baseUrl || '').replace(/\/$/, '')
    return base ? `${base}${value}` : value
  }
  return value
}

function normalizeTaskAssets(task) {
  if (!task || !Array.isArray(task.rawAssets)) return task
  return {
    ...task,
    rawAssets: task.rawAssets.map((asset) => ({
      ...asset,
      maskedUrl: resolveMediaUrl(asset.maskedUrl),
      preMaskedUrl: resolveMediaUrl(asset.preMaskedUrl),
    })),
    maskedAssets: (task.maskedAssets || []).map((asset) => ({
      ...asset,
      url: resolveMediaUrl(asset.url),
    })),
  }
}

module.exports = {
  isDesensitizedUrl,
  buildDesensitizedUrl,
  resolveMediaUrl,
  normalizeTaskAssets,
}
