/**
 * PUB-GEO · 案例事实骨架 hash（19 §4.3.5 E1）
 * 类目、有证检查/施工项与结果、图↔项绑定、图内容指纹。
 */
const { createHash } = require('crypto')
const { stripUrlQuery } = require('../lib/media-signed-url')

function stableStringify(value) {
  if (value == null) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`
  }
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

function imageFingerprint(img = {}) {
  const id = String(img.id || '').trim()
  const key = String(img.desensitizedKey || img.maskedKey || '').trim()
  const url = stripUrlQuery(String(img.rawUrl || img.url || img.src || '').trim())
  return id || key || url || ''
}

/**
 * @param {{ album?: object, checklistItems?: object[], images?: object[] }} input
 */
function buildCaseSkeletonPayload(input = {}) {
  const album = input.album || {}
  const items = Array.isArray(input.checklistItems) ? input.checklistItems : []
  const images = Array.isArray(input.images) ? input.images : album.images || []

  const evidencedInspect = []
  const evidencedWork = []
  items.forEach((it) => {
    if (!it || !it.itemKey) return
    const hasImg = Array.isArray(it.images)
      ? it.images.length > 0
      : images.some((img) => String(img.checklistItemKey || '') === String(it.itemKey))
    const hasNote = Boolean(String(it.note || '').trim())
    if (!hasImg && !hasNote) return
    const row = {
      itemKey: String(it.itemKey),
      outcome: String(it.outcome || ''),
      workOnly: Boolean(it.workOnly),
    }
    if (it.workOnly || it.inWorkQueue) evidencedWork.push(row)
    else evidencedInspect.push(row)
  })

  evidencedInspect.sort((a, b) => a.itemKey.localeCompare(b.itemKey))
  evidencedWork.sort((a, b) => a.itemKey.localeCompare(b.itemKey))

  const imageBindings = images
    .map((img) => ({
      fp: imageFingerprint(img),
      itemKey: String(img.checklistItemKey || ''),
      nodeId: String(img.nodeId || ''),
    }))
    .filter((row) => row.fp)
    .sort((a, b) => `${a.itemKey}|${a.fp}`.localeCompare(`${b.itemKey}|${b.fp}`))

  const followMap = items
    .filter((it) => Array.isArray(it.workFollowUpKeys) && it.workFollowUpKeys.length)
    .map((it) => ({
      parent: String(it.itemKey),
      kids: [...it.workFollowUpKeys].map(String).sort(),
    }))
    .sort((a, b) => a.parent.localeCompare(b.parent))

  return {
    templateId: String(album.templateId || ''),
    serviceItemId: String(album.serviceItemId || ''),
    evidencedInspect,
    evidencedWork,
    followMap,
    imageBindings,
  }
}

function computeCaseSkeletonHash(input = {}) {
  const payload = buildCaseSkeletonPayload(input)
  return createHash('sha256').update(stableStringify(payload)).digest('hex').slice(0, 40)
}

function draftCopyFingerprint(draft = {}) {
  const faq = Array.isArray(draft.faq)
    ? draft.faq.map((row) => ({
        q: String((row && row.q) || '').trim(),
        a: String((row && row.a) || '').trim(),
      }))
    : []
  const sections = Array.isArray(draft.sections)
    ? draft.sections.map((s) => ({
        key: String((s && s.key) || ''),
        body: String((s && s.body) || '').trim(),
      }))
    : []
  const payload = {
    title: String(draft.title || '').trim(),
    caseSummary: String(draft.caseSummary || '').trim(),
    faq,
    sections,
  }
  return createHash('sha256').update(stableStringify(payload)).digest('hex').slice(0, 40)
}

module.exports = {
  buildCaseSkeletonPayload,
  computeCaseSkeletonHash,
  draftCopyFingerprint,
  imageFingerprint,
}
