const TABS = [
  { key: 'home', label: '工作台', url: '/packageMerchant/pages/workbench/index' },
  { key: 'albums', label: '服务相册', url: '/packageMerchant/pages/album/list/index' },
  { key: 'ai', label: 'AI 助手', url: '/packageMerchant/pages/assistant/index' },
  { key: 'store', label: '门店', url: '/packageMerchant/pages/store/home/index' },
]

Component({
  properties: {
    active: { type: String, value: 'home' },
  },
  data: {
    tabs: TABS,
  },
  methods: {
    onTap(e) {
      const key = e.currentTarget.dataset.key
      if (!key || key === this.data.active) return
      const tab = TABS.find((item) => item.key === key)
      if (!tab) return
      wx.redirectTo({ url: tab.url })
    },
  },
})
