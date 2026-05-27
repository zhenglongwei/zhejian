Component({
  properties: {
    images: {
      type: Array,
      value: [],
    },
    columns: {
      type: Number,
      value: 3,
    },
  },
  methods: {
    onPreview(e) {
      const { index } = e.currentTarget.dataset
      const urls = this.properties.images || []
      if (!urls.length) return
      this.triggerEvent('preview', { index, urls })
      wx.previewImage({ current: urls[index], urls })
    },
  },
})
