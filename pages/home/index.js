const { fetchMineSummary } = require('../../services/user')
const { openH5ContentSite } = require('../../constants/h5-links')
const { navigateToScanTarget, navigateFromAlbumCode } = require('../../utils/tool-scan')
const { markMerchantToolEntry, shouldShowH5PublicCaseLink } = require('../../utils/tool-entry-context')
const { isLoggedIn, checkAuth } = require('../../utils/auth')
const {
  getRecentVisit,
  buildRecentVisitLabel,
  buildRecentVisitPath,
} = require('../../utils/recent-visit')
const { TOOL_GUEST_ALBUM_HINT } = require('../../constants/tool-login-copy')

Page({
  data: {
    isLoggedIn: false,
    enterCodeVisible: false,
    enterCodeValue: '',
    loginSheetVisible: false,
    loginSheetMode: 'login',
    scanning: false,
    showH5PublicCaseLink: false,
    h5SiteLabel: '想了解公开维修案例？前往辙见内容站',
    showRecentVisit: false,
    recentVisitLabel: '',
    guestAlbumHint: TOOL_GUEST_ALBUM_HINT,
  },

  onShow() {
    this.refreshPage()
  },

  onPullDownRefresh() {
    this.refreshPage().finally(() => wx.stopPullDownRefresh())
  },

  async refreshPage() {
    const loggedIn = isLoggedIn()
    const recent = getRecentVisit()
    const recentVisitLabel = buildRecentVisitLabel(recent)
    this.recentVisitPath = buildRecentVisitPath(recent)

    this.setData({
      isLoggedIn: loggedIn,
      showRecentVisit: Boolean(recent && recentVisitLabel),
      recentVisitLabel,
      showH5PublicCaseLink: shouldShowH5PublicCaseLink({ hasAlbumBindings: false }),
    })

    if (!loggedIn) return

    const auth = checkAuth({ needPhone: false })
    if (!auth.ok) return

    try {
      const summary = await fetchMineSummary()
      this.setData({
        showH5PublicCaseLink: shouldShowH5PublicCaseLink({
          hasAlbumBindings: Boolean(summary && summary.hasAlbumBindings),
        }),
      })
    } catch (e) {
      // H5 条件展示失败时不阻断工具首页
    }
  },

  onScanTap() {
    if (this.data.scanning) return
    this.setData({ scanning: true })
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success: (res) => {
        if (navigateToScanTarget(res.result)) {
          markMerchantToolEntry('scan')
          this.setData({ showH5PublicCaseLink: false })
        }
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

  onEnterCodeTap() {
    this.setData({ enterCodeVisible: true, enterCodeValue: '' })
  },

  onEnterCodeClose() {
    this.setData({ enterCodeVisible: false, enterCodeValue: '' })
  },

  onEnterCodeInput(e) {
    this.setData({ enterCodeValue: (e.detail && e.detail.value) || '' })
  },

  onEnterCodeConfirm() {
    const code = (this.data.enterCodeValue || '').trim()
    if (!navigateFromAlbumCode(code)) return
    markMerchantToolEntry('album_code')
    this.setData({ showH5PublicCaseLink: false })
    this.onEnterCodeClose()
  },

  onMyAlbumsTap() {
    if (isLoggedIn()) return
    this.setData({ loginSheetVisible: true, loginSheetMode: 'login' })
  },

  onH5SiteTap() {
    openH5ContentSite()
  },

  onRecentVisitTap() {
    if (!this.recentVisitPath) return
    wx.navigateTo({ url: this.recentVisitPath })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    wx.switchTab({ url: '/pages/mine/index' })
  },
})
