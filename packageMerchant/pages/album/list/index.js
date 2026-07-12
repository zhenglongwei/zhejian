const { fetchMerchantServiceAlbumList } = require('../../../../services/merchant-service-album')
const {
  MERCHANT_SERVICE_ALBUM_LIST_TABS,
} = require('../../../../constants/service-album-status')
const {
  buildOwnerShareMessage,
  buildOwnerShareMessageFromDataset,
} = require('../../../../utils/service-album-share')
const { enrichMerchantAlbumListItem } = require('../../../../utils/service-album-display')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')
const {
  shouldRunInitialShow,
  finishInitialShow,
  markListNeedRefresh,
  consumeListRefresh,
  shouldShowListLoading,
} = require('../../../../utils/list-page-show')
const { TOOL_HOME_PATH } = require('../../../../utils/share-store-context')
const { buildMerchantAlbumEntryPath } = require('../../../../utils/merchant-album-nav')

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

    if (shouldRunInitialShow(this)) {
      this.bootstrap()
        .catch(() => {})
        .finally(() => finishInitialShow(this))
      return
    }
    if (consumeListRefresh(this)) {
      this.bootstrap({ silent: true })
    }
  },

  async bootstrap(options = {}) {
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
    await this.loadList(options)
  },

  async loadList(options = {}) {
    const { silent = false, forceLoading = false } = options

    if (this._listLoading) return
    this._listLoading = true

    const showLoading = forceLoading || shouldShowListLoading(this, silent)
    if (showLoading) {
      this.setData({ status: 'loading', errorMessage: '' })
    }

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
    } finally {
      this._listLoading = false
    }
  },

  onTabChange(e) {
    const { key } = e.detail
    if (key === this.data.tab) return
    this.setData({ tab: key }, () => this.loadList({ forceLoading: true }))
  },

  onCreate() {
    markListNeedRefresh(this)
    wx.navigateTo({ url: '/packageMerchant/pages/album/create/index' })
  },

  onCardTap(e) {
    const { id } = e.detail
    if (!id) return
    const item = (this.data.list || []).find((row) => row.albumId === id) || { albumId: id }
    markListNeedRefresh(this)
    wx.navigateTo({ url: buildMerchantAlbumEntryPath(id, item) })
  },

  onRetry() {
    this.loadList({ forceLoading: true })
  },

  onShareAppMessage(res) {
    if (res.from === 'button' && res.target && res.target.dataset) {
      const payload = buildOwnerShareMessageFromDataset(res.target.dataset)
      if (payload) return payload
    }
    return {
      title: '辙见 · 服务相册',
      path: TOOL_HOME_PATH,
    }
  },
})
