Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    title: {
      type: String,
      value: '',
    },
    groups: {
      type: Array,
      value: [],
    },
    extraTitle: {
      type: String,
      value: '',
    },
  },
  methods: {
    onClose() {
      this.triggerEvent('close')
    },
    onPick(e) {
      const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '')
      if (!key) return
      this.triggerEvent('pick', { key })
    },
    onExtra() {
      this.triggerEvent('extra')
    },
  },
})
