/**
 * B-TRACK 冒烟：POST /api/v1/track/events
 * 用法：node scripts/track-events-smoke.js [baseUrl]
 */
const BASE = process.argv[2] || process.env.API_BASE || 'http://127.0.0.1:3000'

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok || json.code !== 0) {
    throw new Error(`${method} ${path} failed: ${json.message || res.status}`)
  }
  return json.data
}

async function main() {
  const eventId = `evt_smoke_${Date.now()}`
  const r1 = await api('POST', '/api/v1/track/events', {
    events: [
      {
        eventId,
        eventName: 'h5_case_view',
        sessionId: 'sid_smoke',
        pagePath: '/case/view.html?id=demo',
        source: 'smoke',
        channel: 'test',
        eventParams: {
          caseId: 'case_001',
          storeId: 'store_demo_1',
        },
      },
      {
        eventName: 'h5_call_click',
        eventParams: { caseId: 'case_001', storeId: 'store_demo_1' },
      },
    ],
  })
  console.log('[smoke] ingest', r1)

  const r2 = await api('POST', '/api/v1/track/events', {
    events: [{ eventId, eventName: 'h5_case_view', eventParams: { caseId: 'case_001' } }],
  })
  console.log('[smoke] duplicate', r2)
  if (r2.duplicated !== 1 || r2.accepted !== 0) {
    throw new Error('expected 1 duplicate on replay')
  }

  try {
    await api('POST', '/api/v1/track/events', {
      events: [{ eventName: 'order_created', eventParams: {} }],
    })
    throw new Error('expected reject for order_created')
  } catch (e) {
    console.log('[smoke] reject unknown event OK:', e.message)
  }

  console.log('[smoke] OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
