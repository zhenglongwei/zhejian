const { fetchMerchantStats } = require('../../../services/merchant-stats')
const { fetchMerchantServiceAlbumList } = require('../../../services/merchant-service-album')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const { countPublicAlbums } = require('../../../utils/merchant-store-home')
const { scoreBasicProfile } = require('../../../utils/merchant-basic-profile')
const {
  PERIOD_TABS,
  formatCount,
  sumViews,
  buildLagHint,
  formatRankRows,
  DEFAULT_METRIC_NOTES,
} = require('../../../utils/merchant-dashboard')
const { getServiceItem } = require('../../../constants/service')

const CASE_METRICS_URL = '/packageMerchant/pages/dashboard/cases/index'
const ALBUM_UNPUBLISHED_URL = '/packageMerchant/pages/album/list/index?public=off'
const STORE_HOME_URL = '/packageMerchant/pages/store/home/index'

function resolveServiceRankTitle(raw) {
  const text = String(raw || '').trim()
  if (!text || text === '—') return '—'
  const catalog = getServiceItem(text)
  return (catalog && catalog.name) || text
}

function buildHeroKpis(stats) {
  const summary = (stats && stats.summary) || {}
  return [
    {
      key: 'views',
      label: '真人浏览量',
      value: formatCount(sumViews(summary)),
      action: '看明细',
      sort: 'views',
    },
    {
      key: 'crawler',
      label: '爬虫访问',
      value: formatCount(summary.crawlerViewCount),
      action: '看明细',
      sort: 'crawler',
    },
    {
      key: 'stars',
      label: '星标次数',
      value: formatStarCount(stats && stats.starSummary),
      action: '看明细',
      sort: 'stars',
    },
  ]
}

function buildStoreKpis(facts) {
  return [
    {
      key: 'publicCase',
      label: '公开案例',
      value: formatCount(facts.publicCaseCount),
      action: '去公开',
      url: ALBUM_UNPUBLISHED_URL,
    },
    {
      key: 'profile',
      label: '资料完整度',
      value: `${facts.profilePercent || '0'}%`,
      action: '去完善',
      url: STORE_HOME_URL,
    },
  ]
}

function formatStarCount(starSummary) {
  return formatCount((starSummary || {}).starCount)
}

Page({
  data: {
    status: 'loading',
    periodTabs: PERIOD_TABS,
    period: 'month',
    errorMessage: '',
    lagHint: '',
    rangeLabel: '',
    topServices: [],
    storeName: '',
    heroKpis: buildHeroKpis({}),
    storeKpis: buildStoreKpis({}),
    noteOpen: {},
    metricNotes: DEFAULT_METRIC_NOTES,
  },

  onLoad() {
    this.storeId = ''
    this.profilePercent = '0'
    this.renderedOnce = false
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
        content: '完成商家入驻后可查看数据概览',
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
    this.profilePercent = String(scoreBasicProfile(profile).score)
    this.setData({ storeName: profile.storeName || '' })
    this.loadStoreFacts()
    // 二次进页面（从明细页返回）只刷数字，不再闪骨架屏
    this.loadData({ quiet: this.renderedOnce })
  },

  /** 门店现状：与时间筛选无关，进页面取一次即可 */
  async loadStoreFacts() {
    // 公开案例数走相册列表口径（已上网），与门店页此前的算法一致
    const albums = await fetchMerchantServiceAlbumList({ tab: 'all' }).catch(() => [])
    this.setData({
      storeKpis: buildStoreKpis({
        publicCaseCount: countPublicAlbums(albums),
        profilePercent: this.profilePercent,
      }),
    })
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
      const range = stats.range || {}
      const rangeLabel =
        range.from && range.to ? `${range.from} 至 ${range.to}` : ''
      const topServices = formatRankRows(stats.rankings?.services, 'name').map((row) => ({
        ...row,
        title: resolveServiceRankTitle(row.title),
      }))
      const hasContent =
        sumViews(stats.summary) > 0 ||
        (stats.summary?.crawlerViewCount || 0) > 0 ||
        topServices.length > 0 ||
        Boolean(stats.lastAggregatedDate)

      this.setData({
        status: hasContent ? 'normal' : 'empty',
        lagHint: buildLagHint(stats.dataLag, stats.lastAggregatedDate),
        rangeLabel,
        metricNotes: { ...DEFAULT_METRIC_NOTES, ...(stats.metricNotes || {}) },
        topServices,
        heroKpis: buildHeroKpis(stats),
      })
      this.renderedOnce = true
    } catch (e) {
      if (quiet) {
        wx.showToast({ title: (e && e.message) || '刷新失败', icon: 'none' })
        return
      }
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
        topServices: [],
        heroKpis: buildHeroKpis({}),
      })
    }
  },

  onPeriodChange(e) {
    const { key } = e.detail
    if (!key || key === this.data.period) return
    this.setData({ period: key }, () => this.loadData({ quiet: true }))
  },

  onRetry() {
    this.loadData()
  },

  /** 指标说明不常驻，点 ⓘ 才把解释挤进文档流 */
  onToggleNote(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.setData({ [`noteOpen.${key}`]: !this.data.noteOpen[key] })
  },

  onCaseMetricsTap(e) {
    const { sort } = e.currentTarget.dataset
    if (!sort) return
    wx.navigateTo({
      url: `${CASE_METRICS_URL}?sort=${sort}&period=${this.data.period}`,
    })
  },

  onKpiTap(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.redirectTo({ url })
  },
})
