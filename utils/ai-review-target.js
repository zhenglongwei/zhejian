/**
 * 把检查建议对回发现项。部位名优先于模型给的序号，
 * 避免仪表照或别的部位挤占第一项。
 */

function suggestionBlob(item) {
  return [item && item.part, item && item.title, item && item.targetLabel, item && item.itemKey, item && item.how, item && item.howText, item && item.suggestedText]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, '')
}

function bestFindingIndex(findings, item, used) {
  const blob = suggestionBlob(item)
  let best = -1
  let bestScore = 0
  ;(findings || []).forEach((row, index) => {
    if (used && used.has(index)) return
    const part = String((row && row.partName) || '').trim()
    if (part.length < 2 || !blob) return
    const at = blob.indexOf(part)
    if (at < 0) return
    const boundary = at === 0 || !/[\u4e00-\u9fa5]/.test(blob.charAt(at - 1))
    const score = part.length * 10 + (boundary ? 5 : 0)
    if (score > bestScore) {
      best = index
      bestScore = score
    }
  })
  return best
}

function suggestionConflictsWithFinding(blob, partName) {
  const part = String(partName || '').trim()
  const text = String(blob || '')
  if (!part || !text || text.includes(part)) return false
  const stripped = text.replace(/^(补拍|重拍|补充|改写|修改|建议)+/, '')
  if (/^(写清|补充|拍清|确保|请写|请补|看清|对准|换掉)/.test(stripped)) return false
  const head = (stripped.match(/^[\u4e00-\u9fa5]{2,6}/) || [''])[0]
  if (!head || head.slice(0, 2) === part.slice(0, 2)) return false
  return true
}

function isOdometerSuggestion(item) {
  return /仪表|里程表|里程/.test(suggestionBlob(item))
}

function resolveAiReviewFindingIndex(findings, item, used) {
  const named = bestFindingIndex(findings, item, used)
  if (named >= 0) return named
  if (isOdometerSuggestion(item)) return -1
  const explicit = Number(item && item.findingIndex)
  const list = findings || []
  if (!Number.isFinite(explicit) || explicit < 0 || !list[explicit]) return -1
  if (used && used.has(explicit)) return -1
  const part = String(list[explicit].partName || '').trim()
  if (suggestionConflictsWithFinding(suggestionBlob(item), part)) return -1
  return explicit
}

module.exports = {
  suggestionBlob,
  bestFindingIndex,
  suggestionConflictsWithFinding,
  isOdometerSuggestion,
  resolveAiReviewFindingIndex,
}
