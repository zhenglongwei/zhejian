Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    layout: { type: String, value: 'inventory' },
    rows: { type: Array, value: [] },
    methodRows: { type: Array, value: [] },
    documentBundle: { type: Object, value: null },
    compact: { type: Boolean, value: false },
    importanceColumnLabel: { type: String, value: '重要度' },
  },

  methods: {
    onPreviewRow(e) {
      const { url, urls } = e.currentTarget.dataset
      const list = (urls || []).filter(Boolean)
      if (!url || !list.length) return
      this.triggerEvent('preview', { url, urls: list })
    },
  },
})
