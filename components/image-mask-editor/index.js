/** A-MASK-05：canvas 框选打码区域（归一化坐标 0–1） */
const MIN_NORM = 0.01

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    imageUrl: {
      type: String,
      value: '',
    },
    mode: {
      type: String,
      value: 'mosaic',
    },
    nodeTitle: {
      type: String,
      value: '',
    },
    submitting: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    regions: [],
    activeMode: 'mosaic',
    canvasH: 400,
    ready: false,
  },
  lifetimes: {
    attached() {
      this._canvas = null
      this._ctx = null
      this._layout = null
      this._img = null
      this._dragStart = null
      this._drag = null
      this.setData({ activeMode: this.properties.mode === 'blur' ? 'blur' : 'mosaic' })
    },
  },
  observers: {
    imageUrl(url) {
      if (url) {
        this.initCanvas()
      }
    },
  },
  methods: {
    initCanvas() {
      const url = this.properties.imageUrl
      if (!url) return
      wx.getImageInfo({
        src: url,
        success: (info) => {
          const sys = wx.getSystemInfoSync()
          const containerW = sys.windowWidth - 32
          const ratio = info.height / info.width
          const maxH = sys.windowHeight * 0.52
          let drawW = containerW
          let drawH = drawW * ratio
          if (drawH > maxH) {
            drawH = maxH
            drawW = drawH / ratio
          }
          const offsetX = (containerW - drawW) / 2
          this._layout = {
            containerW,
            containerH: drawH,
            offsetX,
            offsetY: 0,
            drawW,
            drawH,
            imgW: info.width,
            imgH: info.height,
          }
          this.setData({ canvasH: Math.ceil(drawH), ready: false, regions: [] }, () => {
            this.setupCanvas(url)
          })
        },
        fail: () => {
          wx.showToast({ title: '图片加载失败', icon: 'none' })
          this.triggerEvent('error', { message: '图片加载失败' })
        },
      })
    },

    setupCanvas(url) {
      const query = this.createSelectorQuery()
      query
        .select('#maskCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node || !this._layout) return
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio || 2
          const { containerW, containerH } = this._layout
          canvas.width = containerW * dpr
          canvas.height = containerH * dpr
          ctx.scale(dpr, dpr)
          this._canvas = canvas
          this._ctx = ctx
          const img = canvas.createImage()
          img.onload = () => {
            this._img = img
            this.redraw()
            this.setData({ ready: true })
          }
          img.onerror = () => {
            wx.showToast({ title: '图片绘制失败', icon: 'none' })
          }
          img.src = url
        })
    },

    redraw() {
      const ctx = this._ctx
      const layout = this._layout
      if (!ctx || !layout || !this._img) return
      const { containerW, containerH, offsetX, offsetY, drawW, drawH } = layout
      ctx.clearRect(0, 0, containerW, containerH)
      ctx.fillStyle = '#f5f6f7'
      ctx.fillRect(0, 0, containerW, containerH)
      ctx.drawImage(this._img, offsetX, offsetY, drawW, drawH)
      ;(this.data.regions || []).forEach((r) => {
        this.drawRegionRect(ctx, r, '#1677FF', false)
      })
      if (this._drag) {
        this.drawRegionRect(ctx, this._drag, '#FF4D4F', true)
      }
    },

    drawRegionRect(ctx, region, color, dashed) {
      const { offsetX, offsetY, drawW, drawH } = this._layout
      const x = offsetX + region.x * drawW
      const y = offsetY + region.y * drawH
      const w = region.w * drawW
      const h = region.h * drawH
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      if (dashed) ctx.setLineDash([6, 4])
      ctx.strokeRect(x, y, w, h)
      ctx.fillStyle =
        color === '#FF4D4F' ? 'rgba(255,77,79,0.18)' : 'rgba(22,119,255,0.14)'
      ctx.fillRect(x, y, w, h)
      ctx.restore()
    },

    touchPoint(e) {
      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
      return t ? { x: t.x, y: t.y } : null
    },

    onTouchStart(e) {
      if (!this.data.ready) return
      const p = this.touchPoint(e)
      if (!p) return
      this._dragStart = p
      this._drag = null
    },

    onTouchMove(e) {
      if (!this._dragStart) return
      const p = this.touchPoint(e)
      if (!p) return
      const norm = this.pointsToRegion(this._dragStart, p)
      if (norm) {
        this._drag = norm
        this.redraw()
      }
    },

    onTouchEnd(e) {
      if (!this._dragStart) return
      const p = this.touchPoint(e) || this._dragStart
      const norm = this.pointsToRegion(this._dragStart, p)
      this._dragStart = null
      this._drag = null
      if (norm && norm.w >= MIN_NORM && norm.h >= MIN_NORM) {
        const regions = [...(this.data.regions || []), norm]
        this.setData({ regions }, () => this.redraw())
      } else {
        this.redraw()
      }
    },

    pointsToRegion(a, b) {
      const { offsetX, offsetY, drawW, drawH } = this._layout
      const x1 = clamp(a.x, offsetX, offsetX + drawW)
      const y1 = clamp(a.y, offsetY, offsetY + drawH)
      const x2 = clamp(b.x, offsetX, offsetX + drawW)
      const y2 = clamp(b.y, offsetY, offsetY + drawH)
      const left = Math.min(x1, x2)
      const top = Math.min(y1, y2)
      const width = Math.abs(x2 - x1)
      const height = Math.abs(y2 - y1)
      if (width < 6 || height < 6) return null
      return {
        x: (left - offsetX) / drawW,
        y: (top - offsetY) / drawH,
        w: width / drawW,
        h: height / drawH,
      }
    },

    onSetMode(e) {
      const mode = e.currentTarget.dataset.mode
      if (mode !== 'mosaic' && mode !== 'blur') return
      this.setData({ activeMode: mode })
    },

    onUndo() {
      const regions = (this.data.regions || []).slice(0, -1)
      this.setData({ regions }, () => this.redraw())
    },

    onClear() {
      this.setData({ regions: [] }, () => this.redraw())
    },

    onSubmit() {
      const regions = this.data.regions || []
      if (!regions.length) {
        wx.showToast({ title: '请先框选打码区域', icon: 'none' })
        return
      }
      this.triggerEvent('submit', {
        regions,
        mode: this.data.activeMode,
      })
    },
  },
})
