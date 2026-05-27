Component({
  properties: {
    item: {
      type: Object,
      value: null,
    },
    audience: {
      type: String,
      value: 'user',
    },
  },
  methods: {
    onTap() {
      const { item } = this.properties
      if (!item || !item.albumId) return
      this.triggerEvent('tap', { id: item.albumId })
    },
  },
})
