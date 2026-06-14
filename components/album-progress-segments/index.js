Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    stages: {
      type: Array,
      value: [],
    },
    variant: {
      type: String,
      value: 'mini',
    },
    disabled: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    onSegmentTap(e) {
      if (this.properties.disabled || this.properties.variant !== 'toolbar') return
      const { nodeId, startIndex } = e.currentTarget.dataset
      if (!nodeId) return
      this.triggerEvent('segmenttap', {
        nodeId,
        startIndex: Number(startIndex) || 0,
      })
    },
  },
})
