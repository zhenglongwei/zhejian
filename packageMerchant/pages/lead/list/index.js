const { fetchMerchantLeads } = require('../../../../services/merchant-lead')
const {
  MERCHANT_LEAD_LIST_TABS,
  resolveMerchantLeadListEmptyCopy,
} = require('../../../../constants/merchant-lead-tabs')
const { enrichMerchantLeadListItem } = require('../../../../utils/lead-display')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

function normalizeLeadList(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && Array.isArray(raw.list)) return raw.list
  return []
}

Page({
  data: {
    status: 'loading',
    list: [],
    tabs: MERCHANT_LEAD_LIST_TABS,
    activeTab: 'pending',
    errorMessage: '',
    storeId: '',
    emptyTitle: '暂无线索',
    emptyDescription: '',
    skeletonItems: [0, 1, 2],
  },

  onLoad(options) {
    const activeTab = options.tab || 'pending'
    const emptyCopy = resolveMerchantLeadListEmptyCopy(activeTab)
    this.setData({
      activeTab,
      emptyTitle: emptyCopy.title,
      emptyDescription: emptyCopy.description,
    })
  },

  onShow() {
    this.ensureMerchant()
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  async ensureMerchant() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      wx.showModal({
        title: '请先入驻',
        content: '完成商家入驻后可查看咨询线索',
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
    this.setData({ storeId: this.storeId })
    this.loadList()
  },

  async loadList() {
    if (!this.storeId) return
    this.setData({ status: 'loading', errorMessage: '', list: [] })
    try {
      const raw = await fetchMerchantLeads({
        storeId: this.storeId,
        tab: this.data.activeTab,
      })
      const list = normalizeLeadList(raw).map(enrichMerchantLeadListItem)
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
    const emptyCopy = resolveMerchantLeadListEmptyCopy(key)
    this.setData(
      {
        activeTab: key,
        list: [],
        status: 'loading',
        emptyTitle: emptyCopy.title,
        emptyDescription: emptyCopy.description,
      },
      () => this.loadList()
    )
  },

  onRetry() {
    this.loadList()
  },

  onCardTap(e) {
    const { id } = e.detail || {}
    if (!id) return
    wx.navigateTo({ url: `/packageMerchant/pages/lead/detail/index?id=${id}` })
  },

  onCardAction(e) {
    const { id, action } = e.detail || {}
    if (!id) return
    if (action === 'call') {
      const item = (this.data.list || []).find((l) => l.id === id)
      this.dialLead(item)
      return
    }
    wx.navigateTo({ url: `/packageMerchant/pages/lead/detail/index?id=${id}` })
  },

  dialLead(item) {
    const phone = item && item.contact && item.contact.phone
    if (!phone) {
      wx.showToast({ title: '暂无联系电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },
})
