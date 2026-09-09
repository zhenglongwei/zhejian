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
  },

  methods: {
    onConfirmTap(e) {
      const id = (e.detail && e.detail.nodeId) || e.currentTarget.dataset.id
      if (!id) return
      this.triggerEvent('confirm', { nodeId: id })
    },
  },
})
