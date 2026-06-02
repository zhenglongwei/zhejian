const { fetchMerchantServiceList } = require('../../../../services/service')
const { SERVICE_STATUS } = require('../../../../constants/service')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

const TAB_ALL = 'all'

const STATUS_TABS = [
  { key: TAB_ALL, label: '全部' },
  { key: SERVICE_STATUS.DRAFT, label: '草稿' },
  { key: SERVICE_STATUS.PUBLISHED, label: '已上架' },
]

Page({
  data: {
    status: 'loading',
    list: [],
    statusTabs: STATUS_TABS,
    tab: TAB_ALL,
    errorMessage: '',
  },

  onShow() {
    this.ensureMerchant()
  },

  async ensureMerchant() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      wx.showModal({
        title: '请先入驻',
        content: '完成商家入驻后可管理服务方案',
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
    this.loadList()
  },

  async loadList() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const status = this.data.tab === TAB_ALL ? undefined : this.data.tab
      const { list } = await fetchMerchantServiceList(status)
      this.setData({
        list,
        status: list.length ? 'normal' : 'empty',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onTabChange(e) {
    const { key } = e.detail
    this.setData({ tab: key }, () => this.loadList())
  },

  onCreate() {
    wx.navigateTo({ url: '/packageMerchant/pages/service/create/index' })
  },

  onServiceTap(e) {
    const { serviceId } = e.detail
    wx.navigateTo({
      url: `/packageMerchant/pages/service/detail/index?id=${serviceId}`,
    })
  },

  onRetry() {
    this.loadList()
  },
})
