Component({
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
    showFeedback: {
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
    flipDirection: 'next',
    activeChapterIndex: 0,
  },

  observers: {
    current(value) {
      const index = Number(value) || 0
      if (index !== this.data.innerCurrent) {
        this.setData({ innerCurrent: index })
      }
    },
    pages(list) {
      const total = (list && list.length) || 0
      if (total && this.data.innerCurrent >= total) {
        this.setData({ innerCurrent: total - 1 })
      }
    },
  },

  lifetimes: {
    attached() {
      this.setData({ innerCurrent: Number(this.properties.current) || 0 })
    },
  },

  methods: {
    onSwiperChange(e) {
      const index = (e.detail && e.detail.current) || 0
      const prev = this.data.innerCurrent
      const direction = index > prev ? 'next' : 'prev'
      this.setData({
        innerCurrent: index,
        flipDirection: direction,
        activeChapterIndex: this.resolveActiveChapterIndex(index),
      })
      const page = (this.properties.pages || [])[index]
      this.triggerEvent('pagechange', { index, page })
    },

    resolveActiveChapterIndex(pageIndex) {
      const chapters = this.properties.chapters || []
      if (!chapters.length) return 0
      let active = 0
      for (let i = chapters.length - 1; i >= 0; i -= 1) {
        if (pageIndex >= chapters[i].startIndex) {
          active = i
          break
        }
      }
      return active
    },

    onPrev() {
      const index = this.data.innerCurrent
      if (index <= 0) return
      const nextIndex = index - 1
      this.setData({
        innerCurrent: nextIndex,
        flipDirection: 'prev',
        activeChapterIndex: this.resolveActiveChapterIndex(nextIndex),
      })
      this.emitPageChange(nextIndex)
    },

    onNext() {
      const pages = this.properties.pages || []
      const index = this.data.innerCurrent
      if (index >= pages.length - 1) return
      const nextIndex = index + 1
      this.setData({
        innerCurrent: nextIndex,
        flipDirection: 'next',
        activeChapterIndex: this.resolveActiveChapterIndex(nextIndex),
      })
      this.emitPageChange(nextIndex)
    },

    emitPageChange(index) {
      const page = (this.properties.pages || [])[index]
      this.triggerEvent('pagechange', { index, page })
    },

    onChapterTap(e) {
      const { index, chapter } = e.currentTarget.dataset
      const startIndex = Number(index)
      if (Number.isNaN(startIndex)) return
      this.setData({
        innerCurrent: startIndex,
        activeChapterIndex: Number(chapter) || 0,
      })
      this.emitPageChange(startIndex)
    },

    onPreview() {
      const pages = this.properties.pages || []
      const index = this.data.innerCurrent
      const urls = pages.map((p) => p.url).filter(Boolean)
      if (!urls.length) return
      wx.previewImage({
        current: urls[index] || urls[0],
        urls,
      })
    },

    onFeedbackTap() {
      const page = (this.properties.pages || [])[this.data.innerCurrent]
      if (!page) return
      this.triggerEvent('feedback', {
        nodeId: page.nodeId,
        nodeTitle: page.nodeTitle,
      })
    },
  },
})
