Component({
  properties: {
    safeArea: { type: Boolean, value: true },
    leftActions: { type: Array, value: [] },
  },

  methods: {
    onLeftAction(e) {
      const { key } = e.currentTarget.dataset
      if (!key) return
      this.triggerEvent('leftaction', { key })
    },
  },
})
