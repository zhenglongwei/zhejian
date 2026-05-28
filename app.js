const { ENV } = require('./services/config')
const { syncAppSession } = require('./utils/auth')
const { resolveCityContext } = require('./utils/city-location')

App({
  onLaunch() {
    console.info('[app] launch', ENV.mode)
    syncAppSession()
    resolveCityContext().then((ctx) => {
      this.globalData.cityContext = ctx
    })
  },
  globalData: {
    city: '杭州',
    cityContext: null,
    userInfo: null,
    token: '',
    pendingServiceCategory: '',
    /** 我的页跳转订单 Tab 时携带的筛选 key */
    pendingOrderTab: '',
  },
})
