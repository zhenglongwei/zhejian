Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    albumId: {
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
  },
})
