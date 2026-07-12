/**
 * CASE-SNAP-01 · 授权公示瞬间 CaseSnapshot 构建（纯函数，无 public-case 循环依赖）
 */
const { normalizeCaseSnapshot } = require('../schemas/case-snapshot.schema')

/**
 * @param {object} input
 * @param {object} input.albumView
 * @param {object} input.draft buildCaseDraft 结果
 * @param {object} input.articlePayload buildCaseArticlePayload 结果
 * @param {object[]} input.nodesWithMask
 * @param {object|null} [input.task]
 * @param {string} [input.authorizationTier='named']
 * @param {number} [input.previousSnapshotVersion=0]
 * @param {object[]} [input.parts=[]]
 * @param {object|null} [input.publicView]
 * @param {string} [input.serviceItemId='']
 * @param {string} [input.templateId='']
 */
function buildCaseSnapshot(input = {}) {
  const albumView = input.albumView || {}
  const draft = input.draft || {}
  const articlePayload = input.articlePayload || {}
  let nodesWithMask = input.nodesWithMask || []
  const task = input.task || null
  const authorizationTier = input.authorizationTier || 'named'
  const previousSnapshotVersion = Number.isFinite(input.previousSnapshotVersion)
    ? input.previousSnapshotVersion
    : 0
  const publicView = input.publicView || null

  if (publicView && publicView.media && publicView.media.length) {
    const { publicViewToSnapshotNodes } = require('./build-public-view.service')
    nodesWithMask = publicViewToSnapshotNodes(publicView, nodesWithMask)
  }

  const version = previousSnapshotVersion + 1
  const frozenAt = new Date().toISOString()
  const contentGeo =
    articlePayload.contentJson && typeof articlePayload.contentJson === 'object'
      ? articlePayload.contentJson.geo
      : draft.contentJson?.geo

  const snapshot = normalizeCaseSnapshot({
    version,
    frozenAt,
    authorizationTier,
    taskId: task?.taskId || '',
    albumStatus: albumView.status || 'completed',
    title: articlePayload.title || draft.title,
    summary: articlePayload.summary || draft.summary,
    articleBody: articlePayload.articleBody || '',
    coverImage: draft.coverImage || '',
    nodes: nodesWithMask,
    vehicle: albumView.vehicle || {},
    parts: input.parts || [],
    planParts: albumView.planParts || [],
    evidenceItems: albumView.evidenceItems || [],
    storeNote: albumView.storeNote || '',
    planAmount: albumView.planAmount ?? albumView.minAmount ?? null,
    price: {
      priceMode: draft.priceMode,
      amount: draft.amount,
      minAmount: draft.minAmount,
      maxAmount: draft.maxAmount,
      planAmount: draft.planAmount,
    },
    geo: contentGeo || {},
    storeId: draft.storeId,
    storeName: draft.storeName,
    serviceName: draft.serviceName,
    city: draft.city,
    serviceItemId: input.serviceItemId || '',
    templateId: input.templateId || albumView.templateId || '',
    publicView,
  })

  const contentJson = {
    ...(articlePayload.contentJson || draft.contentJson || {}),
    snapshot,
    nodes: nodesWithMask,
    vehicleText:
      draft.contentJson?.vehicleText ||
      `${(albumView.vehicle && albumView.vehicle.brand) || ''}（已脱敏）`,
    tags: draft.contentJson?.tags || [],
    coldStart: draft.contentJson?.coldStart || false,
  }

  return {
    snapshot,
    contentJson,
    caseId: draft.id,
  }
}

module.exports = {
  buildCaseSnapshot,
}
