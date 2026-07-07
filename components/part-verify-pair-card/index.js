Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    title: {
      type: String,
      value: '',
    },
    planName: { type: String, value: '' },
    planType: { type: String, value: '' },
    planTypeVariant: { type: String, value: 'default' },
    planBrand: { type: String, value: '' },
    planCode: { type: String, value: '' },
    planQty: { type: Number, value: 0 },
    albumName: { type: String, value: '' },
    albumType: { type: String, value: '' },
    albumTypeVariant: { type: String, value: 'default' },
    albumBrand: { type: String, value: '' },
    albumCode: { type: String, value: '' },
    albumQty: { type: Number, value: 0 },
    thumbUrl: { type: String, value: '' },
    linkStatus: { type: String, value: 'linked' },
    linkHint: { type: String, value: '' },
    diffLabels: {
      type: Array,
      value: [],
    },
    showPlanColumn: {
      type: Boolean,
      value: true,
    },
    showAlbumColumn: {
      type: Boolean,
      value: true,
    },
    layout: {
      type: String,
      value: 'pair',
    },
  },

  methods: {
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
