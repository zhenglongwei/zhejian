Component({
  properties: {
    hidden: {
      type: Boolean,
      value: false,
    },
    waiting: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    x: 0,
    y: 0,
    dragging: false,
  },
  lifetimes: {
    attached() {
      this.placeDefault()
    },
  },
  methods: {
    windowBox() {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const width = info.windowWidth || 375
      const rpx = width / 750
      return {
        width,
        height: info.windowHeight || 667,
        rpx,
        safeBottom: info.safeArea ? Math.max(0, (info.screenHeight || info.windowHeight) - info.safeArea.bottom) : 0,
      }
    },
    placeDefault() {
      const box = this.windowBox()
      const btnW = 168 * box.rpx
      const btnH = 88 * box.rpx
      const margin = 32 * box.rpx
      const bar = 126 * box.rpx + box.safeBottom
      this._size = { w: btnW, h: btnH }
      this.setData({
        x: Math.max(margin, box.width - btnW - margin),
        y: Math.max(margin, box.height - btnH - bar - margin),
      })
    },
    clamp(x, y) {
      const box = this.windowBox()
      const w = (this._size && this._size.w) || 80
      const h = (this._size && this._size.h) || 44
      const edge = 8 * box.rpx
      return {
        x: Math.min(Math.max(edge, x), box.width - w - edge),
        y: Math.min(Math.max(edge, y), box.height - h - edge),
      }
    },
    onTouchStart(e) {
      if (this.properties.hidden) return
      const touch = (e.touches && e.touches[0]) || {}
      this._drag = {
        x: touch.clientX,
        y: touch.clientY,
        ox: this.data.x,
        oy: this.data.y,
        moved: false,
      }
      this.setData({ dragging: true })
    },
    onTouchMove(e) {
      const drag = this._drag
      if (!drag) return
      const touch = (e.touches && e.touches[0]) || {}
      const dx = touch.clientX - drag.x
      const dy = touch.clientY - drag.y
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true
      const next = this.clamp(drag.ox + dx, drag.oy + dy)
      this.setData(next)
    },
    onTouchEnd() {
      const drag = this._drag
      this._drag = null
      this.setData({ dragging: false })
      if (!drag || drag.moved || this.properties.hidden) return
      this.triggerEvent('tap')
    },
  },
})
