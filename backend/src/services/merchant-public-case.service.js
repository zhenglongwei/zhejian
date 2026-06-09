/**
 * DS-B-12 / DS-B-04 · 商家工作台案例发布状态
 */
const { prisma } = require('../lib/prisma')
const { toIso } = require('../lib/ids')
const { formatShanghaiDate, addDays, shanghaiDayBounds } = require('../lib/shanghai-date')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const {
  CASE_ARTICLE_STATUS,
  CASE_ARTICLE_STATUS_LABELS,
  CASE_ARTICLE_H5_PUBLISHED_STATUSES,
} = require('../constants/case-article-status')
const { resolvePublicCaseMediaUrl } = require('../lib/media-url')
const { buildCaseH5Url } = require('./case-article-publish.service')

const CASE_VIEW_EVENTS = ['h5_case_view', 'case_view']
const RECENT_LIMIT = 5

function paramCaseId(params) {
  if (!params || typeof params !== 'object') return ''
  return String(params.caseId || params.case_id || '').trim()
}

function paramStoreId(params) {
  if (!params || typeof params !== 'object') return ''
  return String(params.storeId || params.store_id || '').trim()
}

function resolvePublishLabel(row) {
  if (row.status === PUBLIC_CASE_STATUS.PENDING_REVIEW) {
    return { key: 'pending_review', label: '审核中' }
  }
  if (row.status !== PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    return { key: 'draft', label: '未公开' }
  }
  const articleStatus = row.articleStatus || CASE_ARTICLE_STATUS.PENDING
  if (articleStatus === CASE_ARTICLE_STATUS.PUBLISHED_WECHAT) {
    return { key: 'published_wechat', label: '已发公众号' }
  }
  if (articleStatus === CASE_ARTICLE_STATUS.PUBLISHED_H5) {
    return { key: 'published_h5', label: '已发 H5' }
  }
  if (
    articleStatus === CASE_ARTICLE_STATUS.READY ||
    articleStatus === CASE_ARTICLE_STATUS.DRAFT
  ) {
    return { key: 'ready', label: '待发布 H5' }
  }
  return {
    key: 'pending',
    label: CASE_ARTICLE_STATUS_LABELS[CASE_ARTICLE_STATUS.PENDING] || '待生成',
  }
}

async function countCaseViews7d(storeId, caseIds = null) {
  const todayStr = formatShanghaiDate(new Date())
  const fromStr = addDays(todayStr, -6)
  const { start } = shanghaiDayBounds(fromStr)
  const { end } = shanghaiDayBounds(todayStr)

  const logs = await prisma.eventTrackingLog.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      eventName: { in: CASE_VIEW_EVENTS },
    },
    select: { eventParams: true },
  })

  let total = 0
  const perCase = {}
  const idSet =
    Array.isArray(caseIds) && caseIds.length ? new Set(caseIds) : null

  for (const row of logs) {
    const params = row.eventParams || {}
    if (paramStoreId(params) !== storeId) continue
    const caseId = paramCaseId(params)
    if (!caseId) continue
    total += 1
    if (idSet && !idSet.has(caseId)) continue
    perCase[caseId] = (perCase[caseId] || 0) + 1
  }

  return { total, perCase }
}

async function fetchMerchantCasePublishPanel(storeId) {
  const [pendingReview, publishedH5, readyToPublish, recentRows] = await Promise.all([
    prisma.publicCase.count({
      where: { storeId, status: PUBLIC_CASE_STATUS.PENDING_REVIEW },
    }),
    prisma.publicCase.count({
      where: {
        storeId,
        status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
        articleStatus: { in: CASE_ARTICLE_H5_PUBLISHED_STATUSES },
      },
    }),
    prisma.publicCase.count({
      where: {
        storeId,
        status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
        articleStatus: {
          in: [
            CASE_ARTICLE_STATUS.PENDING,
            CASE_ARTICLE_STATUS.DRAFT,
            CASE_ARTICLE_STATUS.READY,
          ],
        },
      },
    }),
    prisma.publicCase.findMany({
      where: {
        storeId,
        status: {
          in: [PUBLIC_CASE_STATUS.PENDING_REVIEW, PUBLIC_CASE_STATUS.PUBLIC_APPROVED],
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: RECENT_LIMIT,
      select: {
        id: true,
        albumId: true,
        title: true,
        serviceName: true,
        status: true,
        articleStatus: true,
        slug: true,
        canonicalPath: true,
        coverImage: true,
        publishedAt: true,
        updatedAt: true,
      },
    }),
  ])

  const caseIds = recentRows.map((row) => row.id)
  const { total: caseViews7d, perCase: viewMap } = await countCaseViews7d(storeId, caseIds)

  const recent = recentRows.map((row) => {
    const publish = resolvePublishLabel(row)
    const h5Url =
      CASE_ARTICLE_H5_PUBLISHED_STATUSES.includes(
        row.articleStatus || CASE_ARTICLE_STATUS.PENDING
      )
        ? buildCaseH5Url(row)
        : ''
    return {
      caseId: row.id,
      albumId: row.albumId || '',
      title: row.title || row.serviceName || '公开案例',
      serviceName: row.serviceName || '',
      status: row.status,
      articleStatus: row.articleStatus || CASE_ARTICLE_STATUS.PENDING,
      publishStatus: publish.key,
      publishLabel: publish.label,
      slug: row.slug || '',
      h5Url,
      coverImage: resolvePublicCaseMediaUrl(row.coverImage || ''),
      viewCount7d: viewMap[row.id] || 0,
      publishedAt: row.publishedAt ? toIso(row.publishedAt) : '',
      updatedAt: row.updatedAt ? toIso(row.updatedAt) : '',
    }
  })

  return {
    summary: {
      pendingReview,
      /** @deprecated 兼容旧字段，等同 pendingReview */
      pendingPublish: pendingReview,
      publishedH5,
      readyToPublish,
      caseViews7d,
    },
    recent,
  }
}

module.exports = {
  fetchMerchantCasePublishPanel,
  resolvePublishLabel,
}
