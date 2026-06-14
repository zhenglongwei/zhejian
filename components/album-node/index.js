const { resolveImageSrcList } = require('../../utils/desensitize-url')

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
    notePlaceholder: { type: String, value: '补充本节点说明（可选）' },
    maxCount: { type: Number, value: 9 },
    /** 上传区旁的操作提示（如隐私说明），仅 edit 模式展示 */
    uploadHint: { type: String, value: '' },
    nodeId: { type: String, value: '' },
    showFeedback: { type: Boolean, value: false },
  },
  data: {
    displayImages: [],
  },
  observers: {
    images(list) {
      this.setData({ displayImages: resolveImageSrcList(list) })
    },
  },
  lifetimes: {
    attached() {
      this.setData({
        displayImages: resolveImageSrcList(this.properties.images),
      })
    },
  },
  methods: {
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
