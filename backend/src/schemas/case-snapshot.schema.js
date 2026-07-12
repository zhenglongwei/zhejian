/**
 * CASE-SNAP-01 · public_cases.contentJson.snapshot 契约
 */

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value, maxLen = 0) {
  const text = String(value ?? '').trim()
  if (!maxLen || text.length <= maxLen) return text
  return text.slice(0, maxLen)
}

function normalizePublicViewMedia(media) {
  if (!Array.isArray(media)) return []
  return media
    .map((item) => {
      const row = isPlainObject(item) ? item : {}
      const maskedUrl = normalizeString(row.maskedUrl)
      if (!maskedUrl) return null
      return {
        nodeId: normalizeString(row.nodeId),
        idx: Number.isFinite(Number(row.idx)) ? Number(row.idx) : 0,
        maskedUrl,
        caption: normalizeString(row.caption, 48),
      }
    })
    .filter(Boolean)
}

function normalizePublicViewFacts(facts) {
  const src = isPlainObject(facts) ? facts : {}
  return {
    faultDesc: normalizeString(src.faultDesc, 200),
    inspectResult: normalizeString(src.inspectResult, 300),
    repairPlan: normalizeString(src.repairPlan, 400),
    resultConfirm: normalizeString(src.resultConfirm, 200),
  }
}

function normalizePublicView(raw) {
  if (!isPlainObject(raw)) return null
  const version = Number.isFinite(Number(raw.version)) ? Number(raw.version) : 0
  if (version < 1) return null
  return {
    version,
    authorizationTier: normalizeString(raw.authorizationTier || 'named'),
    storeName: normalizeString(raw.storeName),
    storeId: normalizeString(raw.storeId),
    serviceName: normalizeString(raw.serviceName),
    city: normalizeString(raw.city),
    media: normalizePublicViewMedia(raw.media),
    facts: normalizePublicViewFacts(raw.facts),
    publicMediaCount: Number.isFinite(Number(raw.publicMediaCount))
      ? Number(raw.publicMediaCount)
      : normalizePublicViewMedia(raw.media).length,
    hasRepairPlanText: Boolean(raw.hasRepairPlanText),
  }
}

function normalizeSnapshotNodes(nodes) {
  if (!Array.isArray(nodes)) return []
  return nodes.map((node) => {
    const item = isPlainObject(node) ? node : {}
    const images = Array.isArray(item.images)
      ? item.images.map((url) => normalizeString(url)).filter(Boolean)
      : []
    return {
      id: normalizeString(item.id || item.nodeId),
      nodeId: normalizeString(item.nodeId || item.id),
      stage: normalizeString(item.stage),
      title: normalizeString(item.title),
      note: normalizeString(item.note),
      images,
    }
  })
}

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
function normalizeCaseSnapshot(raw) {
  if (!isPlainObject(raw)) return null
  const version = Number.isFinite(Number(raw.version)) ? Number(raw.version) : 0
  if (version < 1) return null

  const price = isPlainObject(raw.price) ? raw.price : {}
  const geo = isPlainObject(raw.geo) ? raw.geo : {}

  return {
    version,
    frozenAt: normalizeString(raw.frozenAt),
    authorizationTier: normalizeString(raw.authorizationTier || 'named'),
    taskId: normalizeString(raw.taskId),
    albumStatus: normalizeString(raw.albumStatus),
    title: normalizeString(raw.title),
    summary: normalizeString(raw.summary),
    articleBody: normalizeString(raw.articleBody),
    coverImage: normalizeString(raw.coverImage),
    nodes: normalizeSnapshotNodes(raw.nodes),
    vehicle: isPlainObject(raw.vehicle) ? raw.vehicle : {},
    parts: Array.isArray(raw.parts) ? raw.parts : [],
    planParts: Array.isArray(raw.planParts) ? raw.planParts : [],
    evidenceItems: Array.isArray(raw.evidenceItems) ? raw.evidenceItems : [],
    storeNote: normalizeString(raw.storeNote),
    planAmount: raw.planAmount != null ? Number(raw.planAmount) : null,
    price: {
      priceMode: normalizeString(price.priceMode),
      amount: price.amount != null ? Number(price.amount) : null,
      minAmount: price.minAmount != null ? Number(price.minAmount) : null,
      maxAmount: price.maxAmount != null ? Number(price.maxAmount) : null,
      planAmount: price.planAmount != null ? Number(price.planAmount) : null,
    },
    geo,
    storeId: normalizeString(raw.storeId),
    storeName: normalizeString(raw.storeName),
    serviceName: normalizeString(raw.serviceName),
    city: normalizeString(raw.city),
    serviceItemId: normalizeString(raw.serviceItemId),
    templateId: normalizeString(raw.templateId),
    publicView: normalizePublicView(raw.publicView),
  }
}

/**
 * @param {unknown} contentJson
 * @returns {object|null}
 */
function extractSnapshotFromContentJson(contentJson) {
  if (!isPlainObject(contentJson)) return null
  return normalizeCaseSnapshot(contentJson.snapshot)
}

/**
 * @param {unknown} contentJson
 * @returns {number}
 */
function resolveSnapshotVersion(contentJson) {
  const snapshot = extractSnapshotFromContentJson(contentJson)
  return snapshot?.version || 0
}

/**
 * H5/API 读侧 nodes 真源：有 publicView 且开启 V2 时优先 publicView；否则 snapshot.nodes
 * @param {unknown} contentJson
 * @returns {object[]}
 */
function resolvePublicCaseContentNodes(contentJson) {
  if (!isPlainObject(contentJson)) return []
  const snapshot = extractSnapshotFromContentJson(contentJson)
  const { config } = require('../config')
  if (config.publicViewV2 && snapshot?.publicView?.media?.length) {
    const { publicViewToSnapshotNodes } = require('../services/build-public-view.service')
    return publicViewToSnapshotNodes(snapshot.publicView, snapshot.nodes || [])
  }
  if (snapshot) {
    return Array.isArray(snapshot.nodes) ? snapshot.nodes : []
  }
  if (Array.isArray(contentJson.nodes)) {
    return contentJson.nodes
  }
  return []
}

/**
 * @param {unknown} contentJson
 * @returns {object|null}
 */
function extractPublicViewFromContentJson(contentJson) {
  const snapshot = extractSnapshotFromContentJson(contentJson)
  return snapshot?.publicView || null
}

module.exports = {
  normalizeCaseSnapshot,
  normalizePublicView,
  extractSnapshotFromContentJson,
  extractPublicViewFromContentJson,
  resolveSnapshotVersion,
  resolvePublicCaseContentNodes,
  normalizeSnapshotNodes,
}
