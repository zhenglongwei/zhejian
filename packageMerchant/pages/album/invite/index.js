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
    if (this.albumId) {
      if (this.data.status === 'normal') {
        this.refreshOwnerStatus()
      }
      this.startOwnerPoll()
    }
  },

  onHide() {
    this.stopOwnerPoll()
  },

  onUnload() {
    this.stopOwnerPoll()
  },

  startOwnerPoll() {
    this.stopOwnerPoll()
    if (!this.albumId || (this.data.detail && this.data.detail.hasOwner)) return
    this._ownerPollTimer = setInterval(() => {
      this.refreshOwnerStatus({ silent: true })
    }, 3000)
  },

  stopOwnerPoll() {
    if (this._ownerPollTimer) {
      clearInterval(this._ownerPollTimer)
      this._ownerPollTimer = null
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

  async refreshOwnerStatus(options = {}) {
    const silent = Boolean(options && options.silent)
    try {
      const detail = await fetchMerchantServiceAlbum(this.albumId)
      const wasOwner = Boolean(this.data.detail && this.data.detail.hasOwner)
      this.setData({ detail })
      if (detail.hasOwner) {
        this.stopOwnerPoll()
        if (!wasOwner && !silent) {
          wx.showToast({ title: '车主已关联', icon: 'success' })
        }
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
    if (!this.data.detail || !this.data.detail.hasOwner) {
      wx.showToast({ title: '请等待车主扫码并确认', icon: 'none' })
      return
    }
    wx.redirectTo({
      url: `/packageMerchant/pages/album/edit/index?albumId=${this.albumId}`,
    })
  },
})
