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
    deliveryPending: false,
    repairDone,
    publicOnSite: false,
    completedAt: item.completedAt || '',
    updatedAt: item.updatedAt || '',
  }
}

function countText(n) {
  const value = Math.max(0, Number(n) || 0)
  return String(value)
}

function timeOf(iso) {
  const ms = new Date(iso || '').getTime()
  return Number.isFinite(ms) ? ms : 0
}

function dottedPlate(plate) {
  const raw = String(plate || '').replace(/[·.\s]/g, '')
  if (!raw || raw === '未登记车牌' || raw.length < 3) return raw || '未登记车牌'
  return `${raw.slice(0, 2)}·${raw.slice(2)}`
}

function clockText(date) {
  const h = date.getHours()
  const m = date.getMinutes()
  return `${h < 10 ? `0${h}` : h}:${m < 10 ? `0${m}` : m}`
}

function whenText(iso, now) {
  const ms = timeOf(iso)
  if (!ms) return ''
  const date = new Date(ms)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ms >= start) return `今天 ${clockText(date)}`
  if (ms >= start - 86400000) return '昨天'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function buildSearchText(item, vehicle, hub, titleLine) {
  return [
    item.albumId,
    titleLine,
    item.serviceName,
    item.storeName,
    item.userPhone,
    item.userPhoneDisplay,
    item.vehicleDisplay,
    vehicle.brand,
    vehicle.series,
    vehicle.plate,
    vehicle.plateDisplay,
    vehicle.vin,
    vehicle.modelYear,
    vehicle.modelName,
    hub.modelLine,
  ]
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')
}

function presentAlbumCard(item = {}, now = new Date()) {
  const card = toCard(item)
  const hub = item.hubCard || {}
  const vehicle = item.vehicle || {}
  const car = [vehicle.brand, vehicle.series].map((part) => String(part || '').trim()).filter(Boolean).join(' ')
  const service = String(hub.serviceName || item.serviceName || '').trim()
  const serviceOk = service && service !== '服务留档' && service !== '—'
  const titleLine = [car, serviceOk ? service : ''].filter(Boolean).join(' · ') || card.modelLine
  const when = whenText(card.repairDone ? card.completedAt || card.updatedAt : card.updatedAt, now)
  let metaLine = when
  if (!card.repairDone && !card.quotePending) {
    const started = timeOf(hub.createdAt || item.createdAt)
    const hours = started ? (now.getTime() - started) / 3600000 : 0
    let duration = ''
    if (hours > 0.2 && hours < 48) {
      duration = hours < 10 ? `已进行 ${Math.round(hours * 10) / 10} 小时` : `已进行 ${Math.round(hours)} 小时`
    }
    metaLine = [when, duration].filter(Boolean).join(' · ')
  }
  return {
    ...card,
    plate: dottedPlate(card.plate),
    titleLine,
    searchText: buildSearchText(item, vehicle, hub, titleLine),
    metaLine,
    imageCount: Number(item.imageCount) || 0,
    coverUrl:
      typeof item.coverUrl === 'string'
        ? item.coverUrl
        : (item.coverUrl && item.coverUrl.url) || '',
    thumbTone: card.repairDone || card.quotePending ? 'gray' : 'blue',
    hostedSiteUrl: item.hostedSiteUrl || '',
    hasOwner: Boolean(item.hasOwner),
    status: item.status || '',
    reviewId: item.reviewId || '',
    reviewStatus: item.reviewStatus || 'not_reviewed',
    reviewScore: Number(item.reviewScore) || 0,
  }
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return []
  let pastFrontier = false
  return steps.map((step) => {
    const state = step && step.state
    if (pastFrontier) return { ...step, state: 'todo' }
    if (state === 'current') {
      pastFrontier = true
      return { ...step, state: 'current' }
    }
    if (state === 'done') return { ...step, state: 'done' }
    pastFrontier = true
    return { ...step, state: 'todo' }
  })
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
    progress: Number(hub.progress) || 0,
    steps: normalizeSteps(hub.steps),
    quotePending: Boolean(hub.quotePending),
    deliveryPending: Boolean(hub.deliveryPending),
    repairDone: Boolean(hub.repairDone),
    publicOnSite: Boolean(hub.publicOnSite),
    completedAt: hub.completedAt || item.completedAt || '',
    updatedAt: hub.updatedAt || item.updatedAt || '',
  }
}

function buildWorkbenchHome(list, now = new Date()) {
  const cards = (list || []).filter((item) => item && item.albumId).map(toCard)
  const active = cards.filter((card) => !card.repairDone)
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
    monthCountText: countText(monthDone.length),
    monthPublicCountText: countText(monthPublic),
    heroCount: active.length,
    featured,
    compact,
    hasAlbums: cards.length > 0,
  }
}

module.exports = {
  buildWorkbenchHome,
  toCard,
  presentAlbumCard,
}
