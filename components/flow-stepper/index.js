Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    completedSteps: {
      type: Array,
      value: [],
    },
    activeTitle: {
      type: String,
      value: '',
    },
    activeSummary: {
      type: String,
      value: '',
    },
    activeCategory: {
      type: String,
      value: '',
    },
    progressLabel: {
      type: String,
      value: '',
    },
    showActive: {
      type: Boolean,
      value: true,
    },
    lockedHint: {
      type: String,
      value: '',
    },
    expandedCompletedId: {
      type: String,
      value: '',
    },
  },
  methods: {
    onCompletedTap(e) {
      const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
      const index = Number(e.currentTarget.dataset.index)
      this.triggerEvent('completedtap', { id, index })
    },
  },
})
