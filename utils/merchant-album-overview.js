/**
 * 商家打开相册后的详情页。存储仍是原来的记录，这里只排版。
 */
const { isFlowNodeDone } = require('./service-flow-progress')

function dottedPlate(plate) {
  const raw = String(plate || '').replace(/[·.\s]/g, '')
  if (!raw || raw.includes('*') || raw.length < 3) return String(plate || '').trim() || '未登记车牌'
  return `${raw.slice(0, 2)}·${raw.slice(2)}`
}

function plateOf(vehicle = {}) {
  const full = String(vehicle.plate || '').trim()
  if (full && !full.includes('*')) return dottedPlate(full)
  return dottedPlate(vehicle.plateDisplay || full)
}

function phoneText(display) {
  const raw = String(display || '').trim()
  const matched = raw.match(/^(\d{3})\*+(\d{4})$/)
  if (!matched) return raw
  return `${matched[1]} **** ${matched[2]}`
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

function quoteAmount(node) {
  const lines =
    node && node.document && node.document.payload && Array.isArray(node.document.payload.lines)
      ? node.document.payload.lines
      : []
  const total = lines.reduce((sum, line) => sum + (Number(line && line.amount) || 0), 0)
  return moneyText(total)
}

function findingsOf(nodes) {
  const report = nodes.find((node) => node && node.kind === 'inspection_report')
  const fromDoc = report && report.document && report.document.payload && report.document.payload.findings
  if (Array.isArray(fromDoc) && fromDoc.length) return fromDoc
  const inspection = nodes.find((node) => node && node.kind === 'inspection')
  const fromDraft = inspection && inspection.photoDraft && inspection.photoDraft.findings
  return Array.isArray(fromDraft) ? fromDraft : []
}

function adviceLine(node) {
  const diagnosis = String((node && node.intakeAdvice && node.intakeAdvice.diagnosis) || '').trim()
  if (diagnosis) return diagnosis
  const suggestions = node && node.aiReview && node.aiReview.suggestions
  if (!Array.isArray(suggestions) || !suggestions.length) return ''
  const first = suggestions[0]
  if (typeof first === 'string') return first.trim()
  return String((first && (first.body || first.text || first.title)) || '').trim()
}

function shotsOf(node) {
  const images = node && Array.isArray(node.previewImages) ? node.previewImages : []
  return images
    .map((img) => {
      if (typeof img === 'string') return { url: img, caption: '' }
      return {
        url: String((img && img.url) || ''),
        caption: String((img && (img.caption || img.partName)) || ''),
      }
    })
    .filter((shot) => shot.url)
    .slice(0, 2)
}

function groupTitle(kind, quoteIndex) {
  if (kind === 'intake' || kind === 'intake_inspection') return { key: 'intake', title: '接车建档' }
  if (kind === 'inspection' || kind === 'inspection_report') return { key: 'inspect', title: '全面检测' }
  if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
    return { key: `quote:${quoteIndex}`, title: quoteIndex === 0 ? '首次报价' : '补充报价' }
  }
  if (kind === 'work') return { key: `work:${quoteIndex}`, title: '维修施工' }
  if (kind === 'delivery_photos' || kind === 'repair_report') return { key: 'finish', title: '完工交车' }
  return null
}

function addonQuoteHasProcess(node) {
  if (!node) return false
  const addon = node.kind === 'addon_quote_confirm' || String(node.insertedReason || '') === 'addon'
  if (!addon) return node.kind === 'quote_confirm'
  const status = String((node.document && node.document.status) || '')
  if (status === 'pending_confirm' || status === 'confirmed' || status === 'delivered' || status === 'cancelled') {
    return true
  }
  const payload = (node.document && node.document.payload) || {}
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  if (lines.some((row) => String((row && row.name) || '').trim())) return true
  const discovery = payload.discovery && typeof payload.discovery === 'object' ? payload.discovery : {}
  const images = Array.isArray(discovery.images) ? discovery.images.filter(Boolean) : []
  return Boolean(images.length || String(discovery.note || '').trim())
}

function bucketOnTimeline(bucket) {
  if (!bucket || !String(bucket.key).startsWith('quote') || bucket.key === 'quote:0') return true
  return (bucket.nodes || []).some((node) => addonQuoteHasProcess(node))
}

function bucketNodes(nodes) {
  const buckets = []
  let quoteCount = 0
  let workCount = 0
  nodes.forEach((node) => {
    const quoteIndex = node.kind === 'work' ? workCount : quoteCount
    const meta = groupTitle(node.kind, quoteIndex)
    if (!meta) return
    if (node.kind === 'quote_confirm' || node.kind === 'addon_quote_confirm') quoteCount += 1
    if (node.kind === 'work') workCount += 1
    const last = buckets[buckets.length - 1]
    if (last && last.key === meta.key) {
      last.nodes.push(node)
      return
    }
    buckets.push({ key: meta.key, title: meta.title, nodes: [node] })
  })
  return buckets
}

function bucketDone(bucket) {
  if (
    bucket &&
    String(bucket.key).startsWith('quote') &&
    bucket.key !== 'quote:0' &&
    !(bucket.nodes || []).some((node) => addonQuoteHasProcess(node))
  ) {
    return true
  }
  return bucket.nodes.every((node) => isFlowNodeDone(node))
}

function docTile(title, node, labels) {
  const docStatus = String((node && node.document && node.document.status) || '')
  let label = '待生成'
  let tone = 'muted'
  if (node && node.status !== 'locked') {
    if (isFlowNodeDone(node)) {
      label = labels.done
      tone = 'ok'
    } else if (docStatus === 'pending_confirm') {
      label = '待确认'
      tone = 'warn'
    } else {
      label = labels.live
      tone = 'live'
    }
  }
  return {
    title,
    label,
    tone,
    nodeId: (node && node.id) || '',
    state: tone === 'muted' ? 'todo' : tone === 'ok' ? 'done' : 'current',
  }
}

function stayText(createdAt, now, finished) {
  if (finished || !createdAt) return ''
  const start = new Date(createdAt).getTime()
  if (!Number.isFinite(start)) return ''
  const hours = (now.getTime() - start) / 3600000
  if (hours < 0.2 || hours > 72) return ''
  const shown = hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours)
  return `进店 ${shown}h`
}

function rowDetail(bucket, nodes) {
  const head = bucket.nodes[0] || {}
  if (bucket.key === 'intake') {
    const count = bucket.nodes.reduce((sum, node) => sum + (Number(node.photoCount) || 0), 0)
    return count ? `已留证 ${count} 张` : '待补接车照片'
  }
  if (bucket.key === 'inspect') {
    const list = findingsOf(nodes)
    if (!list.length) return bucketDone(bucket) ? '检测报告已写好' : '按症状检查'
    const abnormal = list.filter((row) => row && (row.result === '需关注' || row.result === '需处理')).length
    return abnormal ? `完成 ${list.length} 项检查，发现 ${abnormal} 项异常` : `完成 ${list.length} 项检查`
  }
  if (bucket.key.startsWith('quote')) {
    const node = bucket.nodes[0]
    const amount = quoteAmount(node)
    const status = String((node.document && node.document.status) || '')
    const word = status === 'confirmed' ? '已确认' : status === 'pending_confirm' ? '等待确认' : status === 'cancelled' ? '已取消' : ''
    return [amount, word].filter(Boolean).join(' · ') || '填写报价'
  }
  if (bucket.key.startsWith('work')) {
    const node = bucket.nodes[0]
    const names = ((node.photoDraft && node.photoDraft.findings) || [])
      .map((row) => String((row && row.partName) || '').trim())
      .filter(Boolean)
      .slice(0, 2)
    const count = Number(node.photoCount) || 0
    const nameText = names.join('、')
    const photoText = count ? `${count} 张现场照片` : ''
    return [nameText, photoText].filter(Boolean).join(' · ') || '施工留证'
  }
  return '交车报告与车主确认'
}

function heroPill(current, finished) {
  if (finished) return { text: '已交车', tone: 'green' }
  if (!current) return { text: '进行中', tone: 'blue' }
  if (current.key.startsWith('quote')) {
    const status = String((current.nodes[0].document && current.nodes[0].document.status) || '')
    if (status === 'pending_confirm') return { text: '待确认', tone: 'amber' }
  }
  if (current.key.startsWith('work')) return { text: '施工中', tone: 'blue' }
  if (current.key === 'finish') return { text: '交车中', tone: 'blue' }
  return { text: '进行中', tone: 'blue' }
}

function actionLabel(current, finished) {
  if (finished || !current) return ''
  if (current.key === 'intake') return '继续接车'
  if (current.key === 'inspect') return '继续检测'
  if (current.key.startsWith('quote')) return '去确认报价'
  if (current.key.startsWith('work')) return '补充施工记录'
  return '去完工'
}

function presentBuckets(buckets, nodes) {
  const currentIndex = buckets.findIndex((bucket) => !bucketDone(bucket))
  const finished = buckets.length > 0 && currentIndex < 0
  const current = currentIndex >= 0 ? buckets[currentIndex] : null
  const rows = buckets.map((bucket, index) => {
    let state = 'todo'
    if (finished || index < currentIndex) state = 'done'
    else if (index === currentIndex) state = 'current'
    const advice = bucket.nodes.map(adviceLine).find(Boolean) || ''
    const showShots = state === 'current' && bucket.key.startsWith('work')
    return {
      key: bucket.key,
      index: index + 1,
      title: bucket.title,
      detail: rowDetail(bucket, nodes),
      state,
      mark: state === 'current' ? '进行中' : state === 'todo' ? '待开始' : '已完成',
      nodeId: (bucket.nodes.find((node) => !isFlowNodeDone(node)) || bucket.nodes[0] || {}).id || '',
      advice: state === 'todo' ? '' : advice,
      shots: showShots ? shotsOf(bucket.nodes[0]) : [],
      canAddShot: showShots,
    }
  })
  return { rows, current, finished }
}

function buildMerchantAlbumOverview(album = {}, flowNodes = [], now = new Date()) {
  const vehicle = album.vehicle || {}
  const nodes = (flowNodes || [])
    .slice()
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
  const buckets = bucketNodes(nodes)
  const full = presentBuckets(buckets, nodes)
  const timeline = presentBuckets(buckets.filter(bucketOnTimeline), nodes)
  const rows = full.rows
  const current = timeline.current
  const finished = timeline.finished
  const intake = nodes.find((node) => node.kind === 'intake' || node.kind === 'intake_inspection')
  const report = nodes.find((node) => node.kind === 'inspection_report')
  const quote = nodes.find((node) => node.kind === 'quote_confirm' || node.kind === 'addon_quote_confirm')
  const work = nodes.find((node) => node.kind === 'work')
  const repair = nodes.find((node) => node.kind === 'repair_report')
  const year = String(vehicle.modelYear || vehicle.year || '').trim()
  const mileage = Number(vehicle.mileage)
  const spec = [
    year ? `${year}款` : '',
    Number.isFinite(mileage) && mileage > 0 ? `里程 ${mileage.toLocaleString('zh-CN')} km` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const phone = String(album.userPhone || '').trim()
  const meta = [phone ? `车主 ${phoneText(album.userPhoneDisplay || phone)}` : '', stayText(album.createdAt, now, finished)]
    .filter(Boolean)
    .join(' · ')
  const records = nodes.reduce((sum, node) => sum + (Number(node.photoCount) || 0), 0)
  return {
    plate: plateOf(vehicle),
    pill: heroPill(current, finished),
    vehicleName: [vehicle.brand, vehicle.series, vehicle.model].map((part) => String(part || '').trim()).filter(Boolean).join(' ') || album.serviceName || '服务相册',
    spec,
    meta,
    phone,
    records,
    docs: [
      docTile('接车报告', intake, { done: '已发出', live: '填写中' }),
      docTile('检测报告', report, { done: '已完成', live: '填写中' }),
      docTile('报价单', quote, { done: '已确认', live: '填写中' }),
      docTile('维修工单', work, { done: '已完成', live: '施工中' }),
      docTile('交车报告', repair, { done: '已确认', live: '填写中' }),
    ].filter((item) => item.label !== '待生成' && item.label !== '填写中'),
    rows,
    timelineRows: timeline.rows,
    action: actionLabel(current, finished),
    actionId: (current && (current.nodes.find((node) => !isFlowNodeDone(node)) || current.nodes[0] || {}).id) || '',
  }
}

function pricedLines(list) {
  return (Array.isArray(list) ? list : [])
    .map((line) => {
      const name = String((line && (line.name || line.partName)) || '').trim()
      if (!name) return null
      const amount = moneyText(line && line.amount)
      return { name, amount }
    })
    .filter(Boolean)
    .slice(0, 6)
}

function findingLines(list) {
  return (Array.isArray(list) ? list : [])
    .map((row) => {
      const name = String((row && (row.partName || row.name)) || '').trim()
      if (!name) return null
      return { name, amount: '' }
    })
    .filter(Boolean)
    .slice(0, 6)
}

function briefLines(title, nodes, node) {
  const payload = (node && node.document && node.document.payload) || {}
  const draft = (node && node.photoDraft) || {}
  if (title === '接车报告') {
    const complaint = String(draft.chiefComplaint || payload.chiefComplaint || '').trim()
    const belongings = String(draft.belongings || payload.belongings || '').trim()
    return [complaint ? { name: complaint, amount: '' } : null, belongings ? { name: belongings, amount: '' } : null].filter(Boolean)
  }
  if (title === '检测报告') {
    const fromDoc = Array.isArray(payload.findings) ? payload.findings : []
    return findingLines(fromDoc.length ? fromDoc : findingsOf(nodes))
  }
  if (title === '报价单') return pricedLines(payload.lines)
  if (title === '交车报告') return pricedLines(payload.workItems)
  return findingLines(findingsOf([node]))
}

function lineTotal(lines) {
  return (lines || []).reduce((sum, line) => {
    const n = Number(String((line && line.amount) || '').replace(/[^\d.]/g, ''))
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
}

/**
 * 详情页顶部五张单据的简要弹层。金额和项目只取已有记录。工单不列金额。
 */
function buildMerchantDocBrief(album = {}, flowNodes = [], title = '') {
  const overview = buildMerchantAlbumOverview(album, flowNodes)
  const tile = (overview.docs || []).find((item) => item && item.title === title) || {
    title,
    label: '待生成',
    tone: 'muted',
    nodeId: '',
  }
  const nodes = Array.isArray(flowNodes) ? flowNodes : []
  const node = nodes.find((item) => item && item.id && item.id === tile.nodeId) || null
  const payload = (node && node.document && node.document.payload) || {}
  const status = String((node && node.document && node.document.status) || '')
  const vehicle = album.vehicle || {}
  const mileage = Number(vehicle.mileage)
  const mileageText = Number.isFinite(mileage) && mileage > 0 ? `${mileage.toLocaleString('zh-CN')}km` : ''
  const lines = tile.label === '待生成' ? [] : briefLines(title, nodes, node)
  const total = lineTotal(lines)
  const serviceName = String(album.serviceName || '').trim()
  const storeName = String(album.storeName || '').trim()
  const period = String((payload.warranty && payload.warranty.period) || payload.warrantyPeriod || '').trim()
  const quoteReady = title === '报价单' && lines.length > 0 && lines.every((line) => line.amount)
  const repairReady = title === '交车报告' && lines.length > 0 && Boolean(period)
  const canSend = (status === '' || status === 'draft') && (quoteReady || repairReady)
  const stageKey =
    title === '接车报告' ? 'intake' : title === '检测报告' ? 'inspect' : title === '报价单' ? 'quote' : title === '维修工单' ? 'work' : 'finish'
  return {
    title: tile.title || title,
    plate: overview.plate,
    vehicleName: overview.vehicleName,
    storeName,
    mark: storeName.slice(0, 2) || '门店',
    status: tile.label || '待生成',
    statusTone: tile.tone || 'muted',
    vehicleLine: [overview.plate, mileageText].filter(Boolean).join(' / '),
    serviceName,
    lines,
    totalText: title === '维修工单' || title === '接车报告' || title === '检测报告' ? '' : total > 0 ? moneyText(total) : '',
    sealed: (status === 'confirmed' || status === 'delivered') && lines.length > 0,
    emptyText: lines.length ? '' : '还没有这份内容',
    canSend,
    nodeId: tile.nodeId || '',
    stageKey,
  }
}

module.exports = {
  buildMerchantAlbumOverview,
  buildMerchantDocBrief,
  addonQuoteHasProcess,
}
