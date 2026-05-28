const { resolveImageSrcList } = require('../../utils/desensitize-url')

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
  data: {
    displayImages: [],
  },
  observers: {
    images(list) {
      this.setData({ displayImages: resolveImageSrcList(list) })
    },
  },
  lifetimes: {
    attached() {
      this.setData({
        displayImages: resolveImageSrcList(this.properties.images),
      })
    },
  },
  methods: {
    onPreview(e) {
      const { index } = e.currentTarget.dataset
      const urls = this.data.displayImages || []
      if (!urls.length) return
      this.triggerEvent('preview', { index, urls })
      wx.previewImage({ current: urls[index], urls })
    },
  },
})
