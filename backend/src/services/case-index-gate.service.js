/**
 * PUB-RIGHT-08 · 第 2 层收录闸门（店页可见 ≠ 进 sitemap / Feed）
 * 无闸门时不得把第 1 层全部打进检索库。
 */
const EIGHTEEN_MONTHS_MS = 18 * 30 * 24 * 60 * 60 * 1000

function isAccidentCase(row = {}, snapshot = {}) {
  if (row.isAccident === true) return true
  const text = [
    row.serviceName,
    row.title,
    snapshot.serviceName,
    snapshot.title,
    snapshot.summary,
  ]
    .map((v) => String(v || ''))
    .join(' ')
  return /事故|碰撞|保险杠大面积|推定全损/.test(text)
}

function countPublicImages(row = {}, snapshot = {}) {
  const pv = snapshot.publicView
  if (pv && Number.isFinite(Number(pv.publicMediaCount))) {
    return Math.max(0, Number(pv.publicMediaCount))
  }
  if (Array.isArray(pv && pv.media)) return pv.media.length
  if (Array.isArray(snapshot.nodes)) {
    return snapshot.nodes.reduce((sum, n) => sum + ((n && n.images) || []).length, 0)
  }
  return 0
}

function hasFactText(row = {}, snapshot = {}) {
  const summary = String(row.summary || snapshot.summary || '').trim()
  if (summary.length >= 12) return true
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : []
  return nodes.some((n) => String((n && (n.note || n.caption)) || '').trim().length >= 8)
}

function isFreshEnough(row = {}, now = new Date()) {
  const published = row.publishedAt ? new Date(row.publishedAt).getTime() : 0
  const completed = row.completedAt ? new Date(row.completedAt).getTime() : 0
  const ts = published || completed
  if (!ts) return false
  return now.getTime() - ts <= EIGHTEEN_MONTHS_MS
}

/**
 * 是否进入检索 / 引用库（sitemap、JSON Feed、专题聚合）。
 * 店页第 1 层展示不走这里。
 */
function shouldIndexPublicCase(row = {}, snapshot = {}, now = new Date()) {
  if (!row || row.storefrontHidden) return false
  if (row.seoNoindex === true) return false
  if (isAccidentCase(row, snapshot)) return false
  if (countPublicImages(row, snapshot) < 1) return false
  if (!hasFactText(row, snapshot)) return false
  if (!isFreshEnough(row, now)) return false
  return true
}

module.exports = {
  shouldIndexPublicCase,
  isAccidentCase,
  countPublicImages,
  hasFactText,
  isFreshEnough,
}
