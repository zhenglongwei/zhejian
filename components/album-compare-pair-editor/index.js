Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    title: { type: String, value: '前后对比' },
    description: { type: String, value: '' },
    photoTips: { type: String, value: '' },
    requiredLevelLabel: { type: String, value: '' },
    requiredLevelVariant: { type: String, value: 'default' },
    uploadHint: { type: String, value: '' },
    note: { type: String, value: '' },
    notePlaceholder: { type: String, value: '补充说明（可选）' },
    beforeImages: {
      type: Array,
      value: [],
    },
    afterImages: {
      type: Array,
      value: [],
    },
    pairPreview: {
      type: Array,
      value: [],
    },
    maxCount: {
      type: Number,
      value: 6,
    },
    disabled: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    countMismatch: false,
  },

  observers: {
    'beforeImages, afterImages'(beforeImages, afterImages) {
      const beforeLen = (beforeImages || []).length
      const afterLen = (afterImages || []).length
      this.setData({
        countMismatch: beforeLen > 0 && afterLen > beforeLen,
      })
    },
  },

  methods: {
    emitColumns(beforeImages, afterImages) {
      this.triggerEvent('columnschange', {
        beforeImages: beforeImages || [],
        afterImages: afterImages || [],
      })
    },

    emitNote(value) {
      this.triggerEvent('notechange', { value })
    },

    onBeforeChange(e) {
      const images = (e.detail && e.detail.images) || []
      this.emitColumns(images, this.properties.afterImages || [])
    },

    onAfterChange(e) {
      const images = (e.detail && e.detail.images) || []
      this.emitColumns(this.properties.beforeImages || [], images)
    },

    onNoteInput(e) {
      this.emitNote((e.detail && e.detail.value) || '')
    },

    onSyncFromAssessment() {
      this.triggerEvent('syncfromassessment')
    },
  },
})
