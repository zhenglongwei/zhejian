Component({
  properties: {
    images: {
      type: Array,
      value: [],
    },
    maxCount: {
      type: Number,
      value: 9,
    },
    disabled: {
      type: Boolean,
      value: false,
    },
    addIconSrc: {
      type: String,
      value: '/assets/icon/add.png',
    },
    /** default 通用 · album 服务相册节点（相框 thumb token） */
    variant: {
      type: String,
      value: 'default',
    },
  },
  data: {
    uploading: false,
  },
  methods: {
    emitChange(list) {
      this.triggerEvent('change', { images: list })
    },
    onAdd() {
      if (this.properties.disabled || this.data.uploading) return
      const current = this.properties.images || []
      const remain = this.properties.maxCount - current.length
      if (remain <= 0) {
        wx.showToast({ title: `最多上传 ${this.properties.maxCount} 张`, icon: 'none' })
        return
      }
      wx.chooseMedia({
        count: Math.min(remain, 9),
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const paths = (res.tempFiles || []).map((f) => f.tempFilePath)
          this.emitChange(current.concat(paths))
        },
      })
    },
    onRemove(e) {
      const { index } = e.currentTarget.dataset
      const list = (this.properties.images || []).slice()
      list.splice(index, 1)
      this.emitChange(list)
    },
    onPreview(e) {
      const { index } = e.currentTarget.dataset
      const urls = this.properties.images || []
      wx.previewImage({ current: urls[index], urls })
    },
  },
})
