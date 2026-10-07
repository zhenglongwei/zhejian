const { collectPrimaryQuoteLines } = require('../../utils/service-doc-sheet-view')

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
    storePhone: {
      type: String,
      value: '',
    },
    /** preview | edit */
    imageTapMode: {
      type: String,
      value: 'preview',
    },
  },

  data: {
    quoteLines: [],
  },

  observers: {
    docs(docs) {
      this.setData({
        quoteLines: collectPrimaryQuoteLines(docs),
      })
    },
  },

  methods: {
    onConfirmTap(e) {
      const id = (e.detail && e.detail.nodeId) || e.currentTarget.dataset.id
      if (!id) return
      this.triggerEvent('confirm', { nodeId: id })
    },

    onRejectTap(e) {
      const id = (e.detail && e.detail.nodeId) || ''
      if (!id) return
      this.triggerEvent('reject', {
        nodeId: id,
        isAddon: Boolean(e.detail && e.detail.isAddon),
      })
    },

    onImageEdit(e) {
      const detail = (e && e.detail) || {}
      this.triggerEvent('imageedit', detail)
    },
  },
})
