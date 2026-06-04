const { prisma } = require('../lib/prisma')
const { shanghaiDayBounds } = require('../lib/shanghai-date')
const { LEAD_STATUS } = require('../constants/v2')
const { fetchMerchantAlbumStats } = require('./service-album.service')

const TOP_LIMIT = 5
const CASE_VIEW_EVENTS = new Set(['h5_case_view', 'case_view'])
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
  return Object.fromEntries(rows.map((r) => [r.serviceItemId, r.name || r.serviceItemId]))
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
  for (const row of logs) {
    const storeId = paramStoreId(row.eventParams)
    if (!inStoreScope(storeIds, storeId)) continue
    const caseId = paramCaseId(row.eventParams)
    if (!caseId) continue
    viewMap[caseId] = (viewMap[caseId] || 0) + 1
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
        name: nameMap[serviceId] || serviceId,
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
  const [topCases, topServices, staleLeadCount, todos] = await Promise.all([
    fetchTopCases(storeIds, range),
    fetchTopServices(merchantId, storeIds, range),
    countStaleLeads(storeIds),
    loadRealtimeTodos(storeIds, merchantId),
  ])

  const suggestions = buildSuggestions({
    ...ctx,
    ...todos,
    staleLeadCount,
    topCases,
  })

  return { topCases, topServices, suggestions, staleLeadCount, ...todos }
}

module.exports = {
  fetchStatsInsights,
  fetchTopCases,
  fetchTopServices,
  buildSuggestions,
}
