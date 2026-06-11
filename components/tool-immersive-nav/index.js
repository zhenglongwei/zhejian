function resolveNavMetrics() {
  try {
    const windowInfo = typeof wx.getWindowInfo === 'function'
      ? wx.getWindowInfo()
      : wx.getSystemInfoSync()
    const menuButton = wx.getMenuButtonBoundingClientRect()
    const statusBarHeight = windowInfo.statusBarHeight || 20
    const gap = menuButton.top - statusBarHeight
    const navBarHeight = menuButton.height + gap * 2
    const navTotalHeight = statusBarHeight + navBarHeight
    const sidePadding = windowInfo.screenWidth - menuButton.right

    return {
      statusBarHeight,
      navBarHeight,
      navTotalHeight,
      sidePadding,
    }
  } catch (err) {
    return {
      statusBarHeight: 20,
      navBarHeight: 44,
      navTotalHeight: 64,
      sidePadding: 12,
    }
  }
}

Component({
  options: {
    addGlobalClass: true,
    multipleSlots: true,
  },

  properties: {
    title: {
      type: String,
      value: '服务相册',
    },
    showBack: {
      type: Boolean,
      value: true,
    },
    backDelta: {
      type: Number,
      value: 1,
    },
    statusBarPlaceholder: {
      type: Boolean,
      value: true,
    },
    transparent: {
      type: Boolean,
      value: false,
    },
    autoBack: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    navTotalHeight: 64,
    sidePadding: 12,
  },

  lifetimes: {
    attached() {
      const metrics = resolveNavMetrics()
      this.setData(metrics, () => {
        this.triggerEvent('ready', metrics)
      })
    },
  },

  methods: {
    onBackTap() {
      this.triggerEvent('back')
      if (!this.properties.autoBack || !this.properties.showBack) return

      const pages = getCurrentPages()
      const delta = Number(this.properties.backDelta) || 1
      if (pages.length > 1) {
        wx.navigateBack({ delta })
        return
      }
      wx.reLaunch({ url: '/pages/mine/index' })
    },
  },
})
