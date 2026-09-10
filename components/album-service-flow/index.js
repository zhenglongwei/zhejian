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

  methods: {
    onConfirmTap(e) {
      const id = (e.detail && e.detail.nodeId) || e.currentTarget.dataset.id
      if (!id) return
      this.triggerEvent('confirm', { nodeId: id })
    },

    onImageEdit(e) {
      const detail = (e && e.detail) || {}
      this.triggerEvent('imageedit', detail)
    },
  },
})
