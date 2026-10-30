Component({
  properties: {
    chapters: {
      type: Array,
      value: [],
    },
    /** preview | edit */
    imageTapMode: {
      type: String,
      value: 'preview',
    },
  },

  methods: {
    onImageTap(e) {
      const url = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || '').trim()
      if (!url) return
      if (this.data.imageTapMode === 'edit') {
        this.triggerEvent('imageedit', { url })
        return
      }
      const urls = (e.currentTarget.dataset && e.currentTarget.dataset.urls) || [url]
      const list = (Array.isArray(urls) ? urls : [url])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
      wx.previewImage({
        current: url,
        urls: list.length ? list : [url],
      })
    },
  },
})
