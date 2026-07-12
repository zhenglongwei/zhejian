Component({
  data: {
    visible: false,
    title: '隐私保护提示',
    description:
      '为在地图上选择门店地址，我们需要使用你的位置相关能力。请阅读并同意《用户隐私保护指引》后继续。',
  },

  lifetimes: {
    attached() {
      const app = getApp()
      if (app) {
        app.privacyPopup = this
        if (app.globalData && app.globalData.pendingPrivacyAuthorization) {
          this.show()
        }
      }
    },
    detached() {
      const app = getApp()
      if (app && app.privacyPopup === this) {
        app.privacyPopup = null
      }
    },
  },

  methods: {
    noop() {},

    show(options = {}) {
      const patch = { visible: true }
      if (options.title) patch.title = options.title
      if (options.description) patch.description = options.description
      this._onResult = typeof options.onResult === 'function' ? options.onResult : null
      this.setData(patch)
    },

    hide() {
      this.setData({ visible: false })
    },

    finish(agreed) {
      const app = getApp()
      if (app && typeof app.completePrivacyAuthorization === 'function') {
        app.completePrivacyAuthorization(agreed)
      }
      if (this._onResult) {
        this._onResult(agreed)
        this._onResult = null
      }
      this.hide()
    },

    onOpenPrivacyContract() {
      if (typeof wx.openPrivacyContract === 'function') {
        wx.openPrivacyContract({})
      } else {
        wx.navigateTo({ url: '/pages/mine/settings/document/index?type=privacy' })
      }
    },

    onAgree() {
      this.finish(true)
    },

    onDisagree() {
      this.finish(false)
    },
  },
})
