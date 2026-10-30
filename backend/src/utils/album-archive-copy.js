/**
 * 本单公开说明草稿 archiveCopy
 * 真源：docs/01_项目总览与业务架构/15_案例档案与托管状态机.md §6.1
 */
const { scrubPiiText } = require('./scrub-pii-text')

function text(value) {
  return String(value || '').trim()
}

function normalizeFaqList(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const q = scrubPiiText(row.q || row.question).slice(0, 80)
      const a = scrubPiiText(row.a || row.answer).slice(0, 280)
      if (!q) return null
      return { q, a }
    })
    .filter(Boolean)
    .slice(0, 5)
}

/** 交车报告定稿 → 兼容旧读侧 archiveCopy */
function archiveCopyFromRepairPayload(payload, options = {}) {
  const brief = text(payload && (payload.repairBrief || payload.summary))
  const faqs = Array.isArray(payload && payload.ownerFaqs)
    ? payload.ownerFaqs
    : Array.isArray(payload && payload.faq)
      ? payload.faq
      : []
  return normalizeArchiveCopy(
    {
      summary: brief,
      faq: faqs.map((row) => ({
        q: row && (row.question || row.q),
        a: row && (row.answer || row.a),
      })),
    },
    { source: options.source || 'repair_report' },
  )
}

function normalizeArchiveCopy(raw, options = {}) {
  const summary = scrubPiiText(raw && (raw.summary || raw.aiSummary)).slice(0, 500)
  const faq = normalizeFaqList(raw && raw.faq)
  if (!summary && !faq.length) return null
  return {
    summary,
    faq,
    generatedAt: text(raw && raw.generatedAt) || new Date().toISOString(),
    source: text(options.source || (raw && raw.source) || 'delivery_ai') || 'delivery_ai',
    factFingerprint: text(options.factFingerprint || (raw && raw.factFingerprint)),
  }
}

function readArchiveCopyFromAlbum(album) {
  const pkg =
    album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  return normalizeArchiveCopy(pkg.archiveCopy, {
    source: pkg.archiveCopy && pkg.archiveCopy.source,
  })
}

/** 优先读已确认交车报告简述/问答；没有再落回 archiveCopy 镜像 */
function readPublicCopyFromAlbum(album) {
  const pkg =
    album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const nodes = Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
  const report = nodes.find((node) => node && node.kind === 'repair_report')
  const status = String((report && report.document && report.document.status) || '')
  const payload =
    (report && report.document && report.document.payload && typeof report.document.payload === 'object'
      ? report.document.payload
      : null) || null
  if (payload && (status === 'confirmed' || status === 'pending_confirm' || status === 'completed')) {
    const fromReport = archiveCopyFromRepairPayload(payload, { source: 'repair_report' })
    if (fromReport) return fromReport
  }
  return readArchiveCopyFromAlbum(album)
}

function mergeArchiveCopyIntoPackage(pkg, archiveCopy) {
  const base = pkg && typeof pkg === 'object' ? { ...pkg } : {}
  const next = normalizeArchiveCopy(archiveCopy, {
    source: archiveCopy && archiveCopy.source,
    factFingerprint: archiveCopy && archiveCopy.factFingerprint,
  })
  if (!next) return base
  base.archiveCopy = next
  return base
}

module.exports = {
  normalizeArchiveCopy,
  normalizeFaqList,
  archiveCopyFromRepairPayload,
  readArchiveCopyFromAlbum,
  readPublicCopyFromAlbum,
  mergeArchiveCopyIntoPackage,
}
