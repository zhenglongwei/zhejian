const {
  fetchMerchantServiceAlbum,
  fetchMerchantAlbumClaimQrcode,
  saveMerchantServiceAlbum,
} = require('../../../../services/merchant-service-album')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')
const { buildAlbumClaimShareMessage } = require('../../../../utils/album-claim')
const { TOOL_HOME_PATH } = require('../../../../utils/share-store-context')
const { MERCHANT_ALBUM_FLOW_PAGE } = require('../../../../utils/merchant-album-nav')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    detail: null,
    qrcodeDataUrl: '',
    qrcodeMessage: '正在生成小程序码…',
    showPhoneInput: false,
    phoneInputFocus: false,
    ownerPhoneInput: '',
    savingPhone: false,
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    this.entryAction = options.action || ''
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '服务相册信息缺失' })
      return
    }
    this.initPage()
  },

  onShow() {
    wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage'] })
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
        })),
      ])
      this.setData({
        status: 'normal',
        detail,
        qrcodeDataUrl: qrcode.qrcodeAvailable ? qrcode.qrcodeDataUrl || '' : '',
        qrcodeMessage: qrcode.qrcodeAvailable
          ? ''
          : qrcode.message || '暂无法生成小程序码，请分享链接发给车主',
      })
      this.maybeHintEntryAction(detail)
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  maybeHintEntryAction(detail) {
    if (!this.entryAction || (detail && detail.hasOwner)) return
    const action = this.entryAction
    this.entryAction = ''
    if (action === 'share') {
      wx.showToast({ title: '请点击下方「分享给车主」', icon: 'none', duration: 2500 })
      return
    }
    if (action === 'scan') {
      wx.showToast({ title: '请出示下方二维码给车主', icon: 'none', duration: 2500 })
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

  onShareAppMessage() {
    const detail = this.data.detail || {}
    if (!this.albumId || detail.hasOwner) {
      return {
        title: '辙见 · 服务相册',
        path: TOOL_HOME_PATH,
      }
    }
    return buildAlbumClaimShareMessage({
      albumId: this.albumId,
      storeName: detail.storeName,
      serviceName: detail.serviceName,
    })
  },

  goEditAlbum() {
    if (!this.albumId) return
    wx.redirectTo({
      url: `${MERCHANT_ALBUM_FLOW_PAGE}?albumId=${this.albumId}`,
    })
  },

  onSwitchToManualPhone() {
    if (!this.albumId || (this.data.detail && this.data.detail.hasOwner)) return
    this.setData({ showPhoneInput: true, phoneInputFocus: true })
  },

  onOwnerPhoneInput(e) {
    const digits = String((e.detail && e.detail.value) || '').replace(/\D/g, '').slice(0, 11)
    this.setData({ ownerPhoneInput: digits })
    if (digits.length === 11) this.onSaveOwnerPhone()
  },

  async onSaveOwnerPhone() {
    if (this._savingPhone || !this.albumId) return
    const phone = String(this.data.ownerPhoneInput || '').replace(/\D/g, '')
    if (phone.length !== 11) {
      wx.showToast({ title: '请填写正确的手机号', icon: 'none' })
      return
    }
    this._savingPhone = true
    this.setData({ savingPhone: true })
    try {
      const detail = await saveMerchantServiceAlbum(this.albumId, { userPhone: phone })
      this.setData({
        detail,
        savingPhone: false,
        showPhoneInput: false,
        phoneInputFocus: false,
      })
      if (detail && detail.hasOwner) {
        this.stopOwnerPoll()
        wx.showToast({ title: '已关联', icon: 'success' })
      }
    } catch (e) {
      this.setData({ savingPhone: false })
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this._savingPhone = false
    }
  },

  onContinue() {
    this.goEditAlbum()
  },
})
