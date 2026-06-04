const { randomUUID } = require('crypto')
const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const {
  TRACK_EVENT_NAMES,
  TRACK_PARAM_BLOCKLIST,
  TRACK_MAX_EVENTS_PER_REQUEST,
  TRACK_MAX_PARAM_KEYS,
  TRACK_MAX_STRING_LEN,
} = require('../constants/track')

const merchantIdCache = new Map()

function clipString(value, max = TRACK_MAX_STRING_LEN) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.length > max ? text.slice(0, max) : text
}

function sanitizeEventParams(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  let count = 0
  for (const [key, value] of Object.entries(raw)) {
    if (count >= TRACK_MAX_PARAM_KEYS) break
    const k = String(key).trim()
    if (!k || TRACK_PARAM_BLOCKLIST.has(k)) continue
    if (typeof value === 'string') {
      out[k] = clipString(value, 256)
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out[k] = value
    } else if (typeof value === 'boolean') {
      out[k] = value
    } else if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      out[k] = sanitizeEventParams(value)
    }
    count += 1
  }
  return out
}

async function resolveMerchantIdForStore(storeId) {
  const id = clipString(storeId, 64)
  if (!id) return ''
  if (merchantIdCache.has(id)) return merchantIdCache.get(id)
  const store = await prisma.store.findUnique({
    where: { id },
    select: { merchantId: true },
  })
  const merchantId = store?.merchantId || ''
  merchantIdCache.set(id, merchantId)
  return merchantId
}

async function enrichEventParams(params) {
  const next = { ...params }
  const storeId = next.storeId || next.store_id || ''
  if (storeId && !next.merchantId && !next.merchant_id) {
    const merchantId = await resolveMerchantIdForStore(storeId)
    if (merchantId) next.merchantId = merchantId
  }
  if (next.case_id && !next.caseId) next.caseId = next.case_id
  if (next.store_id && !next.storeId) next.storeId = next.store_id
  if (next.service_item_id && !next.serviceItemId) {
    next.serviceItemId = next.service_item_id
  }
  return next
}

function normalizeIncomingEvent(raw = {}, auth = {}) {
  const eventName = clipString(raw.eventName || raw.event_name, 64)
  if (!TRACK_EVENT_NAMES.has(eventName)) {
    const err = new Error(`不支持的事件: ${eventName || '(空)'}`)
    err.status = 400
    throw err
  }

  const eventId = clipString(raw.eventId || raw.event_id, 64) || `evt_${randomUUID().replace(/-/g, '')}`

  return {
    id: newId('trk'),
    eventId,
    eventName,
    userId: clipString(raw.userId || auth.userId, 64),
    role: clipString(raw.role || (auth.userId ? 'user' : 'guest'), 32) || 'guest',
    sessionId: clipString(raw.sessionId || raw.session_id, 64),
    pagePath: clipString(raw.pagePath || raw.page_path, TRACK_MAX_STRING_LEN),
    referrer: clipString(raw.referrer, TRACK_MAX_STRING_LEN),
    source: clipString(raw.source || raw.utm_source, 128),
    channel: clipString(raw.channel, 64),
    city: clipString(raw.city, 64),
    eventParams: sanitizeEventParams(raw.eventParams || raw.event_params || {}),
  }
}

async function ingestTrackingEvents(payload = {}, auth = {}) {
  const list = Array.isArray(payload.events)
    ? payload.events
    : payload.eventName || payload.event_name
      ? [payload]
      : []

  if (!list.length) {
    const err = new Error('缺少 events')
    err.status = 400
    throw err
  }
  if (list.length > TRACK_MAX_EVENTS_PER_REQUEST) {
    const err = new Error(`单次最多上报 ${TRACK_MAX_EVENTS_PER_REQUEST} 条事件`)
    err.status = 400
    throw err
  }

  const rows = []
  for (const item of list) {
    const row = normalizeIncomingEvent(item, auth)
    row.eventParams = await enrichEventParams(row.eventParams)
    rows.push(row)
  }

  const eventIds = rows.map((r) => r.eventId)
  const existing = await prisma.eventTrackingLog.findMany({
    where: { eventId: { in: eventIds } },
    select: { eventId: true },
  })
  const seen = new Set(existing.map((e) => e.eventId))
  const toCreate = rows.filter((r) => !seen.has(r.eventId))

  if (toCreate.length) {
    await prisma.eventTrackingLog.createMany({ data: toCreate })
  }

  return {
    accepted: toCreate.length,
    duplicated: rows.length - toCreate.length,
    total: rows.length,
  }
}

module.exports = {
  ingestTrackingEvents,
  sanitizeEventParams,
}
