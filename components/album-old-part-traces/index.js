const { MERCHANT_OLD_PART_INTRO, OLD_PART_TRACE_MAX_COUNT } = require('../../constants/album-evidence-guide')
const { createOldPartTraceKey } = require('../../utils/album-evidence-items')

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    traces: {
      type: Array,
      value: [],
    },
    partOptions: {
      type: Array,
      value: [],
    },
    disabled: {
      type: Boolean,
      value: false,
    },
    uploadHint: {
      type: String,
      value: '',
    },
    introHint: {
      type: String,
      value: MERCHANT_OLD_PART_INTRO,
    },
    maxCount: {
      type: Number,
      value: OLD_PART_TRACE_MAX_COUNT,
    },
  },

  data: {
    displayRows: [],
  },

  observers: {
    'traces, partOptions': function syncDisplayRows() {
      this.setData({ displayRows: this.buildDisplayRows() })
    },
  },

  methods: {
    buildDisplayRows() {
      const traces = this.properties.traces || []
      const options = this.properties.partOptions || []
      return traces.map((row) => {
        const planPartId = String(row.planPartId || '').trim()
        let planPartIndex = 0
        options.forEach((opt, index) => {
          if (String(opt.planPartId || '').trim() === planPartId) {
            planPartIndex = index
          }
        })
        return {
          ...row,
          planPartId,
          planPartIndex,
          pickerLabel: (options[planPartIndex] && options[planPartIndex].label) || '不关联配件',
        }
      })
    },

    emitChange(traces) {
      this.triggerEvent('change', { traces })
    },

    onAddTrace() {
      if (this.properties.disabled) return
      const traces = (this.properties.traces || []).slice()
      if (traces.length >= this.properties.maxCount) {
        wx.showToast({ title: `最多 ${this.properties.maxCount} 张`, icon: 'none' })
        return
      }
      traces.push({
        traceKey: createOldPartTraceKey(),
        images: [],
        planPartId: '',
      })
      this.emitChange(traces)
    },

    onRemoveTrace(e) {
      if (this.properties.disabled) return
      const { index } = e.currentTarget.dataset
      const traces = (this.properties.traces || []).slice()
      traces.splice(Number(index), 1)
      this.emitChange(traces)
    },

    onImageChange(e) {
      const { index } = e.currentTarget.dataset
      const images = (e.detail && e.detail.images) || []
      const traces = (this.properties.traces || []).map((row, rowIndex) =>
        rowIndex === Number(index) ? { ...row, images: images.slice(0, 1) } : row,
      )
      this.emitChange(traces)
    },

    onPartPickChange(e) {
      const { index } = e.currentTarget.dataset
      const pickIndex = Number(e.detail.value)
      const options = this.properties.partOptions || []
      const picked = options[pickIndex] || options[0] || { planPartId: '' }
      const traces = (this.properties.traces || []).map((row, rowIndex) =>
        rowIndex === Number(index)
          ? { ...row, planPartId: String(picked.planPartId || '').trim() }
          : row,
      )
      this.emitChange(traces)
    },
  },
})
