Component({
  properties: {
    /** stage | work | followup */
    mode: { type: String, value: 'stage' },
    title: { type: String, value: '' },
    hint: { type: String, value: '' },
    items: { type: Array, value: [] },
    completeness: { type: Object, value: null },
    readOnly: { type: Boolean, value: false },
    /** 当前阶段：新图写入该阶段 */
    stageId: { type: String, value: '' },
  },
  methods: {
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
    onImagesChange(e) {
      const { key } = e.currentTarget.dataset
      this.triggerEvent('itemimageschange', {
        itemKey: String(key || ''),
        images: (e.detail && e.detail.images) || [],
        stageId: this.properties.stageId,
      })
    },
    onRemoveWork(e) {
      const { key } = e.currentTarget.dataset
      this.triggerEvent('removework', { itemKey: String(key || '') })
    },
    onAddWork(e) {
      const { key } = e.currentTarget.dataset
      this.triggerEvent('addwork', { itemKey: String(key || '') })
    },
    onRestoreFollowUp(e) {
      const { key } = e.currentTarget.dataset
      this.triggerEvent('restorework', { itemKey: String(key || '') })
    },
    noop() {},
  },
})
