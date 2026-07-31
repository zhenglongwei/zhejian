const {
  PREVIEW_LABEL,
  FEEDBACK_LABEL_PENDING,
  FEEDBACK_LABEL_DONE,
  CONTROL_LINE,
} = require('../../utils/publish-thank-you')

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
    invitePitch: {
      type: String,
      value: '',
    },
    inviteEyebrow: {
      type: String,
      value: '',
    },
    controlLine: {
      type: String,
      value: CONTROL_LINE,
    },
    showPreview: {
      type: Boolean,
      value: false,
    },
    previewLabel: {
      type: String,
      value: PREVIEW_LABEL,
    },
    previewDisabled: {
      type: Boolean,
      value: false,
    },
    previewHint: {
      type: String,
      value: '',
    },
    showFeedback: {
      type: Boolean,
      value: true,
    },
    /** 已完工且未提交服务评价：尾页主按钮 */
    pendingOwnerReview: {
      type: Boolean,
      value: false,
    },
    showContact: {
      type: Boolean,
      value: false,
    },
    showStoreBrowse: {
      type: Boolean,
      value: false,
    },
    showWithdraw: {
      type: Boolean,
      value: false,
    },
    withdrawLabel: {
      type: String,
      value: '一键下架',
    },
    statusHint: {
      type: String,
      value: '',
    },
    gateActions: {
      type: Array,
      value: [],
    },
    storeBrowseLabel: {
      type: String,
      value: '查看门店主页',
    },
    contactLabel: {
      type: String,
      value: '联系门店',
    },
  },

  data: {
    resolvedFeedbackLabel: FEEDBACK_LABEL_PENDING,
  },

  observers: {
    pendingOwnerReview(pending) {
      this.setData({
        resolvedFeedbackLabel: pending ? FEEDBACK_LABEL_PENDING : FEEDBACK_LABEL_DONE,
      })
    },
  },

  lifetimes: {
    attached() {
      this.setData({
        resolvedFeedbackLabel: this.properties.pendingOwnerReview
          ? FEEDBACK_LABEL_PENDING
          : FEEDBACK_LABEL_DONE,
      })
    },
  },

  methods: {
    onPreviewTap() {
      if (this.properties.previewDisabled) return
      this.triggerEvent('preview')
    },

    onWithdrawTap() {
      this.triggerEvent('withdraw')
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

    onGateActionTap(e) {
      const key = e.currentTarget.dataset.key
      if (!key) return
      this.triggerEvent('gateaction', { key })
    },
  },
})
