Component({
  properties: {
    item: {
      type: Object,
      value: null,
    },
  },
  methods: {
    onViewAlbum() {
      const { item } = this.properties
      if (!item || !item.albumId) return
      this.triggerEvent('view', { id: item.albumId })
    },
    onWithdraw() {
      const { item } = this.properties
      if (!item || !item.albumId) return
      this.triggerEvent('withdraw', { id: item.albumId })
    },
  },
})
