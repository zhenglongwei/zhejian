/**
 * 车主服务进度页的排版。单据仍是原来的车主文书，这里只决定抬头、横排和摘要。
 */

function dottedPlate(plate) {
  const raw = String(plate || '').replace(/[·.\s]/g, '')
  if (!raw || raw.includes('*') || raw.length < 3) return String(plate || '').trim() || '未登记车牌'
  return `${raw.slice(0, 2)}·${raw.slice(2)}`
}

function clip(text, max = 36) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim()
  if (!raw || raw.length <= max) return raw
  return `${raw.slice(0, max)}…`
}

function moneyText(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return ''
  const rounded = Math.round(n * 100) / 100
  const body = Number.isInteger(rounded)
    ? rounded.toLocaleString('zh-CN')
    : rounded.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `¥${body}`
}

function namesOf(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => String((row && (row.name || row.partName)) || '').trim())
    .filter(Boolean)
    .slice(0, 2)
}

function summaryOf(doc) {
  if (!doc || doc.locked) return '还没到这一步'
  if (doc.cancelled) return String(doc.statusLabel || '已取消')
  const kind = String(doc.kind || '')
  if (kind === 'intake' || kind === 'intake_inspection') {
    const complaint = clip(doc.chiefComplaint)
    if (complaint) return complaint
    const count = Array.isArray(doc.photos) ? doc.photos.length : 0
    return count ? `入店照片 ${count} 张` : '接车信息已记下'
  }
  if (kind === 'inspection_report') {
    const count = Array.isArray(doc.findings) ? doc.findings.length : 0
    return count ? `${count} 项检查发现` : '检查发现已写好'
  }
  if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
    const amount = moneyText(doc.totalAmount)
    const word = doc.needsConfirm ? '待你确认' : String(doc.statusLabel || '已确认')
    return [amount, word].filter(Boolean).join(' · ')
  }
  if (kind === 'work') {
    const names = namesOf(doc.items && doc.items.length ? doc.items : doc.workItems)
    return names.join('、') || '施工记录'
  }
  if (kind === 'repair_report') {
    return doc.needsConfirm ? '待你确认交车' : '交车与质保'
  }
  return String(doc.statusLabel || '')
}

function tileOf(doc) {
  if (!doc || doc.locked) {
    return { label: '还没到', tone: 'muted' }
  }
  if (doc.needsConfirm) return { label: '待确认', tone: 'live' }
  return { label: String(doc.statusLabel || '可查看'), tone: 'ok' }
}

function rowState(doc) {
  if (!doc || doc.locked) return 'todo'
  if (doc.needsConfirm || doc.stepState === 'current') return 'current'
  return 'done'
}

function pillOf(label) {
  const text = String(label || '').trim() || '进行中'
  if (text.indexOf('待确认') >= 0) return { text, tone: 'amber' }
  if (text === '已完工' || text === '已交车') return { text, tone: 'green' }
  return { text, tone: 'blue' }
}

function vehicleBits(detail = {}) {
  const vehicle = detail.vehicle || {}
  const plate = dottedPlate(vehicle.plateDisplay || vehicle.plate || '')
  const name = [vehicle.brand, vehicle.series, vehicle.model]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
  const year = String(vehicle.modelYear || vehicle.year || '').trim()
  const mileageRaw = vehicle.mileage != null ? String(vehicle.mileage).trim() : ''
  const mileage = mileageRaw ? (mileageRaw.indexOf('km') >= 0 ? mileageRaw : `${mileageRaw} km`) : ''
  const spec = [year, mileage].filter(Boolean).join(' · ')
  const store = String(
    detail.storeName || (detail.store && detail.store.name) || '',
  ).trim()
  return {
    plate,
    vehicleName: name || String(detail.vehicleDisplay || '').trim() || '车辆',
    spec,
    meta: store,
  }
}

function buildOwnerProgressBoard(detail = {}, docs = []) {
  const list = Array.isArray(docs) ? docs : []
  const flow = detail.ownerFlow || {}
  const bits = vehicleBits(detail)
  const pending = list.find((doc) => doc && doc.needsConfirm && !doc.locked) || null
  const tiles = list.map((doc) => {
    const face = tileOf(doc)
    return {
      id: String((doc && doc.id) || ''),
      title: String((doc && doc.title) || ''),
      label: face.label,
      tone: face.tone,
      locked: Boolean(doc && doc.locked),
    }
  })
  const rows = list.map((doc, index) => ({
    id: String((doc && doc.id) || ''),
    index: index + 1,
    title: String((doc && doc.title) || ''),
    mark: doc && doc.locked ? '还没到' : String((doc && doc.statusLabel) || '查看'),
    detail: summaryOf(doc),
    state: rowState(doc),
    locked: Boolean(doc && doc.locked),
  }))
  return {
    plate: bits.plate,
    vehicleName: bits.vehicleName,
    spec: bits.spec,
    meta: bits.meta || String((list.find((doc) => doc && doc.storeName) || {}).storeName || ''),
    pill: pillOf(flow.progressLabel || detail.progressLabel),
    deliveredCount: list.filter((doc) => doc && !doc.locked).length,
    protocol: pending ? String(pending.confirmCopy || '').trim() : '',
    pendingId: pending ? String(pending.id || '') : '',
    tiles,
    rows,
  }
}

module.exports = {
  buildOwnerProgressBoard,
  summaryOf,
}
