const { getReviewTagPhrase } = require('../constants/review-tags')

/**
 * 切换标签选中态，并将短语写入/移出文字评价
 * @returns {{ content: string, selectedTags: string[], tagInsertions: Record<string, string> }}
 */
function toggleReviewTag({
  tag,
  content = '',
  selectedTags = [],
  tagInsertions = {},
  maxLength = 300,
}) {
  const isSelected = selectedTags.includes(tag)
  if (isSelected) {
    const inserted = tagInsertions[tag] || ''
    let nextContent = inserted ? content.replace(inserted, '') : content
    nextContent = nextContent.replace(/^，+/, '').replace(/，+$/, '').trim()
    const nextTags = selectedTags.filter((t) => t !== tag)
    const nextInsertions = { ...tagInsertions }
    delete nextInsertions[tag]
    return {
      content: nextContent,
      selectedTags: nextTags,
      tagInsertions: nextInsertions,
    }
  }

  const phrase = getReviewTagPhrase(tag)
  const trimmed = (content || '').trim()
  const separator = trimmed ? '，' : ''
  const inserted = `${separator}${phrase}`
  if (trimmed.length + inserted.length > maxLength) {
    return { overflow: true }
  }
  return {
    content: `${trimmed}${inserted}`,
    selectedTags: selectedTags.concat(tag),
    tagInsertions: { ...tagInsertions, [tag]: inserted },
  }
}

/**
 * 切换标签池（如低分展示负向标签）时，清理不在新池内的选中项
 */
function reconcileTagsForPool({
  content,
  selectedTags,
  tagInsertions,
  nextPool,
}) {
  const poolSet = new Set(nextPool || [])
  let nextContent = content || ''
  let nextTags = selectedTags.slice()
  let nextInsertions = { ...tagInsertions }
  selectedTags.forEach((tag) => {
    if (poolSet.has(tag)) return
    const inserted = nextInsertions[tag] || ''
    if (inserted) nextContent = nextContent.replace(inserted, '')
    nextTags = nextTags.filter((t) => t !== tag)
    delete nextInsertions[tag]
  })
  nextContent = nextContent.replace(/^，+/, '').replace(/，+$/, '').trim()
  return {
    content: nextContent,
    selectedTags: nextTags,
    tagInsertions: nextInsertions,
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
