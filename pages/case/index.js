const { fetchCaseList } = require('../../services/case')
const { CASE_SOURCE } = require('../../constants/case-source')

const FILTER_ALL = 'all'

const INTRO_BY_FILTER = {
  [FILTER_ALL]: {
    introDesc: '已脱敏、已审核；含平台订单与商家历史案例，价格均为参考区间',
    complianceType: 'price',
    showHistoryNotice: true,
  },
  [CASE_SOURCE.PLATFORM_ORDER]: {
    introDesc: '平台订单案例，经用户授权公开',
    complianceType: 'price',
    showHistoryNotice: false,
  },
  [CASE_SOURCE.MERCHANT_HISTORY]: {
    introDesc: '商家历史案例，价格仅供参考',
    complianceType: 'history',
    showHistoryNotice: false,
  },
}

const FILTER_TABS = [
  { key: FILTER_ALL, label: '全部' },
  { key: CASE_SOURCE.PLATFORM_ORDER, label: '平台订单案例' },
  { key: CASE_SOURCE.MERCHANT_HISTORY, label: '商家历史案例' },
]

Page({
  data: {
    status: 'loading',
    list: [],
    filterTabs: FILTER_TABS,
    filterSource: FILTER_ALL,
    introDesc: INTRO_BY_FILTER[FILTER_ALL].introDesc,
    complianceType: INTRO_BY_FILTER[FILTER_ALL].complianceType,
    showHistoryNotice: INTRO_BY_FILTER[FILTER_ALL].showHistoryNotice,
    errorMessage: '',
  },

  onLoad() {
    this.loadList()
  },

  applyFilterMeta(source) {
    const meta = INTRO_BY_FILTER[source] || INTRO_BY_FILTER[FILTER_ALL]
    this.setData({
      introDesc: meta.introDesc,
      complianceType: meta.complianceType,
      showHistoryNotice: !!meta.showHistoryNotice,
    })
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  async loadList() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const source =
        this.data.filterSource === FILTER_ALL
          ? undefined
          : this.data.filterSource
      const { list } = await fetchCaseList({ source })
      this.setData({
        list,
        status: list.length ? 'normal' : 'empty',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败，请重试',
      })
    }
  },

  onRetry() {
    this.loadList()
  },

  onTabChange(e) {
    const { key } = e.detail
    this.setData({ filterSource: key }, () => {
      this.applyFilterMeta(key)
      this.loadList()
    })
  },

  onCaseTap(e) {
    const { caseId } = e.detail
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },
})
