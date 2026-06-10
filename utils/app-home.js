/** 小程序唯一根页（无 TabBar） */
const APP_HOME_PATH = '/pages/mine/index'

function reLaunchAppHome() {
  wx.reLaunch({ url: APP_HOME_PATH })
}

function navigateAppHome(options = {}) {
  const method = options.redirect ? wx.redirectTo : wx.reLaunch
  method({
    url: APP_HOME_PATH,
    fail: () => wx.reLaunch({ url: APP_HOME_PATH }),
  })
}

module.exports = {
  APP_HOME_PATH,
  reLaunchAppHome,
  navigateAppHome,
}
