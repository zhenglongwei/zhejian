const { fetchMerchantStats } = require('../../../services/merchant-stats')
const { fetchMerchantLeadStats } = require('../../../services/merchant-lead')
const { fetchMerchantAlbumStats } = require('../../../services/merchant-service-album')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const {
  PERIOD_TABS,
  formatCount,
  formatRate,
  formatPercentScore,
  sumViews,
  buildLagHint,
  formatRankRows,
} = require('../../../utils/merchant-dashboard')

function emptyDisplay() {
  return {
    totalViews: '0',
    caseViewCount: '0',
    phoneClickCount: '0',
    leadSubmitCount: '0',
    leadContactedCount: '0',
    leadClosedCount: '0',
    caseConsultCount: '0',
    albumCreatedCount: '0',
    albumCompletedCount: '0',
    leadRate: '暂无数据',
    contactRate: '暂无数据',
    caseConsultRate: '暂无数据',
    transparencyScore: '0',
    transparencyBreakdown: [],
    pendingLeads: '0',
    pendingAuth: '0',
  }
}

Page({
  data: {
    status: 'loading',
    periodTabs: PERIOD_TABS,
    period: '7d',
    errorMessage: '',
    lagHint: '',
    rangeLabel: '',
    display: emptyDisplay(),
    transparencyBreakdown: [],
    topCases: [],
    topServices: [],
    suggestions: [],
  },

  onLoad() {
    this.storeId = ''
  },

  onShow() {
    this.ensureMerchant()
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  async ensureMerchant() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      wx.showModal({
        title: '请先入驻',
        content: '完成商家入驻后可查看数据概览',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/packageMerchant/pages/onboarding/index' })
          } else {
            wx.navigateBack()
          }
        },
      })
      return
    }
    this.storeId = profile.storeId || ''
    this.loadData()
  },

  buildDisplay(stats, leadStats, albumStats) {
    const summary = stats.summary || {}
    const rates = summary.rates || {}
    const breakdown = stats.transparency?.breakdown || {}
    const transparencyBreakdown = [
      { key: 'album', label: '服务相册', score: breakdown.album || 0 },
      { key: 'case', label: '公开案例', score: breakdown.case || 0 },
      { key: 'serviceProfile', label: '服务资料', score: breakdown.serviceProfile || 0 },
      { key: 'qualification', label: '资质资料', score: breakdown.qualification || 0 },
      { key: 'leadResponse', label: '咨询响应', score: breakdown.leadResponse || 0 },
    ]

    return {
      totalViews: formatCount(sumViews(summary)),
      caseViewCount: formatCount(summary.caseViewCount),
      phoneClickCount: formatCount(summary.phoneClickCount),
      leadSubmitCount: formatCount(summary.leadSubmitCount),
      leadContactedCount: formatCount(summary.leadContactedCount),
      leadClosedCount: formatCount(summary.leadClosedCount),
      caseConsultCount: formatCount(summary.caseConsultCount),
      albumCreatedCount: formatCount(summary.albumCreatedCount),
      albumCompletedCount: formatCount(summary.albumCompletedCount),
      leadRate: formatRate(rates.leadRate),
      contactRate: formatRate(rates.contactRate),
      caseConsultRate: formatRate(rates.caseConsultRate),
      transparencyScore: formatPercentScore(stats.transparency?.score ?? summary.transparencyScore),
      pendingLeads: formatCount(leadStats?.pending),
      pendingAuth: formatCount(albumStats?.pendingAuth),
      transparencyBreakdown,
    }
  },

  async loadData() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const [stats, leadStats, albumStats] = await Promise.all([
        fetchMerchantStats({ storeId: this.storeId, period: this.data.period }),
        fetchMerchantLeadStats(this.storeId),
        fetchMerchantAlbumStats(),
      ])

      const range = stats.range || {}
      const rangeLabel =
        range.from && range.to ? `${range.from} 至 ${range.to}` : ''
      const display = this.buildDisplay(stats, leadStats, albumStats)
      const rankings = stats.rankings || {}
      const topCases = formatRankRows(rankings.cases, 'title')
      const topServices = formatRankRows(rankings.services, 'name')
      const suggestions = stats.suggestions || []
      const hasMetrics =
        sumViews(stats.summary) > 0 ||
        (stats.summary?.leadSubmitCount || 0) > 0 ||
        (stats.summary?.phoneClickCount || 0) > 0
      const hasInsights =
        topCases.length > 0 || topServices.length > 0 || suggestions.length > 0

      this.setData({
        status: hasMetrics || stats.lastAggregatedDate || hasInsights ? 'normal' : 'empty',
        lagHint: buildLagHint(stats.dataLag, stats.lastAggregatedDate),
        rangeLabel,
        display,
        transparencyBreakdown: display.transparencyBreakdown,
        topCases,
        topServices,
        suggestions,
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
        display: emptyDisplay(),
        transparencyBreakdown: [],
        topCases: [],
        topServices: [],
        suggestions: [],
      })
    }
  },

  onPeriodChange(e) {
    const { key } = e.detail
    if (!key || key === this.data.period) return
    this.setData({ period: key }, () => this.loadData())
  },

  onRetry() {
    this.loadData()
  },

  onGoLeads() {
    wx.navigateTo({ url: '/packageMerchant/pages/lead/list/index?tab=pending' })
  },

  onGoAlbumAuth() {
    wx.navigateTo({
      url: '/packageMerchant/pages/album/list/index?tab=pending_auth',
    })
  },
})
