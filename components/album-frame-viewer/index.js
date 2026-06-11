function formatCaption(page) {
  if (!page || page.type !== 'photo') return ''
  const parts = []
  if (page.nodeTitle) parts.push(page.nodeTitle)
  if (page.time) parts.push(page.time)
  if (page.note) parts.push(page.note)
  return parts.join(' · ')
}

function normalizePhotoPages(pages) {
  return (pages || [])
    .filter((p) => p && p.type !== 'end')
    .map((p, i) => ({
      id: p.id || `page_${i}`,
      type: 'photo',
      imageUrl: p.imageUrl || p.url || '',
      nodeId: p.nodeId || '',
      nodeTitle: p.nodeTitle || '',
      note: p.note || p.caption || '',
      time: p.time || '',
      imageIndex: p.imageIndex,
      imageCountInNode: p.imageCountInNode,
    }))
    .filter((p) => p.imageUrl)
}

Component({
  options: {
    addGlobalClass: true,
    multipleSlots: true,
  },

  properties: {
    pages: {
      type: Array,
      value: [],
    },
    chapters: {
      type: Array,
      value: [],
    },
    current: {
      type: Number,
      value: 0,
    },
    loading: {
      type: Boolean,
      value: false,
    },
    emptyText: {
      type: String,
      value: '该相册暂无过程图片',
    },
  },

  data: {
    innerCurrent: 0,
    displayPages: [],
    photoCount: 0,
    totalCount: 0,
    currentPageType: 'photo',
    currentCaptionLine: '',
  },

  observers: {
    pages(pages) {
      this.rebuildDisplayPages(pages)
    },
    current(value) {
      const index = Number(value) || 0
      if (index !== this.data.innerCurrent) {
        this.setData({ innerCurrent: index }, () => {
          this.syncCurrentPageMeta(index)
        })
      }
    },
  },

  lifetimes: {
    attached() {
      this.rebuildDisplayPages(this.properties.pages)
      const index = Number(this.properties.current) || 0
      this.setData({ innerCurrent: index }, () => {
        this.syncCurrentPageMeta(index)
      })
    },
  },

  methods: {
    rebuildDisplayPages(pages) {
      const photos = normalizePhotoPages(pages)
      const photoCount = photos.length
      const displayPages =
        photoCount > 0
          ? [...photos, { id: '__end__', type: 'end' }]
          : []

      this.setData(
        {
          displayPages,
          photoCount,
          totalCount: displayPages.length,
        },
        () => {
          const maxIndex = Math.max(displayPages.length - 1, 0)
          let nextIndex = this.data.innerCurrent
          if (nextIndex > maxIndex) nextIndex = maxIndex
          if (nextIndex !== this.data.innerCurrent) {
            this.setData({ innerCurrent: nextIndex })
          }
          this.syncCurrentPageMeta(nextIndex)
        },
      )
    },

    syncCurrentPageMeta(index) {
      const page = (this.data.displayPages || [])[index]
      const type = page && page.type === 'end' ? 'end' : 'photo'
      this.setData({
        currentPageType: type,
        currentCaptionLine: formatCaption(page),
      })
    },

    onSwiperChange(e) {
      const index = (e.detail && e.detail.current) || 0
      this.setData({ innerCurrent: index }, () => {
        this.syncCurrentPageMeta(index)
        const page = (this.data.displayPages || [])[index]
        this.triggerEvent('pagechange', {
          index,
          page,
          total: this.data.totalCount,
        })
      })
    },

    onInfoTap() {
      this.triggerEvent('info')
    },
  },
})
