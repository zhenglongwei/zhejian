const { fetchMerchantServiceAlbumList } = require('../../../../services/merchant-service-album')
const {
  MERCHANT_SERVICE_ALBUM_LIST_TABS,
  normalizeMerchantServiceAlbumListTab,
} = require('../../../../constants/service-album-status')
const {
  buildOwnerShareMessageFromDataset,
} = require('../../../../utils/service-album-share')
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
const { openH5Url } = require('../../../../constants/h5-links')
const { toCard } = require('../../../../utils/merchant-workbench-home')

function matchesListTab(card, tab) {
  if (tab === 'done') return Boolean(card.repairDone)
  if (tab === 'confirm') return Boolean(card.quotePending) && !card.repairDone
  if (tab === 'active') return !card.repairDone
  return true
}

Page({
  data: {
    status: 'loading',
    list: [],
    statusTabs: MERCHANT_SERVICE_ALBUM_LIST_TABS,
    tab: 'all',
    keyword: '',
    errorMessage: '',
    createOpen: false,
    statusBarHeight: 20,
    capsulePad: 16,
  },

  onLoad(options) {
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    let capsulePad = 16
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      if (menu && menu.left && sys.windowWidth) {
        capsulePad = Math.max(16, sys.windowWidth - menu.left + 8)
      }
    } catch (e) {
      capsulePad = 96
    }
    this.setData({
      tab: normalizeMerchantServiceAlbumListTab(options.tab),
      keyword: String(options.q || options.keyword || '').trim(),
      statusBarHeight: sys.statusBarHeight || 20,
      capsulePad,
    })
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
            wx.navigateTo({ url: '/packageMerchant/pages/workbench/index' })
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
      const keyword = String(this.data.keyword || '').trim()
      const raw = await fetchMerchantServiceAlbumList({
        tab: this.data.tab,
        q: keyword || undefined,
      })
      const list = (raw || [])
        .map((item) => ({
          ...toCard(item),
          reviewLine: item.reviewLine || '',
          hostedSiteUrl: item.hostedSiteUrl || '',
          hasOwner: Boolean(item.hasOwner),
          status: item.status || '',
        }))
        .filter((card) => matchesListTab(card, this.data.tab))
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

  onKeywordInput(e) {
    this.setData({ keyword: (e.detail && e.detail.value) || '' })
  },

  onKeywordSearch(e) {
    const value =
      e && e.detail && e.detail.value != null ? e.detail.value : this.data.keyword
    this.setData({ keyword: String(value || '').trim() }, () =>
      this.loadList({ forceLoading: true }),
    )
  },

  onKeywordClear() {
    this.setData({ keyword: '' }, () => this.loadList({ forceLoading: true }))
  },

  onChip(e) {
    const key = normalizeMerchantServiceAlbumListTab(e.currentTarget.dataset.key)
    if (key === this.data.tab) return
    this.setData({ tab: key }, () => this.loadList({ forceLoading: true }))
  },

  onCreate() {
    this.setData({ createOpen: true })
  },

  onCloseCreate() {
    this.setData({ createOpen: false })
  },

  onCardTap(e) {
    const id = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || (e.detail && e.detail.id)
    if (!id) return
    const item = (this.data.list || []).find((row) => row.albumId === id) || { albumId: id }
    markListNeedRefresh(this)
    wx.navigateTo({ url: buildMerchantAlbumEntryPath(id, item) })
  },

  onOpenHostedSite(e) {
    const url = e.detail && e.detail.url
    if (!url) return
    openH5Url(url)
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
