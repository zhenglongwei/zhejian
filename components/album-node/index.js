const { resolveImageSrc } = require('../../utils/desensitize-url')

Component({
  properties: {
    mode: {
      type: String,
      value: 'view',
    },
    compact: {
      type: Boolean,
      value: false,
    },
    title: { type: String, value: '' },
    images: {
      type: Array,
      value: [],
    },
    note: { type: String, value: '' },
    time: { type: String, value: '' },
    emptyText: { type: String, value: '商家暂未上传' },
    description: { type: String, value: '' },
    photoTips: { type: String, value: '' },
    compareGuidance: { type: String, value: '' },
    requiredLevelLabel: { type: String, value: '' },
    requiredLevelVariant: { type: String, value: 'default' },
    notePlaceholder: { type: String, value: '' },
    captionPlaceholder: { type: String, value: '本图说明（选填）' },
    maxCount: { type: Number, value: 9 },
    /** 上传区旁的操作提示（如隐私说明），仅 edit 模式展示 */
    uploadHint: { type: String, value: '' },
    nodeId: { type: String, value: '' },
    showFeedback: { type: Boolean, value: false },
    /** ALB-UX · 编辑态每图备注 */
    enableCaption: { type: Boolean, value: true },
    /** 卷十五：新图默认挂检查项 */
    stampChecklistItemKey: { type: String, value: '' },
  },
  data: {
    displayImages: [],
    displayEntries: [],
  },
  observers: {
    images() {
      this.syncDisplay()
    },
  },
  lifetimes: {
    attached() {
      this.syncDisplay()
    },
  },
  methods: {
    syncDisplay() {
      const list = this.properties.images || []
      const displayEntries = list
        .map((entry) => {
          if (typeof entry === 'string') {
            const url = resolveImageSrc(entry)
            return url ? { url, caption: '' } : null
          }
          const url = resolveImageSrc(entry)
          if (!url) return null
          return {
            url,
            caption: String((entry && entry.caption) || '').trim(),
            checklistItemKey: String((entry && entry.checklistItemKey) || '').trim(),
          }
        })
        .filter(Boolean)
      this.setData({
        displayEntries,
        displayImages: displayEntries.map((item) => item.url),
      })
    },
    onPreview(e) {
      const { index } = e.currentTarget.dataset
      const urls = this.data.displayImages || []
      if (!urls.length) return
      wx.previewImage({ current: urls[index], urls })
    },
    onNoteInput(e) {
      this.triggerEvent('notechange', { value: e.detail.value })
    },
    onImagesChange(e) {
      this.triggerEvent('imageschange', {
        images: (e.detail && e.detail.images) || [],
      })
    },
    onFeedbackTap() {
      this.triggerEvent('feedback', {
        nodeId: this.properties.nodeId,
        nodeTitle: this.properties.title,
      })
    },
  },
})
