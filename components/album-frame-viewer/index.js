function formatCaption(page) {
  if (!page || page.type !== 'photo') return ''
  return String(page.note || '').trim()
}

const { orientationToTransform } = require('../../utils/image-orientation')

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
    /** 页面实测分配给相框区的高度（px）；真机必填，否则组件无法撑满 */
    hostHeight: {
      type: Number,
      value: 0,
    },
    immersive: {
      type: Boolean,
      value: false,
    },
    chromeVisible: {
      type: Boolean,
      value: false,
    },
    showImmersiveCaption: {
      type: Boolean,
      value: true,
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
    hostHeight(height) {
      const h = Number(height) || 0
      if (h > 0) {
        this.applyHostLayout(h)
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
      const hostHeight = Number(this.properties.hostHeight) || 0
      if (hostHeight > 0) {
        this.applyHostLayout(hostHeight)
      }
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
          this.resolvePhotoOrientations(displayPages)
        },
      )
    },

    resolvePhotoOrientations(displayPages) {
      const photos = (displayPages || []).filter((p) => p.type === 'photo' && p.imageUrl)
      if (!photos.length) return
      const orientationMap = {}
      let pending = 0
      photos.forEach((page) => {
        pending += 1
        wx.getImageInfo({
          src: page.imageUrl,
          success: (res) => {
            const transform = orientationToTransform(res.orientation)
            if (transform) orientationMap[page.imageUrl] = transform
          },
          complete: () => {
            pending -= 1
            if (pending <= 0 && Object.keys(orientationMap).length) {
              const next = (this.data.displayPages || []).map((p) => {
                if (p.type !== 'photo') return p
                const transform = orientationMap[p.imageUrl] || p.imageTransform || ''
                if (!transform) return p
                return { ...p, imageTransform: transform, imageStyle: `transform:${transform}` }
              })
              this.setData({ displayPages: next })
            }
          },
        })
      })
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
      const hostHeight = Number(this.properties.hostHeight) || 0
      if (hostHeight > 0) {
        this.applyHostLayout(hostHeight)
        return
      }
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
      this.applyHostLayout(frameHeightPx)
    },

    applyHostLayout(hostHeightPx) {
      const win = getWindowMetrics()
      if (this.properties.immersive) {
        const swiperHeightPx = Math.max(Math.floor(hostHeightPx), 200)
        if (swiperHeightPx !== this.data.swiperHeightPx) {
          this.setData({ swiperHeightPx })
        }
        return
      }
      const framePadPx = rpxToPx(48, win.windowWidth)
      const topbarPx = rpxToPx(64, win.windowWidth)
      const captionPx =
        this.data.currentPageType === 'photo' ? rpxToPx(72, win.windowWidth) : 0
      const innerFramePx = Math.max(hostHeightPx - framePadPx, 160)
      const swiperHeightPx = Math.max(Math.floor(innerFramePx - topbarPx - captionPx), 160)
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

    onStageTap() {
      this.triggerEvent('togglechrome')
    },
  },
})
