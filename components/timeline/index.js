Component({
  properties: {
    steps: {
      type: Array,
      value: [],
    },
    compact: {
      type: Boolean,
      value: false,
    },
  },
  methods: {
    onLinkTap(e) {
      const { index } = e.currentTarget.dataset
      const step = (this.properties.steps || [])[index]
      if (!step || !step.linkText) return
      this.triggerEvent('linktap', { index, step })
    },
  },
})
