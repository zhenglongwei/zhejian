/** V1 交易/评价/奖励遗留路由 → V2 咨询（R8 遗留下线） */

const CONSULT_LIST = '/pages/consult/index/index'
const CONSULT_SUBMIT = '/pages/consult/submit/index'
const MINE = '/pages/mine/index'

function go(url, method = 'redirectTo') {
  const fn = wx[method]
  if (typeof fn !== 'function') return
  fn({
    url,
    fail: () => {
      if (method !== 'switchTab') {
        wx.switchTab({ url: MINE, fail: () => wx.reLaunch({ url: CONSULT_LIST }) })
      }
    },
  })
}

function redirectToConsultList() {
  go(CONSULT_LIST)
}

function redirectOrderConfirm(options = {}) {
  const params = []
  const serviceId = options.serviceId || options.id || ''
  const storeId = options.storeId || ''
  if (serviceId) params.push(`serviceId=${encodeURIComponent(serviceId)}`)
  if (storeId) params.push(`storeId=${encodeURIComponent(storeId)}`)
  params.push('sourcePage=legacy_order')
  go(`${CONSULT_SUBMIT}?${params.join('&')}`)
}

function redirectLegacyOrderDetail() {
  wx.showToast({
    title: '订单功能已下线，请查看我的咨询',
    icon: 'none',
    duration: 2200,
  })
  setTimeout(redirectToConsultList, 400)
}

function redirectLegacyReviewPage() {
  wx.showToast({ title: '评价功能已下线', icon: 'none', duration: 2000 })
  setTimeout(redirectToConsultList, 400)
}

function redirectLegacyRewardPage() {
  wx.showToast({ title: '奖励功能已下线', icon: 'none', duration: 2000 })
  setTimeout(() => go(MINE, 'switchTab'), 400)
}

module.exports = {
  redirectToConsultList,
  redirectOrderConfirm,
  redirectLegacyOrderDetail,
  redirectLegacyReviewPage,
  redirectLegacyRewardPage,
}
