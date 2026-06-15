const { isLoggedIn, checkAuth, syncAppSession } = require('../../../utils/auth')
const {
  EARNINGS_COMPLIANCE,
  EARNINGS_RULE_STEPS,
  buildEarningsHeroKpis,
  buildMineEarningsPreview,
} = require('../../../constants/mine-earnings')

Page({
  data: {
    isLoggedIn: false,
    preview: buildMineEarningsPreview({ loggedIn: false }),
    heroKpis: buildEarningsHeroKpis(),
    ruleSteps: EARNINGS_RULE_STEPS,
    complianceText: EARNINGS_COMPLIANCE,
  },

  onLoad() {
    syncAppSession()
    this.refreshState()
  },

  onShow() {
    this.refreshState()
  },

  refreshState() {
    const loggedIn = isLoggedIn()
    const preview = buildMineEarningsPreview({ loggedIn })
    this.setData({
      isLoggedIn: loggedIn,
      preview,
      heroKpis: buildEarningsHeroKpis(preview),
    })
  },

  onGoAuthorize() {
    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      wx.showToast({ title: '请先登录并绑定手机号', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/album/authorize/index' })
  },

  onGoBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({ url: '/pages/mine/index' })
      },
    })
  },
})
