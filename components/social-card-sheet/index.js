const { planFrame, paintPoster, POSTER_WIDTH, momentsKeep } = require('../../utils/social-poster')
const { ensureAlbumPermission, writeAlbumFile } = require('../../utils/save-social-images')

function loadInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: reject,
    })
  })
}

function loadCanvasImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image'))
    img.src = src
  })
}

Component({
  properties: {
    platforms: {
      type: Array,
      value: [],
    },
    activeId: {
      type: String,
      value: 'moments',
    },
    images: {
      type: Array,
      value: [],
    },
    text: {
      type: String,
      value: '',
    },
    caption: {
      type: String,
      value: '',
    },
    loading: {
      type: Boolean,
      value: false,
    },
    emptyText: {
      type: String,
      value: '照片还在处理',
    },
    showActions: {
      type: Boolean,
      value: false,
    },
    saveDisabled: {
      type: Boolean,
      value: false,
    },
    refreshing: {
      type: Boolean,
      value: false,
    },
    revision: {
      type: Number,
      value: 0,
    },
  },

  data: {
    exporting: false,
    focusId: '',
    focusUrl: '',
    slideLine: '',
    captionLabel: '配文',
    copyLabel: '复制',
    lineEditing: false,
    bodyEditing: false,
    bodyShown: '',
  },

  observers: {
    activeId() {
      this.syncLabels()
      this.syncSlideLine()
    },
    images() {
      if (this._seenRevision !== this.properties.revision) {
        this._seenRevision = this.properties.revision
        this._lines = {}
        this._draftSlide = null
        this._draftText = null
        this._draftCaption = null
      }
      this.ensureLines()
      if (!this.data.focusId) {
        const first = (this.properties.images || [])[0]
        if (first && first.id) this.setData({ focusId: first.id })
      }
      this.syncSlideLine()
    },
    text() {
      this._draftText = null
      this.syncBodyShown()
    },
    caption() {
      this._draftCaption = null
      this.syncBodyShown()
    },
  },

  lifetimes: {
    attached() {
      this.syncLabels()
    },
  },

  methods: {
    ensureLines() {
      const images = this.properties.images || []
      const ids = new Set(images.map((img) => img && img.id).filter(Boolean))
      const known = Object.keys(this._lines || {})
      if (!this._lines || !known.some((id) => ids.has(id))) this._lines = {}
      images.forEach((img) => {
        if (!img || !img.id || this._lines[img.id]) return
        this._lines[img.id] = { ...(img.lines || {}) }
      })
    },

    flushSlide() {
      if (this._draftSlide == null) return
      const id = this.data.focusId
      const platform = this.properties.activeId
      if (id && platform && platform !== 'moments') {
        if (!this._lines) this._lines = {}
        if (!this._lines[id]) this._lines[id] = {}
        this._lines[id][platform] = this._draftSlide
      }
      this._draftSlide = null
    },

    syncSlideLine() {
      const images = this.properties.images || []
      let id = this.data.focusId
      if (!images.some((img) => img && img.id === id)) id = images[0] ? images[0].id : ''
      const focus = images.find((img) => img && img.id === id)
      const platform = this.properties.activeId
      const stored = id && this._lines && this._lines[id]
      const line = stored && platform ? (stored[platform] || '') : ''
      const patch = { slideLine: line, focusUrl: focus && focus.url ? focus.url : '' }
      if (id !== this.data.focusId) patch.focusId = id
      this.setData(patch)
    },

    onRefresh() {
      if (this.properties.refreshing || this.properties.loading) return
      this.triggerEvent('refresh')
    },

    onPlatform(e) {
      const id = e.currentTarget.dataset.id
      if (!id || id === this.properties.activeId) return
      this.flushSlide()
      this.setData({ lineEditing: false, bodyEditing: false })
      this.triggerEvent('platformchange', { id })
    },

    onFocus(e) {
      const id = e.currentTarget.dataset.id
      if (!id || id === this.data.focusId) return
      this.flushSlide()
      this.setData({ focusId: id, lineEditing: false })
      this.syncSlideLine()
    },

    syncLabels() {
      const id = this.properties.activeId || 'moments'
      let captionLabel = '配文'
      if (id === 'xiaohongshu') captionLabel = '正文'
      if (id === 'douyin') captionLabel = '描述'
      this.setData({ captionLabel, copyLabel: '复制' })
      this.syncBodyShown()
    },

    syncBodyShown() {
      const moments = (this.properties.activeId || 'moments') === 'moments'
      const value = String(
        moments
          ? (this._draftText != null ? this._draftText : this.properties.text || '')
          : (this._draftCaption != null ? this._draftCaption : this.properties.caption || ''),
      )
      if (value !== this.data.bodyShown) this.setData({ bodyShown: value })
    },

    onEditLine() {
      this.setData({ lineEditing: true })
    },

    onLineBlur() {
      this.flushSlide()
      this.setData({ lineEditing: false })
    },

    onEditBody() {
      this.setData({ bodyEditing: true })
    },

    onBodyBlur() {
      this.setData({ bodyEditing: false })
      this.syncBodyShown()
    },

    onInput(e) {
      const value = (e.detail && e.detail.value) || ''
      this._draftText = value
      this.setData({ bodyShown: value })
      this.triggerEvent('textinput', { value })
    },

    onSlideInput(e) {
      const value = (e.detail && e.detail.value) || ''
      this._draftSlide = value
    },

    onCaptionInput(e) {
      const value = (e.detail && e.detail.value) || ''
      this._draftCaption = value
      this.setData({ bodyShown: value })
      this.triggerEvent('captioninput', { value })
    },

    onCopyCurrent() {
      const moments = (this.properties.activeId || 'moments') === 'moments'
      const value = String(
        moments
          ? (this._draftText != null ? this._draftText : this.properties.text || '')
          : (this._draftCaption != null ? this._draftCaption : this.properties.caption || ''),
      ).trim()
      if (!value) {
        wx.showToast({ title: moments ? '再写一句配文' : '再写一句', icon: 'none' })
        return
      }
      wx.setClipboardData({ data: value })
    },

    onDownload() {
      this.downloadPoster()
    },

    queryCanvas() {
      return new Promise((resolve, reject) => {
        this.createSelectorQuery()
          .select('#socialPoster')
          .fields({ node: true, size: true })
          .exec((res) => {
            const node = res && res[0] && res[0].node
            if (!node) {
              reject(new Error('canvas'))
              return
            }
            resolve(node)
          })
      })
    },

    async paintFrame(info, plan) {
      const canvas = wx.createOffscreenCanvas
        ? wx.createOffscreenCanvas({ type: '2d', width: plan.width, height: plan.height })
        : await this.queryCanvas()
      if (!wx.createOffscreenCanvas) {
        canvas.width = plan.width
        canvas.height = plan.height
      }
      const img = await loadCanvasImage(canvas, info.path)
      ;(plan.ops || []).forEach((op) => {
        if (op.type === 'image') op.img = img
      })
      paintPoster(canvas.getContext('2d'), plan)
      return new Promise((resolve, reject) => {
        const options = {
          canvas,
          fileType: 'jpg',
          quality: 0.92,
          success: (res) => resolve(res.tempFilePath),
          fail: reject,
        }
        if (wx.createOffscreenCanvas) wx.canvasToTempFilePath(options)
        else wx.canvasToTempFilePath(options, this)
      })
    },

    async downloadPoster() {
      if (this.data.exporting) return
      this.ensureLines()
      this.flushSlide()
      const platform = this.properties.activeId || 'moments'
      const text = String(this._draftText != null ? this._draftText : this.properties.text || '').trim()
      const caption = String(this._draftCaption != null ? this._draftCaption : this.properties.caption || '').trim()
      let picked = (this.properties.images || []).filter((item) => item && item.checked !== false && item.url)
      if (platform === 'moments') picked = picked.slice(0, momentsKeep(picked.length))
      if (!picked.length) {
        wx.showToast({ title: '还没有照片', icon: 'none' })
        return
      }
      if (platform === 'moments' && !text) {
        wx.showToast({ title: '再写一句配文', icon: 'none' })
        return
      }
      if (platform !== 'moments' && !caption) {
        const hasLine = picked.some((item) => this._lines && this._lines[item.id] && this._lines[item.id][platform])
        if (!hasLine) {
          wx.showToast({ title: '再写一句', icon: 'none' })
          return
        }
      }
      this.setData({ exporting: true })
      const total = picked.length
      wx.showLoading({ title: `正在准备 1/${total}`, mask: true })
      let saved = 0
      try {
        const measure = wx.createOffscreenCanvas
          ? wx.createOffscreenCanvas({ type: '2d', width: POSTER_WIDTH, height: 200 })
          : await this.queryCanvas()
        const measureCtx = measure.getContext('2d')
        const frames = []
        for (let i = 0; i < picked.length; i += 1) {
          wx.showLoading({ title: `正在准备 ${i + 1}/${total}`, mask: true })
          const item = picked[i]
          let info
          try {
            info = await loadInfo(item.url)
          } catch (e) {
            continue
          }
          const stored = (this._lines && this._lines[item.id]) || item.lines || {}
          const line = platform === 'moments' ? '' : (stored[platform] || '')
          const plan = planFrame(measureCtx, {
            platform,
            width: POSTER_WIDTH,
            line,
            image: { width: info.width, height: info.height, img: { width: info.width, height: info.height } },
          })
          frames.push(await this.paintFrame(info, plan))
        }
        if (!frames.length) {
          wx.hideLoading()
          wx.showToast({ title: '照片没能放进图里', icon: 'none' })
          return
        }
        await ensureAlbumPermission()
        for (let i = 0; i < frames.length; i += 1) {
          wx.showLoading({ title: `正在保存 ${i + 1}/${frames.length}`, mask: true })
          await writeAlbumFile(frames[i])
          saved += 1
          if (i < frames.length - 1) {
            wx.showLoading({ title: `正在保存 ${i + 2}/${frames.length}`, mask: true })
          }
        }
        wx.hideLoading()
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      } catch (err) {
        wx.hideLoading()
        const message = err && err.message
        if (message !== 'cancelled' && message !== 'denied') {
          wx.showToast({ title: saved ? `已存${saved}张` : '没能保存', icon: 'none' })
        }
      } finally {
        this.setData({ exporting: false })
      }
    },
  },
})
