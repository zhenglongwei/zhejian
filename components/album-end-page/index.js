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
      value: '授权公示',
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
      value: '反馈',
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

    onFeedbackTap() {
      this.triggerEvent('feedback', {
        albumId: this.properties.albumId || '',
      })
    },

    onContactTap() {
      this.triggerEvent('contact')
    },

    onStoreBrowseTap() {
      this.triggerEvent('storebrowse')
    },
  },
})
