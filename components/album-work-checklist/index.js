Component({
  properties: {
    categoryLabel: { type: String, value: '' },
    /** 新结构：合成阅读卡 */
    cards: { type: Array, value: [] },
    /** 兼容旧扁平 items；无 cards 时组件内合成简单卡 */
    items: { type: Array, value: [] },
    warrantyText: { type: String, value: '' },
    warrantyImages: { type: Array, value: [] },
  },
  data: {
    displayCards: [],
    showWarranty: false,
    displayWarrantyText: '',
    displayWarrantyImages: [],
    lightboxUrl: '',
  },
  observers: {
    'cards, items, warrantyText, warrantyImages'() {
      this.rebuild()
    },
  },
  lifetimes: {
    attached() {
      this.rebuild()
    },
  },
  methods: {
    noop() {},
    rebuild() {
      const incoming = Array.isArray(this.properties.cards) ? this.properties.cards : []
      let displayCards = incoming.map((card) => this.normalizeCard(card)).filter(Boolean)
      if (!displayCards.length && Array.isArray(this.properties.items) && this.properties.items.length) {
        displayCards = this.properties.items.map((it) => this.legacyItemToCard(it)).filter(Boolean)
      }
      let prevGroup = ''
      displayCards = displayCards.map((card) => {
        const groupLabel = String(card.groupLabel || '').trim()
        const showGroupHeader = Boolean(groupLabel && groupLabel !== prevGroup)
        if (groupLabel) prevGroup = groupLabel
        return { ...card, showGroupHeader }
      })
      const displayWarrantyText = String(this.properties.warrantyText || '').trim()
      const displayWarrantyImages = (this.properties.warrantyImages || [])
        .map((img) => {
          if (typeof img === 'string') {
            const url = img.trim()
            return url ? { url, caption: '' } : null
          }
          const url = String((img && (img.url || img.rawUrl || img.src)) || '').trim()
          if (!url) return null
          return { url, caption: String((img && img.caption) || '').trim() }
        })
        .filter(Boolean)
      this.setData({
        displayCards,
        showWarranty: Boolean(displayWarrantyText || displayWarrantyImages.length),
        displayWarrantyText,
        displayWarrantyImages,
      })
    },
    normalizeCard(card) {
      if (!card) return null
      // 新扁平结构
      if (Array.isArray(card.stageGroups)) {
        return {
          cardKey: card.cardKey,
          groupLabel: String(card.groupLabel || '').trim(),
          title: String(card.title || '').trim() || '本次处理',
          outcome: card.outcome || '',
          outcomeLabel: card.outcomeLabel || '',
          followUpLabel: card.followUpLabel || '',
          deferNote: card.deferNote || '',
          deferredByOwner: Boolean(card.deferredByOwner),
          note: String(card.note || '').trim(),
          stageGroups: card.stageGroups,
          showStageTitles:
            card.showStageTitles != null
              ? Boolean(card.showStageTitles)
              : (card.stageGroups || []).length > 1,
        }
      }
      // 旧 sections 结构 → 展平为首节结果 + 合并图
      const sections = Array.isArray(card.sections) ? card.sections : []
      if (!sections.length) return null
      const stageMap = new Map()
      sections.forEach((section) => {
        ;(section.stageGroups || []).forEach((stage) => {
          const id = String((stage && stage.stageId) || '').trim() || 'other'
          if (!stageMap.has(id)) {
            stageMap.set(id, {
              stageId: id,
              stageTitle: String((stage && stage.stageTitle) || '').trim() || '过程',
              images: [],
            })
          }
          ;(stage.images || []).forEach((img) => {
            if (img && img.url) stageMap.get(id).images.push(img)
          })
        })
      })
      const stageGroups = Array.from(stageMap.values())
      const primary =
        sections.find((s) => s.deferredByOwner) ||
        sections.find((s) => s.outcomeLabel || s.followUpLabel) ||
        sections[0]
      const notes = sections
        .map((s) => String((s && s.note) || '').trim())
        .filter(Boolean)
      return {
        cardKey: card.cardKey,
        groupLabel: String(card.groupLabel || (primary && primary.group) || '').trim(),
        title: String(card.title || (primary && primary.label) || '').trim() || '本次处理',
        outcome: (primary && primary.outcome) || '',
        outcomeLabel: (primary && primary.outcomeLabel) || '',
        followUpLabel: (primary && primary.followUpLabel) || '',
        deferNote: (primary && primary.deferNote) || '',
        deferredByOwner: sections.some((s) => s.deferredByOwner),
        note: notes.join('\n'),
        stageGroups,
        showStageTitles: stageGroups.length > 1,
      }
    },
    legacyItemToCard(it) {
      const images = it.images || []
      const byStage = new Map()
      images.forEach((img) => {
        const stageId = String((img && img.nodeId) || '').trim() || 'other'
        if (!byStage.has(stageId)) {
          byStage.set(stageId, {
            stageId,
            stageTitle: String((img && img.nodeTitle) || '').trim() || '过程',
            images: [],
          })
        }
        byStage.get(stageId).images.push({
          url: String((img && (img.url || img.rawUrl || img.src)) || '').trim(),
          caption: String((img && img.caption) || '').trim(),
        })
      })
      const stageGroups = Array.from(byStage.values()).map((g) => ({
        ...g,
        images: g.images.filter((row) => row.url),
      }))
      return {
        cardKey: it.itemKey,
        groupLabel: String(it.group || '').trim(),
        title: it.label || it.itemKey,
        outcome: it.outcome || '',
        outcomeLabel: it.outcomeLabel || '',
        followUpLabel: it.followUpLabel || '',
        deferNote: it.deferNote || '',
        deferredByOwner: Boolean(it.deferredByOwner),
        note: String(it.note || '').trim(),
        stageGroups,
        showStageTitles: stageGroups.length > 1,
      }
    },
    onOpenLightbox(e) {
      const url = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || '').trim()
      if (!url) return
      this.setData({ lightboxUrl: url })
    },
    onCloseLightbox() {
      this.setData({ lightboxUrl: '' })
    },
  },
})
