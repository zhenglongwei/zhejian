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
      if (!item || !item.id) return
      this.triggerEvent('tap', { id: item.id })
    },
    onAction(e) {
      const { item } = this.properties
      if (!item || !item.id) return
      const action =
        (e.currentTarget.dataset && e.currentTarget.dataset.action) ||
        (item.primaryAction && item.primaryAction.actionKey) ||
        ''
      this.triggerEvent('action', { id: item.id, action })
    },
    onActionAreaTap() {},
  },
})
