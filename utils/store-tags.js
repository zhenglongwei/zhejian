const MAX_TAGS = 3

/**
 * 门店详情头部标签（≤3：已审核 > 资质 > 业务能力）
 */
function buildStoreHeadTags(store) {
  if (!store) return []
  const tags = [{ variant: 'audited', text: '已审核' }]
  const qualification = (store.qualificationTags || [])[0]
  if (qualification) {
    tags.push({ variant: 'info', text: qualification })
  }
  if (store.supportsAlbum) {
    tags.push({ variant: 'info', text: '支持维修相册' })
  }
  return tags.slice(0, MAX_TAGS)
}

/**
 * 门店列表/卡片 Tag（≤3：资质 > 维修相册 > 评价高频标签）
 */
function buildStoreCardTags(store, reviewTags) {
  if (!store) return []
  const tags = []
  ;(store.qualificationTags || []).forEach((text) => {
    if (tags.length < 2) {
      tags.push({ variant: 'audited', text })
    }
  })
  if (store.supportsAlbum && tags.length < MAX_TAGS) {
    tags.push({ variant: 'info', text: '支持维修相册' })
  }
  ;(reviewTags || []).forEach((text) => {
    if (tags.length < MAX_TAGS && text) {
      tags.push({ variant: 'info', text })
    }
  })
  return tags.slice(0, MAX_TAGS)
}

module.exports = { buildStoreHeadTags, buildStoreCardTags }
