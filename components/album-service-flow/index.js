Component({
  properties: {
    docs: {
      type: Array,
      value: [],
    },
    confirmingId: {
      type: String,
      value: '',
    },
  },

  methods: {
    onConfirmTap(e) {
      const id = e.currentTarget.dataset.id
      if (!id) return
      this.triggerEvent('confirm', { nodeId: id })
    },

    onPreviewImage(e) {
      const url = e.currentTarget.dataset.url
      const list = e.currentTarget.dataset.urls
      let urls = []
      if (Array.isArray(list)) {
        urls = list
          .map((row) => (typeof row === 'string' ? row : row && (row.url || row)))
          .filter(Boolean)
      }
      if (!url) return
      wx.previewImage({
        current: url,
        urls: urls.length ? urls : [url],
      })
    },
  },
})
