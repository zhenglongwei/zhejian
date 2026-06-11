function formatCaption(page) {
  if (!page || page.type !== 'photo') return ''
  const parts = []
  if (page.nodeTitle) parts.push(page.nodeTitle)
  if (page.time) parts.push(page.time)
  if (page.note) parts.push(page.note)
  return parts.join(' · ')
}

function getWindowMetrics() {
  try {
    return typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
  } catch (err) {
    return { windowWidth: 375, windowHeight: 667, statusBarHeight: 20 }
  }
}

function rpxToPx(rpx, windowWidth) {
  return (rpx / 750) * windowWidth
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
    swiperHeightPx: 320,
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
    ready() {
      this.scheduleMeasureSwiper()
    },
  },

  pageLifetimes: {
    show() {
      this.scheduleMeasureSwiper()
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
          this.scheduleMeasureSwiper()
        },
      )
    },

    syncCurrentPageMeta(index) {
      const page = (this.data.displayPages || [])[index]
      const type = page && page.type === 'end' ? 'end' : 'photo'
      this.setData(
        {
          currentPageType: type,
          currentCaptionLine: formatCaption(page),
        },
        () => {
          this.scheduleMeasureSwiper()
        },
      )
    },

    scheduleMeasureSwiper() {
      if (this._measureTimer) clearTimeout(this._measureTimer)
      this._measureTimer = setTimeout(() => {
        wx.nextTick(() => this.measureSwiperHeight())
      }, 32)
    },

    measureSwiperHeight() {
      if (!this.data.photoCount) return
      const query = this.createSelectorQuery()
      query.select('.album-frame-viewer__frame').boundingClientRect()
      query.exec((res) => {
        const frame = res && res[0]
        if (frame && frame.height > 80) {
          this.applySwiperHeight(frame.height)
          return
        }
        this.fallbackSwiperHeight()
      })
    },

    applySwiperHeight(frameHeightPx) {
      const win = getWindowMetrics()
      const topbarPx = rpxToPx(64, win.windowWidth)
      const captionPx =
        this.data.currentPageType === 'photo' ? rpxToPx(72, win.windowWidth) : 0
      const swiperHeightPx = Math.max(Math.floor(frameHeightPx - topbarPx - captionPx), 160)
      if (swiperHeightPx !== this.data.swiperHeightPx) {
        this.setData({ swiperHeightPx })
      }
    },

    fallbackSwiperHeight() {
      const win = getWindowMetrics()
      let navTotal = rpxToPx(88, win.windowWidth) + (win.statusBarHeight || 20)
      try {
        const menu = wx.getMenuButtonBoundingClientRect()
        navTotal = menu.top + menu.height + (menu.top - (win.statusBarHeight || 20))
      } catch (err) {
        /* use estimate */
      }
      const toolbarPx = rpxToPx(80, win.windowWidth)
      const footerPx = rpxToPx(200, win.windowWidth)
      const topbarPx = rpxToPx(64, win.windowWidth)
      const captionPx =
        this.data.currentPageType === 'photo' ? rpxToPx(72, win.windowWidth) : 0
      const framePadPx = rpxToPx(48, win.windowWidth)
      const pagePadPx = rpxToPx(16, win.windowWidth)
      const frameHeight =
        win.windowHeight - navTotal - toolbarPx - footerPx - pagePadPx
      const swiperHeightPx = Math.max(
        Math.floor(frameHeight - framePadPx - topbarPx - captionPx),
        160,
      )
      if (swiperHeightPx !== this.data.swiperHeightPx) {
        this.setData({ swiperHeightPx })
      }
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
