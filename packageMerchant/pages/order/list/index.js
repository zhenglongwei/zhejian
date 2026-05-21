const { fetchMerchantOrders } = require('../../../../services/merchant-order')
const { fetchMerchantProfile, MERCHANT_STATUS } = require('../../../../services/merchant')
const { MERCHANT_ORDER_LIST_TABS } = require('../../../../constants/merchant-order-list-tabs')
const { enrichMerchantListItem } = require('../../../../utils/merchant-order-display')
const {
  handleMerchantOrderAction,
  navigateToMerchantOrderDetail,
} = require('../../../../utils/merchant-order-actions')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    tabs: MERCHANT_ORDER_LIST_TABS,
    activeTab: 'all',
    list: [],
  },

  onLoad(options) {
    if (options.tab) {
      this.setData({ activeTab: options.tab })
    }
  },

  onShow() {
    this.loadList()
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  async loadList() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const profile = await fetchMerchantProfile()
      if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
        this.setData({ status: 'unauthorized', list: [] })
        return
      }
      const raw = await fetchMerchantOrders({ tab: this.data.activeTab })
      const list = (raw || []).map(enrichMerchantListItem)
      this.setData({
        list,
        status: list.length ? 'normal' : 'empty',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
        list: [],
      })
    }
  },

  onTabChange(e) {
    const { key } = e.detail
    if (key === this.data.activeTab) return
    this.setData({ activeTab: key })
    this.loadList()
  },

  onRetry() {
    this.loadList()
  },

  onGoWorkbench() {
    wx.redirectTo({ url: '/packageMerchant/pages/workbench/index' })
  },

  onCardTap(e) {
    const { id } = e.detail || {}
    if (id) navigateToMerchantOrderDetail(id)
  },

  onPrimaryAction(e) {
    const { id, action } = e.detail || {}
    const order = this.data.list.find((o) => o.id === id)
    if (!order) return
    handleMerchantOrderAction(action || order.primaryAction.actionKey, {
      order,
      onRefresh: () => this.loadList(),
    })
  },
})
