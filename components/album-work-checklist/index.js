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
      let displayCards = incoming
      if (!displayCards.length && Array.isArray(this.properties.items) && this.properties.items.length) {
        displayCards = this.properties.items.map((it) => this.legacyItemToCard(it))
      }
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
        title: it.label || it.itemKey,
        deferredByOwner: Boolean(it.deferredByOwner),
        sections: [
          {
            itemKey: it.itemKey,
            label: it.label,
            outcome: it.outcome,
            outcomeLabel: it.outcomeLabel,
            note: it.note,
            deferNote: it.deferNote,
            deferredByOwner: it.deferredByOwner,
            followUpLabel: it.followUpLabel,
            stageGroups,
          },
        ],
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
