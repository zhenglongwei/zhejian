const {
  padComparePairRowsForEdit,
  MAX_COMPARE_PAIR_ROWS,
} = require('../../utils/album-compare-stage-images')

function toUploaderImages(url, caption) {
  const src = String(url || '').trim()
  if (!src) return []
  return [{ url: src, caption: String(caption || '').trim() }]
}

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
      value: '',
    },
    afterColumnLabel: { type: String, value: '完工后' },
    beforeColumnLabel: { type: String, value: '维修前' },
    requiredLevelLabel: { type: String, value: '' },
    requiredLevelVariant: { type: String, value: 'default' },
    uploadHint: { type: String, value: '' },
    note: { type: String, value: '' },
    notePlaceholder: { type: String, value: '' },
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
    displayRows: [],
  },

  observers: {
    pairRows(rows) {
      this.refreshDisplayRows(rows)
    },
    maxCount() {
      this.refreshDisplayRows(this.properties.pairRows)
    },
  },

  methods: {
    refreshDisplayRows(rows) {
      const list = padComparePairRowsForEdit(rows || [])
      const maxCount = Number(this.properties.maxCount) || MAX_COMPARE_PAIR_ROWS
      this.setData({
        displayRows: list.slice(0, maxCount).map((row, index) => ({
          ...row,
          index,
          label: `第 ${index + 1} 组`,
          linked: Boolean(row.before && row.after),
          beforeImages: toUploaderImages(row.before, row.beforeCaption),
          afterImages: toUploaderImages(row.after, row.afterCaption),
        })),
      })
    },

    emitRows(rows) {
      this.triggerEvent('rowschange', {
        pairRows: padComparePairRowsForEdit(rows || []),
      })
    },

    onRowImageChange(e) {
      const index = Number(e.currentTarget.dataset.index)
      const field = e.currentTarget.dataset.field
      if (!Number.isFinite(index) || (field !== 'before' && field !== 'after')) return
      const images = (e.detail && e.detail.images) || []
      const first = images[0]
      const url =
        typeof first === 'string'
          ? first
          : String((first && (first.url || first.rawUrl || first.src)) || '').trim()
      const caption =
        typeof first === 'object' && first
          ? String(first.caption || '').trim()
          : ''
      const captionKey = field === 'before' ? 'beforeCaption' : 'afterCaption'
      const rows = padComparePairRowsForEdit(this.properties.pairRows).map((row, i) => {
        if (i !== index) return { ...row }
        return { ...row, [field]: url, [captionKey]: caption }
      })
      this.emitRows(rows)
    },

    onAddRow() {
      const rows = padComparePairRowsForEdit(this.properties.pairRows).slice()
      const maxCount = Number(this.properties.maxCount) || MAX_COMPARE_PAIR_ROWS
      if (rows.length >= maxCount) {
        wx.showToast({ title: `最多 ${maxCount} 组`, icon: 'none' })
        return
      }
      rows.push({ before: '', after: '', beforeCaption: '', afterCaption: '' })
      this.emitRows(rows)
    },

    onRemoveRow(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (!Number.isFinite(index)) return
      const rows = padComparePairRowsForEdit(this.properties.pairRows).filter((_, i) => i !== index)
      this.emitRows(rows)
    },

    onSyncFromAssessment() {
      this.triggerEvent('syncfromassessment')
    },
  },
})
