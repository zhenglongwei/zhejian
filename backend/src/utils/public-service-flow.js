/**
 * 公开档案页服务流转（只读、脱敏、无金额）
 * 口径：15_ §7.9 / 设计体系 §10.8.2
 * 完工章：外观照片 + 逐项验收（含验收图）+ 质保（禁止再列方案/工单项目）
 * 施工图：只读工单节点 content 挂图（禁止 stage_* / 标题兜底拼章）
 */

const {
  resolvePublicCaseMediaUrl,
  resolveStoreProcessedPublicUrl,
  isDesensitizedMediaUrl,
} = require('../lib/media-url')
const { resolveShared } = require('./resolve-shared')
const { contentOfFlowNode } = resolveShared('utils/service-flow-docs.js')

const SKIP_PHOTO_KINDS = {
  intake_inspection: true,
  intake: true,
  inspection: true,
  delivery_photos: true,
}

function text(value) {
  return String(value || '').trim()
}

/** 公开页不展示未填的方括号占位，也不把「无」当成质保说明。 */
function cleanPublicNote(value) {
  let v = text(value)
  if (!v) return ''
  v = v.replace(/\[(?:品牌|粘度|规格|型号|配件|材料)\]/g, '')
  v = v.replace(/[（(]\s*规格\s*[:：]\s*[）)]/g, '')
  v = v.replace(/\s{2,}/g, ' ')
  return v.trim()
}

function publicWarrantyNotes(payload) {
  const raw = text(payload.warrantyNotes || payload.warrantyScope)
  const bare = raw.replace(/[。．.]$/, '')
  if (!bare || bare === '无' || bare === '暂无' || bare === '没有' || bare === '无备注') return ''
  return raw
}

function urlKey(url) {
  return text(url).split('?')[0]
}

function publicizeUrl(url, lookup) {
  const key = urlKey(url)
  if (!key) return ''
  if (lookup.has(key)) return lookup.get(key)
  const stripped = urlKey(key.split('?')[0])
  if (stripped && lookup.has(stripped)) return lookup.get(stripped)
  // 公开预览 / 公域：只出脱敏产物。禁止把原图 uploads 当成「可公开面」回退。
  const desensitized = resolvePublicCaseMediaUrl(key) || ''
  if (desensitized) return desensitized
  if (lookup && lookup._requireDesensitized) return ''
  const pub = resolveStoreProcessedPublicUrl(key) || ''
  if (pub) return pub
  // 仅私密托管核对：尚未打码的原图可预览/点图改码
  if (lookup && lookup._allowPrivateFallback) return key
  return ''
}

function rememberUrl(lookup, from, to) {
  const target = text(to)
  if (!target) return
  // 解析失败仍写入映射，避免打码产物被静默丢掉后预览回落原图
  const pub =
    resolvePublicCaseMediaUrl(target) || resolveStoreProcessedPublicUrl(target) || target
  const setPair = (key) => {
    const k = urlKey(key)
    if (!k) return
    const existing = lookup.get(k)
    // 已有打码映射时，禁止用原图覆盖（否则托管预览出原图、点进工作台却已打码）
    if (existing && isDesensitizedMediaUrl(existing) && !isDesensitizedMediaUrl(pub)) {
      return
    }
    lookup.set(k, pub)
  }
  if (from) setPair(from)
  setPair(target)
  setPair(pub)
}

function applyMaskLookup(lookup, maskLookup) {
  if (!maskLookup) return
  const entries =
    maskLookup instanceof Map
      ? maskLookup
      : maskLookup.byRawUrl instanceof Map
        ? maskLookup.byRawUrl
        : null
  if (!entries) return
  entries.forEach((masked, raw) => {
    rememberUrl(lookup, raw, masked)
  })
}

/** 从节点图对象收获已写回的 maskedUrl（展示真源优先于任务旁路） */
function harvestFlowNodeMaskedUrls(lookup, flowNodes) {
  const harvestSlot = (slot) => {
    if (!slot) return
    if (typeof slot === 'string') return
    if (typeof slot !== 'object') return
    const raw = text(slot.url || slot.src || slot.rawUrl)
    const masked = text(slot.maskedUrl || slot.desensitizedUrl || slot.preMaskedUrl)
    if (raw && masked) rememberUrl(lookup, raw, masked)
  }
  const harvestBag = (bag) => {
    if (!bag || typeof bag !== 'object') return
    ;['photos', 'discoveryImages', 'pendingImages'].forEach((key) => {
      ;(Array.isArray(bag[key]) ? bag[key] : []).forEach(harvestSlot)
    })
    ;['findings', 'workItems', 'items', 'lines', 'acceptanceItems'].forEach((key) => {
      ;(Array.isArray(bag[key]) ? bag[key] : []).forEach((row) => {
        if (!row || typeof row !== 'object') return
        harvestSlot(row)
        ;(Array.isArray(row.images) ? row.images : []).forEach(harvestSlot)
        if (text(row.evidenceUrl) && text(row.evidenceMaskedUrl)) {
          rememberUrl(lookup, row.evidenceUrl, row.evidenceMaskedUrl)
        }
      })
    })
  }
  ;(flowNodes || []).forEach((node) => {
    if (!node) return
    if (node.content) harvestBag(node.content)
  })
}

function buildPublicUrlLookup({ album, contentNodes, publicView, maskLookup, flowNodes } = {}) {
  const lookup = new Map()
  const images = (album && Array.isArray(album.images) ? album.images : []) || []
  images.forEach((img) => {
    if (!img || typeof img !== 'object') return
    rememberUrl(
      lookup,
      img.rawUrl || img.url,
      img.maskedUrl || img.desensitizedUrl || img.preMaskedUrl || '',
    )
    rememberUrl(lookup, img.rawUrl, img.maskedUrl || img.desensitizedUrl)
  })
  // 节点上已写回的打码字段优先入表
  harvestFlowNodeMaskedUrls(lookup, flowNodes)
  ;(contentNodes || []).forEach((node) => {
    ;(node.imagesDesensitized || []).forEach((img) => {
      const url = typeof img === 'string' ? img : img && (img.maskedUrl || img.url)
      rememberUrl(lookup, url, url)
    })
    ;(node.images || []).forEach((img) => {
      // 无打码产物时不要 raw→raw 占坑，留给后面的 maskLookup
      if (typeof img === 'string') return
      if (!img) return
      const masked = img.maskedUrl || img.preMaskedUrl || ''
      if (masked) rememberUrl(lookup, img.url || img.rawUrl, masked)
    })
  })
  const media = (publicView && Array.isArray(publicView.media) && publicView.media) || []
  media.forEach((row) => {
    if (row && row.maskedUrl) rememberUrl(lookup, row.maskedUrl, row.maskedUrl)
  })
  // 任务旁路兜底（旧数据尚未写回节点时）；不得盖掉节点已有打码
  applyMaskLookup(lookup, maskLookup)
  return lookup
}

function resolvePhotoDisplayUrl(item, lookup) {
  if (item && typeof item === 'object') {
    const outcome = text(item.maskOutcome || item.privacyMaskStatus)
    const onNode = text(item.maskedUrl || item.desensitizedUrl || item.preMaskedUrl)
    if (onNode) {
      const asTool = resolvePublicCaseMediaUrl(onNode)
      if (asTool) return asTool
      // 节点已写回的贴码产物
      const asProduct = resolveStoreProcessedPublicUrl(onNode)
      if (asProduct) return asProduct
      if (lookup && lookup._requireDesensitized) return ''
      if (lookup && lookup._allowPrivateFallback) return onNode
      return ''
    }
    const raw = text(item.url || item.src || item.rawUrl)
    if (!raw) return ''
    // 无须打码，或托管重试后仍失败：允许原图上网（责任在商家）
    const allowOriginal =
      outcome === 'ok_no_privacy' ||
      outcome === 'not_analyzed' ||
      outcome === 'pending' ||
      outcome === 'llm_failed' ||
      outcome === 'call_failed' ||
      outcome === 'mask_failed' ||
      outcome === 'ok_detect_mask_failed'
    if (allowOriginal) {
      if (lookup && lookup._requireDesensitized) {
        return resolveStoreProcessedPublicUrl(raw) || raw
      }
      return publicizeUrl(raw, lookup) || raw
    }
  }
  const raw = typeof item === 'string' ? item : item && (item.url || item.src || item.rawUrl)
  return publicizeUrl(raw, lookup)
}

function stripLine(row, lookup) {
  if (!row || typeof row !== 'object') return null
  const name = text(row.name || row.partName)
  const brand = text(row.brand)
  const note = cleanPublicNote(row.note || row.caption || row.advice)
  // 收集该报价项下的所有图片（evidence + images 数组）
  const images = []
  const evidenceRaw = text(row.evidenceUrl)
  const evidenceMasked = text(row.evidenceMaskedUrl)
  const evidenceResolved = evidenceMasked
    ? (resolvePublicCaseMediaUrl(evidenceMasked) ||
        resolveStoreProcessedPublicUrl(evidenceMasked) ||
        (lookup && lookup._allowPrivateFallback ? evidenceMasked : ''))
    : publicizeUrl(evidenceRaw, lookup)
  if (evidenceResolved) images.push({ url: evidenceResolved })
  if (Array.isArray(row.images)) {
    row.images.forEach((img) => {
      const pub = resolvePhotoDisplayUrl(img, lookup)
      if (pub && !images.some((p) => p.url === pub)) images.push({ url: pub })
    })
  }
  const evidenceUrl = evidenceResolved || (images[0] && images[0].url) || ''
  if (!name && !note && !images.length) return null
  // 报价金额：已确认口径下公开，非正数或缺省时不展示
  const rawAmount = Number(row.amount)
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : null
  return { name, brand, note, amount, evidenceUrl, images }
}

function mapFinding(row, lookup) {
  if (!row || typeof row !== 'object') return null
  const partName = text(row.partName)
  let advice = cleanPublicNote(row.advice || row.caption)
  if (partName && advice.startsWith(partName)) {
    const rest = advice.slice(partName.length).replace(/^[：:·\s]+/, '')
    if (rest) advice = rest
  }
  const slots = []
  if (Array.isArray(row.images) && row.images.length) {
    row.images.forEach((img) => slots.push(img))
  } else if (row.url || row.maskedUrl || row.maskOutcome) {
    slots.push(row)
  }
  const images = []
  const seen = new Set()
  slots.forEach((slot) => {
    const rawSrc =
      typeof slot === 'string' ? slot : slot && (slot.url || slot.src || slot.rawUrl)
    const rawKey = urlKey(rawSrc)
    if (rawKey && seen.has(rawKey)) return
    const pub = resolvePhotoDisplayUrl(slot, lookup)
    if (!pub) return
    if (rawKey) seen.add(rawKey)
    images.push({ url: pub })
  })
  const url = images[0] ? images[0].url : ''
  if (!url && !partName && !advice) return null
  return { url, partName, result: text(row.result), advice, images }
}

/**
 * 统一工单条目（公网版，去金额）：每个 item = { name, images[], note }
 * 不再拆 photos / items 两个数组，避免「项目文字和图片分离」的展示问题。
 */
function collectWorkItemsUnified(node, lookup) {
  const draft = contentOfFlowNode(node)
  const findings = Array.isArray(draft.findings) ? draft.findings : []
  const seenRaw = new Set()
  return findings
    .map((raw) => {
      const row = raw && typeof raw === 'object' ? raw : {}
      const name = text(row.partName)
      const noteParts = [
        text(row.material),
        text(row.brand),
        text(row.qty),
        cleanPublicNote(row.caption || row.note),
      ].filter(Boolean)
      const note = noteParts.join(' · ')
      // 收集该项目下的所有图片
      const images = []
      const slots = []
      if (Array.isArray(row.images) && row.images.length) {
        row.images.forEach((img) => slots.push(img))
      } else if (row.url) {
        slots.push(row)
      }
      slots.forEach((slot) => {
        const rawSrc =
          typeof slot === 'string' ? slot : slot && (slot.url || slot.src || slot.rawUrl)
        const rawKey = urlKey(rawSrc)
        if (rawKey && seenRaw.has(rawKey)) return
        const pub = resolvePhotoDisplayUrl(slot, lookup)
        if (!pub) return
        if (rawKey) seenRaw.add(rawKey)
        else if (images.some((p) => p.url === pub)) return
        images.push({ url: pub })
      })
      if (!name && !note && !images.length) return null
      return { name, brand: text(row.brand), note, images }
    })
    .filter(Boolean)
}

function chapterHasContent(chapter) {
  if (!chapter) return false
  if (text(chapter.chiefComplaint)) return true
  if (text(chapter.note)) return true
  if (text(chapter.warrantyPeriod) || text(chapter.warrantyNotes)) return true
  if (Array.isArray(chapter.findings) && chapter.findings.length) return true
  if (Array.isArray(chapter.items) && chapter.items.length) return true
  if (Array.isArray(chapter.photos) && chapter.photos.length) return true
  if (Array.isArray(chapter.acceptanceItems) && chapter.acceptanceItems.length) return true
  return false
}

function publicTitle(node, prevKind) {
  const kind = text(node && node.kind)
  if (kind === 'addon_quote_confirm') {
    // 看前一个章节是什么 kind 来决定标题：
    // 前一个是 work → 施工中新发现；前一个是 repair_report → 交车时补充；
    // 前一个是 quote_confirm 或无 → 补充报价（中性）
    if (prevKind === 'work') return '施工中新发现'
    if (prevKind === 'repair_report') return '交车时补充'
    return '补充报价'
  }
  if (text(node && node.insertedReason) === 'addon') return '施工中新发现'
  if (kind === 'quote_confirm') return '方案'
  if (kind === 'work') return '施工'
  if (kind === 'repair_report') return '完工'
  if (kind === 'inspection_report') return '检测报告'
  return text(node && node.title) || '记录'
}

const ACCEPTANCE_RESULT_LABELS = { pass: '合格', observe: '建议观察', rework: '需返工' }

/**
 * 公网完工章验收（2026-11-10 二次收敛）：一张清单，施工项目逐行 + 外观末行，只有图片 / 结果 / 描述。
 * 只认 acceptanceItems；旧结构由迁移脚本搬完，读侧不做兼容。
 */
function mapAcceptanceItems(payload = {}, lookup) {
  const rows = (Array.isArray(payload.acceptanceItems) ? payload.acceptanceItems : [])
    .map((row, index) => {
      const obj = row && typeof row === 'object' ? row : {}
      const isExterior = obj.kind === 'exterior'
      const name = text(obj.name) || (isExterior ? '外观' : '')
      if (!name) return null
      const result = ['pass', 'observe', 'rework'].includes(obj.result) ? obj.result : ''
      const images = (Array.isArray(obj.images) ? obj.images : [])
        .map((img) => {
          const url = text(img && (img.url || img.rawUrl || img.maskedUrl))
          if (!url) return ''
          return resolvePhotoDisplayUrl(img, lookup) || publicizeUrl(url, lookup)
        })
        .filter(Boolean)
        .map((url) => ({ url }))
      return {
        id: text(obj.id) || (isExterior ? 'exterior' : `acc_${index + 1}`),
        kind: isExterior ? 'exterior' : 'work',
        name,
        note: cleanPublicNote(obj.note),
        result,
        resultLabel: result ? ACCEPTANCE_RESULT_LABELS[result] : '',
        images,
        // 外观照选填（2026-11-11）：缺图如实标注，读侧渲染「商家未留外观照」
        missingPhoto: Boolean(isExterior && !images.length),
      }
    })
    .filter(Boolean)
  return rows
    .filter((row) => row.kind !== 'exterior')
    .concat(rows.filter((row) => row.kind === 'exterior'))
}

function mapRepairChapter(node, lookup) {
  const payload = contentOfFlowNode(node)
  return {
    id: node.id || '',
    kind: 'repair_report',
    title: publicTitle(node),
    // 公网完工不重列方案/工单项目；项目只在上游章
    items: [],
    photos: [],
    acceptanceItems: mapAcceptanceItems(payload, lookup),
    warrantyPeriod: text(payload.warrantyPeriod),
    warrantyNotes: publicWarrantyNotes({
      warrantyNotes: payload.warrantyNotes,
      warrantyScope: payload.warrantyScope,
    }),
    // 定稿时确认过「不拍外观照」的留痕，公开侧与商家端一致
    exteriorPhotoWaived: payload.exteriorPhotoWaived === true,
  }
}

function mapDocumentChapter(node, lookup, allNodes = [], prevKind = '') {
  const doc = (node && node.document) || {}
  if (text(doc.status) === 'cancelled') return null
  const payload = contentOfFlowNode(node)
  const kind = text(node.kind)
  if (kind === 'inspection_report') {
    return {
      id: node.id || '',
      kind,
      title: publicTitle(node, prevKind),
      chiefComplaint: text(payload.chiefComplaint),
      findings: (Array.isArray(payload.findings) ? payload.findings : [])
        .map((row) => mapFinding(row, lookup))
        .filter(Boolean),
    }
  }
  if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
    return {
      id: node.id || '',
      kind,
      title: publicTitle(node, prevKind),
      items: (Array.isArray(payload.lines) ? payload.lines : [])
        .map((row) => stripLine(row, lookup))
        .filter(Boolean),
    }
  }
  if (kind === 'repair_report') return mapRepairChapter(node, lookup)
  return null
}

function sortFlowNodes(nodes = []) {
  return nodes.slice().sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
}

const DELIVERY_PHOTO_KINDS = { delivery_photos: true, repair_report: true }

function nameKey(value) {
  return text(value).replace(/\s+/g, '')
}

/**
 * 交车节点里的施工项验收图：商家可能在施工节点漏拍，流程不能回转，
 * 于是把施工照片传到了交车节点。这些图属于施工证据，收进施工章；
 * 整车外观照（exterior）与未施工项（unbuiltReason）不收。
 */
function collectDeliveryWorkPhotos(flowNodes, lookup) {
  const rows = []
  const seen = new Set()
  flowNodes.forEach((node) => {
    const kind = text(node && node.kind)
    if (!DELIVERY_PHOTO_KINDS[kind]) return
    const payload = contentOfFlowNode(node)
    const acceptance = Array.isArray(payload.acceptanceItems) ? payload.acceptanceItems : []
    acceptance.forEach((row) => {
      if (!row || typeof row !== 'object') return
      if (row.kind === 'exterior' || text(row.unbuiltReason)) return
      const name = text(row.name)
      if (!name) return
      const images = []
      ;(Array.isArray(row.images) ? row.images : []).forEach((img) => {
        const rawKey = urlKey(
          typeof img === 'string' ? img : img && (img.url || img.rawUrl || img.maskedUrl),
        )
        if (rawKey && seen.has(rawKey)) return
        const url = resolvePhotoDisplayUrl(img, lookup)
        if (!url) return
        if (rawKey) seen.add(rawKey)
        images.push({ url })
      })
      if (images.length) rows.push({ name, images })
    })
  })
  return rows
}

/** 把交车节点施工图并入施工章；没有施工章时补一个，排在完工之前 */
function mergeDeliveryWorkPhotos(chapters, flowNodes, lookup) {
  const rows = collectDeliveryWorkPhotos(flowNodes, lookup)
  if (!rows.length) return
  let work = chapters.find((chapter) => chapter && chapter.kind === 'work')
  if (!work) {
    work = { id: '', kind: 'work', title: '施工', items: [] }
    const before = chapters.findIndex(
      (chapter) => chapter && (chapter.kind === 'repair_report' || chapter.kind === 'addon_quote_confirm'),
    )
    if (before >= 0) chapters.splice(before, 0, work)
    else chapters.push(work)
  }
  if (!Array.isArray(work.items)) work.items = []
  rows.forEach((row) => {
    const key = nameKey(row.name)
    const target = work.items.find((item) => nameKey(item && item.name) === key)
    if (!target) {
      work.items.push({ name: row.name, brand: '', note: '', images: row.images })
      return
    }
    if (!Array.isArray(target.images)) target.images = []
    row.images.forEach((img) => {
      if (!target.images.some((item) => urlKey(item && item.url) === urlKey(img.url))) {
        target.images.push(img)
      }
    })
  })
}

/**
 * @returns {{ chapters: object[] }}
 */
function buildPublicServiceFlow(input = {}) {
  const flowNodes = sortFlowNodes(input.flowNodes || [])
  if (!flowNodes.length) return { chapters: [] }
  const lookup = buildPublicUrlLookup({ ...input, flowNodes })
  if (input.requireDesensitized) lookup._requireDesensitized = true
  if (input.allowPrivateFallback && !input.requireDesensitized) {
    lookup._allowPrivateFallback = true
  }
  const chapters = []
  let prevKind = ''
  flowNodes.forEach((node) => {
    if (!node) return
    const kind = text(node.kind)
    if (SKIP_PHOTO_KINDS[kind]) return
    let chapter = null
    if (kind === 'work') {
      chapter = {
        id: node.id || '',
        kind: 'work',
        title: '施工',
        items: collectWorkItemsUnified(node, lookup),
      }
    } else {
      chapter = mapDocumentChapter(node, lookup, flowNodes, prevKind)
    }
    if (chapterHasContent(chapter)) {
      chapters.push(chapter)
      prevKind = chapter.kind
    }
  })
  mergeDeliveryWorkPhotos(chapters, flowNodes, lookup)
  return { chapters }
}

module.exports = {
  buildPublicServiceFlow,
  buildPublicUrlLookup,
  resolvePhotoDisplayUrl,
}
