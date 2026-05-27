Component({
  properties: {
    items: {
      type: Array,
      value: [],
    },
    actionText: {
      type: String,
      value: '立即处理',
    },
  },

  methods: {
    onItemTap(e) {
      const { id } = e.currentTarget.dataset
      if (!id) return
      this.triggerEvent('itemtap', { id })
    },

    onAction() {
      this.triggerEvent('action')
    },
  },
})
