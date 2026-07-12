const { fetchAlbumClaimPreview, claimServiceAlbum } = require('../../../services/service-album')
const { AUTHORIZATION_CONSENT, COMPLIANCE_COPY } = require('../../../constants/compliance-copy')
const { resolveAlbumIdFromOptions } = require('../../../utils/album-claim')
const { markMerchantToolEntry } = require('../../../utils/tool-entry-context')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    preview: null,
    privacyAcknowledged: false,
    privacyModalVisible: false,
    agreedClaim: false,
    agreedProcessing: false,
    submitting: false,
    needLogin: false,
    needPhone: false,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    consentClaimText: AUTHORIZATION_CONSENT.album_claim.text,
    consentProcessingText: AUTHORIZATION_CONSENT.album_processing.text,
    privacyIntroText: COMPLIANCE_COPY.albumClaimPrivacyIntro,
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
      const showPrivacyModal = Boolean(preview.claimable && !preview.alreadyOwner)
      this.setData({
        preview,
        status: 'ready',
        privacyModalVisible: showPrivacyModal,
        privacyAcknowledged: !showPrivacyModal,
      })
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

  onPrivacyAcknowledge() {
    this.setData({
      privacyAcknowledged: true,
      privacyModalVisible: false,
    })
  },

  onPrivacyModalCancel() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/mine/index' })
      },
    })
  },

  onOpenPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/mine/settings/document/index?type=privacy' })
  },

  onClaimConsentToggle(e) {
    const checked = e.detail && e.detail.checked
    this.setData({ agreedClaim: Boolean(checked) })
  },

  onProcessingConsentToggle(e) {
    const checked = e.detail && e.detail.checked
    this.setData({ agreedProcessing: Boolean(checked) })
  },

  buildAuthorizationConsents() {
    return [
      {
        authType: AUTHORIZATION_CONSENT.album_claim.authType,
        authTextVersion: AUTHORIZATION_CONSENT.album_claim.version,
        authTextSnapshot: AUTHORIZATION_CONSENT.album_claim.text,
        businessId: this.albumId,
      },
      {
        authType: AUTHORIZATION_CONSENT.album_processing.authType,
        authTextVersion: AUTHORIZATION_CONSENT.album_processing.version,
        authTextSnapshot: AUTHORIZATION_CONSENT.album_processing.text,
        businessId: this.albumId,
      },
    ]
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
    if (!this.data.privacyAcknowledged) {
      this.setData({ privacyModalVisible: true })
      return
    }
    if (!this.data.agreedClaim || !this.data.agreedProcessing) {
      wx.showToast({ title: '请阅读并勾选全部确认项', icon: 'none' })
      return
    }
    if (!this.ensureAuth()) return
    this.submitClaim()
  },

  async submitClaim() {
    this.setData({ submitting: true })
    try {
      await claimServiceAlbum(this.albumId, {
        agreed: true,
        authorizationConsents: this.buildAuthorizationConsents(),
      })
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
    if (
      this.data.privacyAcknowledged &&
      this.data.agreedClaim &&
      this.data.agreedProcessing &&
      this.data.preview &&
      this.data.preview.claimable
    ) {
      this.submitClaim()
    }
  },

  onLoginSheetFail() {
    this.syncAuthState()
  },
})
