const { isLoggedIn, isMerchant, getSession } = require('../../utils/auth')
const { hasAgreedLegalConsent, markLegalConsent } = require('../../utils/legal-consent')
const { wechatLogin, fetchMineSummary, refreshSession } = require('../../services/user')
const {
  ROLE_MERCHANT,
  ROLE_OWNER,
  decideRole,
  readLocalRole,
  persistRole,
  reLaunchRoleHome,
} = require('../../utils/app-role')

Page({
  data: {
    status: 'loading',
  },

  onLoad() {
    // 协议先于一切：没确认过就不登录、不发请求
    if (!hasAgreedLegalConsent()) {
      this.setData({ status: 'consent' }, () => this.showConsentPopup())
      return
    }
    this.bootstrap()
  },

  showConsentPopup() {
    const run = () => {
      if (this._left) return
      const popup = this.selectComponent && this.selectComponent('#privacyAuthorizePopup')
      if (!popup || typeof popup.show !== 'function') return
      popup.show({
        title: '欢迎使用辙见',
        description: '继续使用前，请先阅读并同意下列协议。',
      })
    }
    if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
      wx.nextTick(run)
      return
    }
    setTimeout(run, 30)
  },

  onPopupResult(e) {
    const agreed = Boolean(e && e.detail && e.detail.agreed)
    if (this.data.status !== 'consent') return
    // 启动确认不接受「暂不」：弹窗保持，用户可退出或继续阅读
    if (!agreed) return
    markLegalConsent()
    this.setData({ status: 'loading' })
    this.bootstrap()
  },

  async bootstrap() {
    const known = readLocalRole()
    if (known) {
      reLaunchRoleHome(known)
      return
    }

    if (!isLoggedIn()) {
      try {
        await wechatLogin()
      } catch (e) {
        if (this._left) return
        this.setData({ status: 'choose' })
        return
      }
    }

    const afterLogin = readLocalRole()
    if (afterLogin) {
      reLaunchRoleHome(afterLogin)
      return
    }

    if (!isMerchant()) {
      try {
        await refreshSession()
      } catch (e) {
        // 非商家刷新失败时继续看相册关联
      }
    }

    let hasAlbumBindings = false
    const session = getSession()
    const preferredRole = (session.user && session.user.preferredRole) || ''
    const merchant = isMerchant()
    if (!preferredRole && !merchant && isLoggedIn()) {
      try {
        const summary = await fetchMineSummary()
        hasAlbumBindings = Boolean(summary && summary.hasAlbumBindings)
      } catch (e) {
        hasAlbumBindings = false
      }
    }

    const role = decideRole({
      local: readLocalRole(),
      preferredRole,
      isMerchant: merchant,
      hasAlbumBindings,
    })

    if (!role) {
      if (this._left) return
      this.setData({ status: 'choose' })
      return
    }

    await persistRole(role)
    reLaunchRoleHome(role)
  },

  onUnload() {
    this._left = true
  },

  onChooseMerchant() {
    this.pick(ROLE_MERCHANT)
  },

  onChooseOwner() {
    this.pick(ROLE_OWNER)
  },

  async pick(role) {
    if (this._picking) return
    this._picking = true
    await persistRole(role)
    reLaunchRoleHome(role)
  },
})
