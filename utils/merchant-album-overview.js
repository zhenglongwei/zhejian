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
    node && node.content && Array.isArray(node.content.lines) ? node.content.lines : []
  const total = lines.reduce((sum, line) => sum + (Number(line && line.amount) || 0), 0)
  return moneyText(total)
}

function findingsOf(nodes) {
  const report = nodes.find((node) => node && node.kind === 'inspection_report')
  const fromDoc = report && report.content && report.content.findings
  if (Array.isArray(fromDoc) && fromDoc.length) return fromDoc
  const inspection = nodes.find((node) => node && node.kind === 'inspection')
  const fromDraft = inspection && inspection.content && inspection.content.findings
  return Array.isArray(fromDraft) ? fromDraft : []
}

function adviceText(value) {
  return String(value || '').trim()
}

function adviceReady(advice) {
  return Boolean(advice && advice.status === 'ready')
}

function findingCaption(node, partName, id) {
  const findings = (node.content && node.content.findings) || []
  const name = adviceText(partName)
  const hit = findings.find((row) => {
    if (!row) return false
    if (id && row.id === id) return true
    return name && adviceText(row.partName) === name
  })
  return adviceText(hit && hit.caption)
}

/** 相册详情只留这一步还要店员动手的一句。已经写上、已经归位、只是告知的都不放。 */
function adviceLine(node) {
  if (!node) return ''
  const kind = node.kind
  if (kind === 'intake' || kind === 'intake_inspection') return intakeAdviceLine(node)
  if (kind === 'inspection' || kind === 'inspection_report') return inspectionAdviceLine(node)
  if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') return quoteAdviceLine(node)
  if (kind === 'work') return workAdviceLine(node)
  if (kind === 'delivery_photos') return deliveryAdviceLine(node)
  return ''
}

function intakeAdviceLine(node) {
  const advice = node.intakeAdvice
  if (!adviceReady(advice)) return ''
  const risks = Array.isArray(advice.risks) ? advice.risks : []
  const risk = risks.map((row) => adviceText(row && (row.title || row.body))).find(Boolean)
  if (risk) return risk
  const fixes = Array.isArray(advice.fixes) ? advice.fixes : []
  return fixes.map((row) => adviceText(row && (row.title || row.body))).find(Boolean) || ''
}

function inspectionAdviceLine(node) {
  const advice = node.inspectionAdvice
  if (!adviceReady(advice)) return ''
  const findings = (node.content && node.content.findings) || []
  const names = new Set(findings.map((row) => adviceText(row && row.partName)).filter(Boolean))
  const shop = Array.isArray(advice.shop) ? advice.shop : []
  const shopHit = shop.find((row) => {
    const kind = adviceText(row && row.kind)
    const title = adviceText(row && row.title)
    if (!adviceText(row && row.body) || !title) return false
    if (kind !== 'miss' && kind !== 'omit') return false
    return !names.has(title)
  })
  if (shopHit) return adviceText(shopHit.body)
  const items = Array.isArray(advice.items) ? advice.items : []
  const pending = items.find((row) => {
    const body = adviceText(row && row.body)
    if (!body) return false
    const name = adviceText(row && row.partName)
    const current = findings.find((item) => name && adviceText(item && item.partName) === name)
    const written = adviceText(current && current.advice)
    return !written || written === '无需处理'
  })
  return adviceText(pending && pending.body)
}

function quoteAdviceLine(node) {
  const advice = node.quoteAssist
  if (!adviceReady(advice)) return ''
  const omissions = Array.isArray(advice.omissions) ? advice.omissions : []
  const omission = omissions.map((row) => adviceText(row && (row.body || row.title))).find(Boolean)
  if (omission) return omission
  const lines = (node.content && node.content.lines) || []
  const names = new Set(lines.map((row) => adviceText(row && row.name)).filter(Boolean))
  const suggested = Array.isArray(advice.suggestedLines) ? advice.suggestedLines : []
  const pending = suggested.find((row) => {
    const name = adviceText(row && (row.name || row.partName))
    return name && !names.has(name)
  })
  return adviceText(pending && (pending.name || pending.partName))
}

function workAdviceLine(node) {
  const advice = node.workAdvice
  if (!adviceReady(advice)) return ''
  const gaps = Array.isArray(advice.gaps) ? advice.gaps : []
  const gap = gaps.map((row) => adviceText(row && row.body)).find(Boolean)
  if (gap) return gap
  const items = Array.isArray(advice.items) ? advice.items : []
  const pending = items.find((row) => {
    const body = adviceText(row && row.body)
    if (!body) return false
    return !findingCaption(node, row && row.partName, row && row.id)
  })
  if (pending) {
    const sentence = adviceText(pending.body)
    const name = adviceText(pending.partName)
    return adviceText(pending.display) || (name ? `${name}建议描述为：${sentence}` : sentence)
  }
  const groups = Array.isArray(advice.groups) ? advice.groups : []
  const findings = (node.content && node.content.findings) || []
  const group = groups.find((row) => {
    const partName = adviceText(row && row.partName)
    const url = adviceText(row && row.url)
    if (!partName) return false
    const host = findings.find((item) =>
      (item.images || []).some((img) => adviceText((img && img.url) || img) === url),
    )
    return !host || adviceText(host.partName) !== partName
  })
  if (!group) return ''
  return adviceText(group.body) || `这张更像是${adviceText(group.partName)}。`
}

function deliveryAdviceLine() {
  return ''
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
  if (kind === 'work') return { key: `work:${quoteIndex}`, title: quoteIndex === 0 ? '维修施工' : '补充施工' }
  if (kind === 'delivery_photos' || kind === 'repair_report') return { key: 'finish', title: '完工交车' }
  return null
}

function addonQuoteHasProcess(node) {
  if (!node) return false
  const addon = node.kind === 'addon_quote_confirm' || String(node.insertedReason || '') === 'addon'
  if (!addon) return node.kind === 'quote_confirm'
  const status = String((node.document && node.document.status) || 'draft')
  // 节点一旦插入就是商家真实在做的工作：中途退出、AI 分析未完成都不能让它从流程里消失。
  // 只有主动「撤销补充报价」才会移除节点（连带移除其补充施工）。
  return status !== 'cancelled'
}

function bucketOnTimeline(bucket) {
  if (!bucket) return true
  const key = String(bucket.key)
  // 补充施工要等补充报价确认、节点解锁后才进时间线
  if (key.indexOf('work') === 0 && key !== 'work:0') {
    return (bucket.nodes || []).some((node) => String(node.status || '') !== 'locked')
  }
  if (!key.startsWith('quote') || key === 'quote:0') return true
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
  if (!bucket) return false
  const nodes = bucket.nodes || []
  if (!nodes.length) return true
  if (String(bucket.key).startsWith('quote') && bucket.key !== 'quote:0') {
    // 补充报价只要节点还在就要展示；是否完成仍按节点本身状态判断
    if (!nodes.some((node) => addonQuoteHasProcess(node))) return false
  }
  return nodes.every((node) => isFlowNodeDone(node))
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
    const names = ((node.content && node.content.findings) || [])
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

function finishAwaitingOwner(current) {
  if (!current || current.key !== 'finish') return false
  return (current.nodes || []).some((node) => {
    const status = String((node && node.document && node.document.status) || '')
    return status === 'pending_confirm'
  })
}

function actionLabel(current, finished) {
  if (finished || !current) return ''
  if (current.key === 'intake') return '继续接车'
  if (current.key === 'inspect') return '继续检测'
  if (current.key.startsWith('quote')) return '去确认报价'
  if (current.key.startsWith('work')) return '补充施工记录'
  if (finishAwaitingOwner(current)) return '待客户确认'
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
  const modelName = String(vehicle.modelName || '').trim()
  const brandSeriesYear = [vehicle.brand, vehicle.series, year ? `${year}款` : '']
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
  const mileageText = Number.isFinite(mileage) && mileage > 0 ? `${mileage.toLocaleString('zh-CN')} km` : ''
  const docs = []
  let quoteIndex = 0
  let workIndex = 0
  nodes.forEach((node) => {
    if (!node) return
    if (node === intake) {
      docs.push(docTile('接车报告', node, { done: '已发出', live: '填写中' }))
      return
    }
    if (node === report) {
      docs.push(docTile('检测报告', node, { done: '已完成', live: '填写中' }))
      return
    }
    if (node.kind === 'quote_confirm' || node.kind === 'addon_quote_confirm') {
      const addon =
        quoteIndex > 0 || node.kind === 'addon_quote_confirm' || String(node.insertedReason || '') === 'addon'
      docs.push(docTile(addon ? '补充报价单' : '报价单', node, { done: '已确认', live: '填写中' }))
      quoteIndex += 1
      return
    }
    if (node.kind === 'work') {
      docs.push(docTile(workIndex > 0 ? '补充施工' : '维修工单', node, { done: '已完成', live: '施工中' }))
      workIndex += 1
      return
    }
    if (node === repair) {
      docs.push(docTile('交车报告', node, { done: '已确认', live: '填写中' }))
    }
  })
  // 相册详情展示完整车辆信息（手机号仍打码）
  const vehicleFacts = [
    { key: '车牌', value: plateOf(vehicle) },
    { key: '车架号', value: String(vehicle.vin || '').trim() },
    { key: '完整车型', value: modelName || brandSeriesYear },
    { key: '品牌车系', value: modelName === brandSeriesYear ? '' : brandSeriesYear },
    { key: '底盘', value: String(vehicle.chassisCode || vehicle.chassis || '').trim() },
    { key: '发动机', value: String(vehicle.engineModel || '').trim() },
    { key: '排量', value: String(vehicle.displacement || '').trim() },
    { key: '变速箱', value: String(vehicle.gearbox || '').trim() },
    { key: '接车里程', value: mileageText },
  ].filter((row) => row.value)
  return {
    plate: plateOf(vehicle),
    pill: heroPill(current, finished),
    vehicleName:
      modelName ||
      brandSeriesYear ||
      album.serviceName ||
      '服务相册',
    vehicleFacts,
    spec,
    meta,
    phone,
    records,
    docs: docs.filter((item) => item.label !== '待生成' && item.label !== '填写中'),
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
  const content = (node && node.content) || {}
  const kind = String((node && node.kind) || '')
  if (title === '接车报告') {
    const complaint = String(content.chiefComplaint || '').trim()
    const belongings = String(content.belongings || '').trim()
    return [complaint ? { name: complaint, amount: '' } : null, belongings ? { name: belongings, amount: '' } : null].filter(Boolean)
  }
  if (title === '检测报告') {
    const fromDoc = Array.isArray(content.findings) ? content.findings : []
    return findingLines(fromDoc.length ? fromDoc : findingsOf(nodes))
  }
  if (kind === 'quote_confirm' || kind === 'addon_quote_confirm' || title === '报价单') {
    return pricedLines(content.lines)
  }
  if (title === '交车报告') return pricedLines(content.workItems)
  if (kind === 'work' || title === '维修工单' || title === '补充施工') {
    const findings = Array.isArray(content.findings) && content.findings.length
      ? content.findings
      : content.workItems
    return findingLines(findings)
  }
  return findingLines(findingsOf([node]))
}

function lineTotal(lines) {
  return (lines || []).reduce((sum, line) => {
    const n = Number(String((line && line.amount) || '').replace(/[^\d.]/g, ''))
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
}

/**
 * 详情页顶部单据的简要弹层。金额和项目只取已有记录。工单不列金额。
 */
function buildMerchantDocBrief(album = {}, flowNodes = [], title = '', nodeId = '') {
  const overview = buildMerchantAlbumOverview(album, flowNodes)
  const requestedId = String(nodeId || '')
  const tile = (overview.docs || []).find((item) =>
    item && (requestedId ? item.nodeId === requestedId : item.title === title),
  ) || {
    title,
    label: '待生成',
    tone: 'muted',
    nodeId: requestedId,
  }
  const nodes = Array.isArray(flowNodes) ? flowNodes : []
  const node = nodes.find((item) => item && item.id && item.id === tile.nodeId) || null
  const kind = String((node && node.kind) || '')
  const quoteDoc = kind === 'quote_confirm' || kind === 'addon_quote_confirm' || title === '报价单'
  const workDoc = kind === 'work' || title === '维修工单'
  const content = (node && node.content) || {}
  const status = String((node && node.document && node.document.status) || '')
  const vehicle = album.vehicle || {}
  const mileage = Number(vehicle.mileage)
  const mileageText = Number.isFinite(mileage) && mileage > 0 ? `${mileage.toLocaleString('zh-CN')}km` : ''
  const lines = tile.label === '待生成' ? [] : briefLines(title, nodes, node)
  const total = lineTotal(lines)
  const serviceName = String(album.serviceName || '').trim()
  const storeName = String(album.storeName || '').trim()
  const period = String((content.warranty && content.warranty.period) || content.warrantyPeriod || '').trim()
  const quoteReady = quoteDoc && lines.length > 0 && lines.every((line) => line.amount)
  const repairReady = title === '交车报告' && lines.length > 0 && Boolean(period)
  const canSend = (status === '' || status === 'draft') && (quoteReady || repairReady)
  const stageKey =
    title === '接车报告' ? 'intake' : title === '检测报告' ? 'inspect' : quoteDoc ? 'quote' : workDoc ? 'work' : 'finish'
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
    totalText: workDoc || title === '接车报告' || title === '检测报告' ? '' : total > 0 ? moneyText(total) : '',
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
