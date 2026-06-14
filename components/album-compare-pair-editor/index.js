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
    pairs: {
      type: Array,
      value: [],
    },
    maxPairs: {
      type: Number,
      value: 6,
    },
    disabled: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    emitPairs(nextPairs) {
      this.triggerEvent('pairchange', { pairs: nextPairs })
    },

    emitNote(value) {
      this.triggerEvent('notechange', { value })
    },

    updatePair(index, patch) {
      const pairs = (this.properties.pairs || []).map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      )
      this.emitPairs(pairs)
    },

    onBeforeChange(e) {
      const { index } = e.currentTarget.dataset
      const images = (e.detail && e.detail.images) || []
      this.updatePair(Number(index), { beforeUrl: images[0] || '' })
    },

    onAfterChange(e) {
      const { index } = e.currentTarget.dataset
      const images = (e.detail && e.detail.images) || []
      this.updatePair(Number(index), { afterUrl: images[0] || '' })
    },

    onNoteInput(e) {
      this.emitNote((e.detail && e.detail.value) || '')
    },

    onSyncFromAssessment() {
      this.triggerEvent('syncfromassessment')
    },

    onAddPair() {
      const pairs = (this.properties.pairs || []).slice()
      if (pairs.length >= this.properties.maxPairs) {
        wx.showToast({ title: `最多 ${this.properties.maxPairs} 组`, icon: 'none' })
        return
      }
      pairs.push({
        id: `pair_${Date.now()}`,
        label: `第 ${pairs.length + 1} 组`,
        beforeUrl: '',
        afterUrl: '',
      })
      this.emitPairs(pairs)
    },

    onRemovePair(e) {
      const { index } = e.currentTarget.dataset
      const idx = Number(index)
      const pairs = (this.properties.pairs || []).slice()
      if (!Number.isFinite(idx) || idx < 0 || idx >= pairs.length) return
      if (pairs.length <= 1) {
        wx.showToast({ title: '至少保留 1 组', icon: 'none' })
        return
      }
      pairs.splice(idx, 1)
      const relabeled = pairs.map((item, i) => ({
        ...item,
        id: `pair_${i}`,
        label: `第 ${i + 1} 组`,
      }))
      this.emitPairs(relabeled)
    },
  },
})
