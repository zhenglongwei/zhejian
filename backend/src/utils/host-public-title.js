/**
 * 相册默认名「服务留档」不是公开标题。有交车简述时用简述。
 * @param {{ serviceName?: string } | null | undefined} album
 * @param {string} [summary]
 * @returns {string}
 */
function hostPublicTitle(album, summary) {
  const name = String((album && album.serviceName) || '').trim()
  if (name && name !== '服务留档') return name
  const brief = String(summary || '')
    .trim()
    .replace(/[。．.]+$/g, '')
  return brief.slice(0, 32) || '维修案例'
}

module.exports = {
  hostPublicTitle,
}
