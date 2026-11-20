function formatCount(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 0) return '0'
  return String(Math.floor(v))
}

function formatRate(rate) {
  if (rate == null || !Number.isFinite(rate)) return '暂无数据'
  return `${(rate * 100).toFixed(1)}%`
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
    return `站外浏览与搜索/智能助手爬虫访问按日统计，次日更新${date}`
  }
  return ''
}

const DEFAULT_METRIC_NOTES = {
  userExposure:
    '真人浏览量指访客在网页或小程序里打开本店公开页的次数，不含爬虫与自动化访问。',
  crawlerProxy:
    '「搜索/智能助手爬虫访问」指已知机器人抓取本店公开页次数，不代表智能助手在对话中引用本店，也不代表收录或排名。',
  probeInternal:
    '平台「答案探测」为内部抽样监测，不向商家展示引用次数；请勿将爬虫访问理解为被智能助手引用。',
  starMetric:
    '星标是读者在案例页上点亮的星星，代表关注与认可这份档案；只计次数，不是评分，也不会加总成店铺评分。只统计所选时间档内点亮的星标。',
}

const PERIOD_TABS = [
  { key: 'month', label: '本月' },
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
  { key: 'yesterday', label: '昨日' },
]

function formatRankRows(items, titleKey) {
  return (items || []).map((item, index) => {
    const h5 = item.h5ViewCount || 0
    const mp = item.mpViewCount || 0
    const viewDetail =
      h5 > 0 || mp > 0
        ? `网页 ${formatCount(h5)} · 小程序 ${formatCount(mp)}`
        : ''
    return {
      rank: index + 1,
      title: item[titleKey] || item.title || item.name || '—',
      viewCountText: formatCount(item.viewCount),
      viewDetailText: viewDetail,
      leadCountText: formatCount(item.leadCount),
      leadRateText: formatRate(item.leadRate),
    }
  })
}

module.exports = {
  formatCount,
  formatRate,
  sumViews,
  buildLagHint,
  DEFAULT_METRIC_NOTES,
  formatRankRows,
  PERIOD_TABS,
}
