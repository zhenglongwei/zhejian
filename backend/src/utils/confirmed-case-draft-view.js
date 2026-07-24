/**
 * CASE-DRAFT-LOCK · 确认案例稿公示视图（小程序 / H5 / 运营审核同源）
 * 只暴露脱敏配图，不带回原图预览位。
 */
const { resolvePublicCaseMediaUrl } = require('../lib/media-url')
const { normalizeMerchantCaseDraft } = require('../services/merchant-case-draft.service')
const { extractSnapshotFromContentJson } = require('../schemas/case-snapshot.schema')

function pickConfirmedDraftRaw(contentJson = {}, row = {}) {
  const content = contentJson && typeof contentJson === 'object' ? contentJson : {}
  if (content.merchantCaseDraft && content.merchantCaseDraft.confirmedAt) {
    return content.merchantCaseDraft
  }
  const snapshot = extractSnapshotFromContentJson(content)
  if (snapshot && snapshot.merchantCaseDraft && snapshot.merchantCaseDraft.confirmedAt) {
    return snapshot.merchantCaseDraft
  }
  if (row.merchantCaseDraft && row.merchantCaseDraft.confirmedAt) {
    return row.merchantCaseDraft
  }
  return null
}

/**
 * @returns {null | {
 *   title: string,
 *   confirmedAt: string,
 *   source: string,
 *   sections: Array<{ key: string, title: string, body: string, media: Array<object> }>,
 * }}
 */
function buildConfirmedCaseDraftView(contentJson = {}, row = {}) {
  const raw = pickConfirmedDraftRaw(contentJson, row)
  if (!raw) return null
  const draft = normalizeMerchantCaseDraft(raw)
  if (!draft || !draft.confirmedAt) return null

  const mediaBySection = {}
  ;(draft.media || []).forEach((item) => {
    const maskedUrl = resolvePublicCaseMediaUrl(item.maskedUrl || '')
    if (!maskedUrl) return
    const sectionKey = String(item.sectionKey || 'process')
    if (!mediaBySection[sectionKey]) mediaBySection[sectionKey] = []
    mediaBySection[sectionKey].push({
      nodeId: item.nodeId || '',
      idx: Number(item.idx || 0),
      maskedUrl,
      caption: item.caption || '',
      sectionKey,
    })
  })

  const sections = (draft.sections || [])
    .map((sec) => ({
      key: sec.key,
      title: sec.title,
      body: String(sec.body || '').trim(),
      media: mediaBySection[sec.key] || [],
    }))
    .filter((sec) => sec.body || (sec.media && sec.media.length))

  if (!sections.length && !draft.title) return null

  return {
    title: draft.title || '',
    caseSummary: draft.caseSummary || '',
    confirmedAt: draft.confirmedAt,
    source: draft.source || 'rule',
    sections,
  }
}

module.exports = {
  pickConfirmedDraftRaw,
  buildConfirmedCaseDraftView,
}
