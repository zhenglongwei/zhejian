Component({
  properties: {
    categoryLabel: { type: String, value: '' },
    items: { type: Array, value: [] },
  },
  methods: {
    onOpenFlip(e) {
      const { url, itemKey } = e.currentTarget.dataset
      this.triggerEvent('openflip', {
        url: String(url || ''),
        itemKey: String(itemKey || ''),
      })
    },
  },
})
