const { ENV } = require('./services/config')
const { syncAppSession } = require('./utils/auth')
const { resolveCityContext } = require('./utils/city-location')
const { recordAppLaunchEntry } = require('./utils/tool-entry-context')

App({
  onLaunch(options) {
    console.info('[app] launch', ENV.mode)
    try {
      syncAppSession()
      this.globalData.toolEntryContext = recordAppLaunchEntry(options || {})
      resolveCityContext().then((ctx) => {
        this.globalData.cityContext = ctx
      })
    } catch (err) {
      console.warn('[app] onLaunch init failed', err)
    }
  },
  globalData: {
    city: '杭州',
    cityContext: null,
    userInfo: null,
    token: '',
    pendingServiceCategory: '',
    /** 我的页跳转订单 Tab 时携带的筛选 key */
    pendingOrderTab: '',
    /** 工具首页 · 冷启动入口（公域搜索 / 商家扫码） */
    toolEntryContext: null,
    /** 分享链路单店隔离上下文 */
    shareStoreContext: null,
  },
})
