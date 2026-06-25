Component({
  properties: {
    item: {
      type: Object,
      value: null,
    },
  },
  methods: {
    onCardAction() {
      const { item } = this.properties
      if (!item || !item.albumId || !item.cardAction || item.cardAction.disabled) return
      const action = item.cardAction.action
      if (action === 'authorize') {
        this.triggerEvent('authorize', { id: item.albumId })
        return
      }
      if (action === 'withdraw') {
        this.triggerEvent('withdraw', { id: item.albumId })
      }
    },
  },
})
