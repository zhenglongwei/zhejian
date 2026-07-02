function buildPartCodeCandidateLabel(candidate = {}) {
  const code = String(candidate.partCode || '').trim()
  const imageIndex = Number(candidate.imageIndex)
  const imageLabel = Number.isFinite(imageIndex) && imageIndex >= 0 ? `图${imageIndex + 1}` : ''
  const brand = String(candidate.partBrand || '').trim()
  const parts = [imageLabel, code].filter(Boolean)
  let label = parts.join(' · ')
  if (brand) label += `（${brand}）`
  return label || code
}

function mapPartCodeCandidatesForPicker(candidates = []) {
  return (candidates || []).map((item, index) => ({
    ...item,
    pickerKey: `${item.partCode || 'code'}_${item.imageIndex}_${index}`,
    displayLabel: buildPartCodeCandidateLabel(item),
  }))
}

module.exports = {
  buildPartCodeCandidateLabel,
  mapPartCodeCandidatesForPicker,
}
