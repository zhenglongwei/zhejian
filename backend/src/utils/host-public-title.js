/**
 * 相册默认名「服务留档」不是公开标题。有交车简述时用简述。
 * @param {{ serviceName?: string } | null | undefined} album
 * @param {string} [summary]
 * @returns {string}
 */
function hostPublicTitle(album, summary) {
  const name = String((album && album.serviceName) || '').trim()
  if (name && name !== '服务留档') return name
  const text = String(summary || '').trim()
  if (!text) return '维修案例'
  const sentence = text.split(/[。！？]/).map((part) => part.trim()).find(Boolean) || ''
  if (!sentence) return '维修案例'
  if (sentence.length <= 32) return sentence
  const clause = sentence.split(/[，,]/).map((part) => part.trim()).find(Boolean) || sentence
  if (clause.length <= 32) return clause
  return clause.slice(0, 32)
}

module.exports = {
  hostPublicTitle,
}
