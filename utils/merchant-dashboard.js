function formatCount(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 0) return '0'
  return String(Math.floor(v))
}

function formatRate(rate) {
  if (rate == null || !Number.isFinite(rate)) return '暂无数据'
  return `${(rate * 100).toFixed(1)}%`
}

function formatPercentScore(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return String(Math.round(v))
}

function sumViews(summary) {
  if (!summary) return 0
  return (
    (summary.storeViewCount || 0) +
    (summary.serviceViewCount || 0) +
    (summary.caseViewCount || 0)
  )
}

function buildLagHint(dataLag, lastAggregatedDate) {
  if (dataLag === 'T+1') {
    const date = lastAggregatedDate ? `（更新至 ${lastAggregatedDate}）` : ''
    return `站外浏览、电话点击与搜索/AI 爬虫访问按日统计，次日更新${date}`
  }
  return ''
}

const PERIOD_TABS = [
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
  { key: 'yesterday', label: '昨日' },
]

function formatRankRows(items, titleKey) {
  return (items || []).map((item, index) => ({
    rank: index + 1,
    title: item[titleKey] || item.title || item.name || '—',
    viewCountText: formatCount(item.viewCount),
    leadCountText: formatCount(item.leadCount),
    leadRateText: formatRate(item.leadRate),
  }))
}

module.exports = {
  formatCount,
  formatRate,
  formatPercentScore,
  sumViews,
  buildLagHint,
  formatRankRows,
  PERIOD_TABS,
}
