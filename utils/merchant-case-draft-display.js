/**
 * 小程序端只读展示商家案例草稿（与 backend merchant-case-draft 对齐的轻量版）
 */
function draftToPlainText(draft = {}) {
  if (!draft || typeof draft !== 'object') return ''
  const parts = [String(draft.title || '').trim()]
  const summary = String(draft.caseSummary || '').trim()
  if (summary) parts.push(summary)
  ;(draft.sections || []).forEach((sec) => {
    const body = String((sec && sec.body) || '').trim()
    if (!body) return
    parts.push(`【${(sec && sec.title) || ''}】${body}`)
  })
  return parts.filter(Boolean).join('\n\n').slice(0, 2000)
}

function draftToAiSummary(draft = {}) {
  const summary = String((draft && draft.caseSummary) || '').trim()
  if (summary) return summary.slice(0, 250)
  return draftToPlainText(draft).slice(0, 250)
}

module.exports = {
  draftToPlainText,
  draftToAiSummary,
}
