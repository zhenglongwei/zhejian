const { isLoggedIn, isMerchant, getSession } = require('../../utils/auth')
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
