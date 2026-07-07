Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    variant: {
      type: String,
      value: 'card',
    },
    thumbUrl: {
      type: String,
      value: '',
    },
    name: {
      type: String,
      value: '',
    },
    partType: {
      type: String,
      value: '',
    },
    typeVariant: {
      type: String,
      value: 'default',
    },
    qty: {
      type: Number,
      value: 0,
    },
    priceAmount: {
      type: null,
      value: null,
    },
    tappable: {
      type: Boolean,
      value: true,
    },
    index: {
      type: Number,
      value: -1,
    },
    isLast: {
      type: Boolean,
      value: false,
    },
    partBrand: {
      type: String,
      value: '',
    },
    partCode: {
      type: String,
      value: '',
    },
  },

  methods: {
    onTap() {
      if (!this.properties.tappable || this.properties.variant !== 'card') return
      this.triggerEvent('tap', { index: this.properties.index })
    },

    onCopyCode(e) {
      const code = String(e.currentTarget.dataset.code || '').trim()
      if (!code) return
      wx.setClipboardData({
        data: code,
        success: () => {
          wx.showToast({ title: '编码已复制', icon: 'none' })
        },
      })
    },

    onPreviewThumb() {
      const url = String(this.properties.thumbUrl || '').trim()
      if (!url) return
      wx.previewImage({ urls: [url], current: url })
    },
  },
})
