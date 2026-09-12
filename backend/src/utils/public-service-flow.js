/**
 * 公开档案页服务流转（只读、脱敏、无金额）
 * 口径：15_ §7.9 / 设计体系 §10.8.2
 */

const {
  resolvePublicCaseMediaUrl,
  resolveStoreProcessedPublicUrl,
} = require('../lib/media-url')

const SKIP_PHOTO_KINDS = {
  intake_inspection: true,
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
  return resolvePublicCaseMediaUrl(key) || resolveStoreProcessedPublicUrl(key) || ''
}

function rememberUrl(lookup, from, to) {
  const pub =
    resolvePublicCaseMediaUrl(to) ||
    resolveStoreProcessedPublicUrl(to) ||
    resolvePublicCaseMediaUrl(from) ||
    resolveStoreProcessedPublicUrl(from) ||
    ''
  if (!pub) return
  if (from) lookup.set(urlKey(from), pub)
  lookup.set(urlKey(to), pub)
  lookup.set(urlKey(pub), pub)
}

function buildPublicUrlLookup({ album, contentNodes, publicView } = {}) {
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
  ;(contentNodes || []).forEach((node) => {
    ;(node.imagesDesensitized || []).forEach((img) => {
      const url = typeof img === 'string' ? img : img && (img.maskedUrl || img.url)
      rememberUrl(lookup, url, url)
    })
    ;(node.images || []).forEach((img) => {
      if (typeof img === 'string') rememberUrl(lookup, img, img)
      else if (img) {
        rememberUrl(lookup, img.url, img.maskedUrl || img.preMaskedUrl || img.url)
      }
    })
  })
  const media = (publicView && Array.isArray(publicView.media) && publicView.media) || []
  media.forEach((row) => {
    if (row && row.maskedUrl) rememberUrl(lookup, row.maskedUrl, row.maskedUrl)
  })
  return lookup
}

function stripLine(row, lookup) {
  if (!row || typeof row !== 'object') return null
  const name = text(row.name || row.partName)
  const brand = text(row.brand)
  const note = text(row.note || row.advice)
  const evidenceUrl = publicizeUrl(row.evidenceUrl, lookup)
  if (!name && !note && !evidenceUrl) return null
  return { name, brand, note, evidenceUrl }
}

function mapFinding(row, lookup) {
  if (!row || typeof row !== 'object') return null
  const url = publicizeUrl(row.url, lookup)
  const partName = text(row.partName)
  const advice = text(row.advice || row.caption)
  if (!url && !partName && !advice) return null
  return { url, partName, advice }
}

function collectWorkPhotos(node, lookup) {
  const draft = (node && node.photoDraft && typeof node.photoDraft === 'object' && node.photoDraft) || {}
  const findings = Array.isArray(draft.findings) ? draft.findings : []
  const photos = []
  const seen = new Set()
  findings.forEach((raw) => {
    const item = raw && typeof raw === 'object' ? raw : {}
    const urls = []
    if (Array.isArray(item.images)) {
      item.images.forEach((img) => {
        urls.push(typeof img === 'string' ? img : img && img.url)
      })
    }
    if (item.url) urls.push(item.url)
    const caption = [text(item.partName), text(item.caption || item.note || item.advice)]
      .filter(Boolean)
      .join(' · ')
    urls.forEach((u) => {
      const pub = publicizeUrl(u, lookup)
      if (!pub || seen.has(pub)) return
      seen.add(pub)
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

function collectDeliveryPhotos(payload, lookup) {
  const list = Array.isArray(payload.deliveryPhotos) ? payload.deliveryPhotos : []
  const photos = []
  const seen = new Set()
  list.forEach((item) => {
    const raw = typeof item === 'string' ? item : item && item.url
    const pub = publicizeUrl(raw, lookup)
    if (!pub || seen.has(pub)) return
    seen.add(pub)
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
  if (kind === 'work_order') return '工单'
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
  if (kind === 'work_order') {
    return {
      id: node.id || '',
      kind,
      title: publicTitle(node),
      items: (Array.isArray(payload.items) ? payload.items : [])
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
  const lookup = buildPublicUrlLookup(input)
  const chapters = []
  flowNodes.forEach((node) => {
    if (!node) return
    const kind = text(node.kind)
    if (SKIP_PHOTO_KINDS[kind]) return
    if (kind === 'work') {
      let photos = collectWorkPhotos(node, lookup)
      if (!photos.length) {
        photos = photosFromPublicNodes(input.contentNodes, ['施工'])
      }
      const chapter = {
        id: node.id || '',
        kind: 'work',
        title: '施工',
        photos,
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
