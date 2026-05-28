const { fetchMineSummary } = require('../../services/user')
const { isLoggedIn, checkAuth, syncAppSession } = require('../../utils/auth')
const { buildMineMenuSections } = require('../../constants/mine-menu')

const PLACEHOLDER_LABELS = {
  settings: '设置',
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    isLoggedIn: false,
    user: null,
    menuSections: buildMineMenuSections({}),
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'consult',
    platformNotice:
      '平台提供案例浏览、咨询预约与服务相册工具。实际维修、报价、收款与售后由门店线下提供和承担。',
  },

  onLoad() {
    syncAppSession()
  },

  onShow() {
    this.loadPage()
  },

  onPullDownRefresh() {
    this.loadPage().finally(() => wx.stopPullDownRefresh())
  },

  buildBadges(summary) {
    const source = summary || {}
    const format = (n) => {
      const count = Number(n) || 0
      if (count <= 0) return ''
      return count > 99 ? '99+' : String(count)
    }
    return {
      consultPending: format(source.consultPending),
      albumPendingAuth: format(source.albumPendingAuth),
    }
  },

  syncMenuSections(badges) {
    this.setData({ menuSections: buildMineMenuSections(badges) })
  },

  async loadPage() {
    const loggedIn = isLoggedIn()
    if (!loggedIn) {
      this.syncMenuSections({})
      this.setData({
        status: 'normal',
        isLoggedIn: false,
        user: null,
        errorMessage: '',
      })
      return
    }

    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const summary = await fetchMineSummary()
      if (!summary) {
        this.syncMenuSections({})
        this.setData({
          status: 'normal',
          isLoggedIn: false,
          user: null,
        })
        return
      }
      const badges = this.buildBadges(summary)
      this.syncMenuSections(badges)
      this.setData({
        status: 'normal',
        isLoggedIn: true,
        user: summary.user,
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '数据加载失败，请下拉刷新或稍后重试。',
      })
    }
  },

  onRetry() {
    this.loadPage()
  },

  openLoginSheet(mode = 'auto', bindContext = 'consult') {
    this.setData({
      loginSheetVisible: true,
      loginSheetMode: mode,
      loginSheetBindContext: bindContext,
    })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    this.loadPage()
  },

  onUserAreaTap() {
    if (this.data.isLoggedIn) {
      if (!(this.data.user && this.data.user.isPhoneBound)) {
        this.openLoginSheet('bindPhone')
      }
      return
    }
    this.openLoginSheet('login')
  },

  onLoginTap() {
    this.openLoginSheet('login')
  },

  onBindPhoneTap() {
    this.openLoginSheet('bindPhone')
  },

  guardProtectedEntry(needPhone = false) {
    const auth = checkAuth({ needPhone })
    if (!auth.ok) {
      this.openLoginSheet(auth.reason === 'bindPhone' ? 'bindPhone' : 'login')
      return false
    }
    return true
  },

  findMenuItem(key) {
    for (const section of this.data.menuSections) {
      const item = section.items.find((entry) => entry.key === key)
      if (item) return { section: section.key, item }
    }
    return null
  },

  showPlaceholder(key) {
    wx.showToast({
      title: `${PLACEHOLDER_LABELS[key] || '功能'}将在后续版本开放`,
      icon: 'none',
    })
  },

  onMenuCellTap(e) {
    const { key } = e.currentTarget.dataset
    const found = this.findMenuItem(key)
    if (!found) return

    const { section, item } = found

    if (section === 'public') {
      if (key === 'merchant') {
        if (this._navigating) return
        this._navigating = true
        wx.navigateTo({
          url: '/packageMerchant/pages/workbench/index',
          complete: () => {
            setTimeout(() => {
              this._navigating = false
            }, 400)
          },
        })
        return
      }
      this.onPublicMenuTap({ currentTarget: { dataset: { key } } })
      return
    }

    if (!this.guardProtectedEntry(item.needPhone)) return

    if (item.url) {
      if (this._navigating) return
      this._navigating = true
      wx.navigateTo({
        url: item.url,
        complete: () => {
          setTimeout(() => {
            this._navigating = false
          }, 400)
        },
      })
      return
    }
    this.showPlaceholder(key)
  },

  onPublicMenuTap(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'support') {
      wx.showToast({ title: '客服功能将在后续版本开放', icon: 'none' })
      return
    }
    if (key === 'rules') {
      wx.showModal({
        title: '平台规则',
        content:
          '辙见平台致力于提供可验证的维修过程与诚实价格信息。详细规则页将在后续版本开放。',
        showCancel: false,
      })
      return
    }
    if (key === 'about') {
      wx.showModal({
        title: '关于平台',
        content: '辙见服务平台（辙见）— 像一份可翻阅的服务相册，而不是促销传单。',
        showCancel: false,
      })
    }
  },
})
