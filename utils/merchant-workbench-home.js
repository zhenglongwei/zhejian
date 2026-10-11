const { SERVICE_ALBUM_REPAIR_DONE_STATUSES } = require('../constants/service-album-status')

const STEP_LABELS = ['接车', '检测', '报价', '施工', '完工']

function privatePlate(vehicle = {}, fallback = '') {
  const full = String(vehicle.plate || '').trim()
  if (full && !/\*{2,}/.test(full)) return full
  const display = String(fallback || vehicle.plateDisplay || '').trim()
  if (display && !/\*{2,}/.test(display)) return display
  return full || display || '未登记车牌'
}

function fallbackHub(item = {}) {
  const repairDone = SERVICE_ALBUM_REPAIR_DONE_STATUSES.includes(item.status)
  const vehicle = item.vehicle || {}
  const modelLine = [vehicle.brand, vehicle.series, vehicle.modelYear]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' · ')
  return {
    plate: privatePlate(vehicle),
    modelLine: modelLine || String(item.serviceName || '').trim(),
    serviceName: String(item.serviceName || '').trim(),
    pill: repairDone ? '已交车' : '进行中',
    pillTone: repairDone ? 'green' : 'blue',
    progress: repairDone ? 100 : 12,
    steps: STEP_LABELS.map((label, index) => ({
      label,
      state: repairDone ? 'done' : index === 0 ? 'current' : 'todo',
    })),
    quotePending: false,
    repairDone,
    publicOnSite: false,
    completedAt: item.completedAt || '',
    updatedAt: item.updatedAt || '',
  }
}

function padCount(n) {
  const value = Math.max(0, Number(n) || 0)
  return value < 10 ? `0${value}` : String(value)
}

function timeOf(iso) {
  const ms = new Date(iso || '').getTime()
  return Number.isFinite(ms) ? ms : 0
}

const MARK_ICON = {
  blue: '/assets/mch/car-blue.png',
  amber: '/assets/mch/clock-amber.png',
  green: '/assets/mch/check-green.png',
}

function toCard(item = {}) {
  const hub = item.hubCard || fallbackHub(item)
  const modelLine = String(hub.modelLine || item.serviceName || '').trim()
  let subLine = modelLine
  if (hub.quotePending && !hub.repairDone) {
    subLine = modelLine ? `${modelLine} · 等待确认报价` : '等待确认报价'
  }
  return {
    albumId: item.albumId,
    plate: privatePlate(item.vehicle, hub.plate),
    modelLine,
    subLine,
    pill: hub.pill || '进行中',
    pillTone: hub.pillTone || 'blue',
    markIcon: MARK_ICON[hub.pillTone] || MARK_ICON.blue,
    progress: Number(hub.progress) || 0,
    steps: Array.isArray(hub.steps) ? hub.steps : [],
    quotePending: Boolean(hub.quotePending),
    repairDone: Boolean(hub.repairDone),
    publicOnSite: Boolean(hub.publicOnSite),
    completedAt: hub.completedAt || item.completedAt || '',
    updatedAt: hub.updatedAt || item.updatedAt || '',
  }
}

function buildWorkbenchHome(list, now = new Date()) {
  const cards = (list || []).filter((item) => item && item.albumId).map(toCard)
  const active = cards.filter((card) => !card.repairDone)
  const pending = active.filter((card) => card.quotePending)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const monthDone = cards.filter(
    (card) => card.repairDone && timeOf(card.completedAt || card.updatedAt) >= monthStart,
  )
  const monthPublic = monthDone.filter((card) => card.publicOnSite).length
  const featured = active.find((card) => card.pill === '施工中') || active[0] || null
  const rest = cards.filter((card) => !featured || card.albumId !== featured.albumId)
  const compact = []
  const push = (card) => {
    if (compact.length >= 2) return
    if (compact.some((row) => row.albumId === card.albumId)) return
    compact.push(card)
  }
  rest.filter((card) => card.quotePending).forEach(push)
  rest.filter((card) => card.repairDone).forEach(push)
  rest.forEach(push)
  return {
    activeCountText: padCount(active.length),
    pendingCountText: padCount(pending.length),
    monthCountText: padCount(monthDone.length),
    monthPublicText: monthPublic > 0 ? `已公开 ${monthPublic}` : '',
    pendingHint: pending.length ? '报价未确认' : '',
    heroCount: active.length,
    featured,
    compact,
    hasAlbums: cards.length > 0,
  }
}

module.exports = {
  buildWorkbenchHome,
  toCard,
}
