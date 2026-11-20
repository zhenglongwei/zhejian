const { fetchMerchantStats } = require('../../../../services/merchant-stats')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')
const {
  PERIOD_TABS,
  formatCount,
  buildLagHint,
  DEFAULT_METRIC_NOTES,
} = require('../../../../utils/merchant-dashboard')

const ALBUM_UNPUBLISHED_URL = '/packageMerchant/pages/album/list/index?public=off'

const SORT_COLUMNS = [
  { key: 'views', label: '浏览' },
  { key: 'crawler', label: '爬虫' },
  { key: 'stars', label: '星标' },
]

function sortValue(row, key) {
  if (key === 'crawler') return row.crawlerViewCount || 0
  if (key === 'stars') return row.starCount || 0
  return row.viewCount || 0
}

function timeValue(value) {
  const t = value ? new Date(value).getTime() : 0
  return Number.isNaN(t) ? 0 : t
}

function formatDay(value) {
  const t = timeValue(value)
  if (!t) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function joinTexts(list) {
  return list.filter(Boolean).join(' · ')
}

function buildRows(caseMetrics, sortKey) {
  return (caseMetrics || [])
    .slice()
    .sort(
      (a, b) =>
        sortValue(b, sortKey) - sortValue(a, sortKey) ||
        (b.viewCount || 0) - (a.viewCount || 0) ||
        timeValue(b.publishedAt) - timeValue(a.publishedAt)
    )
    .map((item) => {
      const title = String(item.title || item.serviceName || '').trim() || item.caseId
      const starCount = item.starCount || 0
      const dayText = formatDay(item.publishedAt)
      const serviceName = String(item.serviceName || '').trim()
      return {
        key: item.caseId,
        title,
        sub: joinTexts([item.vehicle, serviceName === title ? '' : serviceName]),
        metaText: dayText ? `公开 ${dayText}` : '',
        viewText: formatCount(item.viewCount),
        crawlerText: formatCount(item.crawlerViewCount),
        starText: formatCount(starCount),
        hasStar: starCount > 0,
      }
    })
}

Page({
  data: {
    status: 'loading',
    periodTabs: PERIOD_TABS,
    period: 'month',
    sortKey: 'views',
    sortColumns: SORT_COLUMNS,
    errorMessage: '',
    lagHint: '',
    rangeLabel: '',
    rows: [],
    caseCountText: '0',
    summaryText: '',
    noteOpen: false,
    storeName: '',
    metricNotes: DEFAULT_METRIC_NOTES,
  },

  onLoad(options = {}) {
    const sortKey = SORT_COLUMNS.some((c) => c.key === options.sort)
      ? options.sort
      : 'views'
    const period = PERIOD_TABS.some((t) => t.key === options.period)
      ? options.period
      : this.data.period
    this.storeId = ''
    this.caseMetrics = []
    this.renderedOnce = false
    this.setData({ sortKey, period })
  },

  onShow() {
    this.ensureMerchant()
  },

  onPullDownRefresh() {
    this.loadData({ quiet: this.renderedOnce }).finally(() => wx.stopPullDownRefresh())
  },

  async ensureMerchant() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      wx.showModal({
        title: '请先入驻',
        content: '完成商家入驻后可查看案例明细',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/packageMerchant/pages/workbench/index' })
          } else {
            wx.navigateBack()
          }
        },
      })
      return
    }
    this.storeId = profile.storeId || ''
    this.setData({ storeName: profile.storeName || '' })
    this.loadData({ quiet: this.renderedOnce })
  },

  async loadData(options = {}) {
    // quiet：换时间档只刷数字，不把整页打回骨架屏
    const quiet = options.quiet === true
    if (!quiet) this.setData({ status: 'loading', errorMessage: '' })
    try {
      const stats = await fetchMerchantStats({
        storeId: this.storeId,
        period: this.data.period,
      })
      const caseMetrics = stats.caseMetrics || []
      this.caseMetrics = caseMetrics
      const star = stats.starSummary || {}
      const range = stats.range || {}

      this.setData({
        status: caseMetrics.length ? 'normal' : 'empty',
        rows: buildRows(caseMetrics, this.data.sortKey),
        caseCountText: formatCount(caseMetrics.length),
        summaryText: star.starCount
          ? `本期被点亮 ${formatCount(star.starCount)} 次，共 ${formatCount(star.starredCaseCount)} 个案例`
          : '本期还没有收到星标',
        metricNotes: { ...DEFAULT_METRIC_NOTES, ...(stats.metricNotes || {}) },
        lagHint: buildLagHint(stats.dataLag, stats.lastAggregatedDate),
        rangeLabel: range.from && range.to ? `${range.from} 至 ${range.to}` : '',
      })
      this.renderedOnce = true
    } catch (e) {
      if (quiet) {
        wx.showToast({ title: (e && e.message) || '刷新失败', icon: 'none' })
        return
      }
      this.setData({ status: 'error', errorMessage: (e && e.message) || '加载失败' })
    }
  },

  onPeriodChange(e) {
    const { key } = e.detail
    if (!key || key === this.data.period) return
    this.setData({ period: key }, () => this.loadData({ quiet: true }))
  },

  onSortChange(e) {
    const { key } = e.currentTarget.dataset
    if (!SORT_COLUMNS.some((c) => c.key === key) || key === this.data.sortKey) return
    this.setData({ sortKey: key, rows: buildRows(this.caseMetrics, key) })
  },

  onToggleNote() {
    this.setData({ noteOpen: !this.data.noteOpen })
  },

  onGoPublish() {
    wx.redirectTo({ url: ALBUM_UNPUBLISHED_URL })
  },

  onRetry() {
    this.loadData()
  },
})
