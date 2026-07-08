const { fetchServiceAlbum } = require('../../../services/service-album')
const { enrichServiceAlbumListItem } = require('../../../utils/service-album-display')
const { buildAlbumComparePairs, buildAlbumCompareHint } = require('../../../utils/album-compare-pairs')

function setComparePageOrientation(orientation) {
  if (typeof wx.setPageOrientation !== 'function') return
  wx.setPageOrientation({ orientation })
}

function getWindowMetrics() {
  try {
    return typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
  } catch (err) {
    return { windowWidth: 375, windowHeight: 667, statusBarHeight: 20 }
  }
}

function resolveNavMetrics() {
  try {
    const windowInfo = getWindowMetrics()
    const menuButton = wx.getMenuButtonBoundingClientRect()
    const statusBarHeight = windowInfo.statusBarHeight || 20
    const gap = menuButton.top - statusBarHeight
    const navBarHeight = menuButton.height + gap * 2
    return { navTotalHeight: statusBarHeight + navBarHeight }
  } catch (err) {
    return { navTotalHeight: 64 }
  }
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    comparePairs: [],
    compareHint: '',
    pairIndex: 0,
    swiperHeightPx: 480,
    compareStageHeightPx: 440,
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    this._onWindowResize = () => this.updateCompareLayout()
    if (wx.onWindowResize) wx.onWindowResize(this._onWindowResize)
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '相册信息缺失' })
      return
    }
    setComparePageOrientation('auto')
    this.loadCompare()
  },

  onReady() {
    this.updateCompareLayout()
  },

  onShow() {
    this.updateCompareLayout()
  },

  onUnload() {
    if (wx.offWindowResize && this._onWindowResize) {
      wx.offWindowResize(this._onWindowResize)
    }
    setComparePageOrientation('portrait')
  },

  updateCompareLayout() {
    const win = getWindowMetrics()
    const nav = resolveNavMetrics()
    const windowHeight = win.windowHeight || 667
    const footerReserve = 96
    const bodyPadding = 32
    const titleReserve = 40
    const swiperHeightPx = Math.max(
      280,
      windowHeight - nav.navTotalHeight - footerReserve - bodyPadding,
    )
    const compareStageHeightPx = Math.max(240, swiperHeightPx - titleReserve)
    this.setData({ swiperHeightPx, compareStageHeightPx })
  },

  async loadCompare() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchServiceAlbum(this.albumId)
      const enriched = enrichServiceAlbumListItem({
        ...detail,
        id: detail.albumId,
      })
      const comparePairs = buildAlbumComparePairs(enriched.nodes || [], {
        templateId: enriched.templateId,
        templateName: enriched.templateName,
        serviceName: enriched.serviceName,
      })
      if (!comparePairs.length) {
        this.setData({
          status: 'error',
          errorMessage: '暂无完工对照照片',
        })
        return
      }
      this.setData(
        {
          status: 'normal',
          comparePairs,
          compareHint: buildAlbumCompareHint(comparePairs),
          pairIndex: 0,
        },
        () => this.updateCompareLayout(),
      )
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    this.loadCompare()
  },

  onPairChange(e) {
    const index = (e.detail && e.detail.current) || 0
    if (index !== this.data.pairIndex) {
      this.setData({ pairIndex: index })
    }
  },
})
