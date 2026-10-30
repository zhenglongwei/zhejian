/**
 * 公开档案页服务流转（只读、脱敏、无金额）
 * 口径：15_ §7.9 / 设计体系 §10.8.2
 */

const {
  resolvePublicCaseMediaUrl,
  resolveStoreProcessedPublicUrl,
  isDesensitizedMediaUrl,
} = require('../lib/media-url')

const SKIP_PHOTO_KINDS = {
  intake_inspection: true,
  intake: true,
  inspection: true,
  delivery_photos: true,
}

function text(value) {
  return String(value || '').trim()
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
  const pub = resolvePublicCaseMediaUrl(key) || resolveStoreProcessedPublicUrl(key) || ''
  if (pub) return pub
  // 托管核对：尚未公开的原图也要能预览/点图打码
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
    if (text(bag.deliveryExteriorUrl) && text(bag.deliveryExteriorMaskedUrl)) {
      rememberUrl(lookup, bag.deliveryExteriorUrl, bag.deliveryExteriorMaskedUrl)
    }
    ;['findings', 'workItems', 'items', 'lines'].forEach((key) => {
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
    const onNode = text(item.maskedUrl || item.desensitizedUrl || item.preMaskedUrl)
    if (onNode) {
      return (
        resolvePublicCaseMediaUrl(onNode) ||
        resolveStoreProcessedPublicUrl(onNode) ||
        (lookup && lookup._allowPrivateFallback ? onNode : '') ||
        ''
      )
    }
  }
  const raw = typeof item === 'string' ? item : item && (item.url || item.src || item.rawUrl)
  return publicizeUrl(raw, lookup)
}

function stripLine(row, lookup) {
  if (!row || typeof row !== 'object') return null
  const name = text(row.name || row.partName)
  const brand = text(row.brand)
  const note = text(row.note || row.advice)
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
  const url = resolvePhotoDisplayUrl(row, lookup)
  const partName = text(row.partName)
  const advice = text(row.advice || row.caption)
  if (!url && !partName && !advice) return null
  return { url, partName, advice }
}

function collectWorkPhotos(node, lookup) {
  const draft = (node && node.photoDraft && typeof node.photoDraft === 'object' && node.photoDraft) || {}
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
    const caption = [text(item.partName), text(item.caption || item.note || item.advice)]
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

function photosFromPublicNodes(contentNodes, titleHints) {
  const photos = []
  const seen = new Set()
  const hints = titleHints || []
  ;(contentNodes || []).forEach((node) => {
    const title = text(node && node.title)
    if (hints.length && !hints.some((hint) => title.indexOf(hint) >= 0)) return
    const urls = []
    ;(node.imagesDesensitized || []).forEach((img) => {
      urls.push(typeof img === 'string' ? img : img && (img.maskedUrl || img.url))
    })
    ;(node.images || []).forEach((img) => {
      if (typeof img === 'string') urls.push(img)
      else if (img) urls.push(img.maskedUrl || img.preMaskedUrl || img.url)
    })
    urls.forEach((u) => {
      const pub = resolvePublicCaseMediaUrl(u) || resolveStoreProcessedPublicUrl(u) || ''
      if (!pub || seen.has(pub)) return
      seen.add(pub)
      photos.push({ url: pub, caption: text(node.note) })
    })
  })
  return photos
}

/** 工单条目（公网版，去金额）：项目 + 用料/品牌/数量 + 说明 */
function collectWorkSheetPublicItems(node) {
  const draft =
    (node && node.photoDraft && typeof node.photoDraft === 'object' && node.photoDraft) || {}
  const rows = Array.isArray(draft.findings) ? draft.findings : []
  return rows
    .map((row) => {
      const name = text(row && row.partName)
      const note = [text(row && row.material), text(row && row.brand), text(row && row.qty), text(row && row.caption)]
        .filter(Boolean)
        .join(' · ')
      if (!name && !note) return null
      return { name, brand: text(row && row.brand), note }
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
    const caption = text(typeof item === 'object' && item ? item.caption || item.note : '')
    photos.push({ url: pub, caption })
  })
  return photos
}

function chapterHasContent(chapter) {
  if (!chapter) return false
  if (text(chapter.chiefComplaint)) return true
  if (text(chapter.note)) return true
  if (text(chapter.warrantyPeriod) || text(chapter.warrantyNotes)) return true
  if (Array.isArray(chapter.findings) && chapter.findings.length) return true
  if (Array.isArray(chapter.items) && chapter.items.length) return true
  if (Array.isArray(chapter.photos) && chapter.photos.length) return true
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

function mapDocumentChapter(node, lookup) {
  const doc = (node && node.document) || {}
  if (text(doc.status) === 'cancelled') return null
  const payload = (doc.payload && typeof doc.payload === 'object' && doc.payload) || {}
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
  if (kind === 'repair_report') {
    const itemsSource = Array.isArray(payload.workItems)
      ? payload.workItems
      : Array.isArray(payload.items)
        ? payload.items
        : []
    return {
      id: node.id || '',
      kind,
      title: publicTitle(node),
      items: itemsSource.map((row) => stripLine(row, lookup)).filter(Boolean),
      photos: collectDeliveryPhotos(payload, lookup),
      warrantyPeriod: text(payload.warrantyPeriod),
      warrantyNotes: text(payload.warrantyNotes || payload.warrantyScope),
    }
  }
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
  if (input.allowPrivateFallback) lookup._allowPrivateFallback = true
  const chapters = []
  flowNodes.forEach((node) => {
    if (!node) return
    const kind = text(node.kind)
    if (SKIP_PHOTO_KINDS[kind]) return
    if (kind === 'work') {
      let photos = collectWorkPhotos(node, lookup)
      if (!photos.length) {
        photos = photosFromPublicNodes(input.contentNodes, ['施工', '工单'])
      }
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
    const chapter = mapDocumentChapter(node, lookup)
    if (chapterHasContent(chapter)) chapters.push(chapter)
  })
  return { chapters }
}

module.exports = {
  buildPublicServiceFlow,
  buildPublicUrlLookup,
}
