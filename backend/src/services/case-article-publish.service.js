/**
 * DS-B-04 · 案例文章发布状态机（article_status 与审核态分离）
 */
const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const {
  CASE_ARTICLE_STATUS,
  CASE_ARTICLE_ALLOWED_TRANSITIONS,
  CASE_ARTICLE_H5_PUBLISHED_STATUSES,
} = require('../constants/case-article-status')
const { resolveCaseCanonicalPath } = require('../utils/case-slug')
const { mapGeoPageRow } = require('../schemas/geo-page.schema')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { matchGeoPagesForCaseMount } = require('../utils/geo-topic-matcher')
const {
  buildCaseMountItemFromRow,
  mergeTopicMountIds,
} = require('../utils/case-geo-mount')
const { resolveCaseEnrichment } = require('../schemas/case-enrichment.schema')
const { persistCaseEnrichmentForRow } = require('./case-enrichment.service')

function assertArticleTransition(fromStatus, toStatus) {
  const from = fromStatus || CASE_ARTICLE_STATUS.PENDING
  const allowed = CASE_ARTICLE_ALLOWED_TRANSITIONS[from] || []
  if (!allowed.includes(toStatus)) {
    const err = new Error('文章发布状态不可变更')
    err.status = 409
    err.code = 'ARTICLE_STATUS_TRANSITION_INVALID'
    err.details = { from, to: toStatus }
    throw err
  }
}

function stampPublishedH5OnPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const now = new Date().toISOString()
  const contentJson =
    payload.contentJson && typeof payload.contentJson === 'object'
      ? { ...payload.contentJson }
      : {}
  const geo =
    contentJson.geo && typeof contentJson.geo === 'object'
      ? { ...contentJson.geo }
      : {}
  geo.publishedH5At = now
  contentJson.geo = geo
  payload.contentJson = contentJson
  payload.articleStatus = CASE_ARTICLE_STATUS.PUBLISHED_H5
  return payload
}

function buildCaseH5Url({ slug, caseId, canonicalPath }) {
  const path =
    canonicalPath ||
    resolveCaseCanonicalPath({ slug: slug || null, caseId: caseId || '' })
  if (!path) return ''
  const base = String(config.publicBaseUrl || '').replace(/\/$/, '')
  return `${base}${path}`
}

function canBackfillToPublishedH5(row) {
  if (!row || row.status !== PUBLIC_CASE_STATUS.PUBLIC_APPROVED) return false
  const status = row.articleStatus || CASE_ARTICLE_STATUS.PENDING
  if (CASE_ARTICLE_H5_PUBLISHED_STATUSES.includes(status)) return false
  return [
    CASE_ARTICLE_STATUS.PENDING,
    CASE_ARTICLE_STATUS.DRAFT,
    CASE_ARTICLE_STATUS.READY,
  ].includes(status)
}

const GEO_MOUNT_STATUSES = [GEO_PAGE_STATUS.PUBLISHED, GEO_PAGE_STATUS.NOINDEX]

/**
 * GEO-TOPIC-C02 · 案例发布 H5 后挂载到匹配 geo_pages.related_case_ids
 * CASE-ENR-03：只写 geo_pages + enrichment_json.topicMountIds，不改 snapshot
 * @param {string} caseId
 * @param {object} db
 * @param {{ enrichmentPatch?: object, bumpVersion?: boolean }} [options]
 */
async function mountCaseOnGeoPages(caseId, db, options = {}) {
  const row = await db.publicCase.findUnique({
    where: { id: caseId },
    include: { album: true },
  })
  if (!row) return { mounted: 0, targetIds: [], topicMountIds: [] }

  const caseItem = buildCaseMountItemFromRow(row, row.album)
  const geoRows = await db.geoPage.findMany({
    where: { status: { in: GEO_MOUNT_STATUSES } },
  })
  const geoPages = geoRows.map(mapGeoPageRow)
  const targetIds = matchGeoPagesForCaseMount(caseItem, geoPages, { album: row.album })

  let mounted = 0
  for (const geoId of targetIds) {
    const page = geoPages.find((entry) => entry.id === geoId)
    if (!page) continue
    const prev = Array.isArray(page.relatedCaseIds) ? page.relatedCaseIds : []
    const ids = [...new Set([...prev, caseId])]
    if (ids.length === prev.length) continue
    await db.geoPage.update({
      where: { id: geoId },
      data: { relatedCaseIdsJson: ids },
    })
    mounted += 1
  }

  const enrichment = resolveCaseEnrichment(row)
  const prevMountIds = enrichment?.topicMountIds || []
  const mergedMountIds = mergeTopicMountIds(prevMountIds, targetIds)
  const enrichmentPatch = options.enrichmentPatch || {}
  const patch = {
    ...enrichmentPatch,
    topicMountIds: mergedMountIds,
  }

  const mountChanged =
    mergedMountIds.length !== prevMountIds.length ||
    mergedMountIds.some((id, index) => id !== prevMountIds[index])
  const hasEnrichmentPatch = Boolean(
    enrichmentPatch.geo ||
      enrichmentPatch.publishedH5At ||
      enrichmentPatch.publishedWechatAt ||
      enrichmentPatch.aiSummary ||
      enrichmentPatch.seoTitle ||
      enrichmentPatch.seoDescription
  )

  if (mountChanged || hasEnrichmentPatch) {
    await persistCaseEnrichmentForRow(row, patch, {
      db,
      bumpVersion: options.bumpVersion !== false,
      syncContentJsonGeo: true,
    })
  }

  const {
    applyAggregateFaqToCaseEnrichment,
    refreshGeoPagesAggregateFaq,
  } = require('./case-enrichment-aggregate.service')

  const freshRow = await db.publicCase.findUnique({
    where: { id: caseId },
    include: { album: true },
  })
  const enrichmentFaq = await applyAggregateFaqToCaseEnrichment(caseId, {
    db,
    row: freshRow || row,
    bumpVersion: options.bumpVersion !== false,
  })
  const geoPageFaq = await refreshGeoPagesAggregateFaq(targetIds, db)

  return {
    mounted,
    targetIds,
    topicMountIds: mergedMountIds,
    enrichmentFaq,
    geoPageFaq,
  }
}

/**
 * ready（或 backfill 允许的态）→ published_h5
 * @param {string} caseId
 * @param {{ tx?: object, backfill?: boolean, actor?: string }} [options]
 */
async function publishCaseArticleToH5(caseId, options = {}) {
  const db = options.tx || prisma
  const row = await db.publicCase.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      status: true,
      articleStatus: true,
      slug: true,
      canonicalPath: true,
      contentJson: true,
    },
  })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  if (row.status !== PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    const err = new Error('案例尚未审核通过，不可发布 H5')
    err.status = 409
    throw err
  }

  const from = row.articleStatus || CASE_ARTICLE_STATUS.PENDING
  if (CASE_ARTICLE_H5_PUBLISHED_STATUSES.includes(from)) {
    return {
      caseId,
      articleStatus: from,
      h5Url: buildCaseH5Url(row),
      alreadyPublished: true,
    }
  }

  if (options.backfill) {
    if (!canBackfillToPublishedH5(row)) {
      const err = new Error('当前状态不可补发 H5')
      err.status = 409
      throw err
    }
  } else {
    assertArticleTransition(from, CASE_ARTICLE_STATUS.PUBLISHED_H5)
  }

  const now = new Date().toISOString()
  await db.publicCase.update({
    where: { id: caseId },
    data: {
      articleStatus: CASE_ARTICLE_STATUS.PUBLISHED_H5,
    },
  })

  const geoMount = await mountCaseOnGeoPages(caseId, db, {
    enrichmentPatch: {
      publishedH5At: now,
      geo: { publishedH5At: now },
    },
    bumpVersion: true,
  })

  return {
    caseId,
    articleStatus: CASE_ARTICLE_STATUS.PUBLISHED_H5,
    h5Url: buildCaseH5Url(row),
    alreadyPublished: false,
    geoMount,
  }
}

/**
 * published_h5 → published_wechat
 * @param {string} caseId
 * @param {{ tx?: object, actor?: string }} [options]
 */
async function markCaseArticlePublishedWechat(caseId, options = {}) {
  const db = options.tx || prisma
  const row = await db.publicCase.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      status: true,
      articleStatus: true,
      slug: true,
      canonicalPath: true,
      contentJson: true,
    },
  })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  if (row.status !== PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    const err = new Error('案例尚未审核通过')
    err.status = 409
    throw err
  }

  const from = row.articleStatus || CASE_ARTICLE_STATUS.PENDING
  if (from === CASE_ARTICLE_STATUS.PUBLISHED_WECHAT) {
    return {
      caseId,
      articleStatus: from,
      h5Url: buildCaseH5Url(row),
      alreadyPublished: true,
    }
  }

  assertArticleTransition(from, CASE_ARTICLE_STATUS.PUBLISHED_WECHAT)

  const now = new Date().toISOString()
  await db.publicCase.update({
    where: { id: caseId },
    data: {
      articleStatus: CASE_ARTICLE_STATUS.PUBLISHED_WECHAT,
    },
  })

  const fullRow = await db.publicCase.findUnique({ where: { id: caseId } })
  if (fullRow) {
    await persistCaseEnrichmentForRow(
      fullRow,
      {
        publishedWechatAt: now,
        geo: { publishedWechatAt: now },
      },
      { db, bumpVersion: true, syncContentJsonGeo: true }
    )
  }

  return {
    caseId,
    articleStatus: CASE_ARTICLE_STATUS.PUBLISHED_WECHAT,
    h5Url: buildCaseH5Url(row),
    alreadyPublished: false,
  }
}

/**
 * 存量 public_approved 且未 published_h5 的案例补发
 * @param {{ storeId?: string, limit?: number }} [options]
 */
async function backfillPublishedH5ForApprovedCases(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 500, 1), 2000)
  const where = {
    status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
    articleStatus: {
      in: [
        CASE_ARTICLE_STATUS.PENDING,
        CASE_ARTICLE_STATUS.DRAFT,
        CASE_ARTICLE_STATUS.READY,
      ],
    },
  }
  if (options.storeId) where.storeId = options.storeId

  const rows = await prisma.publicCase.findMany({
    where,
    select: { id: true },
    take: limit,
    orderBy: { updatedAt: 'asc' },
  })

  let processed = 0
  let skipped = 0
  for (const row of rows) {
    try {
      const result = await publishCaseArticleToH5(row.id, {
        backfill: true,
        actor: 'system_backfill',
      })
      if (result.alreadyPublished) skipped += 1
      else processed += 1
    } catch (e) {
      skipped += 1
    }
  }

  return { total: rows.length, processed, skipped }
}

module.exports = {
  assertArticleTransition,
  stampPublishedH5OnPayload,
  buildCaseH5Url,
  publishCaseArticleToH5,
  markCaseArticlePublishedWechat,
  backfillPublishedH5ForApprovedCases,
  mountCaseOnGeoPages,
  CASE_ARTICLE_H5_PUBLISHED_STATUSES,
}
