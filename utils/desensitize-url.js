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

function isPendingMediaUrl(url) {
  const value = String(url || '')
  return value.includes('/media/raw/') || value.includes('/media/desensitized/')
}

/**
 * 供 <image src> 使用：mock:// 与未上线的 /media/* 不可加载
 */
function resolveImageSrc(url) {
  if (!url) return ''
  const value = String(url)
  if (value.startsWith('mock://')) return ''
  if (isPendingMediaUrl(value)) return ''
  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('wxfile://') ||
    value.startsWith('cloud://')
  ) {
    return value
  }
  if (value.startsWith('/media/uploads/')) {
    const base = String(ENV.baseUrl || '').replace(/\/$/, '')
    return base ? `${base}${value}` : value
  }
  if (value.startsWith('/')) return value
  return ''
}

/** 批量过滤 mock://，避免 image 组件触发网络 timeout */
function resolveImageSrcList(urls) {
  return (urls || []).map(resolveImageSrc).filter(Boolean)
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
  isPendingMediaUrl,
  buildDesensitizedUrl,
  resolveMediaUrl,
  resolveImageSrc,
  resolveImageSrcList,
  normalizeTaskAssets,
}
