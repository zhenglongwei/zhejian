const { ENV } = require('./services/config')
const { syncAppSession } = require('./utils/auth')

App({
  onLaunch() {
    console.info('[app] launch', ENV.mode)
    syncAppSession()
  },
  globalData: {
    city: '杭州',
    userInfo: null,
    token: '',
    pendingServiceCategory: '',
    /** 我的页跳转订单 Tab 时携带的筛选 key */
    pendingOrderTab: '',
  },
})
