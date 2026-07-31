/** 流程态 Tag（待脱敏/处理中）≠ 案例来源标准 Tag（§7.2） */
Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    items: {
      type: Array,
      value: [],
    },
    processedCount: {
      type: Number,
      value: 0,
    },
    totalCount: {
      type: Number,
      value: 0,
    },
    failedCount: {
      type: Number,
      value: 0,
    },
    liabilityText: {
      type: String,
      value: '',
    },
    liabilityTextAfter: {
      type: String,
      value: '',
    },
    liabilityAccepted: {
      type: Boolean,
      value: false,
    },
    /** 勾选文案中的协议链接，如《公开案例与隐私说明》 */
    policyLinkText: {
      type: String,
      value: '',
    },
  },
  methods: {
    onLiabilityToggle() {
      this.triggerEvent('liabilitychange', {
        accepted: !this.properties.liabilityAccepted,
      })
    },
    onPolicyTap() {
      this.triggerEvent('policy')
    },
    onPreviewRaw(e) {
      const { id, url } = e.currentTarget.dataset
      if (!url) return
      this.triggerEvent('preview', { id, url, type: 'raw' })
    },
    onPreviewMasked(e) {
      const { id, url } = e.currentTarget.dataset
      if (!url) {
        wx.showToast({ title: '请先一键脱敏', icon: 'none' })
        return
      }
      this.triggerEvent('preview', { id, url, type: 'masked' })
    },
    onRetry(e) {
      const { id } = e.currentTarget.dataset
      this.triggerEvent('retry', { assetId: id })
    },
    onManualMask(e) {
      const { id } = e.currentTarget.dataset
      this.triggerEvent('manualmask', { assetId: id })
    },
    onExclude(e) {
      const { id } = e.currentTarget.dataset
      this.triggerEvent('exclude', { assetId: id })
    },
  },
})
