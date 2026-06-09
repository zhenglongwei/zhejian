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
  const contentJson =
    row.contentJson && typeof row.contentJson === 'object' ? { ...row.contentJson } : {}
  const geo =
    contentJson.geo && typeof contentJson.geo === 'object' ? { ...contentJson.geo } : {}
  geo.publishedH5At = now
  if (options.actor) geo.publishedH5By = options.actor
  contentJson.geo = geo

  await db.publicCase.update({
    where: { id: caseId },
    data: {
      articleStatus: CASE_ARTICLE_STATUS.PUBLISHED_H5,
      contentJson,
    },
  })

  return {
    caseId,
    articleStatus: CASE_ARTICLE_STATUS.PUBLISHED_H5,
    h5Url: buildCaseH5Url(row),
    alreadyPublished: false,
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
  const contentJson =
    row.contentJson && typeof row.contentJson === 'object' ? { ...row.contentJson } : {}
  const geo =
    contentJson.geo && typeof contentJson.geo === 'object' ? { ...contentJson.geo } : {}
  geo.publishedWechatAt = now
  if (options.actor) geo.publishedWechatBy = options.actor
  contentJson.geo = geo

  await db.publicCase.update({
    where: { id: caseId },
    data: {
      articleStatus: CASE_ARTICLE_STATUS.PUBLISHED_WECHAT,
      contentJson,
    },
  })

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
  CASE_ARTICLE_H5_PUBLISHED_STATUSES,
}
