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

const { resolveShared } = require('./resolve-shared')
const { contentOfFlowNode, formatWorkDurationText } = resolveShared('utils/service-flow-docs.js')

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

function nodesOfKind(flowNodes, kind) {
  return (flowNodes || []).filter((node) => String((node && node.kind) || '') === kind)
}

/** 诉求：优先检测报告，其次接车报告 */
function pickChiefComplaint(flowNodes) {
  const reports = nodesOfKind(flowNodes, 'inspection_report')
  for (const node of reports) {
    const value = String(contentOfFlowNode(node).chiefComplaint || '').trim()
    if (value) return value
  }
  const intakes = [
    ...nodesOfKind(flowNodes, 'intake'),
    ...nodesOfKind(flowNodes, 'intake_inspection'),
  ]
  for (const node of intakes) {
    const value = String(contentOfFlowNode(node).chiefComplaint || '').trim()
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
    pushRows(contentOfFlowNode(node).findings)
  }
  if (out.length) return out
  for (const node of [
    ...nodesOfKind(flowNodes, 'inspection'),
    ...nodesOfKind(flowNodes, 'intake_inspection'),
  ]) {
    pushRows(contentOfFlowNode(node).findings)
  }
  return out
}

/** 方案行项目名（不喂金额） */
function pickQuoteItems(flowNodes, kind) {
  const rows = []
  for (const node of nodesOfKind(flowNodes, kind)) {
    const lines = contentOfFlowNode(node).lines
    if (!Array.isArray(lines)) continue
    for (const line of lines) {
      const name = String((line && line.name) || '').trim()
      if (name) rows.push(name)
    }
  }
  return rows
}

/**
 * 报价金额：取已确认行金额，供公开文案明码引用
 * 同名行按最后一次报价去重，避免拆检/改价重复累加
 */
function pickQuotePricing(flowNodes, kind) {
  const byName = new Map()
  for (const node of nodesOfKind(flowNodes, kind)) {
    const lines = contentOfFlowNode(node).lines
    if (!Array.isArray(lines)) continue
    for (const line of lines) {
      const name = String((line && line.name) || '').trim()
      const amount = Number(line && line.amount)
      if (!name || !Number.isFinite(amount) || amount <= 0) continue
      byName.set(name, amount)
    }
  }
  const lines = Array.from(byName, ([name, amount]) => ({ name, amount }))
  const total = lines.reduce((sum, row) => sum + row.amount, 0)
  return { lines, total }
}

/**
 * 工单项：优先 content.workItems；存量/进行中才回落 content.findings
 */
function pickWorkItems(flowNodes) {
  const out = []
  for (const node of nodesOfKind(flowNodes, 'work')) {
    const content = contentOfFlowNode(node)
    const sealed = content.workItems
    const rows =
      Array.isArray(sealed) && sealed.length ? sealed : content.findings
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

/** 施工时间（分钟）：交车节点填写，缺失时回落到完工确认；0 表示未填 */
function pickWorkDurationMinutes(flowNodes) {
  for (const kind of ['delivery_photos', 'repair_report']) {
    for (const node of nodesOfKind(flowNodes, kind)) {
      const minutes = Number(contentOfFlowNode(node).workDurationMinutes) || 0
      if (minutes > 0) return Math.round(minutes)
    }
  }
  return 0
}

/** 完工确认：复查结论 + 验收事实句 + 质保 + 使用注意 + 施工时间 */
function pickFinish(flowNodes) {
  for (const node of nodesOfKind(flowNodes, 'repair_report')) {
    const payload = contentOfFlowNode(node)
    // 验收项（2026-11-10 二次收敛）：事实句按行（项目 + 结果 + 描述），外观并入末行；不改快照事实
    const acceptanceItems = (Array.isArray(payload.acceptanceItems) ? payload.acceptanceItems : [])
      .map((row) => {
        const obj = row && typeof row === 'object' ? row : {}
        const name = String(obj.name || (obj.kind === 'exterior' ? '外观' : '')).trim()
        const note = String(obj.note || '').trim()
        const result = ['pass', 'observe', 'rework'].includes(obj.result) ? obj.result : ''
        if (!name) return null
        const photoCount = Array.isArray(obj.images) ? obj.images.length : 0
        return {
          name,
          kind: obj.kind === 'exterior' ? 'exterior' : 'work',
          note,
          result,
          photoCount,
          // 外观照选填（2026-11-11）：缺图如实标注，供 AI 引用时降权采信，而非静默缺失
          missingPhoto: obj.kind === 'exterior' && photoCount === 0,
        }
      })
      .filter(Boolean)
    const acceptancePhotoCount = acceptanceItems.reduce((sum, row) => sum + row.photoCount, 0)
    const workDurationMinutes = pickWorkDurationMinutes(flowNodes)
    return {
      conclusion: String(payload.conclusion || '').trim(),
      acceptanceItems,
      warrantyPeriod: String(payload.warrantyPeriod || '').trim(),
      warrantyNotes: String(payload.warrantyNotes || '').trim(),
      acceptancePhotoCount,
      // 施工时间：交车时商家确认/修改过的值，供 FAQ 回答同类项目工期
      workDurationMinutes,
      workDurationText: formatWorkDurationText(workDurationMinutes),
    }
  }
  return {
    conclusion: '',
    acceptanceItems: [],
    warrantyPeriod: '',
    warrantyNotes: '',
    acceptancePhotoCount: 0,
    workDurationMinutes: 0,
    workDurationText: '',
  }
}

/**
 * 报告里程文案：content 归一化会保留 mileageText。
 */
function reportMileageText(node) {
  const content = contentOfFlowNode(node)
  return String(content.mileageText || '').trim()
}

/** 车型、年款与里程：跨单据聚合（任一单据写了都算，先到先得） */
function pickVehicle(flowNodes) {
  const vehicle = { brand: '', series: '', year: '', mileageText: '' }
  for (const node of flowNodes || []) {
    const payload = contentOfFlowNode(node)
    if (!vehicle.brand) vehicle.brand = String(payload.vehicleBrand || '').trim()
    if (!vehicle.series) vehicle.series = String(payload.vehicleSeries || '').trim()
    if (!vehicle.year) vehicle.year = String(payload.vehicleYear || '').trim()
    if (!vehicle.mileageText) {
      vehicle.mileageText = String(payload.mileageText || '').trim() || reportMileageText(node)
    }
    if (vehicle.brand && vehicle.series && vehicle.year && vehicle.mileageText) break
  }
  return vehicle
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
    collect(contentOfFlowNode(node).findings)
  }
  for (const node of nodesOfKind(flowNodes, 'work')) {
    const content = contentOfFlowNode(node)
    const sealed = content.workItems
    if (Array.isArray(sealed) && sealed.length) collect(sealed)
    else collect(content.findings)
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
      vehicle: { brand: '', series: '', year: '', mileageText: '' },
      findings: [],
      quoteItems: [],
      quotePricing: { lines: [], total: 0 },
      addonQuoteItems: [],
      addonQuotePricing: { lines: [], total: 0 },
      workItems: [],
      finish: {
        conclusion: '',
        acceptanceItems: [],
        warrantyPeriod: '',
        warrantyNotes: '',
        acceptancePhotoCount: 0,
        workDurationMinutes: 0,
        workDurationText: '',
      },
      analyzedImageKeys: [],
      evidenceProfile: null,
      missing: ['flowNodes'],
    }
  }

  const missing = []
  const chiefComplaint = pickChiefComplaint(nodes)
  if (!chiefComplaint) missing.push('chiefComplaint')

  const findings = pickFindings(nodes)
  const workItems = pickWorkItems(nodes)
  if (!findings.length && !workItems.length) missing.push('findings_or_work')

  // 证据画像 + 分级：供 LLM 引用时按级采信（诚实标注优于静默缺失）
  let evidenceProfile = null
  try {
    const { assessCaseEvidenceProfile } = require('./case-evidence-profile')
    const profile = assessCaseEvidenceProfile(nodes)
    if (profile) {
      const { resolveEvidenceLevel } = require('../schemas/case-trust-meta.schema')
      const graded = resolveEvidenceLevel(0, profile)
      evidenceProfile = {
        ...profile,
        evidenceLevel: graded.evidenceLevel,
        evidenceLevelLabel: graded.evidenceLevelLabel,
      }
    }
  } catch (_) {
    /* 画像失败不挡 factpack */
  }

  return {
    hasFlow: true,
    chiefComplaint,
    vehicle: pickVehicle(nodes),
    findings,
    quoteItems: pickQuoteItems(nodes, 'quote_confirm'),
    quotePricing: pickQuotePricing(nodes, 'quote_confirm'),
    addonQuoteItems: pickQuoteItems(nodes, 'addon_quote_confirm'),
    addonQuotePricing: pickQuotePricing(nodes, 'addon_quote_confirm'),
    workItems,
    finish: pickFinish(nodes),
    analyzedImageKeys: pickAnalyzedImageKeys(nodes),
    evidenceProfile,
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
  pickChiefComplaint,
  pickVehicle,
  buildCaseFactPack,
  factPackHasEnoughFacts,
}
