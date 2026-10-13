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

function reviewScoreText(line) {
  const matched = String(line || '').match(/^(\d+(?:\.\d+)?)\s*分/)
  return matched ? matched[1] : ''
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
  if (card.repairDone) {
    const score = reviewScoreText(item.reviewLine)
    metaLine = [when, score ? `车主评价 ${score} 分` : ''].filter(Boolean).join(' · ')
  } else if (!card.quotePending) {
    const started = timeOf(hub.createdAt || item.createdAt)
    const hours = started ? (now.getTime() - started) / 3600000 : 0
    let duration = ''
    if (hours > 0.2 && hours < 48) {
      duration = hours < 10 ? `已进行 ${Math.round(hours * 10) / 10} 小时` : `已进行 ${Math.round(hours)} 小时`
    }
    metaLine = [when, duration].filter(Boolean).join(' · ')
  }
  const chips = []
  if (card.quotePending && !card.repairDone) chips.push('等待确认')
  if (card.repairDone) chips.push('已确认报告')
  if (card.publicOnSite) chips.push('可公开')
  return {
    ...card,
    plate: dottedPlate(card.plate),
    titleLine,
    metaLine,
    chips,
    imageCount: Number(item.imageCount) || 0,
    thumbTone: card.repairDone ? 'ink' : card.quotePending ? 'gray' : 'blue',
    hostedSiteUrl: item.hostedSiteUrl || '',
    hasOwner: Boolean(item.hasOwner),
    status: item.status || '',
  }
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
  presentAlbumCard,
}
