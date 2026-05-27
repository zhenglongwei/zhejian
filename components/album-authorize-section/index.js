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
      value: '授权生成公开案例',
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
      value: '确认公开为案例',
    },
    rejectText: {
      type: String,
      value: '拒绝公开',
    },
  },

  methods: {
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
