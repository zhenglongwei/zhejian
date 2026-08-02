#!/usr/bin/env node
/**
 * 生产上线冒烟（只读 HTTP，不写库、不造数据）
 *
 * 覆盖：health、首页/案例列表/运营后台可达、公开案例列表与详情一致、
 * 无「列表有标题但详情/跳转 404」的演示兜底案例。
 *
 * 用法：
 *   npm run smoke:prod
 *   npm run smoke:prod -- https://geo.simplewin.cn
 *   SMOKE_BASE_URL=https://geo.simplewin.cn npm run smoke:prod
 *
 * 预发：
 *   npm run smoke:prod -- https://staging.geo.simplewin.cn
 */
require('dotenv').config()

const BASE = (
  process.argv[2] ||
  process.env.SMOKE_BASE_URL ||
  process.env.PUBLIC_BASE_URL ||
  'https://geo.simplewin.cn'
).replace(/\/$/, '')

const DEMO_CASE_IDS = new Set(['case_svc_demo_completed', 'case_001', 'case_003'])

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function fetchJson(path, { method = 'GET', acceptStatus = [200] } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  const res = await fetch(url, {
    method,
    headers: { Accept: 'application/json' },
    redirect: 'manual',
  })
  const text = await res.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch (_) {
    body = null
  }
  return { url, status: res.status, ok: acceptStatus.includes(res.status), body, text, headers: res.headers }
}

async function fetchText(path, { acceptStatus = [200] } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  const res = await fetch(url, { redirect: 'follow' })
  const text = await res.text()
  return { url, status: res.status, ok: acceptStatus.includes(res.status), text }
}

async function step(name, fn) {
  process.stdout.write(`· ${name} ... `)
  await fn()
  console.log('OK')
}

async function main() {
  console.log(`[smoke:prod] BASE ${BASE}`)
  const failures = []

  await step('health', async () => {
    const { ok, body, status, text } = await fetchJson('/api/v1/health')
    assert(ok && body, `health 非 JSON 或状态异常 HTTP ${status}: ${String(text).slice(0, 120)}`)
    assert(body.code === 0 || body.data?.ok === true, `health code 异常: ${JSON.stringify(body).slice(0, 200)}`)
    const data = body.data || body
    assert(data.ok === true, 'health.data.ok != true')
    assert(data.db === 'up', `health.data.db=${data.db}`)
  })

  await step('H5 首页', async () => {
    const { ok, status, text } = await fetchText('/', { acceptStatus: [200] })
    assert(ok, `首页 HTTP ${status}`)
    assert(/辙见|zhejian/i.test(text), '首页缺少品牌文案')
  })

  await step('H5 案例列表页', async () => {
    const { ok, status, text } = await fetchText('/case/', { acceptStatus: [200] })
    assert(ok, `/case/ HTTP ${status}`)
    assert(text.includes('公开案例') || text.includes('app'), '案例列表页结构异常')
  })

  await step('运营后台入口', async () => {
    const { status } = await fetchText('/admin/', { acceptStatus: [200, 301, 302] })
    assert([200, 301, 302].includes(status), `/admin/ HTTP ${status}`)
  })

  let caseList = []
  await step('公开案例 API 列表', async () => {
    const { ok, body, status } = await fetchJson('/api/v1/user/cases?limit=50')
    assert(ok && body?.code === 0, `GET /user/cases 失败 HTTP ${status}`)
    caseList = body.data?.list || body.data || []
    assert(Array.isArray(caseList), 'cases.list 不是数组')
  })

  await step('列表项均可打开详情（无空壳案例）', async () => {
    if (!caseList.length) {
      console.log('(空列表，跳过详情抽查)')
      return
    }
    for (const item of caseList) {
      assert(item.id, '列表项缺 id')
      const detail = await fetchJson(`/api/v1/user/cases/${encodeURIComponent(item.id)}`)
      assert(
        detail.ok && detail.body?.code === 0 && detail.body?.data?.id,
        `案例 ${item.id}「${item.title || ''}」详情不可用: ${JSON.stringify(detail.body || {}).slice(0, 160)}`
      )

      const redirect = await fetchJson(
        `/api/v1/public/h5/case-redirect?id=${encodeURIComponent(item.id)}`,
        { acceptStatus: [301, 302] }
      )
      const loc = redirect.headers?.get?.('location') || ''
      assert(
        redirect.ok && loc,
        `案例 ${item.id} H5 跳转失败 HTTP ${redirect.status}: ${JSON.stringify(redirect.body || {}).slice(0, 160)}`
      )
    }
  })

  await step('生产不应出现演示兜底案例', async () => {
    const demoHits = caseList.filter((c) => DEMO_CASE_IDS.has(c.id))
    if (BASE.includes('geo.simplewin.cn') && !BASE.includes('staging')) {
      assert(
        demoHits.length === 0,
        `生产列表含演示案例: ${demoHits.map((c) => c.id).join(', ')}（应关闭 CONTENT_PUBLIC_CASE_FALLBACK / 重启 API）`
      )
    } else if (demoHits.length) {
      console.log(`(预发/非生产出现演示案例 ${demoHits.map((c) => c.id).join(', ')}，已记录)`)
    }
  })

  await step('用户首页聚合 API', async () => {
    const { ok, body, status } = await fetchJson('/api/v1/user/home')
    assert(ok && body?.code === 0, `GET /user/home 失败 HTTP ${status}`)
  })

  console.log(`[smoke:prod] ✅ 全部通过（案例数=${caseList.length}）`)
}

main().catch((err) => {
  console.error(`\n[smoke:prod] ❌ ${err.message}`)
  process.exit(1)
})
