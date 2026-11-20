const {
  fetchMerchantServiceAlbumList,
  deleteMerchantServiceAlbum,
} = require('../../../../services/merchant-service-album')
const { inviteOwnerReview } = require('../../../../utils/merchant-review-invite')
const {
  defaultMerchantAlbumFilters,
  matchesMerchantAlbumFilters,
  matchesMerchantAlbumKeyword,
  buildMerchantAlbumFilterGroups,
  summarizeMerchantAlbumFilters,
  merchantAlbumFiltersFromQuery,
} = require('../../../../utils/merchant-album-filters')
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
const { presentAlbumCard } = require('../../../../utils/merchant-workbench-home')

function buildCountText(total, matched, hasCondition) {
  if (!total) return ''
  if (!hasCondition) return `共 ${total} 本相册`
  return `匹配到 ${matched} 本 · 共 ${total} 本`
}

function buildEmptyHint(keyword, hasActiveFilters) {
  const q = String(keyword || '').trim()
  if (q) return `没有匹配「${q}」的相册`
  if (hasActiveFilters) return '没有符合筛选条件的相册'
  return ''
}

function buildClearLabel(keyword, hasActiveFilters) {
  if (keyword && hasActiveFilters) return '清空搜索与筛选'
  if (keyword) return '清空搜索'
  if (hasActiveFilters) return '清空筛选'
  return ''
}

Page({
  data: {
    status: 'loading',
    list: [],
    totalCount: 0,
    isFilteredEmpty: false,
    filters: defaultMerchantAlbumFilters(),
    filterGroups: [],
    filterTags: [],
    hasActiveFilters: false,
    resultText: '',
    emptyHint: '',
    clearLabel: '',
    keyword: '',
    panelOpen: false,
    errorMessage: '',
    createOpen: false,
    statusBarHeight: 20,
    capsulePad: 16,
  },

  onLoad(options) {
    const query = options || {}
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
    this._cards = []
    this.setData({
      filters: merchantAlbumFiltersFromQuery(query),
      keyword: String(query.q || query.keyword || '').trim(),
      statusBarHeight: sys.statusBarHeight || 20,
      capsulePad,
    })
    this._syncApplied()
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
      // 搜索与筛选全在端上即时算，所以每次都取全量，不再把 q 交给服务端
      const raw = await fetchMerchantServiceAlbumList({ tab: 'all' })
      this._cards = (raw || []).map((item) => presentAlbumCard(item))
      this._loaded = true
      this._syncApplied()
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    } finally {
      this._listLoading = false
    }
  },

  /** 关键词 ∩ 三维筛选 → 列表、各档计数、收起后挂在搜索框上的小标 */
  _syncApplied() {
    const cards = this._cards || []
    const { keyword, filters } = this.data
    const pool = cards.filter((card) => matchesMerchantAlbumKeyword(card, keyword))
    const list = pool.filter((card) => matchesMerchantAlbumFilters(card, filters))
    const filterTags = summarizeMerchantAlbumFilters(filters)
    const hasActiveFilters = filterTags.length > 0
    const hasCondition = hasActiveFilters || Boolean(String(keyword || '').trim())
    const nextStatus = !this._loaded
      ? this.data.status
      : list.length
        ? 'normal'
        : 'empty'
    this.setData({
      list,
      isFilteredEmpty: cards.length > 0 && list.length === 0,
      filterGroups: buildMerchantAlbumFilterGroups(pool, filters),
      filterTags,
      hasActiveFilters,
      resultText: buildCountText(cards.length, list.length, hasCondition),
      emptyHint: buildEmptyHint(keyword, hasActiveFilters),
      clearLabel: buildClearLabel(String(keyword || '').trim(), hasActiveFilters),
      status: nextStatus,
    })
  },

  onOpenPanel() {
    if (this.data.panelOpen) return
    this.setData({ panelOpen: true })
  },

  onClosePanel() {
    if (!this.data.panelOpen) return
    this.setData({ panelOpen: false })
  },

  onSearchInput(e) {
    this.setData({ keyword: (e.detail && e.detail.value) || '' }, () => this._syncApplied())
  },

  onSearchClear() {
    this.setData({ keyword: '' }, () => this._syncApplied())
  },

  onFilterOption(e) {
    const dataset = (e.currentTarget && e.currentTarget.dataset) || {}
    const dim = dataset.dim
    const key = dataset.key
    if (!dim || !key) return
    this.setData({ filters: { ...this.data.filters, [dim]: key } }, () => this._syncApplied())
  },

  onResetFilters() {
    this.setData({ filters: defaultMerchantAlbumFilters() }, () => this._syncApplied())
  },

  onRemoveFilterTag(e) {
    const dim = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.dim
    if (!dim) return
    this.setData({ filters: { ...this.data.filters, [dim]: 'all' } }, () => this._syncApplied())
  },

  onClearSearchAndFilters() {
    this.setData(
      { keyword: '', filters: defaultMerchantAlbumFilters() },
      () => this._syncApplied(),
    )
  },

  onOpenReview(e) {
    const id = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.reviewId) || ''
    if (!id) return
    wx.navigateTo({
      url: `/packageMerchant/pages/review/detail/index?id=${encodeURIComponent(id)}`,
    })
  },

  onCreate() {
    this.setData({ createOpen: true })
  },

  onCloseCreate() {
    this.setData({ createOpen: false })
  },

  onDeleteAlbum(e) {
    const id = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || ''
    if (!id || this._deleting) return
    const item = (this.data.list || []).find((row) => row.albumId === id)
    if (item && item.repairDone) {
      wx.showToast({ title: '已交车的相册不能删除', icon: 'none' })
      return
    }
    if (item && item.deliveryPending) {
      wx.showToast({ title: '等车主确认交车，不能删除', icon: 'none' })
      return
    }
    wx.showModal({
      title: '删除这本相册？',
      content: '删除后不能恢复。',
      confirmText: '删除',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        this._deleting = true
        wx.showLoading({ title: '删除中', mask: true })
        try {
          await deleteMerchantServiceAlbum(id)
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })
          await this.loadList({ silent: true })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
        } finally {
          this._deleting = false
        }
      },
    })
  },

  onCardTap(e) {
    const id = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || (e.detail && e.detail.id)
    if (!id) return
    const item = (this.data.list || []).find((row) => row.albumId === id) || { albumId: id }
    markListNeedRefresh(this)
    wx.navigateTo({ url: buildMerchantAlbumEntryPath(id, item) })
  },

  onInviteReview(e) {
    const id = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || ''
    if (!id) return
    inviteOwnerReview(id)
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
      title: '服务相册',
      path: TOOL_HOME_PATH,
    }
  },
})
