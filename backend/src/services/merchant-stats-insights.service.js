const { prisma } = require('../lib/prisma')
const { shanghaiDayBounds } = require('../lib/shanghai-date')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { getServiceItem } = require('../constants/service-catalog')
const { publicCaseH5Where } = require('../utils/public-case-visibility')
const { fetchMerchantAlbumStats } = require('./service-album.service')
const { loadStoreCapabilitiesByIds } = require('../utils/store-capability-load')

const TOP_LIMIT = 5
const H5_CASE_VIEW_EVENT = 'h5_case_view'
const MP_CASE_VIEW_EVENT = 'case_view'
const CASE_VIEW_EVENTS = new Set([MP_CASE_VIEW_EVENT, H5_CASE_VIEW_EVENT])
const CRAWLER_VIEW_EVENT = 'h5_crawler_view'
const SERVICE_VIEW_EVENTS = new Set(['h5_service_view', 'service_view'])

function paramStoreId(params) {
  if (!params || typeof params !== 'object') return ''
  return String(params.storeId || params.store_id || '').trim()
}

function paramCaseId(params) {
  if (!params || typeof params !== 'object') return ''
  return String(params.caseId || params.case_id || '').trim()
}

function paramServiceId(params) {
  if (!params || typeof params !== 'object') return ''
  return String(
    params.serviceItemId || params.service_item_id || params.serviceId || params.service_id || ''
  ).trim()
}

function inStoreScope(storeIds, storeId) {
  if (!storeId) return storeIds.length <= 1
  return storeIds.includes(storeId)
}

function buildLeadRate(viewCount, leadCount) {
  if (!viewCount) return null
  return leadCount / viewCount
}

async function loadServiceNameMap(merchantId, storeIds, serviceIds) {
  if (!serviceIds.length) return {}
  const rows = await prisma.merchantServicePlan.findMany({
    where: {
      merchantId,
      storeId: { in: storeIds },
      serviceItemId: { in: serviceIds },
    },
    select: { serviceItemId: true, name: true },
  })
  return Object.fromEntries(
    rows.map((r) => [r.serviceItemId, String(r.name || '').trim()]).filter(([, name]) => name)
  )
}

function resolveServiceDisplayName(serviceId, nameFromPlan) {
  const planName = String(nameFromPlan || '').trim()
  if (planName && planName !== serviceId && !/^item_/.test(planName)) return planName
  const catalog = getServiceItem(serviceId)
  return (catalog && catalog.name) || planName || serviceId
}

function vehicleText(vehicleJson) {
  const v = vehicleJson && typeof vehicleJson === 'object' ? vehicleJson : {}
  const plate = String(v.plateDisplay || v.plate || '').trim()
  const model = [String(v.brand || '').trim(), String(v.series || '').trim()]
    .filter(Boolean)
    .join(' ')
  return [plate, model].filter(Boolean).join(' · ')
}

/**
 * 案例明细：每个已公开案例在所选时间档内的真人浏览、爬虫抓取与星标次数。
 * 案例集合用 publicCaseH5Where，和看板「公开案例」同一口径。
 */
async function fetchCaseMetrics(storeIds, range) {
  const { start, end } = shanghaiDayBounds(range.from)
  const endBound = shanghaiDayBounds(range.to).end

  const [cases, logs, leads] = await Promise.all([
    prisma.publicCase.findMany({
      where: { storeId: { in: storeIds }, ...publicCaseH5Where() },
      select: {
        id: true,
        title: true,
        serviceName: true,
        publishedAt: true,
        album: { select: { vehicleJson: true } },
      },
      orderBy: { publishedAt: 'desc' },
    }),
    prisma.eventTrackingLog.findMany({
      where: {
        createdAt: { gte: start, lte: endBound },
        eventName: { in: [...CASE_VIEW_EVENTS, CRAWLER_VIEW_EVENT] },
      },
      select: { eventName: true, eventParams: true },
    }),
    prisma.consultLead.findMany({
      where: {
        storeId: { in: storeIds },
        createdAt: { gte: start, lte: endBound },
        caseId: { not: '' },
      },
      select: { caseId: true },
    }),
  ])

  const viewMap = {}
  const h5ViewMap = {}
  const mpViewMap = {}
  const crawlerMap = {}
  for (const row of logs) {
    const storeId = paramStoreId(row.eventParams)
    if (!inStoreScope(storeIds, storeId)) continue
    const caseId = paramCaseId(row.eventParams)
    if (!caseId) continue
    if (row.eventName === CRAWLER_VIEW_EVENT) {
      crawlerMap[caseId] = (crawlerMap[caseId] || 0) + 1
      continue
    }
    viewMap[caseId] = (viewMap[caseId] || 0) + 1
    if (row.eventName === H5_CASE_VIEW_EVENT) {
      h5ViewMap[caseId] = (h5ViewMap[caseId] || 0) + 1
    }
    if (row.eventName === MP_CASE_VIEW_EVENT) {
      mpViewMap[caseId] = (mpViewMap[caseId] || 0) + 1
    }
  }

  const leadMap = {}
  for (const row of leads) {
    leadMap[row.caseId] = (leadMap[row.caseId] || 0) + 1
  }

  const starMap = {}
  const caseIds = cases.map((item) => item.id)
  if (caseIds.length) {
    // 星标 = 读者在案例页上点亮的星星（user_favorites 的 type=case），只有次数
    const stars = await prisma.userFavorite.findMany({
      where: {
        targetType: 'case',
        targetId: { in: caseIds },
        createdAt: { gte: start, lte: endBound },
      },
      select: { targetId: true },
    })
    for (const row of stars) {
      starMap[row.targetId] = (starMap[row.targetId] || 0) + 1
    }
  }

  return cases
    .map((pc) => {
      const viewCount = viewMap[pc.id] || 0
      const leadCount = leadMap[pc.id] || 0
      return {
        caseId: pc.id,
        title: String(pc.title || pc.serviceName || '').trim() || pc.id,
        serviceName: String(pc.serviceName || '').trim(),
        vehicle: vehicleText(pc.album && pc.album.vehicleJson),
        publishedAt: pc.publishedAt || null,
        viewCount,
        h5ViewCount: h5ViewMap[pc.id] || 0,
        mpViewCount: mpViewMap[pc.id] || 0,
        crawlerViewCount: crawlerMap[pc.id] || 0,
        leadCount,
        leadRate: buildLeadRate(viewCount, leadCount),
        starCount: starMap[pc.id] || 0,
      }
    })
    .sort(
      (a, b) =>
        b.viewCount - a.viewCount ||
        b.crawlerViewCount - a.crawlerViewCount ||
        b.leadCount - a.leadCount
    )
}

function buildStarSummary(caseMetrics) {
  let starCount = 0
  let starredCaseCount = 0
  ;(caseMetrics || []).forEach((item) => {
    if (!item.starCount) return
    starCount += item.starCount
    starredCaseCount += 1
  })
  return { starCount, starredCaseCount, caseCount: (caseMetrics || []).length }
}

async function fetchTopServices(merchantId, storeIds, range) {
  const { start, end } = shanghaiDayBounds(range.from)
  const endBound = shanghaiDayBounds(range.to).end

  const [logs, leads] = await Promise.all([
    prisma.eventTrackingLog.findMany({
      where: {
        createdAt: { gte: start, lte: endBound },
        eventName: { in: [...SERVICE_VIEW_EVENTS] },
      },
      select: { eventParams: true },
    }),
    prisma.consultLead.findMany({
      where: {
        storeId: { in: storeIds },
        createdAt: { gte: start, lte: endBound },
        serviceId: { not: '' },
      },
      select: { serviceId: true },
    }),
  ])

  const viewMap = {}
  for (const row of logs) {
    const storeId = paramStoreId(row.eventParams)
    if (!inStoreScope(storeIds, storeId)) continue
    const serviceId = paramServiceId(row.eventParams)
    if (!serviceId) continue
    viewMap[serviceId] = (viewMap[serviceId] || 0) + 1
  }

  const leadMap = {}
  for (const row of leads) {
    leadMap[row.serviceId] = (leadMap[row.serviceId] || 0) + 1
  }

  const ids = [...new Set([...Object.keys(viewMap), ...Object.keys(leadMap)])]
  const nameMap = await loadServiceNameMap(merchantId, storeIds, ids)

  return ids
    .map((serviceId) => {
      const viewCount = viewMap[serviceId] || 0
      const leadCount = leadMap[serviceId] || 0
      return {
        serviceId,
        name: resolveServiceDisplayName(serviceId, nameMap[serviceId]),
        viewCount,
        leadCount,
        leadRate: buildLeadRate(viewCount, leadCount),
      }
    })
    .sort((a, b) => b.viewCount - a.viewCount || b.leadCount - a.leadCount)
    .slice(0, TOP_LIMIT)
}

function buildSuggestions(ctx) {
  const tips = []
  const pendingAuth = ctx.pendingAuth || 0
  const score = ctx.transparencyScore || 0
  const topCases = ctx.topCases || []

  if (pendingAuth > 0) {
    tips.push(
      `有 ${pendingAuth} 个已完工服务相册待邀请车主查看并授权公开，建议发送链接完成留痕。`
    )
  }

  const weakCase = topCases.find(
    (c) => c.viewCount >= 5 && c.leadCount === 0 && (c.leadRate == null || c.leadRate < 0.05)
  )
  if (weakCase) {
    tips.push(
      `「${weakCase.title}」浏览较高但咨询较少，建议完善服务方案参考价与适用车型说明。`
    )
  }

  if (score > 0 && score < 45) {
    tips.push('门店透明度分偏低，建议补充公开案例、完善服务资料。')
  }

  if (ctx.daysSinceLastPublicCase != null && ctx.daysSinceLastPublicCase > 30) {
    tips.push(
      `超过 ${ctx.daysSinceLastPublicCase} 天无新公开案例，建议完工后邀请车主授权公示以保持新鲜度。`
    )
  }

  if (ctx.capabilityIncomplete) {
    tips.push('技师或设备能力资料尚未完善/未过审，建议提交能力墙信息以提升可信展示。')
  }

  if (ctx.brandAuthExpiring) {
    tips.push('品牌授权即将过期或已过期，建议更新授权证明与有效期。')
  }

  if (!tips.length) {
    tips.push('继续保持案例更新，站外浏览数据将按日汇总展示。')
  }

  return tips.slice(0, 5)
}

async function loadRealtimeTodos(storeIds, merchantId) {
  const albumStats = await fetchMerchantAlbumStats('', merchantId)
  return { pendingAuth: albumStats.pendingAuth || 0 }
}

async function fetchStatsInsights(merchantId, storeIds, range, ctx = {}) {
  const [caseMetrics, topServices, todos, stores] = await Promise.all([
    fetchCaseMetrics(storeIds, range),
    fetchTopServices(merchantId, storeIds, range),
    loadRealtimeTodos(storeIds, merchantId),
    loadStoreCapabilitiesByIds(storeIds),
  ])
  const topCases = caseMetrics.slice(0, TOP_LIMIT)

  let capabilityIncomplete = false
  let brandAuthExpiring = false
  let daysSinceLastPublicCase = null
  const today = new Date()
  for (const store of stores) {
    const cap =
      store.capabilityJson && typeof store.capabilityJson === 'object'
        ? store.capabilityJson
        : {}
    const tech = Array.isArray(cap.technicians) ? cap.technicians.length : 0
    const eq = Array.isArray(cap.equipmentTags) ? cap.equipmentTags.length : 0
    if (tech === 0 && eq === 0) capabilityIncomplete = true
    if (cap.reviewStatus === 'pending' || cap.reviewStatus === 'rejected') {
      capabilityIncomplete = true
    }
    const untils = []
    const until = String(cap.brandAuthValidUntil || '').trim()
    if (until) untils.push(until)
    const photos =
      store.photosJson && typeof store.photosJson === 'object' ? store.photosJson : {}
    if (Array.isArray(photos.brandAuthItems)) {
      photos.brandAuthItems.forEach((item) => {
        const u = String((item && item.validUntil) || '').trim()
        if (u) untils.push(u)
      })
    }
    for (const u of untils) {
      const diff = Math.floor(
        (new Date(`${u}T12:00:00+08:00`) - today) / (24 * 3600 * 1000)
      )
      if (diff <= 30) brandAuthExpiring = true
    }
  }

  const lastCase = await prisma.publicCase.findFirst({
    where: {
      storeId: { in: storeIds },
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
    },
    orderBy: { publishedAt: 'desc' },
    select: { publishedAt: true },
  })
  if (lastCase?.publishedAt) {
    const published =
      lastCase.publishedAt instanceof Date
        ? lastCase.publishedAt
        : new Date(lastCase.publishedAt)
    daysSinceLastPublicCase = Math.max(
      0,
      Math.floor((today - published) / (24 * 3600 * 1000))
    )
  }

  const suggestions = buildSuggestions({
    ...ctx,
    ...todos,
    topCases,
    capabilityIncomplete,
    brandAuthExpiring,
    daysSinceLastPublicCase,
  })

  return {
    caseMetrics,
    starSummary: buildStarSummary(caseMetrics),
    topCases,
    topServices,
    suggestions,
    ...todos,
  }
}

module.exports = {
  fetchStatsInsights,
  fetchCaseMetrics,
  buildStarSummary,
  fetchTopServices,
  buildSuggestions,
}
