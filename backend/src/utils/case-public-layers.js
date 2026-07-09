/**
 * CASE-ENR-02 · 公开案例读侧：snapshot 正文/过程 vs enrichment 提炼层
 */
const {
  extractSnapshotFromContentJson,
  resolveSnapshotVersion,
} = require('../schemas/case-snapshot.schema')
const { resolveCaseEnrichment } = require('../schemas/case-enrichment.schema')

function resolveSnapshotArticleBody(row) {
  const snapshot = extractSnapshotFromContentJson(row?.contentJson)
  if (snapshot?.articleBody) return String(snapshot.articleBody).trim()
  return String(row?.articleBody || '').trim()
}

function resolveEnrichmentVersion(row) {
  const columnVersion = Number(row?.enrichmentVersion)
  if (Number.isFinite(columnVersion) && columnVersion >= 1) return columnVersion
  const enrichment = resolveCaseEnrichment(row)
  return enrichment?.version >= 1 ? enrichment.version : 0
}

function applySnapshotPriceFields(row = {}, item = {}) {
  const snapshot = extractSnapshotFromContentJson(row.contentJson)
  if (!snapshot) return item

  const price = snapshot.price && typeof snapshot.price === 'object' ? snapshot.price : null
  const next = { ...item }

  if (price) {
    if (price.priceMode) next.priceMode = price.priceMode
    if (price.amount != null) next.amount = Number(price.amount)
    if (price.minAmount != null) next.minAmount = Number(price.minAmount)
    if (price.maxAmount != null) next.maxAmount = Number(price.maxAmount)
    if (price.planAmount != null) next.planAmount = Number(price.planAmount)
  } else if (snapshot.planAmount != null) {
    next.planAmount = Number(snapshot.planAmount)
  }

  return next
}

function buildCasePublicLayerMeta(row = {}) {
  const snapshotVersion = resolveSnapshotVersion(row.contentJson)
  const enrichmentVersion = resolveEnrichmentVersion(row)
  const snapshot = extractSnapshotFromContentJson(row.contentJson)
  return {
    snapshotVersion,
    enrichmentVersion,
    snapshotFrozenAt: snapshot?.frozenAt || '',
    contentSource: snapshotVersion >= 1 ? 'snapshot' : 'legacy',
  }
}

function applySnapshotLayerToPublicCase(row, item) {
  const meta = buildCasePublicLayerMeta(row)
  let next = {
    ...item,
    ...meta,
  }

  const snapshot = extractSnapshotFromContentJson(row?.contentJson)
  if (snapshot) {
    if (snapshot.title) next.title = snapshot.title
    next = applySnapshotPriceFields(row, next)
  }

  return next
}

module.exports = {
  resolveSnapshotArticleBody,
  resolveEnrichmentVersion,
  applySnapshotPriceFields,
  buildCasePublicLayerMeta,
  applySnapshotLayerToPublicCase,
}
