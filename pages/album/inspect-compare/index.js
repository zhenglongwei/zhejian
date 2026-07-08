const { fetchServiceAlbum } = require('../../../services/service-album')
const { enrichServiceAlbumListItem } = require('../../../utils/service-album-display')
const { buildAlbumComparePairs, buildAlbumCompareHint } = require('../../../utils/album-compare-pairs')

function setComparePageOrientation(orientation) {
  if (typeof wx.setPageOrientation !== 'function') return
  wx.setPageOrientation({ orientation })
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    comparePairs: [],
    compareHint: '',
    pairIndex: 0,
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '相册信息缺失' })
      return
    }
    setComparePageOrientation('auto')
    this.loadCompare()
  },

  onUnload() {
    setComparePageOrientation('portrait')
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
      this.setData({
        status: 'normal',
        comparePairs,
        compareHint: buildAlbumCompareHint(comparePairs),
        pairIndex: 0,
      })
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
