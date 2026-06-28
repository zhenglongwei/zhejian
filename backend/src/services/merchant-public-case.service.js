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

const H5_CASE_VIEW_EVENT = 'h5_case_view'
const MP_CASE_VIEW_EVENT = 'case_view'
const CASE_VIEW_EVENTS = [H5_CASE_VIEW_EVENT, MP_CASE_VIEW_EVENT]
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
  if (CASE_ARTICLE_H5_PUBLISHED_STATUSES.includes(articleStatus)) {
    if (row.seoNoindex) {
      return { key: 'published_h5_private', label: 'H5 私域' }
    }
    return { key: 'published_h5', label: 'H5 公域收录' }
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
  let h5Total = 0
  let mpTotal = 0
  const perCase = {}
  const perCaseH5 = {}
  const perCaseMp = {}
  const idSet =
    Array.isArray(caseIds) && caseIds.length ? new Set(caseIds) : null

  for (const row of logs) {
    const params = row.eventParams || {}
    if (paramStoreId(params) !== storeId) continue
    const caseId = paramCaseId(params)
    if (!caseId) continue
    const isH5 = row.eventName === H5_CASE_VIEW_EVENT
    const isMp = row.eventName === MP_CASE_VIEW_EVENT
    if (!isH5 && !isMp) continue
    total += 1
    if (isH5) h5Total += 1
    if (isMp) mpTotal += 1
    if (idSet && !idSet.has(caseId)) continue
    perCase[caseId] = (perCase[caseId] || 0) + 1
    if (isH5) perCaseH5[caseId] = (perCaseH5[caseId] || 0) + 1
    if (isMp) perCaseMp[caseId] = (perCaseMp[caseId] || 0) + 1
  }

  return { total, h5Total, mpTotal, perCase, perCaseH5, perCaseMp }
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
        seoNoindex: true,
      },
    }),
  ])

  const caseIds = recentRows.map((row) => row.id)
  const {
    total: caseViews7d,
    h5Total: h5CaseViews7d,
    mpTotal: mpCaseViews7d,
    perCase: viewMap,
    perCaseH5: h5ViewMap,
    perCaseMp: mpViewMap,
  } = await countCaseViews7d(storeId, caseIds)

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
      h5ViewCount7d: h5ViewMap[row.id] || 0,
      mpViewCount7d: mpViewMap[row.id] || 0,
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
      h5CaseViews7d,
      mpCaseViews7d,
    },
    recent,
  }
}

module.exports = {
  fetchMerchantCasePublishPanel,
  resolvePublishLabel,
}
