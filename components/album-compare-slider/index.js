Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    pairKey: {
      type: String,
      value: '',
    },
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
    afterImageWidthPx: 0,
  },

  observers: {
    'pairKey, beforeUrl, afterUrl'() {
      this.resetSplit()
    },
  },

  lifetimes: {
    attached() {
      this.resetSplit()
    },
    ready() {
      this.scheduleMeasure()
    },
  },

  methods: {
    resetSplit() {
      this._dragging = false
      this._containerWidth = 0
      this.setData({ splitPercent: 50, afterImageWidthPx: 0 })
      this.scheduleMeasure()
    },

    scheduleMeasure() {
      if (this._measureTimer) clearTimeout(this._measureTimer)
      this._measureTimer = setTimeout(() => {
        this._measureTimer = null
        this.measureContainer()
      }, 48)
    },

    measureContainer(callback) {
      this.createSelectorQuery()
        .in(this)
        .select('.album-compare-slider__stage')
        .boundingClientRect((rect) => {
          if (!rect || !rect.width) {
            if (callback) callback(null)
            return
          }
          this._containerWidth = rect.width
          this._containerRect = rect
          const widthPx = Math.floor(rect.width)
          if (widthPx !== this.data.afterImageWidthPx) {
            this.setData({ afterImageWidthPx: widthPx })
          }
          if (callback) callback(rect)
        })
        .exec()
    },

    resolveOffsetX(touch, rect) {
      if (!touch) return null
      const width = (rect && rect.width) || this._containerWidth
      if (!width) return null
      if (typeof touch.x === 'number' && !Number.isNaN(touch.x)) {
        return touch.x
      }
      const left = (rect && rect.left) || (this._containerRect && this._containerRect.left) || 0
      return Number(touch.clientX) - left
    },

    updateSplitByTouch(touch, rect) {
      const width = (rect && rect.width) || this._containerWidth
      const offsetX = this.resolveOffsetX(touch, rect)
      if (!width || offsetX == null) return
      let pct = (offsetX / width) * 100
      pct = Math.max(10, Math.min(90, pct))
      if (Math.abs(pct - this.data.splitPercent) > 0.2) {
        this.setData({ splitPercent: pct })
      }
    },

    onTouchStart(e) {
      const touch = e.touches && e.touches[0]
      if (!touch) return
      this._dragging = true
      this.measureContainer((rect) => {
        if (!this._dragging) return
        this.updateSplitByTouch(touch, rect)
      })
    },

    onTouchMove(e) {
      if (!this._dragging) return
      const touch = e.touches && e.touches[0]
      if (!touch) return
      if (!this._containerWidth) {
        this.measureContainer((rect) => {
          if (!this._dragging) return
          this.updateSplitByTouch(touch, rect)
        })
        return
      }
      this.updateSplitByTouch(touch)
    },

    onTouchEnd() {
      this._dragging = false
    },
  },
})
