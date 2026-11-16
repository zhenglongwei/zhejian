/**
 * PV-REFORM · PublicView 构建（公开池 media + scrub 文案）
 */
const { resolvePublicCaseMediaUrl, resolveStoreProcessedPublicUrl } = require('../lib/media-url')
const { stripUrlQuery } = require('../lib/media-signed-url')
const { rewriteMediaUrlForCurrentBase } = require('../lib/media-storage')
const { scrubPiiText } = require('../utils/scrub-pii-text')
const { extractGeoFromAlbumNodes, findStageNode } = require('../utils/album-geo-extract')
const {
  PUBLIC_MEDIA_SOFT_CAP,
  PUBLIC_GATE_STATUS,
  VISIBILITY,
} = require('../constants/album-public-visibility-policy')

function normalizeImageUrl(url = '') {
  return stripUrlQuery(rewriteMediaUrlForCurrentBase(String(url || '').trim()))
}

function taskAssets(task) {
  if (!task) return []
  return task.rawAssets || task.assets || []
}

function resolveMaskedUrlForImage(task, nodeId, idx, rawUrl) {
  const assets = taskAssets(task)
  const normalized = normalizeImageUrl(rawUrl)
  let matched = assets.find(
    (asset) =>
      String(asset.nodeId || '') === String(nodeId) &&
      Number(asset.idx != null ? asset.idx : asset.index ?? 0) === Number(idx),
  )
  if (!matched && normalized) {
    matched = assets.find(
      (asset) => normalizeImageUrl(asset.rawUrl || asset.url || '') === normalized,
    )
  }
  const masked = matched?.maskedUrl || matched?.preMaskedUrl || ''
  return resolvePublicCaseMediaUrl(masked)
}

function buildPublicRepairPlan(albumView = {}) {
  const nodes = albumView.nodes || []
  const stage3 = findStageNode(nodes, 'stage_3')
  const note = scrubPiiText(stage3?.note || '')
  const parts = (albumView.planParts || [])
    .map((row) => {
      const name = scrubPiiText(row.name || '')
      if (!name) return ''
      const type = scrubPiiText(row.partType || '')
      return type ? `${name}（${type}）` : name
    })
    .filter(Boolean)
  const chunks = []
  if (note) chunks.push(note)
  if (parts.length) chunks.push(`主要项目：${parts.join('、')}`)
  // PKG-COACH：公域藏价，不把 planAmount 写入公开方案文案
  return chunks.join('。').slice(0, 400)
}

function listPublicImageRows(albumView = {}) {
  const meta = Array.isArray(albumView.imageMeta) ? albumView.imageMeta : []
  // 排序按流程节点顺序（flowNodeViews 与 imageMeta 同 nodeId 域），不再按 nodeId 字母序。
  // 旧逻辑按 nodeId 字符串排序，多节点案例会先吃满排在前面的「检测」图。
  const orderNodes =
    Array.isArray(albumView.flowNodeViews) && albumView.flowNodeViews.length
      ? albumView.flowNodeViews
      : albumView.nodes || []
  const orderIndex = new Map()
  orderNodes.forEach((node, idx) => {
    const id = String((node && (node.id || node.nodeId)) || '')
    if (id && !orderIndex.has(id)) orderIndex.set(id, idx)
  })
  return meta
    .filter(
      (row) =>
        row.visibility === VISIBILITY.PUBLIC &&
        row.publicGateStatus === PUBLIC_GATE_STATUS.PASSED,
    )
    .sort((a, b) => {
      const ai = orderIndex.has(String(a.nodeId)) ? orderIndex.get(String(a.nodeId)) : Number.MAX_SAFE_INTEGER
      const bi = orderIndex.has(String(b.nodeId)) ? orderIndex.get(String(b.nodeId)) : Number.MAX_SAFE_INTEGER
      if (ai !== bi) return ai - bi
      return Number(a.idx || 0) - Number(b.idx || 0)
    })
}

/**
 * 公开关键帧按节点轮转取名：先每个节点取 1 张，再逐轮补，直到达到上限。
 * 保证多节点案例每个环节都有代表图，而不是被首个节点（通常检测）吃满。
 */
function pickPublicRowsByNode(rows, cap) {
  const limit = Math.max(0, Number(cap) || 0)
  if (!limit || !Array.isArray(rows) || !rows.length) return []
  const order = []
  const byNode = new Map()
  rows.forEach((row) => {
    const key = String((row && row.nodeId) || '')
    if (!byNode.has(key)) {
      byNode.set(key, [])
      order.push(key)
    }
    byNode.get(key).push(row)
  })
  const picked = []
  order.forEach((key) => {
    const first = byNode.get(key)[0]
    if (first) picked.push(first)
  })
  let round = 1
  while (picked.length < limit) {
    let added = false
    for (const key of order) {
      const row = byNode.get(key)[round]
      if (!row) continue
      picked.push(row)
      added = true
      if (picked.length >= limit) break
    }
    if (!added) break
    round += 1
  }
  return picked.slice(0, limit)
}

function captionForNode(nodes, nodeId) {
  const node = findStageNode(nodes, nodeId)
  return scrubPiiText(node?.note || '').slice(0, 48)
}

const PUBLIC_RESULT_ORDER = ['需处理', '需关注', '状态良好', '仅记录']

function flowContentView(node) {
  const content = node && node.content
  return content && typeof content === 'object' ? content : {}
}

function flowViewsOfKind(views, kinds) {
  const allow = new Set(Array.isArray(kinds) ? kinds : [kinds])
  return (views || []).filter((view) => allow.has(String((view && view.kind) || '')))
}

function pickFlowChiefComplaint(views) {
  for (const kind of ['inspection_report', 'intake', 'intake_inspection', 'inspection']) {
    for (const view of flowViewsOfKind(views, kind)) {
      const value = String(flowContentView(view).chiefComplaint || '').trim()
      if (value) return value
    }
  }
  return ''
}

function findFlowFindings(views) {
  for (const kinds of [['inspection_report'], ['inspection', 'intake_inspection']]) {
    const rows = []
    flowViewsOfKind(views, kinds).forEach((view) => {
      const findings = flowContentView(view).findings
      if (Array.isArray(findings)) rows.push(...findings)
    })
    if (rows.length) return rows
  }
  return []
}

/** 只取 partName + result（人工结论），不把图片描述写进公开事实 */
function summarizeFlowFindings(findings) {
  const groups = new Map()
  const seen = new Set()
  ;(findings || []).forEach((row) => {
    if (!row || typeof row !== 'object') return
    const partName = String(row.partName || '').trim()
    if (!partName) return
    const result = String(row.result || '').trim()
    const key = `${result}|${partName}`
    if (seen.has(key)) return
    seen.add(key)
    if (!groups.has(result)) groups.set(result, [])
    groups.get(result).push(partName)
  })
  const rank = (result) => {
    const idx = PUBLIC_RESULT_ORDER.indexOf(result)
    return idx === -1 ? PUBLIC_RESULT_ORDER.length : idx
  }
  return Array.from(groups.entries())
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([result, names]) => (result ? `${result}：${names.join('、')}` : names.join('、')))
    .join('；')
}

function pickFlowQuoteNames(views) {
  const names = []
  const seen = new Set()
  flowViewsOfKind(views, ['quote_confirm', 'addon_quote_confirm']).forEach((view) => {
    const lines = flowContentView(view).lines
    if (!Array.isArray(lines)) return
    lines.forEach((line) => {
      const name = String((line && line.name) || '').trim()
      if (!name || seen.has(name)) return
      seen.add(name)
      const brand = String((line && line.brand) || '').trim()
      names.push(brand ? `${name}（${brand}）` : name)
    })
  })
  return names
}

function pickFlowWorkNotes(views) {
  const rows = []
  const indexByName = new Map()
  flowViewsOfKind(views, 'work').forEach((view) => {
    const findings = flowContentView(view).findings
    if (!Array.isArray(findings)) return
    findings.forEach((row) => {
      if (!row || typeof row !== 'object') return
      const name = String(row.partName || '').trim()
      const note = String(row.caption || '').trim()
      if (!name) return
      if (!indexByName.has(name)) {
        indexByName.set(name, rows.length)
        rows.push({ name, note })
        return
      }
      const idx = indexByName.get(name)
      if (!rows[idx].note && note) rows[idx].note = note
    })
  })
  return rows
}

function buildFlowRepairPlan(views) {
  const names = pickFlowQuoteNames(views)
  const works = pickFlowWorkNotes(views)
  const chunks = []
  if (names.length) chunks.push(`主要项目：${names.join('、')}`)
  const workText = works
    .map((item) => (item.note ? `${item.name}——${item.note}` : item.name))
    .join('；')
  if (workText) chunks.push(`施工说明：${workText}`)
  return chunks.join('。')
}

function buildFlowResultConfirm(views) {
  for (const view of flowViewsOfKind(views, ['repair_report', 'delivery_photos'])) {
    const content = flowContentView(view)
    const items = (Array.isArray(content.acceptanceItems) ? content.acceptanceItems : [])
      .map((row) => {
        if (!row || typeof row !== 'object') return ''
        const name = String(row.name || (row.kind === 'exterior' ? '外观' : '')).trim()
        if (!name) return ''
        const note = String(row.note || '').trim()
        return note ? `${name}（${note}）` : name
      })
      .filter(Boolean)
    const warranty = [content.warrantyPeriod, content.warrantyNotes]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' · ')
    if (!items.length && !warranty) continue
    const chunks = []
    if (items.length) chunks.push(`验收项目：${items.join('、')}`)
    if (warranty) chunks.push(`质保：${warranty}`)
    return chunks.join('。')
  }
  return ''
}

/**
 * 公开事实文案：只认流程节点 content（店员确认过的项目文本），
 * 旧 stage_* note 只在没有 flow 节点时兜底。
 */
function buildFlowFacts(flowNodeViews) {
  const views = Array.isArray(flowNodeViews) ? flowNodeViews : []
  if (!views.length) return null
  return {
    faultDesc: pickFlowChiefComplaint(views),
    inspectResult: summarizeFlowFindings(findFlowFindings(views)),
    repairPlan: buildFlowRepairPlan(views),
    resultConfirm: buildFlowResultConfirm(views),
  }
}

/**
 * @param {object} albumView buildAlbumView 产物（含 imageMeta）
 * @param {object|null} task pre-mask / authorize task
 * @param {{ authorizationTier?: string, softCap?: number }} [options]
 *        softCap 默认取 PUBLIC_MEDIA_SOFT_CAP（30）：上网图片已取消固定张数，
 *        只留性能护栏，可被调用方按场景下调（如朋友圈九宫格）。
 *        allowStoreProcessedFace 已废弃（保留参数兼容旧调用）：新政策下隐私责任在商家，
 *        平台只做必要技术脱敏，不强制拦截原图——有码用码，无产物放行持久化原图。
 */
function buildPublicView(albumView = {}, task = null, options = {}) {
  const nodes = albumView.nodes || []
  // 上网图片不设固定张数（旧 8 张关键帧口径已废止），只留 30 张性能护栏
  const softCap =
    options.softCap != null ? Number(options.softCap) : PUBLIC_MEDIA_SOFT_CAP
  const publicRows = pickPublicRowsByNode(
    listPublicImageRows(albumView),
    Math.min(softCap, PUBLIC_MEDIA_SOFT_CAP),
  )

  const media = publicRows
    .map((row) => {
      // 节点写回的打码结论优先（DOC-FLOW 真源）；task 资产仅作旧数据兜底
      const nodeMasked = resolvePublicCaseMediaUrl(row.maskedUrl || '')
      const toolMasked = nodeMasked
        ? ''
        : resolveMaskedUrlForImage(task, row.nodeId, row.idx, row.rawUrl)
      // 无打码产物时不再丢弃图片：放行持久化原图（责任在商家）
      const maskedUrl =
        nodeMasked || toolMasked || resolveStoreProcessedPublicUrl(row.rawUrl || '')
      if (!maskedUrl) return null
      return {
        nodeId: row.nodeId,
        idx: row.idx,
        maskedUrl,
        caption: captionForNode(nodes, row.nodeId),
        storeProcessed: !nodeMasked && !toolMasked,
      }
    })
    .filter(Boolean)

  const flowFacts = buildFlowFacts(albumView.flowNodeViews)
  const geo = extractGeoFromAlbumNodes(nodes, {
    coldStart: false,
    serviceName: albumView.serviceName,
    includePlanAmount: false,
    storeNote: albumView.storeNote,
  })

  const facts = {
    faultDesc: scrubPiiText(flowFacts?.faultDesc || geo.faultDesc || '').slice(0, 200),
    inspectResult: scrubPiiText(flowFacts?.inspectResult || geo.inspectResult || '').slice(0, 300),
    repairPlan:
      scrubPiiText(flowFacts?.repairPlan || '').slice(0, 400) ||
      buildPublicRepairPlan(albumView),
    resultConfirm: scrubPiiText(flowFacts?.resultConfirm || geo.resultConfirm || '').slice(0, 200),
  }

  return {
    version: 1,
    authorizationTier: options.authorizationTier || 'named',
    storeName: scrubPiiText(albumView.store?.name || ''),
    storeId: albumView.store?.id || '',
    serviceName: albumView.serviceName || '',
    city: albumView.store?.city || '',
    media,
    facts,
    publicMediaCount: media.length,
    hasRepairPlanText: Boolean(facts.repairPlan),
  }
}

function publicViewToSnapshotNodes(publicView = {}, fallbackNodes = []) {
  const media = Array.isArray(publicView.media) ? publicView.media : []
  const fallback = Array.isArray(fallbackNodes) ? fallbackNodes : []
  if (!media.length) {
    return fallback.map((node) => ({ ...node, images: [] }))
  }

  const urlsByNode = {}
  media.forEach((item) => {
    const nodeId = String((item && item.nodeId) || '')
    const url = String((item && item.maskedUrl) || '').trim()
    if (!nodeId || !url) return
    if (!urlsByNode[nodeId]) urlsByNode[nodeId] = []
    urlsByNode[nodeId].push(url)
  })

  // 没有节点真源（旧快照）：退回按 media 分组，保证不丢图
  if (!fallback.length) {
    return Object.keys(urlsByNode).map((nodeId) => ({
      id: nodeId,
      nodeId,
      title: '',
      note: '',
      images: Array.from(new Set(urlsByNode[nodeId])),
    }))
  }

  // 保留全部流程节点（无图节点也留标题与说明），图片只取公域池，避免接车/报价图外泄
  return fallback.map((node) => {
    const nodeId = String((node && (node.id || node.nodeId)) || '')
    return {
      ...node,
      id: (node && node.id) || nodeId,
      nodeId,
      title: String((node && node.title) || ''),
      note: scrubPiiText((node && node.note) || '').slice(0, 500),
      images: Array.from(new Set(urlsByNode[nodeId] || [])),
    }
  })
}

function pickPublicViewCover(publicView = {}) {
  const media = Array.isArray(publicView.media) ? publicView.media : []
  const pick = (item) => {
    const url = String((item && item.maskedUrl) || '').trim()
    if (!url) return ''
    // 打码产物优先；无产物时允许持久化原图（责任在商家）
    return resolvePublicCaseMediaUrl(url) || resolveStoreProcessedPublicUrl(url)
  }
  for (let i = media.length - 1; i >= 0; i -= 1) {
    const url = pick(media[i])
    if (url) return url
  }
  for (const item of media) {
    const url = pick(item)
    if (url) return url
  }
  return ''
}

module.exports = {
  buildPublicView,
  buildFlowFacts,
  buildPublicRepairPlan,
  publicViewToSnapshotNodes,
  pickPublicViewCover,
  listPublicImageRows,
}
