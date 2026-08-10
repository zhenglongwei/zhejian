Component({
  properties: {
    items: { type: Array, value: [] },
    completeness: { type: Object, value: null },
    categoryLabel: { type: String, value: '' },
    activeItemKey: { type: String, value: '' },
    readOnly: { type: Boolean, value: false },
  },
  methods: {
    onSelectItem(e) {
      const { key } = e.currentTarget.dataset
      this.triggerEvent('select', { itemKey: String(key || '') })
    },
    onNoteInput(e) {
      const { key } = e.currentTarget.dataset
      this.triggerEvent('notechange', {
        itemKey: String(key || ''),
        note: String((e.detail && e.detail.value) || ''),
      })
    },
    onOutcomeTap(e) {
      const { key, outcome } = e.currentTarget.dataset
      this.triggerEvent('outcomechange', {
        itemKey: String(key || ''),
        outcome: outcome === 'clear' ? null : String(outcome || ''),
      })
    },
    noop() {},
  },
})
