Component({
  properties: {
    /** stage | work | followup */
    mode: { type: String, value: 'stage' },
    title: { type: String, value: '' },
    hint: { type: String, value: '' },
    items: { type: Array, value: [] },
    completeness: { type: Object, value: null },
    readOnly: { type: Boolean, value: false },
    stageId: { type: String, value: '' },
  },
  data: {
    stageQuickTags: ['正常', '建议更换', '需处理', '仅检查', '自定义'],
    workQuickTags: ['已更换', '已处理', '未更换', '自定义'],
    displayItems: [],
    expandedMap: {},
  },
  observers: {
    items() {
      this.rebuildDisplayItems()
    },
    mode() {
      this.rebuildDisplayItems()
    },
  },
  lifetimes: {
    attached() {
      this.rebuildDisplayItems()
    },
  },
  methods: {
    captionNeedsWork(caption) {
      const t = String(caption || '').trim()
      if (!t) return false
      if (/^正常(；|;|：|:)?/.test(t)) {
        const rest = t.replace(/^正常(；|;|：|:)?\s*/, '')
        return /建议更换|需处理|仅检查|已更换|未更换|已处理/.test(rest)
      }
      return true
    },
    resolveItemSummary(item) {
      const images = item.stageImages || item.images || []
      const hasPhotos = images.length > 0
      const captions = images.map((img) => String((img && img.caption) || '').trim()).filter(Boolean)
      const hasCaption = captions.length > 0
      if (!hasPhotos) {
        return {
          checkStatus: 'pending',
          statusTone: 'muted',
          checkStatusLabel: '未检查',
          resultKind: '',
          resultLabel: '',
        }
      }
      if (!hasCaption) {
        return {
          checkStatus: 'pending_tag',
          statusTone: 'hint',
          checkStatusLabel: '待标注',
          resultKind: 'warn',
          resultLabel: '请点图下标签',
        }
      }
      const needWork = captions.some((c) => this.captionNeedsWork(c))
      if (needWork) {
        return {
          checkStatus: 'need_work',
          statusTone: 'warn',
          checkStatusLabel: '已检查',
          resultKind: 'warn',
          resultLabel: '需处理',
        }
      }
      return {
        checkStatus: 'normal',
        statusTone: 'ok',
        checkStatusLabel: '已检查',
        resultKind: 'ok',
        resultLabel: '正常',
      }
    },
    rebuildDisplayItems() {
      const expandedMap = this.data.expandedMap || {}
      const mode = this.properties.mode
      const displayItems = (this.properties.items || []).map((it) => {
        const summary = this.resolveItemSummary(it)
        const expanded = mode !== 'stage' ? true : Boolean(expandedMap[it.itemKey])
        const group = String(it.groupName || '').trim()
        const label = String(it.label || '').trim()
        const titleText = group && label && label.indexOf(group) < 0 ? `${label} / ${group}` : label || group
        const displayImages = it.stageImages || it.images || []
        return {
          ...it,
          ...summary,
          titleText,
          displayImages,
          hasImages: displayImages.length > 0,
          expanded,
          toggleLabel: expanded ? '收起' : '展开',
        }
      })
      this.setData({ displayItems })
    },
    onToggleItem(e) {
      if (this.properties.mode !== 'stage') return
      const { key } = e.currentTarget.dataset
      const itemKey = String(key || '')
      if (!itemKey) return
      const expandedMap = { ...(this.data.expandedMap || {}) }
      expandedMap[itemKey] = !expandedMap[itemKey]
      this.setData({ expandedMap }, () => this.rebuildDisplayItems())
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
    onRestoreFollowUp(e) {
      const { key } = e.currentTarget.dataset
      this.triggerEvent('restorework', { itemKey: String(key || '') })
    },
    noop() {},
  },
})
