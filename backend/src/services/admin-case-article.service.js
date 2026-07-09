/**
 * GEO-CITE-B01/B02 · 运营案例 GEO 文案编辑与模板重生成
 * CASE-OPS-02/03 · 快照冻结后仅允许提炼层编辑
 */
const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const {
  resolveCaseGeoEditPolicy,
  assertSnapshotPayloadForbidden,
} = require('../constants/case-enrichment')
const { extractSnapshotFromContentJson } = require('../schemas/case-snapshot.schema')
const {
  resolveCaseEnrichment,
  mergeCaseEnrichmentPatch,
  buildEnrichmentPatchFromGeoPayload,
  buildEnrichmentFromPublicCaseRow,
} = require('../schemas/case-enrichment.schema')
const { mergeContentJsonGeo, resolveGeoReadableFields } = require('../schemas/case-geo-content.schema')
const { buildCaseArticlePayload } = require('./case-article-generator.service')
const { buildAlbumView } = require('./service-album.service')
const { buildCaseDraft, resolvePublishTask, buildNodesFromTask } = require('./public-case.service')
const { ensureUniqueCaseSlug, resolveCaseCanonicalPath } = require('../utils/case-slug')

const GEO_EDITABLE_TOP_FIELDS = [
  'aiSummary',
  'seoTitle',
  'seoDescription',
  'articleBody',
]
const GEO_EDITABLE_BLOCK_FIELDS = [
  'faultDesc',
  'inspectResult',
  'repairPlan',
  'resultConfirm',
]

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function assertGeoEditableStatus(status) {
  const allowed = new Set([
    PUBLIC_CASE_STATUS.PENDING_REVIEW,
    PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
  ])
  if (!allowed.has(status)) {
    const err = new Error('当前状态不可编辑 GEO 文案')
    err.status = 409
    throw err
  }
}

function collectManualFields(existing = [], payload = {}, editableTop = GEO_EDITABLE_TOP_FIELDS, editableBlock = GEO_EDITABLE_BLOCK_FIELDS) {
  const manualFields = new Set(Array.isArray(existing) ? existing : [])
  for (const key of editableTop) {
    if (payload[key] != null) manualFields.add(key)
  }
  for (const key of editableBlock) {
    if (payload[key] != null) manualFields.add(key)
  }
  return [...manualFields]
}

/**
 * CASE-OPS-02 · 提炼层编辑（有快照时禁止写 snapshot / 正文 / 节点聚合段）
 * @param {string} caseId
 * @param {object} payload
 * @param {{ reviewerId?: string }} [options]
 */
async function updateAdminCaseEnrichment(caseId, payload = {}, options = {}) {
  return updateAdminCaseGeoContent(caseId, payload, options)
}

/**
 * @param {string} caseId
 * @param {object} payload
 * @param {{ reviewerId?: string }} [options]
 */
async function updateAdminCaseGeoContent(caseId, payload = {}, options = {}) {
  const row = await prisma.publicCase.findUnique({ where: { id: caseId } })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  assertGeoEditableStatus(row.status)

  const content =
    row.contentJson && typeof row.contentJson === 'object' ? { ...row.contentJson } : {}
  const editPolicy = resolveCaseGeoEditPolicy(content)
  assertSnapshotPayloadForbidden(payload, { frozen: editPolicy.frozen })

  const prevGeo = content.geo && typeof content.geo === 'object' ? content.geo : {}
  const manualFields = collectManualFields(
    prevGeo.manualFields,
    payload,
    editPolicy.topFields,
    editPolicy.blockFields
  )

  const topUpdates = {}
  for (const key of editPolicy.topFields) {
    if (payload[key] != null) {
      topUpdates[key] = normalizeString(payload[key])
    }
  }

  const geoPatch = { manualFields }
  for (const key of editPolicy.blockFields) {
    if (payload[key] != null) {
      geoPatch[key] = normalizeString(payload[key])
    }
  }

  const nextContent = mergeContentJsonGeo(content, geoPatch)
  if (editPolicy.frozen) {
    const snapshot = extractSnapshotFromContentJson(content)
    if (snapshot) {
      nextContent.snapshot = snapshot
    }
  }

  const data = {
    contentJson: nextContent,
  }
  if (topUpdates.aiSummary) {
    data.aiSummary = topUpdates.aiSummary
    data.summary = topUpdates.aiSummary.slice(0, 200)
  }
  if (topUpdates.seoTitle) data.seoTitle = topUpdates.seoTitle
  if (topUpdates.seoDescription) data.seoDescription = topUpdates.seoDescription
  if (topUpdates.articleBody) data.articleBody = topUpdates.articleBody

  const enrichmentPatch = buildEnrichmentPatchFromGeoPayload(payload)
  if (topUpdates.aiSummary) enrichmentPatch.aiSummary = topUpdates.aiSummary
  if (topUpdates.seoTitle) enrichmentPatch.seoTitle = topUpdates.seoTitle
  if (topUpdates.seoDescription) enrichmentPatch.seoDescription = topUpdates.seoDescription
  enrichmentPatch.geo = {
    ...(enrichmentPatch.geo || {}),
    ...geoPatch,
  }
  const nextEnrichment = mergeCaseEnrichmentPatch(resolveCaseEnrichment(row), enrichmentPatch, {
    bumpVersion: true,
    previousVersion: row.enrichmentVersion ?? resolveCaseEnrichment(row)?.version ?? 0,
  })
  data.enrichmentJson = nextEnrichment
  data.enrichmentVersion = nextEnrichment.version

  await prisma.publicCase.update({
    where: { id: caseId },
    data,
  })

  if (options.reviewerId) {
    const { appendReviewLog } = require('./admin-case.service')
    await appendReviewLog({
      caseId,
      reviewerId: options.reviewerId,
      reviewAction: editPolicy.frozen ? 'enrichment_update' : 'geo_update',
      reviewComment: editPolicy.frozen ? '运营更新提炼层（SEO/摘要）' : '运营更新 GEO 文案',
      beforeStatus: row.status,
      afterStatus: row.status,
    })
  }

  const { getAdminCaseDetail } = require('./admin-case.service')
  return getAdminCaseDetail(caseId)
}

async function buildRegeneratePayload(row) {
  const content =
    row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  const snapshot = extractSnapshotFromContentJson(content)
  if (snapshot) {
    return buildEnrichmentRegeneratePayload(row, snapshot, content)
  }
  return buildLegacyRegeneratePayload(row)
}

/**
 * CASE-OPS-03 · 有快照时仅从 snapshot 派生提炼层，不写 snapshot / nodes / 正文
 */
function buildEnrichmentRegeneratePayload(row, snapshot, content) {
  const manualFields = new Set(
    Array.isArray(content.geo?.manualFields) ? content.geo.manualFields : []
  )
  const readable = resolveGeoReadableFields(row)
  const prevGeo = readable.geo || snapshot.geo || {}

  const draft = {
    id: row.id,
    title: snapshot.title || row.title,
    summary: snapshot.summary || row.summary,
    coverImage: snapshot.coverImage || row.coverImage,
    storeId: snapshot.storeId || row.storeId,
    storeName: snapshot.storeName || row.storeName,
    serviceName: snapshot.serviceName || row.serviceName,
    city: snapshot.city || row.city,
    priceMode: snapshot.price?.priceMode || row.priceMode,
    minAmount: snapshot.price?.minAmount ?? row.minAmount,
    maxAmount: snapshot.price?.maxAmount ?? row.maxAmount,
    planAmount: snapshot.planAmount ?? snapshot.price?.planAmount,
    contentJson: {
      ...content,
      nodes: snapshot.nodes || content.nodes || [],
      geo: prevGeo,
    },
  }

  const albumView = {
    serviceName: snapshot.serviceName || row.serviceName,
    storeNote: snapshot.storeNote || '',
    vehicle: snapshot.vehicle || {},
    store: {
      id: snapshot.storeId || row.storeId,
      name: snapshot.storeName || row.storeName,
      city: snapshot.city || row.city,
    },
    nodes: snapshot.nodes || [],
    planAmount: snapshot.planAmount,
    planParts: snapshot.planParts || [],
  }

  const fresh = buildCaseArticlePayload({
    caseId: row.id,
    draft,
    albumView,
    coldStart: false,
    hasUserAuthorization: true,
    serviceItemId: snapshot.serviceItemId || '',
    templateId: snapshot.templateId || '',
    previousArticleVersion: row.articleVersion || 0,
  })

  const pick = (field, freshValue, currentValue) =>
    manualFields.has(field) ? currentValue : freshValue

  const freshGeo = fresh.contentJson?.geo || {}
  const mergedGeo = {
    ...prevGeo,
    keyInfo: freshGeo.keyInfo || prevGeo.keyInfo,
    priceFactors: freshGeo.priceFactors || prevGeo.priceFactors,
    sections: freshGeo.sections || prevGeo.sections,
    nodeNarratives: freshGeo.nodeNarratives || prevGeo.nodeNarratives,
    faultDesc: snapshot.geo?.faultDesc || prevGeo.faultDesc || freshGeo.faultDesc,
    inspectResult: snapshot.geo?.inspectResult || prevGeo.inspectResult || freshGeo.inspectResult,
    repairPlan: snapshot.geo?.repairPlan || prevGeo.repairPlan || freshGeo.repairPlan,
    resultConfirm: snapshot.geo?.resultConfirm || prevGeo.resultConfirm || freshGeo.resultConfirm,
    manualFields: [...manualFields],
    generationSource: prevGeo.generationSource || freshGeo.generationSource,
    generationVersion: prevGeo.generationVersion || freshGeo.generationVersion,
    riskChecked: prevGeo.riskChecked ?? freshGeo.riskChecked,
  }

  const aiSummary = pick('aiSummary', fresh.aiSummary, row.aiSummary || readable.aiSummary)
  const seoTitle = pick('seoTitle', fresh.seoTitle, row.seoTitle)
  const seoDescription = pick('seoDescription', fresh.seoDescription, row.seoDescription)

  const mergedContentJson = mergeContentJsonGeo(
    {
      ...content,
      snapshot,
      nodes: content.nodes,
    },
    mergedGeo
  )
  mergedContentJson.snapshot = snapshot

  return {
    title: row.title || snapshot.title,
    summary: aiSummary ? String(aiSummary).slice(0, 200) : row.summary || snapshot.summary,
    seoTitle,
    seoDescription,
    aiSummary,
    articleBody: row.articleBody || snapshot.articleBody,
    seoNoindex: row.seoNoindex ?? fresh.seoNoindex,
    slug: row.slug,
    canonicalPath: row.canonicalPath || resolveCaseCanonicalPath({ slug: row.slug, caseId: row.id }),
    contentJson: mergedContentJson,
    articleVersion: (row.articleVersion || 0) + 1,
    articleGeneratedAt: new Date(),
  }
}

async function buildLegacyRegeneratePayload(row) {
  const content =
    row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  const manualFields = new Set(
    Array.isArray(content.geo?.manualFields) ? content.geo.manualFields : []
  )
  const readable = resolveGeoReadableFields(row)

  const album = await prisma.album.findUnique({
    where: { id: row.albumId },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
      authorization: true,
    },
  })
  if (!album) {
    const err = new Error('关联相册不存在')
    err.status = 404
    throw err
  }

  const task = await resolvePublishTask(row.albumId, {})
  const albumView = buildAlbumView(album)
  const hasOwner =
    Boolean(String(album.userId || '').trim()) ||
    Boolean(String(album.userPhone || '').trim())
  const hasUserAuth = album.authorization?.status === 'authorized'
  const coldStart = !hasUserAuth && !hasOwner

  const draft = buildCaseDraft(albumView, task, row.authorizationTier, {
    coldStart,
    hasUserAuthorization: hasUserAuth,
    serviceItemId: album.serviceItemId || '',
    templateId: album.templateId || '',
  })
  if (task && Array.isArray(draft.contentJson?.nodes)) {
    draft.contentJson.nodes = buildNodesFromTask(draft.contentJson.nodes, task)
  }

  const fresh = buildCaseArticlePayload({
    caseId: row.id,
    draft,
    albumView,
    coldStart,
    hasUserAuthorization: hasUserAuth,
    serviceItemId: album.serviceItemId || '',
    templateId: album.templateId || '',
    previousArticleVersion: row.articleVersion || 0,
  })

  const pick = (field, freshValue, currentValue) =>
    manualFields.has(field) ? currentValue : freshValue

  const prevGeo = readable.geo || {}
  const freshGeo = fresh.contentJson?.geo || {}
  const mergedGeo = {
    ...freshGeo,
    faultDesc: pick('faultDesc', freshGeo.faultDesc, prevGeo.faultDesc),
    inspectResult: pick('inspectResult', freshGeo.inspectResult, prevGeo.inspectResult),
    repairPlan: pick('repairPlan', freshGeo.repairPlan, prevGeo.repairPlan),
    resultConfirm: pick('resultConfirm', freshGeo.resultConfirm, prevGeo.resultConfirm),
    manualFields: [...manualFields],
  }

  let mergedContentJson = mergeContentJsonGeo(fresh.contentJson, mergedGeo)
  if (manualFields.has('aiSummary') && readable.aiSummary) {
    mergedContentJson = { ...mergedContentJson }
  }

  const slug = row.slug || (await ensureUniqueCaseSlug(prisma, fresh.slug, row.id))

  return {
    title: fresh.title,
    summary: pick('aiSummary', fresh.summary, row.summary)?.slice(0, 200) || fresh.summary,
    seoTitle: pick('seoTitle', fresh.seoTitle, row.seoTitle),
    seoDescription: pick('seoDescription', fresh.seoDescription, row.seoDescription),
    aiSummary: pick('aiSummary', fresh.aiSummary, row.aiSummary || readable.aiSummary),
    articleBody: pick('articleBody', fresh.articleBody, row.articleBody || readable.articleBody),
    seoNoindex: fresh.seoNoindex,
    slug,
    canonicalPath: resolveCaseCanonicalPath({ slug, caseId: row.id }),
    contentJson: mergedContentJson,
    articleVersion: (row.articleVersion || 0) + 1,
    articleGeneratedAt: new Date(),
  }
}

/**
 * @param {string} caseId
 * @param {{ reviewerId?: string }} [options]
 */
async function regenerateAdminCaseArticle(caseId, options = {}) {
  const row = await prisma.publicCase.findUnique({ where: { id: caseId } })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  assertGeoEditableStatus(row.status)

  const payload = await buildRegeneratePayload(row)
  const enrichment = buildEnrichmentFromPublicCaseRow(
    { ...row, ...payload, contentJson: payload.contentJson },
    { version: (row.enrichmentVersion || 0) + 1 }
  )
  payload.enrichmentJson = enrichment
  payload.enrichmentVersion = enrichment.version
  await prisma.publicCase.update({
    where: { id: caseId },
    data: payload,
  })

  if (options.reviewerId) {
    const { appendReviewLog } = require('./admin-case.service')
    const content =
      row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
    const frozen = Boolean(extractSnapshotFromContentJson(content))
    await appendReviewLog({
      caseId,
      reviewerId: options.reviewerId,
      reviewAction: frozen ? 'enrichment_regenerate' : 'geo_regenerate',
      reviewComment: frozen
        ? '运营触发提炼层重生成（快照字段未改动）'
        : '运营触发模板重生成（保留手改字段）',
      beforeStatus: row.status,
      afterStatus: row.status,
    })
  }

  const { getAdminCaseDetail } = require('./admin-case.service')
  return getAdminCaseDetail(caseId)
}

/**
 * 批准或重生成时保留运营手改字段
 * @param {object} row public_cases 行
 * @param {object} freshPayload buildCaseArticlePayload 产物
 */
function applyManualGeoOverrides(row, freshPayload) {
  const content =
    row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  const manualFields = new Set(
    Array.isArray(content.geo?.manualFields) ? content.geo.manualFields : []
  )
  if (!manualFields.size) return freshPayload

  const readable = resolveGeoReadableFields(row)
  const pick = (field, freshValue, currentValue) =>
    manualFields.has(field) ? currentValue : freshValue

  const prevGeo = readable.geo || {}
  const freshGeo =
    freshPayload.contentJson && freshPayload.contentJson.geo
      ? freshPayload.contentJson.geo
      : {}
  const mergedGeo = {
    ...freshGeo,
    faultDesc: pick('faultDesc', freshGeo.faultDesc, prevGeo.faultDesc),
    inspectResult: pick('inspectResult', freshGeo.inspectResult, prevGeo.inspectResult),
    repairPlan: pick('repairPlan', freshGeo.repairPlan, prevGeo.repairPlan),
    resultConfirm: pick('resultConfirm', freshGeo.resultConfirm, prevGeo.resultConfirm),
    manualFields: [...manualFields],
  }

  const aiSummary = pick(
    'aiSummary',
    freshPayload.aiSummary,
    row.aiSummary || readable.aiSummary
  )

  return {
    ...freshPayload,
    summary: aiSummary ? String(aiSummary).slice(0, 200) : freshPayload.summary,
    seoTitle: pick('seoTitle', freshPayload.seoTitle, row.seoTitle),
    seoDescription: pick('seoDescription', freshPayload.seoDescription, row.seoDescription),
    aiSummary,
    articleBody: pick('articleBody', freshPayload.articleBody, row.articleBody || readable.articleBody),
    contentJson: mergeContentJsonGeo(freshPayload.contentJson, mergedGeo),
  }
}

module.exports = {
  GEO_EDITABLE_TOP_FIELDS,
  GEO_EDITABLE_BLOCK_FIELDS,
  updateAdminCaseGeoContent,
  updateAdminCaseEnrichment,
  regenerateAdminCaseArticle,
  applyManualGeoOverrides,
  buildEnrichmentRegeneratePayload,
  buildRegeneratePayload,
}
