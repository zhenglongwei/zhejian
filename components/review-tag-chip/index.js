Component({
  properties: {
    text: { type: String, value: '' },
    selected: { type: Boolean, value: false },
  },

  methods: {
    onTap() {
      const { text } = this.properties
      if (!text) return
      this.triggerEvent('tap', { text })
    },
  },
})
