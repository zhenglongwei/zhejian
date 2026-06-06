const {
  fetchMerchantServiceAlbum,
  fetchMerchantAlbumClaimQrcode,
} = require('../../../../services/merchant-service-album')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')
const { buildAlbumClaimPath } = require('../../../../utils/album-claim')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    detail: null,
    qrcodeDataUrl: '',
    qrcodeMessage: '正在生成小程序码…',
    claimPath: '',
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '服务相册信息缺失' })
      return
    }
    this.initPage()
  },

  onShow() {
    if (this.albumId && this.data.status === 'normal') {
      this.refreshOwnerStatus()
    }
  },

  async initPage() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      this.setData({ status: 'error', errorMessage: '请先完成商家入驻' })
      return
    }
    await this.loadPage()
  },

  async loadPage() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const [detail, qrcode] = await Promise.all([
        fetchMerchantServiceAlbum(this.albumId),
        fetchMerchantAlbumClaimQrcode(this.albumId).catch((e) => ({
          qrcodeAvailable: false,
          message: (e && e.message) || '暂无法生成小程序码',
          claimPath: buildAlbumClaimPath(this.albumId),
        })),
      ])
      this.setData({
        status: 'normal',
        detail,
        qrcodeDataUrl: qrcode.qrcodeAvailable ? qrcode.qrcodeDataUrl || '' : '',
        qrcodeMessage: qrcode.qrcodeAvailable
          ? ''
          : qrcode.message || '暂无法生成小程序码，可复制认领路径发给车主',
        claimPath: qrcode.claimPath || detail.claimPath || buildAlbumClaimPath(this.albumId),
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  async refreshOwnerStatus() {
    try {
      const detail = await fetchMerchantServiceAlbum(this.albumId)
      this.setData({ detail })
      if (detail.hasOwner) {
        wx.showToast({ title: '车主已关联', icon: 'success' })
      }
    } catch (e) {
      /* ignore silent refresh errors */
    }
  },

  onRetry() {
    this.loadPage()
  },

  onCopyPath() {
    const path = this.data.claimPath || buildAlbumClaimPath(this.albumId)
    wx.setClipboardData({
      data: path,
      success: () => {
        wx.showToast({ title: '路径已复制', icon: 'success' })
      },
    })
  },

  onContinue() {
    wx.redirectTo({
      url: `/packageMerchant/pages/album/edit/index?albumId=${this.albumId}`,
    })
  },
})
