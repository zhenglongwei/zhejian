Component({
  properties: {
    checked: {
      type: Boolean,
      value: false,
    },
    submitting: {
      type: Boolean,
      value: false,
    },
    title: {
      type: String,
      value: '发布到公开网站',
    },
    showPolicyLink: {
      type: Boolean,
      value: true,
    },
    policyLinkText: {
      type: String,
      value: '《公开案例与隐私说明》',
    },
    confirmText: {
      type: String,
      value: '确认并进入脱敏预览',
    },
    rejectText: {
      type: String,
      value: '暂不发布',
    },
    authTier: {
      type: String,
      value: 'named',
    },
    showActions: {
      type: Boolean,
      value: true,
    },
    showRejectLink: {
      type: Boolean,
      value: true,
    },
  },

  methods: {
    onTierTap(e) {
      const tier = e.currentTarget.dataset.tier
      if (!tier || tier === this.properties.authTier) return
      this.triggerEvent('tierchange', { tier })
    },

    onToggle() {
      this.triggerEvent('toggle')
    },

    onSubmit() {
      if (this.properties.submitting) return
      if (!this.properties.checked) {
        wx.showToast({ title: '请先勾选确认项', icon: 'none' })
        return
      }
      this.triggerEvent('submit')
    },

    onReject() {
      if (this.properties.submitting) return
      this.triggerEvent('reject')
    },

    onPolicyTap() {
      this.triggerEvent('policy')
    },
  },
})
