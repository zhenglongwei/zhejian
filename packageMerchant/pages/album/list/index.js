const { fetchMerchantServiceAlbumList } = require('../../../../services/merchant-service-album')
const {
  MERCHANT_SERVICE_ALBUM_LIST_TABS,
} = require('../../../../constants/service-album-status')
const {
  buildOwnerShareMessage,
  buildOwnerShareMessageFromDataset,
} = require('../../../../utils/service-album-share')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

Page({
  data: {
    status: 'loading',
    list: [],
    statusTabs: MERCHANT_SERVICE_ALBUM_LIST_TABS,
    tab: 'all',
    errorMessage: '',
  },

  onLoad(options) {
    if (options.tab) {
      this.setData({ tab: options.tab })
    }
  },

  onShow() {
    wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage'] })
    this.ensureMerchant()
  },

  async ensureMerchant() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      wx.showModal({
        title: '请先入驻',
        content: '完成商家入驻后可管理服务相册',
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
      const raw = await fetchMerchantServiceAlbumList({ tab: this.data.tab })
      const list = (raw || []).map(enrichMerchantAlbumListItem)
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
    wx.navigateTo({ url: '/packageMerchant/pages/album/create/index' })
  },

  onCardTap(e) {
    const { id } = e.detail
    if (!id) return
    wx.navigateTo({ url: `/packageMerchant/pages/album/edit/index?albumId=${id}` })
  },

  onRetry() {
    this.loadList()
  },

  onShareAppMessage(res) {
    if (res.from === 'button' && res.target && res.target.dataset) {
      const payload = buildOwnerShareMessageFromDataset(res.target.dataset)
      if (payload) return payload
    }
    return {
      title: '辙见 · 服务相册',
      path: '/pages/index/index',
    }
  },
})
