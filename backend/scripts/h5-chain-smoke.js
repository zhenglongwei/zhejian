/**
 * H5-A-04 全链路验收：
 *   GET /user/cases/{id} → POST /analytics/events (h5_case_view)
 *   → event_tracking_log 真实 storeId → 日聚合 → GET /merchant/stats caseViewCount > 0
 *
 * 用法：
 *   npm run h5:chain-smoke
 *   SMOKE_BASE_URL=https://geo.simplewin.cn npm run h5:chain-smoke
 *   SMOKE_CASE_ID=case_xxx npm run h5:chain-smoke
 *   npm run h5:chain-smoke -- --http-only   # 无 DATABASE_URL 时仅测 HTTP 前两步
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const {
  runDailyAggregation,
  fetchMerchantStats,
} = require('../src/services/merchant-daily-stats.service')
const { formatShanghaiDate, statDateValue } = require('../src/lib/shanghai-date')
const { buildAuthSession } = require('../src/services/auth.service')

const BASE = process.env.SMOKE_BASE_URL || 'https://geo.simplewin.cn'
const CASE_ID_ENV = process.env.SMOKE_CASE_ID || ''
const HTTP_ONLY = process.argv.includes('--http-only')
const KEEP_EVENT = process.argv.includes('--keep-event')
const DEMO_STORES = new Set(['store_demo_1'])

const prisma = new PrismaClient()

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function api(method, path, { body } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

async function pickTargetFromApi() {
  const list = await api('GET', '/user/cases?page=1&pageSize=30')
  assert(list.ok && list.json?.code === 0, '案例列表失败')
  const items = list.json.data?.list || []
  assert(items.length, '案例列表为空')
  const picked =
    items.find((i) => i.id && i.storeId && !DEMO_STORES.has(i.storeId)) ||
    items.find((i) => i.id && i.storeId) ||
    items[0]
  assert(picked?.id && picked?.storeId, '列表项缺少 id/storeId')
  return { id: picked.id, storeId: picked.storeId }
}

async function pickTargetCase(useDb) {
  if (CASE_ID_ENV) {
    const detail = await api('GET', `/user/cases/${encodeURIComponent(CASE_ID_ENV)}`)
    assert(detail.ok && detail.json?.code === 0, `案例 ${CASE_ID_ENV} API 不可用`)
    return {
      id: CASE_ID_ENV,
      storeId: detail.json.data.storeId,
    }
  }

  const fromApi = await pickTargetFromApi()

  if (!useDb) return fromApi

  const row = await prisma.publicCase.findUnique({ where: { id: fromApi.id } })
  if (row?.status === 'public_approved') return { id: row.id, storeId: row.storeId }

  console.warn('[chain] API 案例在本地 DB 未找到或未 approved，仅跑 HTTP 链路')
  return fromApi
}

async function resolveMerchantToken(merchantId) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { ownerUserId: true },
  })
  assert(merchant?.ownerUserId, `商家 ${merchantId} 无 ownerUserId`)
  const user = await prisma.user.findUnique({ where: { id: merchant.ownerUserId } })
  assert(user, `用户 ${merchant.ownerUserId} 不存在`)
  const session = await buildAuthSession(user)
  assert(session.roles?.includes('merchant'), 'owner JWT 无 merchant 角色')
  return session.token
}

async function verifyH5Home() {
  const homeRes = await fetch(`${BASE}/`)
  assert(homeRes.ok, `H5 首页 HTTP ${homeRes.status}`)
  const html = await homeRes.text()
  assert(html.includes('home-render.js'), 'index.html 未引用 home-render.js')

  const apiHome = await api('GET', '/user/home')
  assert(apiHome.ok && apiHome.json?.code === 0, 'GET /user/home 失败')
  assert(Array.isArray(apiHome.json.data?.featuredCases), 'home 缺少 featuredCases')
  assert(Array.isArray(apiHome.json.data?.recommendedMerchants), 'home 缺少 recommendedMerchants')
  assert(Array.isArray(apiHome.json.data?.cityEntries), 'home 缺少 cityEntries')
  console.log('[chain] ✅ H5 首页 + GET /user/home')

  const geoList = await api('GET', '/user/geo-pages?limit=3')
  assert(geoList.ok && geoList.json?.code === 0, 'GET /user/geo-pages 失败')
  const geoId = geoList.json.data?.list?.[0]?.id
  assert(geoId, 'geo-pages 列表为空')
  const geoDetail = await api('GET', `/user/geo-pages/${encodeURIComponent(geoId)}`)
  assert(geoDetail.ok && geoDetail.json?.code === 0, `GET /user/geo-pages/${geoId} 失败`)
  console.log('[chain] ✅ GET /user/geo-pages/:id')
}

async function verifyH5City() {
  const cityRes = await fetch(`${BASE}/city/hangzhou`)
  assert(cityRes.ok, `H5 城市页 HTTP ${cityRes.status}`)
  const html = await cityRes.text()
  assert(html.includes('city-render.js'), 'city/index 未引用 city-render.js')

  const apiCity = await api('GET', '/public/h5/cities/hangzhou')
  assert(apiCity.ok && apiCity.json?.code === 0, 'GET /public/h5/cities/hangzhou 失败')
  assert(apiCity.json.data?.city?.slug === 'hangzhou', 'city slug 不正确')
  assert(Array.isArray(apiCity.json.data?.featuredCases), 'city 缺少 featuredCases')
  assert(Array.isArray(apiCity.json.data?.recommendedMerchants), 'city 缺少 recommendedMerchants')
  assert(Array.isArray(apiCity.json.data?.faq), 'city 缺少 faq')
  assert(apiCity.json.data?.seo?.canonicalPath === '/city/hangzhou', 'city canonicalPath 不正确')
  console.log('[chain] ✅ H5 城市页 /city/hangzhou + GET /public/h5/cities/hangzhou')
}

async function verifyH5Assets(caseId) {
  const listRes = await fetch(`${BASE}/case/`)
  assert(listRes.ok, `case/ 列表页 HTTP ${listRes.status}`)
  const listHtml = await listRes.text()
  assert(listHtml.includes('case-list.js'), 'case/index 未引用 case-list.js')

  const viewRes = await fetch(`${BASE}/case/view.html?id=${encodeURIComponent(caseId)}`)
  assert(viewRes.ok, `view.html HTTP ${viewRes.status}`)
  const html = await viewRes.text()
  assert(html.includes('track.js'), 'view.html 未引用 track.js')
  assert(html.includes('case-render.js'), 'view.html 未引用 case-render.js')
  console.log('[chain] H5 /case/ 列表 + view.html 静态资源 OK')
}

async function pickServiceForStore(storeId) {
  const list = await api('GET', `/user/services?storeId=${encodeURIComponent(storeId)}&pageSize=10`)
  assert(list.ok && list.json?.code === 0, '服务列表失败')
  const items = list.json.data?.list || []
  if (!items.length) return null
  return items.find((i) => i.id) || null
}

async function verifyH5ServiceAssets(storeId) {
  const service = await pickServiceForStore(storeId)
  if (!service?.id) {
    console.warn('[chain] ⚠ 门店无已上架服务，跳过服务 H5 检查')
    return null
  }
  const planId = service.id

  const svcRes = await fetch(`${BASE}/service/${encodeURIComponent(planId)}.html`)
  assert(svcRes.ok, `service/{id}.html HTTP ${svcRes.status}`)
  const html = await svcRes.text()
  assert(html.includes('track.js'), 'service 页未引用 track.js')
  assert(html.includes('service-render.js'), 'service 页未引用 service-render.js')
  console.log('[chain] H5 /service/{id}.html 静态资源 OK')

  const detail = await api('GET', `/user/services/${encodeURIComponent(planId)}`)
  assert(detail.ok && detail.json?.code === 0, `服务详情 API 失败: ${detail.status}`)
  assert(detail.json.data?.storeId === storeId, '服务 storeId 与门店不一致')
  console.log('[chain] ✅ GET /user/services/:id')

  const eventId = `evt_h5_svc_chain_${Date.now()}`
  const pagePath = `/service/${encodeURIComponent(planId)}.html`
  const ingest = await api('POST', '/analytics/events', {
    body: {
      events: [
        {
          eventId,
          eventName: 'h5_service_view',
          sessionId: `sid_svc_chain_${Date.now()}`,
          pagePath,
          source: 'h5_chain_smoke',
          channel: 'smoke',
          eventParams: {
            serviceId: planId,
            storeId: detail.json.data.storeId,
            storeName: detail.json.data.storeName || '',
            serviceName: detail.json.data.name || '',
          },
        },
      ],
    },
  })
  assert(ingest.ok && ingest.json?.code === 0, `h5_service_view ingest 失败: ${JSON.stringify(ingest.json)}`)
  assert(ingest.json.data?.accepted >= 1, 'h5_service_view 未被接受')
  console.log('[chain] ✅ POST /analytics/events h5_service_view')

  return { planId, eventId, storeId: detail.json.data.storeId }
}

async function verifyH5ServiceItem() {
  const slug = 'brake-pad-replacement'
  const pageRes = await fetch(`${BASE}/service/${slug}.html`)
  assert(pageRes.ok, `H5 服务项目聚合页 HTTP ${pageRes.status}`)
  const html = await pageRes.text()
  assert(html.includes('service-item-render.js'), 'service/view 未引用 service-item-render.js')

  const apiItem = await api('GET', `/public/h5/service-items/${slug}`)
  assert(apiItem.ok && apiItem.json?.code === 0, 'GET /public/h5/service-items/:slug 失败')
  assert(apiItem.json.data?.item?.slug === slug, 'service item slug 不正确')
  assert(Array.isArray(apiItem.json.data?.featuredCases), 'service item 缺少 featuredCases')
  assert(Array.isArray(apiItem.json.data?.recommendedStores), 'service item 缺少 recommendedStores')
  assert(Array.isArray(apiItem.json.data?.faq), 'service item 缺少 faq')
  assert(
    apiItem.json.data?.seo?.canonicalPath === `/service/${slug}.html`,
    'service item canonicalPath 不正确'
  )
  console.log('[chain] ✅ H5 服务项目聚合页 /service/{slug}.html + GET /public/h5/service-items/:slug')
}

async function verifyH5ServiceItemCases() {
  const slug = 'brake-pad-replacement'
  const pageRes = await fetch(`${BASE}/service/${slug}/cases`)
  assert(pageRes.ok, `H5 项目案例列表 HTTP ${pageRes.status}`)
  const html = await pageRes.text()
  assert(html.includes('service-item-cases-render.js'), 'service/cases 未引用 service-item-cases-render.js')

  const apiCases = await api('GET', `/public/h5/service-items/${slug}/cases?page=1&pageSize=12`)
  assert(apiCases.ok && apiCases.json?.code === 0, 'GET /public/h5/service-items/:slug/cases 失败')
  assert(apiCases.json.data?.item?.slug === slug, 'service item cases slug 不正确')
  assert(Array.isArray(apiCases.json.data?.cases), 'service item cases 缺少 cases 数组')
  assert(apiCases.json.data?.pagination, 'service item cases 缺少 pagination')
  assert(
    apiCases.json.data?.seo?.canonicalPath === `/service/${slug}/cases`,
    'service item cases canonicalPath 不正确'
  )
  console.log('[chain] ✅ H5 项目案例列表 /service/{slug}/cases + GET /public/h5/service-items/:slug/cases')
}

async function verifyH5StoreAssets(storeId) {
  const listRes = await fetch(`${BASE}/store/`)
  assert(listRes.ok, `store/ 列表页 HTTP ${listRes.status}`)
  const listHtml = await listRes.text()
  assert(listHtml.includes('store-list.js'), 'store/index 未引用 store-list.js')

  const storeRes = await fetch(`${BASE}/store/${encodeURIComponent(storeId)}.html`)
  assert(storeRes.ok, `store/{id}.html HTTP ${storeRes.status}`)
  const html = await storeRes.text()
  assert(html.includes('track.js'), 'store 页未引用 track.js')
  assert(html.includes('store-render.js'), 'store 页未引用 store-render.js')
  console.log('[chain] H5 /store/{id}.html 静态资源 OK')

  const merchant = await api('GET', `/user/merchants/${encodeURIComponent(storeId)}`)
  assert(merchant.ok && merchant.json?.code === 0, `门店 merchants API 失败: ${merchant.status}`)
  console.log('[chain] ✅ GET /user/merchants/:id')
}

async function verifyH5StoreCases(storeId) {
  const casesRes = await fetch(`${BASE}/store/${encodeURIComponent(storeId)}/cases`)
  assert(casesRes.ok, `H5 门店案例集 HTTP ${casesRes.status}`)
  const html = await casesRes.text()
  assert(html.includes('store-cases-render.js'), 'store/cases 未引用 store-cases-render.js')

  const apiCases = await api('GET', `/public/h5/stores/${encodeURIComponent(storeId)}/cases?page=1&pageSize=12`)
  assert(apiCases.ok && apiCases.json?.code === 0, 'GET /public/h5/stores/:id/cases 失败')
  assert(apiCases.json.data?.store?.id === storeId, 'store cases storeId 不一致')
  assert(Array.isArray(apiCases.json.data?.cases), 'store cases 缺少 cases 数组')
  assert(apiCases.json.data?.pagination, 'store cases 缺少 pagination')
  assert(apiCases.json.data?.seo?.canonicalPath === `/store/${storeId}/cases`, 'store cases canonicalPath 不正确')
  console.log('[chain] ✅ H5 门店案例集 /store/{id}/cases + GET /public/h5/stores/:id/cases')
}

async function main() {
  console.log('[chain] H5-A-04 全链路验收')
  console.log('[chain] BASE =', BASE)

  const health = await api('GET', '/health')
  assert(health.ok && health.json?.data?.ok !== false, 'health 失败')

  let caseRow = null
  const useDb = !HTTP_ONLY && process.env.DATABASE_URL
  caseRow = await pickTargetCase(useDb)
  assert(caseRow?.id, '无可用案例')

  const caseId = caseRow.id
  const storeId = caseRow.storeId
  console.log('[chain] 目标案例', caseId, 'storeId=', storeId)

  const detail = await api('GET', `/user/cases/${encodeURIComponent(caseId)}`)
  assert(detail.ok && detail.json?.code === 0 && detail.json.data, `案例详情失败: ${detail.status}`)
  assert(detail.json.data.storeId, '案例详情缺少 storeId')
  const caseData = detail.json.data
  if (caseData.article && caseData.article.hasArticle) {
    assert(caseData.seo && caseData.seo.title, '文章案例应有 seo.title')
    assert(caseData.article.body, '文章案例应有 article.body')
    assert(Array.isArray(caseData.article.sections), '应有 article.sections')
    console.log('[chain] ✅ 案例文章 API（seo + article）')
  } else {
    console.warn('[chain] ⚠ 案例未生成文章，跳过 article 断言（可 POST /system/cases/:id/generate-content）')
  }
  if (caseData.seo && caseData.seo.slug) {
    assert(
      caseData.seo.canonicalPath === `/case/${caseData.seo.slug}.html`,
      'canonicalPath 应与 slug 对齐'
    )
    const redirectRes = await fetch(
      `${BASE}/api/v1/public/h5/case-redirect?id=${encodeURIComponent(caseId)}`,
      { redirect: 'manual' }
    )
    assert(redirectRes.status === 301, `旧链 redirect 应为 301，实际 ${redirectRes.status}`)
    const location = redirectRes.headers.get('location') || ''
    assert(location.endsWith(`${caseData.seo.slug}.html`), `redirect Location 应指向 slug 页: ${location}`)
    console.log('[chain] ✅ 旧 URL 301 → slug 页')

    const legacyView = await fetch(
      `${BASE}/case/view.html?id=${encodeURIComponent(caseId)}&legacy=1`
    )
    assert(legacyView.ok, `legacy view.html 应 200，实际 ${legacyView.status}`)
    console.log('[chain] ✅ legacy=1 旧链无死循环')
  } else {
    console.warn('[chain] ⚠ 案例无 slug，跳过 301 断言（可 generate-content?force=true）')
  }
  console.log('[chain] ✅ GET /user/cases/:id')

  await verifyH5Home()
  await verifyH5City()
  await verifyH5ServiceItem()
  await verifyH5ServiceItemCases()
  await verifyH5Assets(caseId)
  await verifyH5StoreAssets(storeId)
  await verifyH5StoreCases(storeId)
  const serviceChain = await verifyH5ServiceAssets(storeId)

  const eventId = `evt_h5_chain_${Date.now()}`
  const pagePath = `/case/view.html?id=${encodeURIComponent(caseId)}`
  const ingest = await api('POST', '/analytics/events', {
    body: {
      events: [
        {
          eventId,
          eventName: 'h5_case_view',
          sessionId: `sid_chain_${Date.now()}`,
          pagePath,
          source: 'h5_chain_smoke',
          channel: 'smoke',
          eventParams: {
            caseId,
            storeId: detail.json.data.storeId,
            storeName: detail.json.data.storeName || '',
          },
        },
      ],
    },
  })
  assert(ingest.ok && ingest.json?.code === 0, `埋点 ingest 失败: ${JSON.stringify(ingest.json)}`)
  assert(ingest.json.data?.accepted >= 1, '埋点未被接受')
  console.log('[chain] ✅ POST /analytics/events h5_case_view')

  if (HTTP_ONLY || !process.env.DATABASE_URL) {
    console.log('[chain] ✅ HTTP 链路通过（跳过 DB 聚合/看板，需 DATABASE_URL 跑完整链路）')
    return
  }

  const store = await prisma.store.findUnique({
    where: { id: detail.json.data.storeId },
    select: { merchantId: true },
  })
  if (!store?.merchantId) {
    console.warn('[chain] ⚠ 本地 DB 无门店', detail.json.data.storeId)
    console.log('[chain] ✅ H5-A-04 HTTP 链路通过（聚合/看板请在 ECS：npm run h5:chain-smoke）')
    return
  }

  const log = await prisma.eventTrackingLog.findUnique({ where: { eventId } })
  if (!log) {
    console.warn('[chain] ⚠ 本地 DB 未找到 event_tracking_log（API 与 DB 可能不同环境）')
    console.log('[chain] ✅ H5-A-04 HTTP 链路通过（日志/看板请在 ECS 验收）')
    return
  }
  const params = log.eventParams || {}
  assert(params.storeId === detail.json.data.storeId, `log storeId 不一致: ${params.storeId}`)
  assert(params.caseId === caseId, `log caseId 不一致: ${params.caseId}`)
  console.log('[chain] ✅ event_tracking_log storeId/caseId 对齐')

  const today = formatShanghaiDate(new Date())
  const agg = await runDailyAggregation({
    date: today,
    merchantId: store.merchantId,
    storeId: detail.json.data.storeId,
  })
  console.log('[chain] 日聚合', today, 'processed=', agg.processed)

  const dayRow = await prisma.merchantDailyStats.findFirst({
    where: {
      merchantId: store.merchantId,
      storeId: detail.json.data.storeId,
      statDate: statDateValue(today),
    },
  })
  assert(dayRow && dayRow.caseViewCount > 0, `merchant_daily_stats.caseViewCount 仍为 0（${today}）`)
  console.log('[chain] ✅ merchant_daily_stats caseViewCount =', dayRow.caseViewCount)

  const token = await resolveMerchantToken(store.merchantId)
  const statsRes = await fetch(
    `${BASE}/api/v1/merchant/stats?storeId=${encodeURIComponent(detail.json.data.storeId)}&period=custom&from=${today}&to=${today}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const statsJson = await statsRes.json()
  assert(statsRes.ok && statsJson.code === 0, `merchant/stats 失败: ${JSON.stringify(statsJson)}`)
  assert(
    statsJson.data?.summary?.caseViewCount > 0,
    `看板 summary.caseViewCount 为 0（custom ${today}）`
  )
  console.log('[chain] ✅ GET /merchant/stats caseViewCount =', statsJson.data.summary.caseViewCount)

  if (!KEEP_EVENT) {
    await prisma.eventTrackingLog.delete({ where: { eventId } }).catch(() => {})
    if (serviceChain?.eventId) {
      await prisma.eventTrackingLog.delete({ where: { eventId: serviceChain.eventId } }).catch(() => {})
    }
    await runDailyAggregation({
      date: today,
      merchantId: store.merchantId,
      storeId: detail.json.data.storeId,
    })
    console.log('[chain] 已清理冒烟埋点并重新聚合（--keep-event 可保留）')
  }

  const isDemo = DEMO_STORES.has(detail.json.data.storeId)
  if (isDemo) {
    console.warn('[chain] ⚠ 使用 demo 店验收；建议 SMOKE_CASE_ID 指定非 demo 店案例')
  }

  console.log('[chain] ✅ H5-A-04 全链路通过')
}

main()
  .catch((e) => {
    console.error('[chain] ❌', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
