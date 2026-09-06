Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    completedSteps: {
      type: Array,
      value: [],
    },
    activeTitle: {
      type: String,
      value: '',
    },
    activeSummary: {
      type: String,
      value: '',
    },
    activeCategory: {
      type: String,
      value: '',
    },
    progressLabel: {
      type: String,
      value: '',
    },
    showActive: {
      type: Boolean,
      value: true,
    },
    lockedHint: {
      type: String,
      value: '',
    },
    expandedCompletedId: {
      type: String,
      value: '',
    },
  },
  methods: {
    onCompletedTap(e) {
      const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
      const index = Number(e.currentTarget.dataset.index)
      this.triggerEvent('completedtap', { id, index })
    },
    onPreviewFinding(e) {
      const url = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || '')
      if (!url) return
      const urlsRaw = (e.currentTarget.dataset && e.currentTarget.dataset.urls) || []
      const urls = (Array.isArray(urlsRaw) ? urlsRaw : [])
        .map((row) => (typeof row === 'string' ? row : (row && row.url) || ''))
        .filter(Boolean)
      wx.previewImage({
        current: url,
        urls: urls.length ? urls : [url],
      })
    },
  },
})
