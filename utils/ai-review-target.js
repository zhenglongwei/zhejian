/**
 * 检查建议只钉在部位上，不跟列表序号走。
 * 补拍不占用已经有照片的那一项。
 */

const GENERIC_PART = /^(相关部位|本步文字|检查发现|改检查发现|改文案|主诉|质保|图注|方案行名)$/

function suggestionBlob(item) {
  return [item && item.part, item && item.boundPart, item && item.title, item && item.targetLabel, item && item.itemKey, item && item.how, item && item.howText, item && item.suggestedText]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, '')
}

function cleanPartLabel(value) {
  return String(value || '')
    .replace(/^(补拍|重拍|补充|改写|修改)/, '')
    .trim()
}

function isUsablePart(value) {
  const part = cleanPartLabel(value)
  return part.length >= 2 && !GENERIC_PART.test(part)
}

function partInBlob(part, blob) {
  const name = String(part || '').trim()
  if (name.length < 2 || !blob) return false
  const at = blob.indexOf(name)
  if (at < 0) return false
  return at === 0 || !/[\u4e00-\u9fa5]/.test(blob.charAt(at - 1))
}

function bindSuggestionPart(findings, item) {
  const saved = cleanPartLabel(item && item.boundPart)
  if (isUsablePart(saved)) return saved
  const fromPart = cleanPartLabel(item && (item.part || item.partName))
  if (isUsablePart(fromPart)) return fromPart
  const blob = suggestionBlob(item)
  let best = ''
  ;(findings || []).forEach((row) => {
    const part = String((row && row.partName) || '').trim()
    if (!partInBlob(part, blob)) return
    if (part.length > best.length) best = part
  })
  if (best) return best
  const explicit = Number(item && item.findingIndex)
  const indexed = Number.isFinite(explicit) ? (findings || [])[explicit] : null
  const indexedPart = String((indexed && indexed.partName) || '').trim()
  if (isUsablePart(indexedPart)) {
    const namesOther = (findings || []).some((row) => {
      const part = String((row && row.partName) || '').trim()
      return part && part !== indexedPart && partInBlob(part, blob)
    })
    if (!namesOther) return indexedPart
  }
  const fromTitle = cleanPartLabel(item && (item.targetLabel || item.title))
  if (isUsablePart(fromTitle)) return fromTitle
  return ''
}

function rowHasPhoto(row) {
  if (!row) return false
  if (String(row.url || '').trim()) return true
  return Array.isArray(row.images) && row.images.length > 0
}

function isOdometerSuggestion(item) {
  return /仪表|里程表|里程/.test(suggestionBlob(item))
}

function resolveAiReviewFindingIndex(findings, item, used, mode) {
  const part = bindSuggestionPart(findings, item)
  const list = findings || []
  if (!part) {
    if (isOdometerSuggestion(item)) return -1
    return -1
  }
  const skipped = (index) => used && used.has(index)
  if (mode === 'photo') {
    const tied = list.findIndex((row, index) => {
      if (skipped(index)) return false
      if (String((row && row.partName) || '').trim() !== part) return false
      return (row.aiSuggestionId && row.aiSuggestionId === item.id) || (row.photoHint && row.photoHint.id === item.id)
    })
    if (tied >= 0 && !rowHasPhoto(list[tied])) return tied
    const empty = list.findIndex((row, index) => {
      if (skipped(index)) return false
      if (String((row && row.partName) || '').trim() !== part) return false
      return !rowHasPhoto(row)
    })
    if (empty >= 0) return empty
    return -1
  }
  const withPhoto = list.findIndex((row, index) => {
    if (skipped(index)) return false
    return String((row && row.partName) || '').trim() === part && rowHasPhoto(row)
  })
  if (withPhoto >= 0) return withPhoto
  return list.findIndex((row, index) => {
    if (skipped(index)) return false
    return String((row && row.partName) || '').trim() === part
  })
}

module.exports = {
  suggestionBlob,
  bindSuggestionPart,
  isOdometerSuggestion,
  resolveAiReviewFindingIndex,
}
