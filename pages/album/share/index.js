const { fetchSharedAlbum } = require('../../../services/service-album')
const { resolveImageSrcList } = require('../../../utils/desensitize-url')
const { SHARE_MODE } = require('../../../constants/album-share')
const { markShareStoreContext } = require('../../../utils/share-store-context')
const { reLaunchAppHome } = require('../../../utils/app-home')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    detail: null,
    summaryRows: [],
  },

  onLoad(options) {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    this.shareToken = options.token || ''
    if (!this.shareToken) {
      this.setData({
        status: 'error',
        errorMessage: '分享链接无效',
      })
      return
    }
    this.loadSharedAlbum()
  },

  async loadSharedAlbum() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchSharedAlbum(this.shareToken)
      const nodes = (detail.nodes || []).map((node) => ({
        ...node,
        images: resolveImageSrcList(node.images),
      }))
      const summaryRows = [
        { label: '服务项目', value: detail.serviceName || '—' },
        { label: '门店', value: (detail.store && detail.store.name) || '—' },
        { label: '车辆', value: detail.vehicleDisplay || '—' },
        {
          label: '分享方式',
          value: detail.shareMode === SHARE_MODE.ORIGINAL ? '原图分享' : '脱敏分享',
        },
      ]
      this.setData({
        detail: { ...detail, nodes },
        summaryRows,
        status: 'normal',
      })
      const storeId = detail.store && detail.store.id
      if (storeId) {
        markShareStoreContext({ storeId, source: 'album_token_share', albumId: detail.albumId })
      }
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onGoHome() {
    reLaunchAppHome()
  },
})
