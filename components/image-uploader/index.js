Component({
  properties: {
    images: {
      type: Array,
      value: [],
    },
    maxCount: {
      type: Number,
      value: 9,
    },
    disabled: {
      type: Boolean,
      value: false,
    },
    addIconSrc: {
      type: String,
      value: '/assets/icon/add.png',
    },
    /** default 通用 · album 服务相册节点（相框 thumb token） */
    variant: {
      type: String,
      value: 'default',
    },
    /** grid 缩略图网格 · cta 大号上传入口（配件凭证等） */
    layout: {
      type: String,
      value: 'grid',
    },
    ctaTitle: {
      type: String,
      value: '上传图片',
    },
    ctaDesc: {
      type: String,
      value: '',
    },
    /** 空态时「+」占满一行，便于配件凭证入口点选 */
    fullWidthAdd: {
      type: Boolean,
      value: false,
    },
    /** 网格列数；对照编辑等单槽场景传 1 */
    columns: {
      type: Number,
      value: 3,
    },
    /** ALB-UX · 每图备注（过程图） */
    enableCaption: {
      type: Boolean,
      value: false,
    },
    captionPlaceholder: {
      type: String,
      value: '本图说明（选填）',
    },
    /** 商家编辑：放大说明框，突出关键录入 */
    captionProminent: {
      type: Boolean,
      value: false,
    },
    /** 卷十五：新选图默认挂到的检查项 key */
    stampChecklistItemKey: {
      type: String,
      value: '',
    },
    /**
     * 图下快捷说明标签（如：正常 / 建议更换）
     * tagsWriteOutcomeOnly=true 时只作结果选择，不写入 caption
     */
    captionQuickTags: {
      type: Array,
      value: [],
    },
    /** 当前检查项结果标签文案（用于高亮；由清单编辑器传入） */
    outcomeTag: {
      type: String,
      value: '',
    },
    /** true：快捷标签只改结果，不写入图注（清单编辑默认） */
    tagsWriteOutcomeOnly: {
      type: Boolean,
      value: false,
    },
    /** 一图一行（检查项编辑） */
    stackLayout: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    uploading: false,
    isCtaLayout: false,
    isSingleColumn: false,
    isStackLayout: false,
    hasQuickTags: false,
    displayList: [],
  },
  observers: {
    layout(val) {
      this.setData({ isCtaLayout: String(val || '') === 'cta' })
    },
    columns(val) {
      this.setData({ isSingleColumn: Number(val) === 1 })
    },
    stackLayout(val) {
      this.setData({ isStackLayout: Boolean(val) })
    },
    captionQuickTags(val) {
      this.setData({ hasQuickTags: Array.isArray(val) && val.length > 0 })
    },
    images() {
      // 输入中勿用父级 images 回写整表，否则 textarea 失焦
      if (this._captionEditingIndex >= 0) return
      this.syncDisplayList()
    },
    outcomeTag() {
      if (this._captionEditingIndex >= 0) return
      this.syncDisplayList()
    },
  },
  lifetimes: {
    attached() {
      this._captionEditingIndex = -1
      this._draftCaptions = Object.create(null)
      this.setData({
        isCtaLayout: String(this.properties.layout || '') === 'cta',
        isSingleColumn: Number(this.properties.columns) === 1,
        isStackLayout: Boolean(this.properties.stackLayout),
        hasQuickTags:
          Array.isArray(this.properties.captionQuickTags) &&
          this.properties.captionQuickTags.length > 0,
      })
      this.syncDisplayList()
    },
  },
  methods: {
    clearCaptionDraft(imgIndex) {
      if (!this._draftCaptions) return
      delete this._draftCaptions[imgIndex]
    },
    captionOf(item, imgIndex) {
      if (
        this._draftCaptions &&
        Object.prototype.hasOwnProperty.call(this._draftCaptions, imgIndex)
      ) {
        return this._draftCaptions[imgIndex]
      }
      return String((item && item.caption) || '')
    },
    clearCaptionFocusFlags(list) {
      return (list || []).map((item) =>
        item && item.focusCaption ? { ...item, focusCaption: false } : item,
      )
    },
    tagLabels() {
      return (this.properties.captionQuickTags || [])
        .map((t) => (typeof t === 'string' ? t : String((t && t.label) || '').trim()))
        .filter(Boolean)
        .filter((t) => t !== '自定义')
    },
    applyTagToCaption(caption, label) {
      const labels = this.tagLabels()
      const c = String(caption || '').trim()
      for (let i = 0; i < labels.length; i += 1) {
        const t = labels[i]
        if (c === t || c === `${t}；` || c === `${t};`) return `${label}；`
        if (c.startsWith(`${t}；`) || c.startsWith(`${t};`) || c.startsWith(`${t}：`) || c.startsWith(`${t}:`)) {
          const sepLen = c.startsWith(`${t}；`) || c.startsWith(`${t}：`) ? t.length + 1 : t.length + 1
          const suffix = c.slice(sepLen)
          return `${label}；${suffix}`
        }
        if (c.startsWith(t)) {
          const suffix = c.slice(t.length).replace(/^[；;：:\s]+/, '')
          return suffix ? `${label}；${suffix}` : `${label}；`
        }
      }
      if (!c) return `${label}；`
      return `${label}；${c}`
    },
    stripOutcomeTagFromCaption(caption) {
      const labels = this.tagLabels()
      let c = String(caption || '').trim()
      if (!c) return ''
      for (let i = 0; i < labels.length; i += 1) {
        const t = labels[i]
        if (c === t || c === `${t}；` || c === `${t};`) return ''
        if (c.startsWith(`${t}；`) || c.startsWith(`${t};`) || c.startsWith(`${t}：`) || c.startsWith(`${t}:`)) {
          return c.slice(t.length + 1).replace(/^[；;：:\s]+/, '').trim()
        }
        if (c.startsWith(t)) {
          return c.slice(t.length).replace(/^[；;：:\s]+/, '').trim()
        }
      }
      return c
    },
    resolveActiveTag(caption) {
      const outcomeOnly = Boolean(this.properties.tagsWriteOutcomeOnly)
      const external = String(this.properties.outcomeTag || '').trim()
      if (outcomeOnly && external) return external
      const c = String(caption || '').trim()
      if (!c) return outcomeOnly ? '' : ''
      const labels = this.tagLabels()
      for (let i = 0; i < labels.length; i += 1) {
        const t = labels[i]
        if (
          c === t ||
          c === `${t}；` ||
          c === `${t};` ||
          c.startsWith(`${t}；`) ||
          c.startsWith(`${t};`) ||
          c.startsWith(`${t}：`) ||
          c.startsWith(`${t}:`)
        ) {
          return t
        }
      }
      if (outcomeOnly && !external) return c ? '自定义' : ''
      return c ? '自定义' : ''
    },
    decorateDisplayItem(item, old) {
      const caption = String((item && item.caption) || '').trim()
      const showCaption =
        Boolean(caption) || Boolean(old && old.showCaption) || Boolean(item && item.showCaption)
      return {
        ...item,
        showCaption,
        activeTag: this.resolveActiveTag(caption),
      }
    },
    normalizeEntry(entry) {
      if (typeof entry === 'string') {
        const url = entry.trim()
        return url ? { url, caption: '', showCaption: false } : null
      }
      if (!entry || typeof entry !== 'object') return null
      const url = String(entry.url || entry.rawUrl || entry.src || '').trim()
      if (!url) return null
      const caption = String(entry.caption || '').trim().slice(0, 500)
      return {
        url,
        caption,
        checklistItemKey: String(entry.checklistItemKey || '').trim(),
        showCaption: Boolean(caption) || Boolean(entry.showCaption),
      }
    },
    toEmitList(displayList) {
      if (this.properties.enableCaption) {
        return (displayList || []).map((item) => ({
          url: item.url,
          caption: item.caption || '',
          checklistItemKey: String(item.checklistItemKey || '').trim(),
        }))
      }
      return (displayList || []).map((item) => ({
        url: item.url,
        checklistItemKey: String(item.checklistItemKey || '').trim(),
      }))
    },
    syncDisplayList() {
      const prev = this.data.displayList || []
      const prevByUrl = new Map(prev.map((item) => [item.url, item]))
      const displayList = (this.properties.images || [])
        .map((entry) => this.normalizeEntry(entry))
        .filter(Boolean)
        .map((item) => this.decorateDisplayItem(item, prevByUrl.get(item.url)))
      this.setData({ displayList })
    },
    mergeDraftCaptions(list) {
      if (!this._draftCaptions) return list || []
      return (list || []).map((item, i) => {
        if (!Object.prototype.hasOwnProperty.call(this._draftCaptions, i)) return item
        return { ...item, caption: this._draftCaptions[i], showCaption: true }
      })
    },
    emitChange(list) {
      const merged = this.mergeDraftCaptions(list)
      this.triggerEvent('change', {
        images: this.toEmitList(merged),
        stampChecklistItemKey: String(this.properties.stampChecklistItemKey || '').trim(),
      })
    },
    onAdd() {
      if (this.properties.disabled || this.data.uploading) return
      const current = this.data.displayList || []
      const remain = this.properties.maxCount - current.length
      if (remain <= 0) {
        wx.showToast({ title: `最多上传 ${this.properties.maxCount} 张`, icon: 'none' })
        return
      }
      const count = Math.min(remain, 9)
      const onSuccess = (paths) => {
        const stampKey = String(this.properties.stampChecklistItemKey || '').trim()
        const list = (paths || []).filter(Boolean).map((url) => ({
          url,
          caption: '',
          checklistItemKey: stampKey,
          showCaption: false,
        }))
        if (!list.length) return
        this.emitChange(current.concat(list))
      }
      const onFail = (err) => {
        const msg = String((err && err.errMsg) || '')
        if (/cancel/i.test(msg)) return
        wx.showToast({ title: '无法打开相册，请检查权限', icon: 'none' })
      }
      if (typeof wx.chooseMedia === 'function') {
        wx.chooseMedia({
          count,
          mediaType: ['image'],
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: (res) => {
            onSuccess((res.tempFiles || []).map((f) => f.tempFilePath))
          },
          fail: (err) => {
            const msg = String((err && err.errMsg) || '')
            if (/cancel/i.test(msg)) return
            wx.chooseImage({
              count,
              sizeType: ['compressed'],
              sourceType: ['album', 'camera'],
              success: (res) => onSuccess(res.tempFilePaths || []),
              fail: onFail,
            })
          },
        })
        return
      }
      wx.chooseImage({
        count,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => onSuccess(res.tempFilePaths || []),
        fail: onFail,
      })
    },
    onQuickTagTap(e) {
      if (this.properties.disabled || !this.properties.enableCaption) return
      const { index, label } = e.currentTarget.dataset
      const imgIndex = Number(index)
      if (!Number.isFinite(imgIndex)) return
      const tag = String(label || '').trim()
      if (!tag) return
      const isCustom = tag === '自定义'
      const outcomeOnly = Boolean(this.properties.tagsWriteOutcomeOnly)
      this.clearCaptionDraft(imgIndex)
      this._captionEditingIndex = -1

      if (outcomeOnly) {
        // 结果标签不写图注；若图注整句是旧标签则剥掉
        let captionChanged = false
        const list = (this.data.displayList || []).map((item, i) => {
          if (i !== imgIndex) return { ...item, focusCaption: false }
          const baseCaption = this.captionOf(item, i)
          if (isCustom) {
            const next = {
              ...item,
              caption: item.activeTag === '自定义' ? baseCaption : this.stripOutcomeTagFromCaption(baseCaption),
              showCaption: true,
              focusCaption: true,
              activeTag: '自定义',
            }
            if (next.caption !== baseCaption) captionChanged = true
            return next
          }
          const stripped = this.stripOutcomeTagFromCaption(baseCaption)
          if (stripped !== baseCaption) captionChanged = true
          const next = {
            ...item,
            caption: stripped,
            // 再点同一标签：展开说明框补人话，不改结果
            showCaption: item.activeTag === tag ? true : Boolean(stripped),
            focusCaption: item.activeTag === tag,
            activeTag: tag,
          }
          return next
        })
        this.setData({ displayList: list })
        this.triggerEvent('quicktag', { index: imgIndex, label: isCustom ? '' : tag })
        if (captionChanged) this.emitChange(list)
        setTimeout(() => {
          const cur = this.data.displayList || []
          if (!cur[imgIndex] || !cur[imgIndex].focusCaption) return
          this.setData({ displayList: this.clearCaptionFocusFlags(cur) })
        }, 200)
        return
      }

      const list = (this.data.displayList || []).map((item, i) => {
        if (i !== imgIndex) return { ...item, focusCaption: false }
        const baseCaption = this.captionOf(item, i)
        if (isCustom) {
          const next = {
            ...item,
            caption: item.activeTag === '自定义' ? baseCaption : '',
            showCaption: true,
            focusCaption: true,
          }
          return this.decorateDisplayItem(next, item)
        }
        // 再次点击同一标签：不重复写入，避免误以为未选中
        if (item.activeTag === tag) {
          return { ...item, showCaption: true, focusCaption: true }
        }
        const next = {
          ...item,
          caption: this.applyTagToCaption(baseCaption, tag).slice(0, 500),
          showCaption: true,
          focusCaption: true,
        }
        return this.decorateDisplayItem(next, item)
      })
      this.setData({ displayList: list })
      this.emitChange(list)
      // focus 仅作一次性拉起键盘，随后清掉，避免后续受控 focus=false 抢焦点
      setTimeout(() => {
        const cur = this.data.displayList || []
        if (!cur[imgIndex] || !cur[imgIndex].focusCaption) return
        this.setData({ displayList: this.clearCaptionFocusFlags(cur) })
      }, 200)
    },
    onClearCaption(e) {
      if (this.properties.disabled || !this.properties.enableCaption) return
      const imgIndex = Number(e.currentTarget.dataset.index)
      if (!Number.isFinite(imgIndex)) return
      this.clearCaptionDraft(imgIndex)
      this._captionEditingIndex = -1
      const list = (this.data.displayList || []).map((item, i) => {
        if (i !== imgIndex) return item
        return this.decorateDisplayItem(
          {
            ...item,
            caption: '',
            showCaption: false,
            focusCaption: false,
          },
          item
        )
      })
      this.setData({ displayList: list })
      this.emitChange(list)
    },
    onCaptionFocus(e) {
      if (this.properties.disabled || !this.properties.enableCaption) return
      const imgIndex = Number(e.currentTarget.dataset.index)
      if (!Number.isFinite(imgIndex)) return
      this._captionEditingIndex = imgIndex
    },
    onCaptionInput(e) {
      if (this.properties.disabled || !this.properties.enableCaption) return
      const imgIndex = Number(e.currentTarget.dataset.index)
      if (!Number.isFinite(imgIndex)) return
      // 仅记草稿，不 setData / 不上抛，避免受控回写导致失焦
      if (!this._draftCaptions) this._draftCaptions = Object.create(null)
      this._draftCaptions[imgIndex] = String((e.detail && e.detail.value) || '').slice(0, 500)
      this._captionEditingIndex = imgIndex
    },
    onCaptionBlur(e) {
      if (this.properties.disabled || !this.properties.enableCaption) return
      const imgIndex = Number(e.currentTarget.dataset.index)
      if (!Number.isFinite(imgIndex)) return
      const value = String((e.detail && e.detail.value) || '').slice(0, 500)
      this.clearCaptionDraft(imgIndex)
      this._captionEditingIndex = -1
      const list = (this.data.displayList || []).map((item, i) => {
        if (i !== imgIndex) return { ...item, focusCaption: false }
        return this.decorateDisplayItem(
          {
            ...item,
            caption: value,
            showCaption: true,
            focusCaption: false,
          },
          item,
        )
      })
      this.setData({ displayList: list })
      this.emitChange(list)
    },
    onRemove(e) {
      const imgIndex = Number(e.currentTarget.dataset.index)
      if (!Number.isFinite(imgIndex)) return
      const list = (this.data.displayList || []).slice()
      list.splice(imgIndex, 1)
      this.emitChange(list)
    },
    onPreview(e) {
      const imgIndex = Number(e.currentTarget.dataset.index)
      const urls = (this.data.displayList || []).map((item) => item.url)
      if (!urls.length || !Number.isFinite(imgIndex)) return
      wx.previewImage({ current: urls[imgIndex], urls })
    },
  },
})
