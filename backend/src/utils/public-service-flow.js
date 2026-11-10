/**
 * 公开档案页服务流转（只读、脱敏、无金额）
 * 口径：15_ §7.9 / 设计体系 §10.8.2
 * 完工章：简述 + 车主关心问答 + 外观照片 + 逐项验收（含验收图）+ 质保（禁止再列方案/工单项目）
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
    ;['photos', 'deliveryPhotos', 'discoveryImages', 'pendingImages'].forEach((key) => {
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
    if (node.photoDraft) harvestBag(node.photoDraft)
    if (node.document && node.document.payload) harvestBag(node.document.payload)
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
  let evidenceUrl = ''
  if (text(row.evidenceMaskedUrl)) {
    evidenceUrl =
      resolvePublicCaseMediaUrl(row.evidenceMaskedUrl) ||
      resolveStoreProcessedPublicUrl(row.evidenceMaskedUrl) ||
      (lookup && lookup._allowPrivateFallback ? text(row.evidenceMaskedUrl) : '')
  }
  if (!evidenceUrl) evidenceUrl = publicizeUrl(row.evidenceUrl, lookup)
  if (!name && !note && !evidenceUrl) return null
  return { name, brand, note, evidenceUrl }
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

function collectWorkPhotos(node, lookup) {
  const draft = contentOfFlowNode(node)
  const findings = Array.isArray(draft.findings) ? draft.findings : []
  const photos = []
  const seenRaw = new Set()
  findings.forEach((raw) => {
    const item = raw && typeof raw === 'object' ? raw : {}
    const slots = []
    if (Array.isArray(item.images) && item.images.length) {
      item.images.forEach((img) => slots.push(img))
    } else if (item.url) {
      // 仅存量一图一项；禁止因顶层 maskedUrl 把整项（可能串了别的码）再推一次
      slots.push(item)
    }
    const caption = [text(item.partName), cleanPublicNote(item.caption || item.note || item.advice)]
      .filter(Boolean)
      .join(' · ')
    slots.forEach((slot) => {
      const rawSrc =
        typeof slot === 'string' ? slot : slot && (slot.url || slot.src || slot.rawUrl)
      const rawKey = urlKey(rawSrc)
      // 按原图身份去重，避免不同原图被映射成同一打码 URL 时工单只剩交车那一张
      if (rawKey && seenRaw.has(rawKey)) return
      const pub = resolvePhotoDisplayUrl(slot, lookup)
      if (!pub) return
      if (rawKey) seenRaw.add(rawKey)
      else if (photos.some((p) => p.url === pub)) return
      photos.push({ url: pub, caption })
    })
  })
  return photos
}

/** 工单条目（公网版，去金额）：项目 + 用料/品牌/数量；说明文字只在图说展示，避免一图两段重复 */
function collectWorkSheetPublicItems(node) {
  const draft = contentOfFlowNode(node)
  const rows = Array.isArray(draft.findings) ? draft.findings : []
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const name = text(row.partName)
      const hasPhoto = Boolean(text(row.url)) || (Array.isArray(row.images) && row.images.length > 0)
      const noteParts = [text(row.material), text(row.brand), text(row.qty)]
      if (!hasPhoto) noteParts.push(cleanPublicNote(row.caption))
      const note = noteParts.filter(Boolean).join(' · ')
      if (!name && !note) return null
      return { name, brand: text(row.brand), note }
    })
    .filter(Boolean)
}

function collectDeliveryPhotos(payload, lookup) {
  const list = Array.isArray(payload.deliveryPhotos) ? payload.deliveryPhotos : []
  const photos = []
  const seenRaw = new Set()
  list.forEach((item) => {
    const rawSrc = typeof item === 'string' ? item : item && (item.url || item.src || item.rawUrl)
    const rawKey = urlKey(rawSrc)
    if (rawKey && seenRaw.has(rawKey)) return
    const pub = resolvePhotoDisplayUrl(item, lookup)
    if (!pub) return
    if (rawKey) seenRaw.add(rawKey)
    else if (photos.some((p) => p.url === pub)) return
    const caption = cleanPublicNote(typeof item === 'object' && item ? item.caption || item.note : '')
    photos.push({ url: pub, caption })
  })
  return photos
}

function mapOwnerFaqs(payload) {
  const rows = Array.isArray(payload && payload.ownerFaqs) ? payload.ownerFaqs : []
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const question = text(row.question || row.q)
      const answer = text(row.answer || row.a)
      if (!question || !answer) return null
      return { question, answer }
    })
    .filter(Boolean)
}

function chapterHasContent(chapter) {
  if (!chapter) return false
  if (text(chapter.chiefComplaint)) return true
  if (text(chapter.note)) return true
  if (text(chapter.repairBrief)) return true
  if (text(chapter.warrantyPeriod) || text(chapter.warrantyNotes)) return true
  if (Array.isArray(chapter.findings) && chapter.findings.length) return true
  if (Array.isArray(chapter.items) && chapter.items.length) return true
  if (Array.isArray(chapter.photos) && chapter.photos.length) return true
  if (Array.isArray(chapter.ownerFaqs) && chapter.ownerFaqs.length) return true
  if (Array.isArray(chapter.acceptanceItems) && chapter.acceptanceItems.length) return true
  return false
}

function publicTitle(node) {
  const kind = text(node && node.kind)
  const addon =
    kind === 'addon_quote_confirm' || text(node && node.insertedReason) === 'addon'
  if (addon) return '施工中新发现'
  if (kind === 'quote_confirm') return '方案'
  if (kind === 'work') return '工单'
  if (kind === 'repair_report') return '完工'
  if (kind === 'work') return '施工'
  if (kind === 'inspection_report') return '检测报告'
  return text(node && node.title) || '记录'
}

const ACCEPTANCE_RESULT_LABELS = { pass: '合格', observe: '建议观察', rework: '需返工' }

/**
 * 公网完工章验收（2026-11-10 定稿）：按施工项目逐项原样展示（含「建议观察」），带验收图（走脱敏映射）。
 * 只认 acceptanceItems；旧结构由迁移脚本搬完，读侧不做兼容。
 */
function mapAcceptanceItems(payload = {}, lookup) {
  return (Array.isArray(payload.acceptanceItems) ? payload.acceptanceItems : [])
    .map((row, index) => {
      const obj = row && typeof row === 'object' ? row : {}
      const name = text(obj.name)
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
        id: text(obj.id) || `acc_${index + 1}`,
        name,
        standard: cleanPublicNote(obj.standard),
        method: cleanPublicNote(obj.method),
        note: cleanPublicNote(obj.note),
        result,
        resultLabel: result ? ACCEPTANCE_RESULT_LABELS[result] : '',
        images,
      }
    })
    .filter(Boolean)
}

function mapRepairChapter(node, lookup) {
  const payload = contentOfFlowNode(node)
  return {
    id: node.id || '',
    kind: 'repair_report',
    title: publicTitle(node),
    // 公网完工不重列方案/工单项目；项目只在上游章
    items: [],
    photos: collectDeliveryPhotos({ deliveryPhotos: payload.deliveryPhotos }, lookup),
    repairBrief: text(payload.repairBrief),
    acceptanceItems: mapAcceptanceItems(payload, lookup),
    ownerFaqs: mapOwnerFaqs(payload),
    warrantyPeriod: text(payload.warrantyPeriod),
    warrantyNotes: publicWarrantyNotes({
      warrantyNotes: payload.warrantyNotes,
      warrantyScope: payload.warrantyScope,
    }),
  }
}

function mapDocumentChapter(node, lookup, allNodes = []) {
  const doc = (node && node.document) || {}
  if (text(doc.status) === 'cancelled') return null
  const payload = contentOfFlowNode(node)
  const kind = text(node.kind)
  if (kind === 'inspection_report') {
    return {
      id: node.id || '',
      kind,
      title: publicTitle(node),
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
      title: publicTitle(node),
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
  flowNodes.forEach((node) => {
    if (!node) return
    const kind = text(node.kind)
    if (SKIP_PHOTO_KINDS[kind]) return
    if (kind === 'work') {
      const photos = collectWorkPhotos(node, lookup)
      const chapter = {
        id: node.id || '',
        kind: 'work',
        title: '工单',
        photos,
        items: collectWorkSheetPublicItems(node),
      }
      if (chapterHasContent(chapter)) chapters.push(chapter)
      return
    }
    const chapter = mapDocumentChapter(node, lookup, flowNodes)
    if (chapterHasContent(chapter)) chapters.push(chapter)
  })
  return { chapters }
}

module.exports = {
  buildPublicServiceFlow,
  buildPublicUrlLookup,
  resolvePhotoDisplayUrl,
}
