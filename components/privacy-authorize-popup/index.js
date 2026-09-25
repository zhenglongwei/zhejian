Component({
  properties: {
    /** 启动期协议确认：勾选后主按钮才可用，且不允许点遮罩或「暂不」跳过 */
    requireAgreement: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    visible: false,
    title: '隐私保护提示',
    description: '继续使用前，请先阅读并同意。',
    agreed: false,
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
      // 已经显示时不重置勾选：微信授权回调会再调一次 show()
      if (!this.data.visible) patch.agreed = false
      if (options.title) patch.title = options.title
      if (options.description) patch.description = options.description
      this._finished = false
      this._onResult = typeof options.onResult === 'function' ? options.onResult : null
      this.setData(patch)
    },

    hide() {
      this.setData({ visible: false })
    },

    finish(agreed) {
      if (this._finished) return
      this._finished = true
      const app = getApp()
      if (app && typeof app.completePrivacyAuthorization === 'function') {
        app.completePrivacyAuthorization(agreed)
      }
      if (this._onResult) {
        this._onResult(agreed)
        this._onResult = null
      }
      this.triggerEvent('result', { agreed: !!agreed })
      this.hide()
    },

    toggleAgreement() {
      this.setData({ agreed: !this.data.agreed })
    },

    onAgreementLinkTap(e) {
      const { type } = e.currentTarget.dataset
      wx.navigateTo({
        url: `/pages/mine/settings/document/index?type=${type === 'privacy' ? 'privacy' : 'agreement'}`,
      })
    },

    onOpenPrivacyContract() {
      if (typeof wx.openPrivacyContract === 'function') {
        wx.openPrivacyContract({})
      } else {
        wx.navigateTo({ url: '/pages/mine/settings/document/index?type=privacy' })
      }
    },

    onAgree() {
      if (this.data.requireAgreement && !this.data.agreed) return
      const app = getApp()
      const hasPending = Boolean(
        app && app.globalData && app.globalData.pendingPrivacyAuthorization
      )
      if (hasPending) {
        app.completePrivacyAuthorization(true)
      } else if (app && app.markConsentApproved) {
        // 授权回调晚于点击时：先记下用户已表态，app 收到请求即放行
        app.markConsentApproved()
      }
      this.finish(true)
    },

    onDisagree() {
      this.finish(false)
    },
  },
})
