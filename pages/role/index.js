const { isLoggedIn, isMerchant, getSession } = require('../../utils/auth')
const { hasAgreedLegalConsent, markLegalConsent } = require('../../utils/legal-consent')
const { authorizeOnRolePage, confirmWechatPrivacy } = require('../../utils/privacy-authorize')
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
    // 启动确认后立即把同意落到微信侧：否则第一次选图/选地址时微信还会再弹一次。
    // 新用户刚点过同意，requirePrivacyAuthorize 会被 5 秒放行窗口直接应答；
    // 老用户微信侧授权被重置时，弹窗会在本页可见地弹出，同意后才继续。
    const wechatAuthorized = await confirmWechatPrivacy()
    if (!wechatAuthorized) {
      console.warn('[role] 微信隐私授权未完成，后续隐私接口可能再弹授权')
    }
    // 登录态先于角色：本机记住的角色不作数，先把身份确认/刷新一遍再跳。
    // 否则会带着失效的登录态进首页 —— 首页拉不到数据，还会被当成「没入驻」
    if (!isLoggedIn()) {
      try {
        await wechatLogin()
      } catch (e) {
        if (this._left) return
        this.setData({ status: 'choose' })
        return
      }
    } else {
      try {
        await refreshSession()
      } catch (e) {
        // 本地已有登录态，刷新失败不挡路，继续用本地身份判断
      }
    }

    if (!isLoggedIn()) {
      if (this._left) return
      this.setData({ status: 'choose' })
      return
    }

    const remembered = readLocalRole()
    if (remembered) {
      reLaunchRoleHome(remembered)
      return
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
    if (this._picking || this._left) return
    this._picking = true
    try {
      await persistRole(role)
      if (!isLoggedIn()) {
        const loggedIn = await this.authorizeAndLogin()
        if (!loggedIn || this._left) return
      }
      reLaunchRoleHome(role)
    } catch (e) {
      if (this._left) return
      wx.showToast({
        title: (e && e.message) || '登录失败，请重试',
        icon: 'none',
      })
    } finally {
      this._picking = false
    }
  },

  async authorizeAndLogin() {
    const agreed = await authorizeOnRolePage(this)
    if (!agreed) return false
    await wechatLogin()
    return isLoggedIn()
  },
})
