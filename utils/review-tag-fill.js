/**
 * 切换评价标签选中态。标签只作为标签保存，不写入文字评价。
 */
function toggleReviewTag({ tag, selectedTags = [] }) {
  const isSelected = selectedTags.includes(tag)
  if (isSelected) {
    return {
      selectedTags: selectedTags.filter((item) => item !== tag),
    }
  }
  return {
    selectedTags: selectedTags.concat(tag),
  }
}

/**
 * 切换标签池（如低分展示负向标签）时，清理不在新池内的选中项
 */
function reconcileTagsForPool({ selectedTags, nextPool }) {
  const poolSet = new Set(nextPool || [])
  return {
    selectedTags: (selectedTags || []).filter((tag) => poolSet.has(tag)),
  }
}

function buildTagItems(tagOptions, selectedTags) {
  return (tagOptions || []).map((text) => ({
    text,
    selected: (selectedTags || []).includes(text),
  }))
}

module.exports = {
  toggleReviewTag,
  reconcileTagsForPool,
  buildTagItems,
}
