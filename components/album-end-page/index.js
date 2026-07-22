Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    albumId: {
      type: String,
      value: '',
    },
    albumTitle: {
      type: String,
      value: '',
    },
    showAuth: {
      type: Boolean,
      value: false,
    },
    authLabel: {
      type: String,
      value: '分享脱敏报告',
    },
    authDisabled: {
      type: Boolean,
      value: false,
    },
    authHint: {
      type: String,
      value: '',
    },
    showShare: {
      type: Boolean,
      value: false,
    },
    shareLabel: {
      type: String,
      value: '分享',
    },
    showFeedback: {
      type: Boolean,
      value: true,
    },
    showContact: {
      type: Boolean,
      value: false,
    },
    showStoreBrowse: {
      type: Boolean,
      value: false,
    },
    showPartVerify: {
      type: Boolean,
      value: false,
    },
    showWithdraw: {
      type: Boolean,
      value: false,
    },
    withdrawLabel: {
      type: String,
      value: '撤回发布',
    },
    statusHint: {
      type: String,
      value: '',
    },
    gateActions: {
      type: Array,
      value: [],
    },
    partVerifyLabel: {
      type: String,
      value: '配件验真',
    },
    storeBrowseLabel: {
      type: String,
      value: '查看门店主页',
    },
    contactLabel: {
      type: String,
      value: '联系门店',
    },
    feedbackLabel: {
      type: String,
      value: '评价与反馈',
    },
  },

  methods: {
    onAuthTap() {
      if (this.properties.authDisabled) return
      this.triggerEvent('auth')
    },

    onShareTap() {
      this.triggerEvent('share')
    },

    onWithdrawTap() {
      this.triggerEvent('withdraw')
    },

    onFeedbackTap() {
      this.triggerEvent('feedback', {
        albumId: this.properties.albumId || '',
      })
    },

    onPartVerifyTap() {
      this.triggerEvent('partverify', {
        albumId: this.properties.albumId || '',
      })
    },

    onContactTap() {
      this.triggerEvent('contact')
    },

    onStoreBrowseTap() {
      this.triggerEvent('storebrowse')
    },

    onGateActionTap(e) {
      const key = e.currentTarget.dataset.key
      if (!key) return
      this.triggerEvent('gateaction', { key })
    },
  },
})
