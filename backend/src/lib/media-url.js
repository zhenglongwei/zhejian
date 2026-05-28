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

module.exports = {
  isPendingMediaUrl,
  sanitizeClientMediaUrl,
}
