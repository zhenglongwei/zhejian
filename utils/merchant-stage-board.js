/**
 * 节点详情页的展示。只排已有记录，不编分数、工序和试车结论。
 */
const { FINDING_RESULT } = require('../constants/service-flow-nodes')
const { buildMerchantAlbumOverview } = require('./merchant-album-overview')

const STAGES = [
  { key: 'intake', title: '接车建档', short: '接车' },
  { key: 'inspect', title: '全面检测', short: '检测' },
  { key: 'quote', title: '首次报价', short: '报价' },
  { key: 'work', title: '维修施工', short: '施工' },
  { key: 'finish', title: '完工交车', short: '交车' },
]

function stageKeyOf(bucketKey) {
  const key = String(bucketKey || '')
  if (key === 'intake' || key === 'inspect' || key === 'finish') return key
  if (key.startsWith('quote')) return 'quote'
  if (key.startsWith('work')) return 'work'
  return ''
}

function imagesOf(node) {
  const list = node && Array.isArray(node.previewImages) ? node.previewImages : []
  return list
    .map((img) => {
      if (typeof img === 'string') return { url: img, caption: '' }
      return {
        url: String((img && img.url) || ''),
        caption: String((img && (img.caption || img.partName)) || ''),
      }
    })
    .filter((img) => img.url)
}

function adviceOf(node) {
  const suggestions = node && node.aiReview && node.aiReview.suggestions
  if (!Array.isArray(suggestions)) return ''
  for (let i = 0; i < suggestions.length; i += 1) {
    const item = suggestions[i]
    if (typeof item === 'string' && item.trim()) return item.trim()
    const text = String((item && (item.body || item.text || item.title)) || '').trim()
    if (text && !(item && item.applied)) return text
  }
  return ''
}

function findingsOf(node) {
  const payload = node && node.document && node.document.payload
  const fromDoc = payload && Array.isArray(payload.findings) ? payload.findings : null
  const draft = node && node.photoDraft && Array.isArray(node.photoDraft.findings) ? node.photoDraft.findings : []
  return fromDoc && fromDoc.length ? fromDoc : draft
}

function docStatus(node) {
  return String((node && node.document && node.document.status) || '')
}

function money(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return ''
  const rounded = Math.round(n * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

function nodesFor(buckets, key) {
  return buckets.filter((bucket) => stageKeyOf(bucket.key) === key).flatMap((bucket) => bucket.nodes || [])
}

function firstNode(list, kinds) {
  return list.find((node) => kinds.indexOf(node.kind) >= 0) || null
}

/** 接车影像检查只认看得见的留证，不把初步诊断当影像结论。 */
function intakeImageNote(node) {
  const images = node && Array.isArray(node.previewImages) ? node.previewImages : []
  const notes = []
  images.forEach((img) => {
    if (!img || typeof img === 'string') return
    const caption = String(img.observation || img.note || '').trim()
    if (!caption || notes.indexOf(caption) >= 0) return
    notes.push(caption)
  })
  return notes.slice(0, 3).join(' ')
}

function maskedPhone(album = {}) {
  const shown = String(album.userPhoneDisplay || album.userPhone || '').trim()
  const masked = shown.match(/^(\d{3})\*+(\d{4})$/)
  if (masked) return `${masked[1]} **** ${masked[2]}`
  if (/^\d{11}$/.test(shown)) return `${shown.slice(0, 3)} **** ${shown.slice(7)}`
  return shown
}

function intakeRecord(nodes, album = {}) {
  const photo = firstNode(nodes, ['intake', 'intake_inspection'])
  const draft = (photo && photo.photoDraft) || {}
  const all = imagesOf(photo)
  const odo = String(draft.odometerUrl || '').trim()
  const photos = []
  const seen = {}
  const pushPhoto = (url, caption) => {
    const clean = String(url || '').trim()
    const key = clean.replace(/[?#].*$/, '')
    if (!key || seen[key]) return
    seen[key] = true
    photos.push({ url: clean, caption: String(caption || '').trim() })
  }
  if (odo) pushPhoto(odo, '仪表里程')
  all.forEach((img) => pushPhoto(img.url, img.caption))
  const results = Array.isArray(draft.intakeResults) ? draft.intakeResults : []
  const reading = (id) => {
    const row = results.find((item) => item && item.category === id)
    return String((row && row.reading) || '').trim()
  }
  const fuel = String(draft.fuelReading || reading('fuel') || '').trim()
  const belongings = reading('belongings')
  const phone = maskedPhone(album)
  const sender = String(album.userName || album.contactName || '').trim()
  const cells = [
    sender ? { label: '送修人', value: sender } : null,
    phone ? { label: '联系电话', value: phone } : null,
    belongings ? { label: '随车物品', value: belongings } : null,
    fuel ? { label: '油量', value: fuel } : null,
  ].filter(Boolean)
  const complaint = String(draft.chiefComplaint || '').trim()
  const advice = intakeImageNote(photo)
  const done = nodes.length > 0 && nodes.every((node) => node && node._done)
  return {
    photos,
    photoCount: all.length || photos.length,
    advice,
    complaint,
    cells,
    confirmed: done ? { title: '接车信息已确认', sub: '' } : null,
    empty: !photos.length && !complaint && !cells.length && !advice,
  }
}

function resultTag(result) {
  if (result === FINDING_RESULT.ACTION) return { tag: '需处理', tone: 'amber' }
  if (result === FINDING_RESULT.WATCH) return { tag: '建议观察', tone: 'blue' }
  return null
}

function inspectRecord(nodes) {
  const report = firstNode(nodes, ['inspection_report'])
  const photo = firstNode(nodes, ['inspection'])
  const rows = findingsOf(report || photo)
  const items = []
  rows.forEach((row) => {
    const tag = resultTag(String((row && row.result) || ''))
    if (!tag) return
    const shots = []
    const images = row && Array.isArray(row.images) ? row.images : []
    images.forEach((img) => {
      const url = String((img && img.url) || (typeof img === 'string' ? img : '') || '')
      if (url) shots.push(url)
    })
    if (!shots.length && row && row.url) shots.push(String(row.url))
    items.push({
      no: String(items.length + 1).padStart(2, '0'),
      name: String((row && (row.partName || row.caption)) || '').trim() || '未命名部位',
      tag: tag.tag,
      tone: tag.tone,
      body: String((row && row.advice) || '').trim(),
      shots: shots.slice(0, 2),
      more: shots.length > 2 ? `查看 ${shots.length} 张照片` : '',
    })
  })
  const action = items.filter((item) => item.tone === 'amber').length
  const watch = items.filter((item) => item.tone === 'blue').length
  const advice = adviceOf(report) || adviceOf(photo)
  return {
    headline: items.length ? `发现 ${items.length} 项异常` : '还没有异常项',
    sub: rows.length ? `已记录 ${rows.length} 项` : '',
    pills: [
      action ? { text: `${action} 项建议立即处理`, tone: 'amber' } : null,
      watch ? { text: `${watch} 项建议观察`, tone: 'blue' } : null,
    ].filter(Boolean),
    items,
    advice,
    previewNodeId: (report && report.id) || (photo && photo.id) || '',
    empty: !items.length && !advice,
  }
}

function quoteRecord(nodes) {
  const quote = nodes.find((node) => node && (node.kind === 'quote_confirm' || node.kind === 'addon_quote_confirm'))
  const payload = (quote && quote.document && quote.document.payload) || {}
  const lines = (Array.isArray(payload.lines) ? payload.lines : [])
    .map((line) => {
      const name = String((line && line.name) || '').trim()
      if (!name) return null
      const brand = String((line && line.brand) || '').trim()
      const amount = money(line.amount)
      return { name, brand, amount: amount ? `¥${amount}` : '' }
    })
    .filter(Boolean)
  const total = lines.reduce((sum, line) => sum + (Number(String(line.amount).replace(/[^\d.]/g, '')) || 0), 0)
  const status = docStatus(quote)
  const confirmed = status === 'confirmed' || status === 'delivered'
  const waiting = status === 'pending_confirm'
  return {
    amount: lines.length ? money(total) || '0' : '',
    note: confirmed ? '车主已确认' : waiting ? '等待确认' : '',
    lines,
    totalText: lines.length ? `合计 ¥${money(total) || '0'}` : '',
    advice: adviceOf(quote),
    owner: confirmed ? { title: '维修方案及报价已确认', sub: '确认凭证已保存' } : null,
    previewNodeId: (quote && quote.id) || '',
    empty: !lines.length && !advice,
  }
}

function workRecord(nodes, addonNodes) {
  const work = firstNode(nodes, ['work'])
  const findings = findingsOf(work)
  const tasks = findings
    .map((row) => {
      const name = String((row && (row.partName || row.caption)) || '').trim()
      if (!name) return null
      const done = Boolean(row && row.result && row.result !== FINDING_RESULT.RECORD)
      return {
        name,
        note: String((row && row.advice) || '').trim(),
        status: done ? '已记录' : '施工中',
        tone: done ? 'green' : 'blue',
      }
    })
    .filter(Boolean)
  const addon = addonNodes.find((node) => node && node.kind === 'addon_quote_confirm' && docStatus(node) !== 'cancelled')
  const addonPayload = (addon && addon.document && addon.document.payload) || {}
  const addonLine = (Array.isArray(addonPayload.lines) ? addonPayload.lines : []).find((line) => String((line && line.name) || '').trim())
  const discovery = (work && work.photoDraft && work.photoDraft.discovery) || addonPayload.discovery || {}
  const faultName = String((addonLine && addonLine.name) || discovery.note || '').trim()
  const faultAmount = money(addonLine && addonLine.amount)
  const fault = faultName
    ? {
        title: faultName,
        body: String((addonLine && addonLine.note) || discovery.note || '').trim(),
        amount: faultAmount ? `¥${faultAmount}` : '',
      }
    : null
  const count = imagesOf(work).length
  return {
    headline: tasks.length ? '施工记录' : '还没有施工记录',
    sub: count ? `${count} 张现场照片` : '',
    tasks,
    fault,
    previewNodeId: (work && work.id) || '',
    empty: !tasks.length && !fault && !count,
  }
}

function finishRecord(nodes, intakeImages) {
  const report = firstNode(nodes, ['repair_report'])
  const photos = firstNode(nodes, ['delivery_photos'])
  const payload = (report && report.document && report.document.payload) || {}
  const status = docStatus(report)
  const confirmed = status === 'confirmed' || status === 'delivered'
  const waiting = status === 'pending_confirm'
  const after = imagesOf(photos)
  const before = intakeImages.slice(0, 1)
  const warranty = String(payload.warrantyPeriod || '').trim()
  const sent = confirmed || waiting
  return {
    headline: confirmed ? '车主已确认交车' : waiting ? '等待车主确认' : '还没有交车报告',
    sub: String(payload.conclusion || '').trim(),
    before: before[0] ? { url: before[0].url, caption: before[0].caption || '维修前' } : null,
    after: after[0] ? { url: after[0].url, caption: after[0].caption || '维修后' } : null,
    warranty,
    steps: [
      { no: '1', title: '商家提交交车报告', sub: sent ? '已提交' : '还没提交', done: sent, muted: false },
      { no: '2', title: '等待车主确认', sub: confirmed ? '已确认' : '确认后本单完成', done: confirmed, muted: !sent },
      { no: '3', title: '邀请公开案例', sub: '公开前会先脱敏', done: false, muted: !confirmed },
    ],
    previewNodeId: (report && report.id) || (photos && photos.id) || '',
    empty: !sent && !after.length && !warranty,
  }
}

function buildMerchantStageBoard(album = {}, flowNodes = [], selectedKey = 'intake') {
  const overview = buildMerchantAlbumOverview(album, flowNodes || [])
  const buckets = []
  ;(overview.rows || []).forEach((row) => {
    const key = stageKeyOf(row.key)
    if (!key) return
    const found = buckets.find((item) => item.key === key)
    const nodeIds = String(row.nodeId || '')
    if (found) {
      if (nodeIds) found.nodeIds.push(nodeIds)
      return
    }
    buckets.push({ key, state: row.state, nodeIds: nodeIds ? [nodeIds] : [] })
  })
  const byId = {}
  ;(flowNodes || []).forEach((node) => {
    if (node && node.id) byId[node.id] = node
  })
  const grouped = { intake: [], inspect: [], quote: [], work: [], finish: [] }
  ;(flowNodes || []).forEach((node) => {
    const key = stageKeyOf(
      node.kind === 'intake' || node.kind === 'intake_inspection'
        ? 'intake'
        : node.kind === 'inspection' || node.kind === 'inspection_report'
          ? 'inspect'
          : node.kind === 'quote_confirm'
            ? 'quote'
            : node.kind === 'addon_quote_confirm'
              ? 'quote'
              : node.kind === 'work'
                ? 'work'
                : node.kind === 'delivery_photos' || node.kind === 'repair_report'
                  ? 'finish'
                  : '',
    )
    if (!grouped[key]) return
    const bucket = buckets.find((item) => item.key === key)
    grouped[key].push({ ...node, _done: bucket ? bucket.state === 'done' : false })
  })
  const selected = STAGES.some((item) => item.key === selectedKey) ? selectedKey : 'intake'
  const selectedIndex = STAGES.findIndex((item) => item.key === selected)
  const albumState = (buckets.find((item) => item.key === selected) || {}).state || 'todo'
  const intakeImages = imagesOf(firstNode(grouped.intake, ['intake', 'intake_inspection']))
  const record = {
    intake: selected === 'intake' ? intakeRecord(grouped.intake, album) : null,
    inspect: selected === 'inspect' ? inspectRecord(grouped.inspect) : null,
    quote: selected === 'quote' ? quoteRecord(grouped.quote.filter((node) => node.kind === 'quote_confirm')) : null,
    work: selected === 'work' ? workRecord(grouped.work, grouped.quote) : null,
    finish: selected === 'finish' ? finishRecord(grouped.finish, intakeImages) : null,
  }
  const current = record[selected] || {}
  const vehicle = album.vehicle || {}
  const year = String(vehicle.modelYear || vehicle.year || '').trim()
  const mileage = Number(vehicle.mileage)
  const mileageLabel =
    selected === 'intake' || !Number.isFinite(mileage) || mileage <= 0
      ? ''
      : `${mileage.toLocaleString('zh-CN')} km`
  const spec = [overview.vehicleName, year ? `${year}` : '', mileageLabel]
    .filter(Boolean)
    .join(' · ')
  return {
    title: (STAGES[selectedIndex] || STAGES[0]).title,
    selectedKey: selected,
    state: albumState,
    previewNodeId: current.previewNodeId || (grouped[selected][0] && grouped[selected][0].id) || '',
    vehicle: {
      plate: overview.plate,
      line: spec,
      pill: overview.pill && overview.pill.text ? overview.pill.text : '进行中',
    },
    tabs: STAGES.map((item, index) => ({
      key: item.key,
      short: item.short,
      index: index + 1,
      mark: index < selectedIndex ? 'before' : index === selectedIndex ? 'on' : 'after',
      state: (buckets.find((bucket) => bucket.key === item.key) || {}).state || 'todo',
    })),
    ...record,
  }
}

module.exports = {
  STAGES,
  stageKeyOf,
  buildMerchantStageBoard,
}
