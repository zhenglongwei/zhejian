Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    beforeUrl: {
      type: String,
      value: '',
    },
    afterUrl: {
      type: String,
      value: '',
    },
    beforeLabel: {
      type: String,
      value: '维修前',
    },
    afterLabel: {
      type: String,
      value: '完工后',
    },
  },

  data: {
    splitPercent: 50,
    containerWidthPx: 0,
    afterImageWidthPx: 0,
  },

  lifetimes: {
    attached() {
      this.measureContainer()
    },
    ready() {
      this.measureContainer()
    },
  },

  methods: {
    measureContainer() {
      this.createSelectorQuery()
        .select('.album-compare-slider__stage')
        .boundingClientRect((rect) => {
          if (!rect || !rect.width) return
          this._containerLeft = rect.left
          this._containerWidth = rect.width
          this.setData({
            containerWidthPx: Math.floor(rect.width),
            afterImageWidthPx: Math.floor(rect.width),
          })
        })
        .exec()
    },

    updateSplitByClientX(clientX) {
      const width = this._containerWidth || this.data.containerWidthPx
      const left = this._containerLeft || 0
      if (!width) return
      let pct = ((Number(clientX) - left) / width) * 100
      pct = Math.max(10, Math.min(90, pct))
      if (pct !== this.data.splitPercent) {
        this.setData({ splitPercent: pct })
      }
    },

    onTouchStart(e) {
      const touch = e.touches && e.touches[0]
      if (!touch) return
      this._dragging = true
      this.updateSplitByClientX(touch.clientX)
    },

    onTouchMove(e) {
      if (!this._dragging) return
      const touch = e.touches && e.touches[0]
      if (!touch) return
      this.updateSplitByClientX(touch.clientX)
    },

    onTouchEnd() {
      this._dragging = false
    },
  },
})
