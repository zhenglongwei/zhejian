/**
 * 脱敏 URL 识别与构建（mock / API 联调共用）
 */
const { ENV } = require('../services/config-stub')

function isDesensitizedUrl(url) {
  if (!url) return false
  const value = String(url)
  if (value.indexOf('mock://desensitized/') === 0) return true
  if (value.includes('/files/uploads/desensitized/')) return true
  if (value.includes('/media/files/uploads/desensitized/')) return true
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

/** 开发者工具 / 本机临时路径，不可作为公开案例封面或跨端展示 */
function isLocalTempImageUrl(url) {
  if (!url || typeof url !== 'string') return true
  const value = url.trim()
  if (!value || value.startsWith('mock://')) return false
  if (value.startsWith('wxfile://')) return true
  if (value.includes('/__tmp__/')) return true
  if (value.includes('://tmp/')) return true
  if (value.startsWith('http://usr/')) return true
  if (/^http:\/\/127\.0\.0\.1(:\d+)?\//.test(value) && !value.includes('/api/v1/media/')) {
    return true
  }
  if (/^http:\/\/localhost(:\d+)?\//.test(value) && !value.includes('/api/v1/media/')) {
    return true
  }
  if (
    value.startsWith('http://') &&
    !value.includes('/api/v1/media/') &&
    !value.includes('/media/files/uploads/')
  ) {
    return true
  }
  return false
}

/** 公开列表/案例卡：仅 https 或已持久化的 media files URL */
function isPersistedPublicImageUrl(url) {
  if (!url || isLocalTempImageUrl(url)) return false
  const value = String(url).trim()
  if (value.startsWith('https://')) return true
  if (value.includes('/api/v1/media/files/')) return true
  if (value.includes('/media/files/uploads/')) return true
  if (value.startsWith('/assets/')) return true
  return false
}

/**
 * 供 <image src> 使用：mock:// 与未上线的 /media/* 不可加载
 */
/** 将旧 /media/uploads/ 公网 URL 转为走 /api/ 的文件路由（避免 Nginx 未配 /media/ 时 404） */
function normalizePublicMediaUrl(url) {
  if (!url) return ''
  const value = String(url)
  const base = String(ENV.baseUrl || '').replace(/\/$/, '')
  if (value.includes('/media/uploads/')) {
    return value.replace(/\/media\/uploads\//, '/api/v1/media/files/uploads/')
  }
  if (base && value.startsWith(`${base}/media/uploads/`)) {
    return value.replace(`${base}/media/uploads/`, `${base}/api/v1/media/files/uploads/`)
  }
  return value
}

function resolveMediaFilesUrlForLocalApi(value) {
  const match = String(value || '').match(/\/api\/v1\/media\/files\/(uploads\/.+)$/i)
  if (!match) return value
  const base = String(ENV.baseUrl || '').replace(/\/$/, '')
  if (!base || value.startsWith(base)) return value
  return `${base}/api/v1/media/files/${match[1]}`
}

function resolveImageSrc(url) {
  if (!url) return ''
  let value = normalizePublicMediaUrl(String(url).trim())
  value = resolveMediaFilesUrlForLocalApi(value)
  if (value.startsWith('mock://')) return ''
  if (isPendingMediaUrl(value)) return ''
  if (isLocalTempImageUrl(value)) return ''
  if (value.startsWith('https://')) return value
  if (value.startsWith('http://') && value.includes('/api/v1/media/')) return value
  if (value.startsWith('wxfile://')) return value
  if (value.startsWith('cloud://')) return value
  if (value.startsWith('/')) return resolveMediaUrl(value)
  return ''
}

/** 批量过滤 mock://，避免 image 组件触发网络 timeout */
function resolveImageSrcList(urls) {
  return (urls || []).map(resolveImageSrc).filter(Boolean)
}

/**
 * 公开案例封面：优先脱敏 URL，禁止回退到原图 uploads/YYYY/MM
 */
function pickCaseDisplayCover(item) {
  if (!item || typeof item !== 'object') return ''

  const urls = []
  if (item.coverImageDesensitized && isDesensitizedUrl(item.coverImageDesensitized)) {
    urls.push(item.coverImageDesensitized)
  }
  if (item.coverImage && isDesensitizedUrl(item.coverImage)) {
    urls.push(item.coverImage)
  }

  for (const node of item.nodes || []) {
    if (Array.isArray(node.imagesDesensitized)) {
      urls.push(...node.imagesDesensitized.filter(isDesensitizedUrl))
    }
    if (Array.isArray(node.images)) {
      urls.push(...node.images.filter(isDesensitizedUrl))
    }
  }

  for (let i = 0; i < urls.length; i += 1) {
    const src = resolveImageSrc(normalizePublicMediaUrl(String(urls[i] || '')))
    if (src) return src
  }
  return ''
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
  isLocalTempImageUrl,
  isPersistedPublicImageUrl,
  buildDesensitizedUrl,
  resolveMediaUrl,
  normalizePublicMediaUrl,
  resolveImageSrc,
  resolveImageSrcList,
  pickCaseDisplayCover,
  normalizeTaskAssets,
}
