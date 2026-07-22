const {
  AUTH_SHEET_TITLE,
  AUTH_CONFIRM_TEXT,
  AUTH_REJECT_TEXT,
  CONSENT_CHECKBOX,
  CONTROL_LINE,
} = require('../../utils/publish-thank-you')

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
      value: AUTH_SHEET_TITLE,
    },
    pitch: {
      type: String,
      value: '',
    },
    benefitLine: {
      type: String,
      value: '',
    },
    controlLine: {
      type: String,
      value: CONTROL_LINE,
    },
    disclaimer: {
      type: String,
      value: '',
    },
    consentText: {
      type: String,
      value: CONSENT_CHECKBOX,
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
      value: AUTH_CONFIRM_TEXT,
    },
    rejectText: {
      type: String,
      value: AUTH_REJECT_TEXT,
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
