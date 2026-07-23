/**
 * 小程序端只读展示商家案例草稿（与 backend merchant-case-draft 对齐的轻量版）
 */
function draftToAiSummary(draft = {}) {
  if (!draft || typeof draft !== 'object') return ''
  const parts = [String(draft.title || '').trim()]
  ;(draft.sections || []).forEach((sec) => {
    const body = String((sec && sec.body) || '').trim()
    if (!body) return
    parts.push(`【${(sec && sec.title) || ''}】${body}`)
  })
  return parts.filter(Boolean).join('\n\n').slice(0, 600)
}

module.exports = {
  draftToAiSummary,
}
