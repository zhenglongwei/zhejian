/**
 * 分享卡片标题口径：辙见是门店的工具，卡片的主语应该是门店而不是平台。
 * 拿不到门店名时只留内容后缀，不硬挂平台名。
 */

function resolveShareStoreName(source = {}) {
  const raw = (source && (source.storeName || (source.store && source.store.name))) || ''
  return String(raw).trim()
}

function buildStoreFallbackTitle(storeName, suffix) {
  const name = String(storeName || '').trim()
  return name ? `${name} · ${suffix}` : suffix
}

module.exports = {
  resolveShareStoreName,
  buildStoreFallbackTitle,
}
