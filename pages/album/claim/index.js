const { fetchAlbumClaimPreview, claimServiceAlbum } = require('../../../services/service-album')
const { COMPLIANCE_COPY } = require('../../../constants/compliance-copy')
const { resolveAlbumIdFromOptions } = require('../../../utils/album-claim')
const { markMerchantToolEntry } = require('../../../utils/tool-entry-context')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    preview: null,
    agreed: false,
    submitting: false,
    needLogin: false,
    needPhone: false,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    consentText: COMPLIANCE_COPY.albumClaim,
  },

  onLoad(options) {
    this.albumId = resolveAlbumIdFromOptions(options)
    if (!this.albumId) {
      this.setData({
        status: 'error',
        errorMessage: '相册信息缺失',
      })
      return
    }
    markMerchantToolEntry('claim_launch')
    this.loadPreview()
  },

  onShow() {
    if (this.albumId && this.data.preview && this.data.preview.claimable) {
      this.syncAuthState()
    }
  },

  syncAuthState() {
    const needLogin = !isLoggedIn()
    const needPhone = !needLogin && !checkAuth({ needPhone: true }).ok
    this.setData({ needLogin, needPhone })
  },

  async loadPreview() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const preview = await fetchAlbumClaimPreview(this.albumId)
      this.syncAuthState()
      const status = preview.alreadyOwner || preview.claimable ? 'ready' : 'ready'
      this.setData({ preview, status })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
        preview: null,
      })
    }
  },

  onRetry() {
    this.loadPreview()
  },

  onAgreeToggle(e) {
    const checked = e.detail && e.detail.checked
    this.setData({ agreed: Boolean(checked) })
  },

  ensureAuth() {
    if (!isLoggedIn()) {
      this.setData({
        loginSheetVisible: true,
        loginSheetMode: 'login',
      })
      return false
    }
    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        loginSheetVisible: true,
        loginSheetMode: 'bindPhone',
      })
      return false
    }
    return true
  },

  onClaimTap() {
    if (this.data.submitting) return
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意关联说明', icon: 'none' })
      return
    }
    if (!this.ensureAuth()) return
    this.submitClaim()
  },

  async submitClaim() {
    this.setData({ submitting: true })
    try {
      await claimServiceAlbum(this.albumId, { agreed: true })
      wx.showToast({ title: '关联成功', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/album/detail/index?albumId=${this.albumId}`,
        })
      }, 400)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '关联失败', icon: 'none' })
      this.loadPreview()
    } finally {
      this.setData({ submitting: false })
    }
  },

  onViewAlbum() {
    wx.redirectTo({
      url: `/pages/album/detail/index?albumId=${this.albumId}`,
    })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
    this.syncAuthState()
  },

  onLoginSheetSuccess() {
    this.setData({ loginSheetVisible: false })
    this.syncAuthState()
    if (this.data.agreed && this.data.preview && this.data.preview.claimable) {
      this.submitClaim()
    }
  },

  onLoginSheetFail() {
    this.syncAuthState()
  },
})
