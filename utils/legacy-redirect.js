/** V1 交易/评价/奖励遗留路由 → 单页工具台（R8 遗留下线） */

const { reLaunchAppHome } = require('./app-home')

function goHomeWithToast(title) {
  wx.showToast({ title, icon: 'none', duration: 2200 })
  setTimeout(reLaunchAppHome, 400)
}

function redirectToConsultList() {
  wx.redirectTo({ url: '/pages/consult/index/index' })
}

function redirectOrderConfirm() {
  goHomeWithToast('下单功能已下线')
}

function redirectLegacyOrderDetail() {
  goHomeWithToast('订单功能已下线')
}

function redirectLegacyReviewPage() {
  goHomeWithToast('评价功能已下线')
}

function redirectLegacyRewardPage() {
  goHomeWithToast('奖励功能已下线')
}

module.exports = {
  redirectToConsultList,
  redirectOrderConfirm,
  redirectLegacyOrderDetail,
  redirectLegacyReviewPage,
  redirectLegacyRewardPage,
}
