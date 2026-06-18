/**
 * GEO-OBS-C03 · 商家 GEO 机会分（本店 vs 同城同服务）
 */
const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { buildIntentKey, median } = require('../utils/geo-citation-gap')

const PUBLIC_GEO_STATUSES = [GEO_PAGE_STATUS.PUBLISHED, GEO_PAGE_STATUS.NOINDEX]

function extractCityFromStore(store) {
  if (store?.city) return String(store.city)
  const m = String(store?.address || '').match(/([\u4e00-\u9fa5]{2,4}市)/)
  return m ? m[1] : '杭州'
}

async function resolveMerchantStore(auth, storeId) {
  const sid = String(storeId || auth?.storeId || '').trim()
  if (!sid) {
    const err = new Error('缺少门店 ID')
    err.status = 400
    throw err
  }
  const store = await prisma.store.findUnique({ where: { id: sid } })
  if (!store || store.merchantId !== auth.merchantId) {
    const err = new Error('门店不存在或无权访问')
    err.status = 404
    throw err
  }
  return store
}

/**
 * @param {object} auth
 * @param {{ storeId?: string }} [query]
 */
async function getMerchantGeoOpportunity(auth, query = {}) {
  const store = await resolveMerchantStore(auth, query.storeId)
  const city = extractCityFromStore(store)

  const [storeCases, cityCases, geoPages] = await Promise.all([
    prisma.publicCase.findMany({
      where: { storeId: store.id, status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED },
      select: { serviceName: true },
    }),
    prisma.publicCase.findMany({
      where: { city, status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED },
      select: { serviceName: true, storeId: true },
    }),
    prisma.geoPage.findMany({
      where: { city, status: { in: PUBLIC_GEO_STATUSES } },
      select: { title: true, slug: true },
    }),
  ])

  const storeServiceMap = new Map()
  storeCases.forEach((row) => {
    const name = String(row.serviceName || '').trim()
    if (!name) return
    storeServiceMap.set(name, (storeServiceMap.get(name) || 0) + 1)
  })

  const cityServiceMap = new Map()
  cityCases.forEach((row) => {
    const name = String(row.serviceName || '').trim()
    if (!name) return
    const key = buildIntentKey(city, name)
    cityServiceMap.set(key, (cityServiceMap.get(key) || 0) + 1)
  })

  const cityCounts = [...cityServiceMap.values()]
  const cityMedian = median(cityCounts)

  const serviceNames = new Set([
    ...storeServiceMap.keys(),
    ...cityCases.map((row) => String(row.serviceName || '').trim()).filter(Boolean),
  ])
  const services = [...serviceNames]
    .filter(Boolean)
    .slice(0, 12)
    .map((serviceName) => {
      const key = buildIntentKey(city, serviceName)
      const cityPublicCaseCount = cityServiceMap.get(key) || 0
      const storePublicCaseCount = storeServiceMap.get(serviceName) || 0
      const hasTopic = geoPages.some((page) => String(page.title || '').includes(serviceName))
      let opportunityScore = 0
      if (storePublicCaseCount === 0) opportunityScore += 40
      if (cityMedian > 0 && storePublicCaseCount < cityMedian) {
        opportunityScore += Math.min(30, (cityMedian - storePublicCaseCount) * 5)
      }
      if (!hasTopic && cityPublicCaseCount > 0) opportunityScore += 10
      return {
        serviceName,
        storePublicCaseCount,
        cityPublicCaseCount,
        hasTopic,
        opportunityScore: Math.round(opportunityScore),
      }
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore)

  const top = services[0]
  const hint = top
    ? `您所在城市「${top.serviceName}」相关公开脱敏案例约 ${top.cityPublicCaseCount} 条；完善服务相册并授权公开，有助于在「${top.serviceName} 怎么处理」类问题中成为可引用参考。`
    : `完善服务相册并授权公开，有助于在「维修过程怎么处理」类 AI 问答中成为可引用参考。`

  return {
    city,
    storePublicCaseCount: storeCases.length,
    cityMedianPublicCases: Math.round(cityMedian),
    services,
    hint,
    disclaimer:
      '此为平台内部供给参考，不代表地图或点评排名变化，也不构成 AI 引用承诺。',
  }
}

module.exports = {
  getMerchantGeoOpportunity,
}
