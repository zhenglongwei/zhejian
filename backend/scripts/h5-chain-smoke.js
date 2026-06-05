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

async function verifyH5Assets(caseId) {
  const viewRes = await fetch(`${BASE}/case/view.html?id=${encodeURIComponent(caseId)}`)
  assert(viewRes.ok, `view.html HTTP ${viewRes.status}`)
  const html = await viewRes.text()
  assert(html.includes('track.js'), 'view.html 未引用 track.js')
  assert(html.includes('case-render.js'), 'view.html 未引用 case-render.js')
  console.log('[chain] H5 view.html 静态资源 OK')
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
  console.log('[chain] ✅ GET /user/cases/:id')

  await verifyH5Assets(caseId)

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
