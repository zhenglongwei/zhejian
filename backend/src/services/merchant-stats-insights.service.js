const { prisma } = require('../lib/prisma')
const { shanghaiDayBounds } = require('../lib/shanghai-date')
const { LEAD_STATUS, PUBLIC_CASE_STATUS } = require('../constants/v2')
const { getServiceItem } = require('../constants/service-catalog')
const { fetchMerchantAlbumStats } = require('./service-album.service')

const TOP_LIMIT = 5
const H5_CASE_VIEW_EVENT = 'h5_case_view'
const MP_CASE_VIEW_EVENT = 'case_view'
const CASE_VIEW_EVENTS = new Set([MP_CASE_VIEW_EVENT, H5_CASE_VIEW_EVENT])
const SERVICE_VIEW_EVENTS = new Set(['h5_service_view', 'service_view'])
const STALE_LEAD_MS = 24 * 60 * 60 * 1000

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

async function loadCaseTitleMap(storeIds, caseIds) {
  if (!caseIds.length) return {}
  const rows = await prisma.publicCase.findMany({
    where: { storeId: { in: storeIds }, id: { in: caseIds } },
    select: { id: true, title: true },
  })
  return Object.fromEntries(rows.map((r) => [r.id, r.title || r.id]))
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

async function fetchTopCases(storeIds, range) {
  const { start, end } = shanghaiDayBounds(range.from)
  const endBound = shanghaiDayBounds(range.to).end

  const [logs, leads] = await Promise.all([
    prisma.eventTrackingLog.findMany({
      where: {
        createdAt: { gte: start, lte: endBound },
        eventName: { in: [...CASE_VIEW_EVENTS] },
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
  for (const row of logs) {
    const storeId = paramStoreId(row.eventParams)
    if (!inStoreScope(storeIds, storeId)) continue
    const caseId = paramCaseId(row.eventParams)
    if (!caseId) continue
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

  const ids = [...new Set([...Object.keys(viewMap), ...Object.keys(leadMap)])]
  const titleMap = await loadCaseTitleMap(storeIds, ids)

  return ids
    .map((caseId) => {
      const viewCount = viewMap[caseId] || 0
      const leadCount = leadMap[caseId] || 0
      return {
        caseId,
        title: titleMap[caseId] || caseId,
        viewCount,
        h5ViewCount: h5ViewMap[caseId] || 0,
        mpViewCount: mpViewMap[caseId] || 0,
        leadCount,
        leadRate: buildLeadRate(viewCount, leadCount),
      }
    })
    .sort((a, b) => b.viewCount - a.viewCount || b.leadCount - a.leadCount)
    .slice(0, TOP_LIMIT)
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

async function countStaleLeads(storeIds) {
  const cutoff = new Date(Date.now() - STALE_LEAD_MS)
  return prisma.consultLead.count({
    where: {
      storeId: { in: storeIds },
      status: { in: [LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED] },
      createdAt: { lt: cutoff },
    },
  })
}

function buildSuggestions(ctx) {
  const tips = []
  const stale = ctx.staleLeadCount || 0
  const pendingAuth = ctx.pendingAuth || 0
  const pendingLeads = ctx.pendingLeads || 0
  const score = ctx.transparencyScore || 0
  const topCases = ctx.topCases || []

  if (stale > 0) {
    tips.push(`你有 ${stale} 条咨询线索超过 24 小时未联系，建议尽快回电。`)
  } else if (pendingLeads > 0) {
    tips.push(`你有 ${pendingLeads} 条咨询线索待处理，建议尽快查看并联系。`)
  }

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
    tips.push('门店透明度分偏低，建议补充公开案例、完善服务资料并跟进咨询线索。')
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
    tips.push('继续保持案例更新与线索跟进，站外浏览数据将按日汇总展示。')
  }

  return tips.slice(0, 5)
}

async function loadRealtimeTodos(storeIds, merchantId) {
  const [pendingLeads, albumStats] = await Promise.all([
    prisma.consultLead.count({
      where: {
        storeId: { in: storeIds },
        status: { in: [LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED] },
      },
    }),
    fetchMerchantAlbumStats('', merchantId),
  ])
  return { pendingLeads, pendingAuth: albumStats.pendingAuth || 0 }
}

async function fetchStatsInsights(merchantId, storeIds, range, ctx = {}) {
  const [topCases, topServices, staleLeadCount, todos, stores] = await Promise.all([
    fetchTopCases(storeIds, range),
    fetchTopServices(merchantId, storeIds, range),
    countStaleLeads(storeIds),
    loadRealtimeTodos(storeIds, merchantId),
    prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { capabilityJson: true },
    }),
  ])

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
    const until = String(cap.brandAuthValidUntil || '').trim()
    if (until) {
      const diff = Math.floor(
        (new Date(`${until}T12:00:00+08:00`) - today) / (24 * 3600 * 1000)
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
    staleLeadCount,
    topCases,
    capabilityIncomplete,
    brandAuthExpiring,
    daysSinceLastPublicCase,
  })

  return { topCases, topServices, suggestions, staleLeadCount, ...todos }
}

module.exports = {
  fetchStatsInsights,
  fetchTopCases,
  fetchTopServices,
  buildSuggestions,
}
