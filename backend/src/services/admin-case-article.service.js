/**
 * GEO-CITE-B01/B02 · 运营案例 GEO 文案编辑与模板重生成
 */
const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { mergeContentJsonGeo, resolveGeoReadableFields } = require('../schemas/case-geo-content.schema')
const { buildCaseArticlePayload } = require('./case-article-generator.service')
const { buildAlbumView } = require('./service-album.service')
const { buildCaseDraft, resolvePublishTask, buildNodesFromTask } = require('./public-case.service')
const { ensureUniqueCaseSlug, resolveCaseCanonicalPath } = require('../utils/case-slug')

const GEO_EDITABLE_TOP_FIELDS = ['aiSummary', 'seoTitle', 'seoDescription', 'articleBody']
const GEO_EDITABLE_BLOCK_FIELDS = ['faultDesc', 'inspectResult', 'repairPlan', 'resultConfirm']

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

function collectManualFields(existing = [], payload = {}) {
  const manualFields = new Set(Array.isArray(existing) ? existing : [])
  for (const key of GEO_EDITABLE_TOP_FIELDS) {
    if (payload[key] != null) manualFields.add(key)
  }
  for (const key of GEO_EDITABLE_BLOCK_FIELDS) {
    if (payload[key] != null) manualFields.add(key)
  }
  return [...manualFields]
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
  const prevGeo = content.geo && typeof content.geo === 'object' ? content.geo : {}
  const manualFields = collectManualFields(prevGeo.manualFields, payload)

  const topUpdates = {}
  for (const key of GEO_EDITABLE_TOP_FIELDS) {
    if (payload[key] != null) {
      topUpdates[key] = normalizeString(payload[key])
    }
  }

  const geoPatch = { manualFields }
  for (const key of GEO_EDITABLE_BLOCK_FIELDS) {
    if (payload[key] != null) {
      geoPatch[key] = normalizeString(payload[key])
    }
  }

  const nextContent = mergeContentJsonGeo(content, geoPatch)
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

  await prisma.publicCase.update({
    where: { id: caseId },
    data,
  })

  if (options.reviewerId) {
    const { appendReviewLog } = require('./admin-case.service')
    await appendReviewLog({
      caseId,
      reviewerId: options.reviewerId,
      reviewAction: 'geo_update',
      reviewComment: '运营更新 GEO 文案',
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
  await prisma.publicCase.update({
    where: { id: caseId },
    data: payload,
  })

  if (options.reviewerId) {
    const { appendReviewLog } = require('./admin-case.service')
    await appendReviewLog({
      caseId,
      reviewerId: options.reviewerId,
      reviewAction: 'geo_regenerate',
      reviewComment: '运营触发模板重生成（保留手改字段）',
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
  regenerateAdminCaseArticle,
  applyManualGeoOverrides,
}
