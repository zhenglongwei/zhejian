/**
 * 检查页头部元信息（送修/更新时间 + 门店链接）
 */
const { formatDateYMD, formatUpdatedAtDisplay } = require('./album-summary')

function pickSummaryValue(rows, label) {
  const row = (Array.isArray(rows) ? rows : []).find(
    (item) => item && item.label === label,
  )
  const value = row ? String(row.value || '').trim() : ''
  return value && value !== '—' ? value : ''
}

function buildInspectHeroMeta(detail = {}, enriched = {}) {
  const summaryRows = enriched.summaryRows || detail.summaryRows || []
  const store = enriched.store || detail.store || {}
  const linkedStoreId = store.id || detail.storeId || ''
  const storeName = store.name || detail.storeName || ''

  const deliverDateText =
    pickSummaryValue(summaryRows, '送修日期') ||
    formatDateYMD(detail.createdAt || enriched.createdAt)

  const updatedAtText =
    pickSummaryValue(summaryRows, '更新时间') ||
    enriched.updatedAtText ||
    formatUpdatedAtDisplay(detail.updatedAt || enriched.updatedAt)

  return {
    deliverDateText,
    updatedAtText,
    linkedStoreId,
    storeName,
    showStoreLink: Boolean(linkedStoreId && storeName),
  }
}

module.exports = {
  buildInspectHeroMeta,
}
