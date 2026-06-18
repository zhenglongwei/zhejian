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

function parseDisplayCount(value) {
  const n = Number(String(value || '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function buildHeroKpis(display = {}) {
  return [
    { key: 'views', label: '总浏览', value: display.totalViews || '0', tone: 'primary' },
    { key: 'leads', label: '咨询提交', value: display.leadSubmitCount || '0', tone: 'warning' },
    { key: 'score', label: '透明度', value: display.transparencyScore || '0', tone: 'success' },
  ]
}

function buildExposureChips(display = {}) {
  return [
    { key: 'h5', label: 'H5 案例', value: display.h5CaseViewCount || '0' },
    { key: 'mp', label: '小程序案例', value: display.mpCaseViewCount || '0' },
    { key: 'phone', label: '电话点击', value: display.phoneClickCount || '0' },
    { key: 'crawler', label: '搜索/AI爬虫', value: display.crawlerViewCount || '0' },
  ]
}

function buildLeadRows(display = {}) {
  const pending = parseDisplayCount(display.pendingLeads)
  const pendingAuth = parseDisplayCount(display.pendingAuth)
  return [
    {
      key: 'pending',
      value: display.pendingLeads || '0',
      label: '条咨询待处理（实时）',
      action: '去处理',
      active: pending > 0,
      handler: 'leads',
    },
    {
      key: 'submit',
      value: display.leadSubmitCount || '0',
      label: '区间提交',
      active: false,
    },
    {
      key: 'contacted',
      value: display.leadContactedCount || '0',
      label: '已联系',
      active: false,
    },
    {
      key: 'closed',
      value: display.leadClosedCount || '0',
      label: '已关闭',
      active: false,
    },
    {
      key: 'case',
      value: display.caseConsultCount || '0',
      label: '案例留资',
      active: false,
    },
  ]
}

function buildAlbumRows(display = {}) {
  const pendingAuth = parseDisplayCount(display.pendingAuth)
  return [
    { key: 'created', value: display.albumCreatedCount || '0', label: '新建相册', active: false },
    { key: 'done', value: display.albumCompletedCount || '0', label: '完工相册', active: false },
    {
      key: 'auth',
      value: display.pendingAuth || '0',
      label: '本待公开授权',
      action: '去授权',
      active: pendingAuth > 0,
      handler: 'auth',
    },
  ]
}

function emptyDisplay() {
  return {
    totalViews: '0',
    caseViewCount: '0',
    h5CaseViewCount: '0',
    mpCaseViewCount: '0',
    crawlerViewCount: '0',
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
    storeName: '',
    heroKpis: buildHeroKpis(),
    exposureChips: buildExposureChips(),
    leadRows: buildLeadRows(),
    albumRows: buildAlbumRows(),
    complianceText:
      '数据来自站外公开页浏览与咨询留资统计，不含平台订单；浏览类指标按日更新（T+1）。搜索/AI 爬虫访问为代理指标，非引用次数。',
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
    this.setData({ storeName: profile.storeName || '' })
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

    const hasSplitFields =
      summary.h5CaseViewCount != null || summary.mpCaseViewCount != null
    const h5Views = hasSplitFields
      ? summary.h5CaseViewCount || 0
      : summary.caseViewCount || 0
    const mpViews = hasSplitFields ? summary.mpCaseViewCount || 0 : 0

    return {
      totalViews: formatCount(sumViews(summary)),
      caseViewCount: formatCount(summary.caseViewCount),
      h5CaseViewCount: formatCount(h5Views),
      mpCaseViewCount: formatCount(mpViews),
      crawlerViewCount: formatCount(summary.crawlerViewCount),
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
        (stats.summary?.crawlerViewCount || 0) > 0 ||
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
        heroKpis: buildHeroKpis(display),
        exposureChips: buildExposureChips(display),
        leadRows: buildLeadRows(display),
        albumRows: buildAlbumRows(display),
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
        heroKpis: buildHeroKpis(),
        exposureChips: buildExposureChips(),
        leadRows: buildLeadRows(),
        albumRows: buildAlbumRows(),
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

  onLeadRowTap(e) {
    const handler = e.currentTarget.dataset.handler
    if (handler === 'leads') this.onGoLeads()
    if (handler === 'auth') this.onGoAlbumAuth()
  },
})
