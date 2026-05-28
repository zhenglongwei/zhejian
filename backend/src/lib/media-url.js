/**
 * B-MEDIA 上线前：/media/* 仅为占位，不可作为客户端可加载 URL
 */
function isPendingMediaUrl(url) {
  if (!url) return false
  const value = String(url)
  return value.includes('/media/raw/') || value.includes('/media/desensitized/')
}

function sanitizeClientMediaUrl(url) {
  if (!url || isPendingMediaUrl(url)) return ''
  return String(url)
}

/** 公开案例封面：允许持久化 upload URL，拦截占位路径与本机临时路径 */
function resolveDisplayMediaUrl(url) {
  if (!url) return ''
  const value = String(url).trim()
  if (!value || value.startsWith('mock://')) return ''
  if (value.includes('/media/raw/') || value.includes('/media/desensitized/')) return ''
  if (value.startsWith('wxfile://')) return ''
  if (value.includes('/__tmp__/')) return ''
  if (/^http:\/\/127\.0\.0\.1(:\d+)?\//.test(value) && !value.includes('/api/v1/media/')) {
    return ''
  }
  if (/^http:\/\/localhost(:\d+)?\//.test(value) && !value.includes('/api/v1/media/')) {
    return ''
  }
  if (
    value.startsWith('http://') &&
    !value.includes('/api/v1/media/') &&
    !value.includes('/media/files/uploads/')
  ) {
    return ''
  }
  return value
}

module.exports = {
  isPendingMediaUrl,
  sanitizeClientMediaUrl,
  resolveDisplayMediaUrl,
}
