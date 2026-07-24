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
    /** grid 缩略图网格 · cta 大号上传入口（配件凭证等） */
    layout: {
      type: String,
      value: 'grid',
    },
    ctaTitle: {
      type: String,
      value: '上传图片',
    },
    ctaDesc: {
      type: String,
      value: '',
    },
    /** 空态时「+」占满一行，便于配件凭证入口点选 */
    fullWidthAdd: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    uploading: false,
    isCtaLayout: false,
  },
  observers: {
    layout(val) {
      this.setData({ isCtaLayout: String(val || '') === 'cta' })
    },
  },
  lifetimes: {
    attached() {
      this.setData({ isCtaLayout: String(this.properties.layout || '') === 'cta' })
    },
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
      const count = Math.min(remain, 9)
      const onSuccess = (paths) => {
        const list = (paths || []).filter(Boolean)
        if (!list.length) return
        this.emitChange(current.concat(list))
      }
      const onFail = (err) => {
        const msg = String((err && err.errMsg) || '')
        if (/cancel/i.test(msg)) return
        wx.showToast({ title: '无法打开相册，请检查权限', icon: 'none' })
      }
      if (typeof wx.chooseMedia === 'function') {
        wx.chooseMedia({
          count,
          mediaType: ['image'],
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: (res) => {
            onSuccess((res.tempFiles || []).map((f) => f.tempFilePath))
          },
          fail: (err) => {
            const msg = String((err && err.errMsg) || '')
            if (/cancel/i.test(msg)) return
            wx.chooseImage({
              count,
              sizeType: ['compressed'],
              sourceType: ['album', 'camera'],
              success: (res) => onSuccess(res.tempFilePaths || []),
              fail: onFail,
            })
          },
        })
        return
      }
      wx.chooseImage({
        count,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => onSuccess(res.tempFilePaths || []),
        fail: onFail,
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
