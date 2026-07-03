const { buildComparePairPreviewFromRows, normalizeComparePairRows } = require('../../utils/album-compare-stage-images')

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    title: { type: String, value: '前后对比' },
    description: { type: String, value: '' },
    photoTips: { type: String, value: '' },
    compareHint: {
      type: String,
      value: '建议尽量上传一一对应的照片组（左完工、右维修前），完整配对可在车主端生成对比效果；维修前可留空，仅展示完工图。',
    },
    afterColumnLabel: { type: String, value: '完工效果' },
    beforeColumnLabel: { type: String, value: '维修前（可选）' },
    requiredLevelLabel: { type: String, value: '' },
    requiredLevelVariant: { type: String, value: 'default' },
    uploadHint: { type: String, value: '' },
    note: { type: String, value: '' },
    notePlaceholder: { type: String, value: '补充说明（可选）' },
    pairRows: {
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
    showSyncAssessment: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    pairPreview: [],
  },

  observers: {
    pairRows(rows) {
      this.setData({
        pairPreview: buildComparePairPreviewFromRows(rows || []),
      })
    },
  },

  methods: {
    emitRows(rows) {
      this.triggerEvent('rowschange', {
        pairRows: normalizeComparePairRows(rows || []),
      })
    },

    emitNote(value) {
      this.triggerEvent('notechange', { value })
    },

    onRowImageChange(e) {
      const index = Number(e.currentTarget.dataset.index)
      const field = e.currentTarget.dataset.field
      if (!Number.isFinite(index) || (field !== 'before' && field !== 'after')) return
      const images = (e.detail && e.detail.images) || []
      const url = images[0] || ''
      const rows = (this.properties.pairRows || []).map((row, i) => {
        if (i !== index) return { ...row }
        return { ...row, [field]: url }
      })
      this.emitRows(rows)
    },

    onAddRow() {
      const rows = (this.properties.pairRows || []).slice()
      if (rows.length >= this.properties.maxCount) return
      rows.push({ before: '', after: '' })
      this.emitRows(rows)
    },

    onRemoveRow(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (!Number.isFinite(index)) return
      const rows = (this.properties.pairRows || []).filter((_, i) => i !== index)
      this.emitRows(rows.length ? rows : [{ before: '', after: '' }])
    },

    onNoteInput(e) {
      this.emitNote((e.detail && e.detail.value) || '')
    },

    onSyncFromAssessment() {
      this.triggerEvent('syncfromassessment')
    },
  },
})
