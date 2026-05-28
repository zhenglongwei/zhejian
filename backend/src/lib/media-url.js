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

/** 公开案例封面：允许持久化 upload URL，仅拦截占位 raw/desensitized 路径 */
function resolveDisplayMediaUrl(url) {
  if (!url) return ''
  const value = String(url).trim()
  if (!value || value.startsWith('mock://')) return ''
  if (value.includes('/media/raw/') || value.includes('/media/desensitized/')) return ''
  return value
}

module.exports = {
  isPendingMediaUrl,
  sanitizeClientMediaUrl,
  resolveDisplayMediaUrl,
}
