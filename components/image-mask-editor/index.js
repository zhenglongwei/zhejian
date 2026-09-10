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
      this._canvasRect = null
      this.setData({ activeMode: this.properties.mode === 'blur' ? 'blur' : 'mosaic' })
    },
    ready() {
      if (this.properties.imageUrl) {
        this.initCanvas()
      }
    },
  },
  observers: {
    imageUrl(url) {
      if (url) {
        // 延后一拍，等浮层/面板完成布局后再取 canvas 节点
        setTimeout(() => this.initCanvas(), 40)
      }
    },
  },
  methods: {
    preventPass() {
      /* 拦住空白区滑动穿透，不参与画框 */
    },

    initCanvas() {
      const url = this.properties.imageUrl
      if (!url) return
      this.setData({ ready: false })
      wx.getImageInfo({
        src: url,
        success: (info) => {
          const sys = wx.getSystemInfoSync()
          const containerW = Math.max(1, sys.windowWidth - 32)
          const ratio = (info.height || 1) / (info.width || 1)
          const maxH = sys.windowHeight * 0.45
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
            this.setupCanvas(url, 0)
          })
        },
        fail: () => {
          wx.showToast({ title: '图片加载失败', icon: 'none' })
          this.triggerEvent('error', { message: '图片加载失败' })
        },
      })
    },

    setupCanvas(url, attempt) {
      const query = this.createSelectorQuery()
      query
        .select('#maskCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node || !this._layout) {
            if (attempt < 8) {
              setTimeout(() => this.setupCanvas(url, attempt + 1), 50)
            }
            return
          }
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio || 2
          const { containerW, containerH } = this._layout
          canvas.width = containerW * dpr
          canvas.height = containerH * dpr
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.scale(dpr, dpr)
          this._canvas = canvas
          this._ctx = ctx
          const img = canvas.createImage()
          img.onload = () => {
            this._img = img
            this.redraw()
            this.refreshCanvasRect(() => {
              this.setData({ ready: true })
            })
          }
          img.onerror = () => {
            wx.showToast({ title: '图片绘制失败', icon: 'none' })
          }
          img.src = url
        })
    },

    refreshCanvasRect(done) {
      this.createSelectorQuery()
        .select('#maskCanvas')
        .boundingClientRect((rect) => {
          this._canvasRect = rect || null
          if (typeof done === 'function') done()
        })
        .exec()
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
      else ctx.setLineDash([])
      ctx.strokeRect(x, y, w, h)
      ctx.fillStyle =
        color === '#FF4D4F' ? 'rgba(255,77,79,0.18)' : 'rgba(22,119,255,0.14)'
      ctx.fillRect(x, y, w, h)
      ctx.restore()
    },

    touchPoint(e) {
      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
      if (!t) return null
      // 浮层 + catchtouch 下，优先用页面坐标换算到 canvas，避免 x/y 缺失或错位
      const rect = this._canvasRect
      if (rect && Number.isFinite(t.clientX) && Number.isFinite(t.clientY)) {
        return {
          x: t.clientX - rect.left,
          y: t.clientY - rect.top,
        }
      }
      if (typeof t.x === 'number' && typeof t.y === 'number') {
        return { x: t.x, y: t.y }
      }
      return null
    },

    onTouchStart(e) {
      if (!this.data.ready) return
      this.refreshCanvasRect()
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
      if (!this._layout || !a || !b) return null
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
