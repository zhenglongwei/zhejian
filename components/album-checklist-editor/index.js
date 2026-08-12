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
    pickImages(item) {
      const stage = item.stageImages
      if (Array.isArray(stage) && stage.length) return stage
      return item.images || []
    },
    /** 检测节点：是否已检查 / 结果 */
    resolveStageSummary(item) {
      const images = this.pickImages(item)
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
    /** 施工待处理：与是否已施工/方案相关，不用「未检查」 */
    resolveWorkSummary(item) {
      const images = Array.isArray(item.stageImages) ? item.stageImages : []
      const captions = images.map((img) => String((img && img.caption) || '').trim()).filter(Boolean)
      const joined = captions.join(' ')
      const outcome = String(item.outcome || '')
      const detectHint =
        outcome === 'recommend_replace' || /建议更换/.test(joined)
          ? '建议更换'
          : outcome === 'repaired_other' || /需处理/.test(joined)
            ? '需处理'
            : item.outcomeLabel || ''

      if (/已更换/.test(joined) || outcome === 'replaced') {
        return {
          checkStatus: 'done',
          statusTone: 'ok',
          checkStatusLabel: '已施工',
          resultKind: 'ok',
          resultLabel: '已更换',
        }
      }
      if (/已处理/.test(joined)) {
        return {
          checkStatus: 'done',
          statusTone: 'ok',
          checkStatusLabel: '已施工',
          resultKind: 'ok',
          resultLabel: '已处理',
        }
      }
      if (/未更换/.test(joined) || outcome === 'not_replaced') {
        return {
          checkStatus: 'deferred',
          statusTone: 'warn',
          checkStatusLabel: '未更换',
          resultKind: 'warn',
          resultLabel: detectHint || '本次未换',
        }
      }
      if (!images.length) {
        return {
          checkStatus: 'todo',
          statusTone: 'warn',
          checkStatusLabel: '待施工',
          resultKind: detectHint ? 'warn' : '',
          resultLabel: detectHint,
        }
      }
      if (!captions.length) {
        return {
          checkStatus: 'pending_tag',
          statusTone: 'hint',
          checkStatusLabel: '待标注',
          resultKind: 'warn',
          resultLabel: '请点施工结果标签',
        }
      }
      return {
        checkStatus: 'in_progress',
        statusTone: 'hint',
        checkStatusLabel: '施工中',
        resultKind: detectHint ? 'warn' : '',
        resultLabel: detectHint,
      }
    },
    resolveFollowUpSummary(item) {
      return {
        checkStatus: 'followup',
        statusTone: 'hint',
        checkStatusLabel: '跟进中',
        resultKind: 'warn',
        resultLabel: (item.work && item.work.deferNote) || '择日再约',
      }
    },
    resolveItemSummary(item, mode) {
      if (mode === 'work') return this.resolveWorkSummary(item)
      if (mode === 'followup') return this.resolveFollowUpSummary(item)
      return this.resolveStageSummary(item)
    },
    rebuildDisplayItems() {
      const expandedMap = this.data.expandedMap || {}
      const mode = this.properties.mode
      const displayItems = (this.properties.items || []).map((it) => {
        const summary = this.resolveItemSummary(it, mode)
        const expanded = mode !== 'stage' ? true : Boolean(expandedMap[it.itemKey])
        const group = String(it.groupName || '').trim()
        const label = String(it.label || '').trim()
        const titleText = group && label && label.indexOf(group) < 0 ? `${label} / ${group}` : label || group
        // 施工/跟进：只展示本阶段挂图（可为空）；检测：空数组不遮挡历史图
        const displayImages =
          mode === 'work' || mode === 'followup'
            ? Array.isArray(it.stageImages)
              ? it.stageImages
              : it.images || []
            : this.pickImages(it)
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
      const datasetKey = String(
        (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.itemKey) ||
          (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) ||
          '',
      ).trim()
      const stamped = String((e.detail && e.detail.stampChecklistItemKey) || '').trim()
      const images = (e.detail && e.detail.images) || []
      const fromImage = String(
        (images.find((img) => img && img.checklistItemKey) || {}).checklistItemKey || '',
      ).trim()
      const itemKey = datasetKey || stamped || fromImage
      this.triggerEvent('itemimageschange', {
        itemKey,
        images,
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
