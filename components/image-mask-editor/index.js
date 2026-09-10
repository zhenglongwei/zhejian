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
    canvasW: 300,
    canvasH: 200,
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
      if (this.properties.imageUrl) this.initCanvas()
    },
  },
  observers: {
    imageUrl(url) {
      if (url) setTimeout(() => this.initCanvas(), 30)
    },
  },
  methods: {
    preventPass() {},

    initCanvas() {
      const url = this.properties.imageUrl
      if (!url) return
      this.setData({ ready: false })
      wx.getImageInfo({
        src: url,
        success: (info) => {
          const sys = wx.getSystemInfoSync()
          // 与弹层左右 padding 对齐，避免画布比容器宽
          const maxW = Math.max(120, Math.floor(sys.windowWidth - 48))
          const maxH = Math.floor(sys.windowHeight * 0.42)
          const imgW = Number(info.width) || 1
          const imgH = Number(info.height) || 1
          const ratio = imgH / imgW
          let drawW = maxW
          let drawH = Math.round(drawW * ratio)
          if (drawH > maxH) {
            drawH = maxH
            drawW = Math.round(drawH / ratio)
          }
          this._layout = {
            containerW: drawW,
            containerH: drawH,
            offsetX: 0,
            offsetY: 0,
            drawW,
            drawH,
            imgW,
            imgH,
          }
          this.setData(
            {
              canvasW: drawW,
              canvasH: drawH,
              ready: false,
              regions: [],
            },
            () => this.setupCanvas(url, 0),
          )
        },
        fail: () => {
          wx.showToast({ title: '图片加载失败', icon: 'none' })
          this.triggerEvent('error', { message: '图片加载失败' })
        },
      })
    },

    setupCanvas(url, attempt) {
      this.createSelectorQuery()
        .select('#maskCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node || !this._layout) {
            if (attempt < 10) setTimeout(() => this.setupCanvas(url, attempt + 1), 40)
            return
          }
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio || 2
          const { containerW, containerH } = this._layout
          // 缓冲分辨率；显示尺寸用 style 固定为 containerW/H，避免空白错位
          canvas.width = Math.max(1, Math.floor(containerW * dpr))
          canvas.height = Math.max(1, Math.floor(containerH * dpr))
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          this._canvas = canvas
          this._ctx = ctx
          const img = canvas.createImage()
          img.onload = () => {
            this._img = img
            this.redraw()
            this.refreshCanvasRect(() => this.setData({ ready: true }))
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
      ctx.setLineDash(dashed ? [6, 4] : [])
      ctx.strokeRect(x, y, w, h)
      ctx.fillStyle =
        color === '#FF4D4F' ? 'rgba(255,77,79,0.18)' : 'rgba(22,119,255,0.14)'
      ctx.fillRect(x, y, w, h)
      ctx.restore()
    },

    /**
     * 触摸点 → canvas 逻辑像素（与 drawW/drawH 同一套坐标系）
     * 用 client 坐标相对 canvas 矩形换算，避免 style 与缓冲错位。
     */
    touchPoint(e) {
      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
      if (!t || !this._layout) return null
      const rect = this._canvasRect
      const { containerW, containerH } = this._layout
      if (rect && rect.width > 0 && rect.height > 0 && Number.isFinite(t.clientX)) {
        const x = ((t.clientX - rect.left) / rect.width) * containerW
        const y = ((t.clientY - rect.top) / rect.height) * containerH
        return { x, y }
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
