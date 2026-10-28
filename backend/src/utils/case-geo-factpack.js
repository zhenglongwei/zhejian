/**
 * 案例原料包：把七步单据链压成给大模型的一份扁平原料
 *
 * 背景：大模型以前只拿到相册节点的 note（师傅手打的字，常为空或占位话术），
 * 真正的干货全在单据链里，一样都没喂。这就是摘要说出「虽无具体故障描述或更换配件」的根因。
 *
 * 设计要点：
 * 1. **纯函数**：只吃 flowNodes 数组，不碰 DB、不依赖 album，方便单测
 * 2. **从原始 flowNodes 解析**，不走 buildHostContentReviewDocs——
 *    后者有两个坑：工单节点的 outsideQuote（增项标记）会被映射丢掉；
 *    inspection 节点会被 isOwnerDocumentKind 过滤掉，拿不到回退数据
 * 3. **不喂金额**（藏价规则）：方案行只取项目名
 * 4. **四档结论只取两档**：需处理 / 需关注。状态良好、仅记录写进去等于刷屏
 */

/** 只有这两档结论值得喂给大模型 */
const FEEDABLE_RESULTS = new Set(['需处理', '需关注'])

/** 图片可能是字符串，也可能是 { url } */
function pickImageKey(raw) {
  if (!raw) return ''
  if (typeof raw === 'string') return String(raw).trim()
  if (typeof raw === 'object') return String(raw.url || raw.rawUrl || '').trim()
  return ''
}

function normalizeImageKey(key) {
  const value = String(key || '').trim()
  if (!value) return ''
  return value.replace(/[?#].*$/, '')
}

function payloadOf(node) {
  const doc = node && node.document && typeof node.document === 'object' ? node.document : {}
  const payload = doc.payload && typeof doc.payload === 'object' ? doc.payload : {}
  return payload
}

function photoDraftOf(node) {
  const draft = node && node.photoDraft && typeof node.photoDraft === 'object' ? node.photoDraft : {}
  return draft
}

function nodesOfKind(flowNodes, kind) {
  return (flowNodes || []).filter((node) => String((node && node.kind) || '') === kind)
}

/** 诉求：优先检测报告，其次接车报告，最后才回落接车草稿 */
function pickChiefComplaint(flowNodes) {
  const reports = nodesOfKind(flowNodes, 'inspection_report')
  for (const node of reports) {
    const value = String(payloadOf(node).chiefComplaint || '').trim()
    if (value) return value
  }
  const intakes = [
    ...nodesOfKind(flowNodes, 'intake'),
    ...nodesOfKind(flowNodes, 'intake_inspection'),
  ]
  for (const node of intakes) {
    const fromDoc = String(payloadOf(node).chiefComplaint || '').trim()
    if (fromDoc) return fromDoc
  }
  for (const node of intakes) {
    const value = String(photoDraftOf(node).chiefComplaint || '').trim()
    if (value) return value
  }
  return ''
}

/**
 * 检测结论：只认检测报告定稿；报告未写入前才回落检测节点草稿 findings
 * 只保留需处理 / 需关注两档
 */
function pickFindings(flowNodes) {
  const seen = new Set()
  const out = []
  const pushRows = (rows) => {
    if (!Array.isArray(rows)) return
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const result = String(row.result || '').trim()
      if (!FEEDABLE_RESULTS.has(result)) continue
      const partName = String(row.partName || '').trim()
      const advice = String(row.advice || '').trim()
      if (!partName && !advice) continue
      const dedupe = `${partName}|${result}|${advice}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      out.push({ partName, result, advice })
    }
  }
  for (const node of nodesOfKind(flowNodes, 'inspection_report')) {
    pushRows(payloadOf(node).findings)
  }
  if (out.length) return out
  for (const node of [
    ...nodesOfKind(flowNodes, 'inspection'),
    ...nodesOfKind(flowNodes, 'intake_inspection'),
  ]) {
    pushRows(photoDraftOf(node).findings)
  }
  return out
}

/** 方案行项目名（不喂金额） */
function pickQuoteItems(flowNodes, kind) {
  const rows = []
  for (const node of nodesOfKind(flowNodes, kind)) {
    const lines = payloadOf(node).lines
    if (!Array.isArray(lines)) continue
    for (const line of lines) {
      const name = String((line && line.name) || '').trim()
      if (name) rows.push(name)
    }
  }
  return rows
}

/**
 * 工单项：优先定稿 document.payload.workItems；存量/进行中才回落 photoDraft.findings
 */
function pickWorkItems(flowNodes) {
  const out = []
  for (const node of nodesOfKind(flowNodes, 'work')) {
    const sealed = payloadOf(node).workItems
    const rows =
      Array.isArray(sealed) && sealed.length ? sealed : photoDraftOf(node).findings
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const name = String(row.partName || row.name || '').trim()
      const note = String(row.caption || row.note || '').trim()
      if (!name && !note) continue
      out.push({
        name,
        note,
        outsideQuote: row.outsideQuote === true,
      })
    }
  }
  return out
}

/** 完工确认：复查结论 + 质保 + 使用注意 */
function pickFinish(flowNodes) {
  for (const node of nodesOfKind(flowNodes, 'repair_report')) {
    const payload = payloadOf(node)
    const deliveryPhotos = Array.isArray(payload.deliveryPhotos) ? payload.deliveryPhotos : []
    return {
      conclusion: String(payload.conclusion || '').trim(),
      warrantyPeriod: String(payload.warrantyPeriod || '').trim(),
      warrantyNotes: String(payload.warrantyNotes || '').trim(),
      deliveryPhotoCount: deliveryPhotos.length,
    }
  }
  return { conclusion: '', warrantyPeriod: '', warrantyNotes: '', deliveryPhotoCount: 0 }
}

/** 车型与里程：任一单据上写了都算 */
function pickVehicle(flowNodes) {
  for (const node of flowNodes || []) {
    const payload = payloadOf(node)
    const brand = String(payload.vehicleBrand || '').trim()
    const series = String(payload.vehicleSeries || '').trim()
    const mileageText = String(payload.mileageText || '').trim()
    if (brand || series || mileageText) {
      return { brand, series, mileageText }
    }
  }
  return { brand: '', series: '', mileageText: '' }
}

/**
 * 已被分析过的图片 key（供图片分流用：这些图不用再送多模态模型）
 * 来源是检测结论与工单项上的图——它们已经带 partName / result / advice
 */
function pickAnalyzedImageKeys(flowNodes) {
  const keys = new Set()
  const collect = (rows) => {
    if (!Array.isArray(rows)) return
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const images = Array.isArray(row.images) ? row.images : []
      for (const img of images) {
        const key = normalizeImageKey(pickImageKey(img))
        if (key) keys.add(key)
      }
    }
  }
  for (const node of nodesOfKind(flowNodes, 'inspection_report')) {
    collect(payloadOf(node).findings)
  }
  for (const node of nodesOfKind(flowNodes, 'work')) {
    const sealed = payloadOf(node).workItems
    if (Array.isArray(sealed) && sealed.length) collect(sealed)
    else collect(photoDraftOf(node).findings)
  }
  return Array.from(keys)
}

/**
 * @param {object[]} flowNodes 单据链（album.contentPackageJson.flowNodes）
 * @returns {object} 原料包
 */
function buildCaseFactPack(flowNodes) {
  const nodes = Array.isArray(flowNodes) ? flowNodes : []
  if (!nodes.length) {
    return {
      hasFlow: false,
      chiefComplaint: '',
      vehicle: { brand: '', series: '', mileageText: '' },
      findings: [],
      quoteItems: [],
      addonQuoteItems: [],
      workItems: [],
      finish: { conclusion: '', warrantyPeriod: '', warrantyNotes: '', deliveryPhotoCount: 0 },
      analyzedImageKeys: [],
      missing: ['flowNodes'],
    }
  }

  const missing = []
  const chiefComplaint = pickChiefComplaint(nodes)
  if (!chiefComplaint) missing.push('chiefComplaint')

  const findings = pickFindings(nodes)
  const workItems = pickWorkItems(nodes)
  if (!findings.length && !workItems.length) missing.push('findings_or_work')

  return {
    hasFlow: true,
    chiefComplaint,
    vehicle: pickVehicle(nodes),
    findings,
    quoteItems: pickQuoteItems(nodes, 'quote_confirm'),
    addonQuoteItems: pickQuoteItems(nodes, 'addon_quote_confirm'),
    workItems,
    finish: pickFinish(nodes),
    analyzedImageKeys: pickAnalyzedImageKeys(nodes),
    missing,
  }
}

/** 原料包是否够写摘要：有诉求，且有检查结论或施工内容 */
function factPackHasEnoughFacts(pack) {
  if (!pack || !pack.hasFlow) return false
  if (!String(pack.chiefComplaint || '').trim()) return false
  const hasFinding = Array.isArray(pack.findings) && pack.findings.length > 0
  const hasWork = Array.isArray(pack.workItems) && pack.workItems.length > 0
  return hasFinding || hasWork
}

module.exports = {
  FEEDABLE_RESULTS,
  buildCaseFactPack,
  factPackHasEnoughFacts,
}
