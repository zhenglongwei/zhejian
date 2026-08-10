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
  data: {
    stageQuickTags: ['正常', '建议更换', '需处理', '仅检查'],
    workQuickTags: ['已更换', '已处理', '未更换'],
  },
  methods: {
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
