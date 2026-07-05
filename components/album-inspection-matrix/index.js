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
    compact: { type: Boolean, value: false },
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
