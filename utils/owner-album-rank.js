/**
 * 车主首页相册顺序：先处理报价，再处理其它待确认，然后待评价，不用处理的在最后。
 * 同一档按节点更新时间，近的在前。不用相册创建时间。
 */

function isQuoteConfirm(item = {}) {
  const kind = String(item.pendingConfirmKind || '')
  if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') return true
  const label = String(item.progressLabel || item.progressLine || '')
  return label.indexOf('报价') >= 0 || label.indexOf('方案') >= 0
}

function needsOwnerConfirm(item = {}) {
  if (Number(item.pendingConfirmCount) > 0) return true
  const label = String(item.progressLabel || item.progressLine || '')
  return label.indexOf('待确认') >= 0
}

function attentionDoc(item = {}) {
  const title = String(item.latestDocTitle || '')
  if (title.indexOf('报价') >= 0) return 'quote'
  if (title.indexOf('接车') >= 0 || title.indexOf('检测') >= 0 || title.indexOf('交车') >= 0) return 'doc'
  return ''
}

function ownerAlbumTier(item = {}) {
  if (needsOwnerConfirm(item)) return isQuoteConfirm(item) ? 0 : 1
  const doc = attentionDoc(item)
  if (item.hasUnreadUpdate && doc === 'quote') return 0
  if (item.hasUnreadUpdate && doc) return 1
  if (item.pendingOwnerReview) return 2
  return 3
}

function ownerAlbumTime(item = {}) {
  const raw = item.nodeUpdatedAt || item.updatedAt || ''
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? t : 0
}

function compareOwnerAlbums(a, b) {
  const tier = ownerAlbumTier(a) - ownerAlbumTier(b)
  if (tier) return tier
  return ownerAlbumTime(b) - ownerAlbumTime(a)
}

function filterOwnerHubAlbums(albums = [], key = 'all') {
  const list = albums || []
  if (key === 'active') {
    return list.filter((item) => String(item.progressLine || item.progressLabel || '') !== '已完工')
  }
  if (key === 'confirm') return list.filter((item) => needsOwnerConfirm(item))
  if (key === 'review') return list.filter((item) => item && item.pendingOwnerReview)
  return list
}

function nextOwnerHubFilter(current, tapped) {
  if (!tapped) return current || 'preview'
  return current === tapped ? 'preview' : tapped
}

function visibleOwnerHubAlbums(albums = [], key = 'preview') {
  const list = albums || []
  if (!key || key === 'preview') {
    return list
      .slice()
      .sort(compareOwnerAlbums)
      .filter((item) => ownerAlbumTier(item) < 3)
      .slice(0, 3)
  }
  return filterOwnerHubAlbums(list, key)
}

module.exports = {
  compareOwnerAlbums,
  visibleOwnerHubAlbums,
  nextOwnerHubFilter,
  filterOwnerHubAlbums,
  ownerAlbumTier,
  needsOwnerConfirm,
}
