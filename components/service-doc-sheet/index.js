Component({
  properties: {
    /** 单据展示对象（与 ownerFlow doc / completedStep 对齐） */
    doc: {
      type: Object,
      value: {},
    },
    /** owner | merchant */
    mode: {
      type: String,
      value: 'owner',
    },
    confirming: {
      type: Boolean,
      value: false,
    },
    /** 是否展示单头（时间线内嵌时可保留） */
    showHeader: {
      type: Boolean,
      value: true,
    },
  },

  methods: {
    onConfirmTap() {
      const doc = this.data.doc || {}
      if (!doc.needsConfirm || !doc.id) return
      this.triggerEvent('confirm', { nodeId: doc.id })
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
