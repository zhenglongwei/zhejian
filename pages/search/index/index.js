const {
  TOOL_SEARCH_ALBUM_PLACEHOLDER,
  TOOL_SEARCH_STORE_PLACEHOLDER,
  TOOL_SEARCH_MIGRATED_HINT,
} = require('../../../constants/search-tool')
const { SEARCH_KEYWORD_MAX } = require('../../../constants/search')
const { openH5ContentSite } = require('../../../constants/h5-links')
const { navigateFromAlbumCode, navigateToScanTarget } = require('../../../utils/tool-scan')
const { isAlbumCodeInput } = require('../../../utils/search-tool')
const {
  resolvePageShareContext,
  getShareStoreId,
  withStoreContextPath,
} = require('../../../utils/share-store-context')

Page({
  data: {
    albumCode: '',
    storeKeyword: '',
    storeMode: false,
    storeId: '',
    scanning: false,
    albumPlaceholder: TOOL_SEARCH_ALBUM_PLACEHOLDER,
    storePlaceholder: TOOL_SEARCH_STORE_PLACEHOLDER,
    migratedHint: TOOL_SEARCH_MIGRATED_HINT,
  },

  onLoad(options) {
    const ctx = resolvePageShareContext(options || {}, {
      storeId: (options && options.storeId) || '',
      autoIsolate: Boolean(options && options.storeId),
    })
    const storeId = (options && options.storeId) || ctx.storeId || getShareStoreId() || ''
    this.setData({ storeMode: Boolean(storeId), storeId })

    const legacyKeyword = options && options.keyword ? decodeURIComponent(options.keyword) : ''
    if (legacyKeyword) {
      if (isAlbumCodeInput(legacyKeyword)) {
        navigateFromAlbumCode(legacyKeyword)
        return
      }
      if (storeId) {
        wx.redirectTo({
          url: withStoreContextPath(
            `/pages/search/result/index?keyword=${encodeURIComponent(legacyKeyword)}&storeId=${encodeURIComponent(storeId)}`,
            { storeId, isolated: true }
          ),
        })
        return
      }
      this.setData({ albumCode: legacyKeyword })
    }
  },

  onAlbumInput(e) {
    this.setData({ albumCode: (e.detail && e.detail.value) || '' })
  },

  onStoreInput(e) {
    this.setData({ storeKeyword: (e.detail && e.detail.value) || '' })
  },

  onAlbumSubmit() {
    navigateFromAlbumCode(this.data.albumCode)
  },

  onStoreSearch() {
    const keyword = String(this.data.storeKeyword || '').trim()
    if (!keyword) {
      wx.showToast({ title: '请输入搜索关键词', icon: 'none' })
      return
    }
    if (keyword.length > SEARCH_KEYWORD_MAX) {
      wx.showToast({
        title: `关键词不超过 ${SEARCH_KEYWORD_MAX} 字`,
        icon: 'none',
      })
      return
    }
    const { storeId } = this.data
    if (!storeId) return
    wx.navigateTo({
      url: withStoreContextPath(
        `/pages/search/result/index?keyword=${encodeURIComponent(keyword)}&storeId=${encodeURIComponent(storeId)}`,
        { storeId, isolated: true }
      ),
    })
  },

  onScanTap() {
    if (this.data.scanning) return
    this.setData({ scanning: true })
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success: (res) => {
        navigateToScanTarget(res.result)
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) return
        wx.showToast({ title: '扫码失败', icon: 'none' })
      },
      complete: () => {
        this.setData({ scanning: false })
      },
    })
  },

  onOpenH5() {
    openH5ContentSite()
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/home/index' })
  },
})
