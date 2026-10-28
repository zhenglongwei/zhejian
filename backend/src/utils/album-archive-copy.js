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
    .slice(0, 6)
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
  readArchiveCopyFromAlbum,
  mergeArchiveCopyIntoPackage,
}
