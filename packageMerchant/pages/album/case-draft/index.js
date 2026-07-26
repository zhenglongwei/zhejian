const {
  fetchMerchantCaseDraft,
  saveMerchantCaseDraft,
  polishMerchantCaseDraft,
  confirmAndCompleteMerchantCaseDraft,
  exportMerchantCaseDraftCopy,
} = require('../../../../services/merchant-service-album')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    fromComplete: false,
    editable: false,
    saving: false,
    polishing: false,
    completing: false,
    canRevertPolish: false,
    title: '',
    caseSummary: '',
    titleHeight: 40,
    summaryHeight: 40,
    sections: [],
    media: [],
    confirmed: false,
  },

  /** 仅保留最近一次「AI 润色」前的文案，不落库 */
  _prePolishSnapshot: null,

  onLoad(options) {
    this.albumId = options.albumId || ''
    const fromComplete = options.from === 'complete' || options.gate === '1'
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '服务相册信息缺失' })
      return
    }
    this.setData({ fromComplete })
    if (fromComplete) {
      wx.setNavigationBarTitle({ title: '案例预览 · 确认完工' })
    }
    this.initPage()
  },

  async initPage() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      this.setData({ status: 'error', errorMessage: '请先完成商家入驻' })
      return
    }
    await this.loadDraft()
  },

  /** 按正文字号估算 textarea 高度，避免微信 auto-height 异步赋值失效 */
  measureTextHeight(text = '', minLines = 1) {
    let windowWidth = 375
    try {
      const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
      windowWidth = info.windowWidth || 375
    } catch (_) {
      windowWidth = 375
    }
    const rpx = windowWidth / 750
    const linePx = 40 * rpx
    const padY = 16 * rpx * 2
    // 页边距 32*2 + 卡片内边距 24*2 + 文本框左右 padding 16*2
    const textWidth = Math.max(120, windowWidth - 144 * rpx)
    const charPx = 28 * rpx
    const cols = Math.max(6, Math.floor(textWidth / charPx))
    const raw = String(text || '')
    let lines = 0
    if (!raw) {
      lines = minLines
    } else {
      raw.split('\n').forEach((row) => {
        const len = Array.from(row).length
        lines += Math.max(1, Math.ceil(len / cols))
      })
    }
    return Math.ceil(Math.max(minLines, lines) * linePx + padY + 2)
  },

  mediaDisplayUrl(item) {
    // 商家预览优先原图；脱敏图留给车主/正式公示
    return (item && (item.previewUrl || item.maskedUrl)) || ''
  },

  mapMedia(list) {
    return (list || []).map((item) => ({
      ...item,
      displayUrl: this.mediaDisplayUrl(item),
    }))
  },

  mapSections(list) {
    return (list || []).map((sec) => ({
      ...sec,
      bodyHeight: this.measureTextHeight(sec && sec.body, 1),
    }))
  },

  applyDraftView(draft = {}, extra = {}) {
    const title = draft.title || ''
    const caseSummary = draft.caseSummary || ''
    const sections = this.mapSections(draft.sections || [])
    const media = this.mapMedia(draft.media || [])
    this.setData({
      title,
      caseSummary,
      titleHeight: this.measureTextHeight(title, 1),
      summaryHeight: this.measureTextHeight(caseSummary, 2),
      sections,
      media,
      ...extra,
    })
  },

  async loadDraft() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const data = await fetchMerchantCaseDraft(this.albumId)
      const draft = data.draft || {}
      this._prePolishSnapshot = null
      this.applyDraftView(draft, {
        status: 'normal',
        albumId: this.albumId,
        editable: Boolean(data.editable),
        confirmed: Boolean(data.confirmed || (draft && draft.confirmedAt)),
        canRevertPolish: false,
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  capturePrePolishSnapshot() {
    this._prePolishSnapshot = {
      title: this.data.title || '',
      caseSummary: this.data.caseSummary || '',
      sections: (this.data.sections || []).map((sec) => ({
        key: sec.key,
        title: sec.title,
        body: sec.body || '',
      })),
    }
  },

  onRetry() {
    this.loadDraft()
  },

  onTitleInput(e) {
    const title = e.detail.value || ''
    this.setData({
      title,
      titleHeight: this.measureTextHeight(title, 1),
    })
  },

  onSummaryInput(e) {
    const caseSummary = e.detail.value || ''
    this.setData({
      caseSummary,
      summaryHeight: this.measureTextHeight(caseSummary, 2),
    })
  },

  onSectionInput(e) {
    const { key } = e.currentTarget.dataset
    const value = e.detail.value || ''
    const sections = (this.data.sections || []).map((sec) =>
      sec.key === key
        ? { ...sec, body: value, bodyHeight: this.measureTextHeight(value, 1) }
        : sec,
    )
    this.setData({ sections })
  },

  onRemoveMedia(e) {
    const { nodeId, idx } = e.currentTarget.dataset
    const media = (this.data.media || []).filter(
      (item) => !(String(item.nodeId) === String(nodeId) && Number(item.idx) === Number(idx)),
    )
    this.setData({ media })
  },

  buildDraftPayload() {
    return {
      title: this.data.title,
      caseSummary: this.data.caseSummary,
      sections: (this.data.sections || []).map((sec) => ({
        key: sec.key,
        title: sec.title,
        body: sec.body,
      })),
      media: (this.data.media || []).map((item) => ({
        nodeId: item.nodeId,
        idx: item.idx,
        maskedUrl: item.maskedUrl || '',
        previewUrl: item.previewUrl || '',
        caption: item.caption || '',
        sectionKey: item.sectionKey || '',
      })),
    }
  },

  async onAiPolish() {
    if (!this.data.editable || this.data.polishing || this.data.saving) return
    this.capturePrePolishSnapshot()
    this.setData({ polishing: true })
    try {
      wx.showLoading({ title: 'AI 润色中', mask: true })
      const data = await polishMerchantCaseDraft(this.albumId, {
        draft: this.buildDraftPayload(),
      })
      wx.hideLoading()
      const draft = data.draft || {}
      this.applyDraftView(
        {
          ...draft,
          media: draft.media && draft.media.length ? draft.media : this.data.media,
        },
        { confirmed: false, canRevertPolish: true },
      )
      wx.showToast({ title: '已润色，可恢复或继续改', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      this._prePolishSnapshot = null
      this.setData({ canRevertPolish: false })
      wx.showToast({ title: (e && e.message) || '润色失败', icon: 'none' })
    } finally {
      this.setData({ polishing: false })
    }
  },

  onRevertPolish() {
    if (!this.data.editable || !this.data.canRevertPolish || !this._prePolishSnapshot) return
    const snap = this._prePolishSnapshot
    this._prePolishSnapshot = null
    this.applyDraftView(
      {
        title: snap.title,
        caseSummary: snap.caseSummary,
        sections: snap.sections,
        media: this.data.media,
      },
      { canRevertPolish: false },
    )
    wx.showToast({ title: '已恢复润色前', icon: 'success' })
  },

  async onSave(confirm) {
    if (!this.data.editable || this.data.saving) return
    this.setData({ saving: true })
    try {
      const data = await saveMerchantCaseDraft(this.albumId, {
        confirm: Boolean(confirm),
        draft: this.buildDraftPayload(),
      })
      const draft = data.draft || {}
      this.applyDraftView(draft, {
        editable: Boolean(data.editable),
        confirmed: Boolean(data.confirmed || draft.confirmedAt),
      })
      wx.showToast({
        title: confirm ? '已确认案例稿' : '已保存',
        icon: 'success',
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  onSaveDraft() {
    this.onSave(false)
  },

  onConfirmDraft() {
    this.onSave(true)
  },

  async onConfirmAndComplete() {
    if (!this.data.editable || this.data.completing) return
    this.setData({ completing: true })
    try {
      wx.showLoading({ title: '确认并完工中', mask: true })
      await confirmAndCompleteMerchantCaseDraft(this.albumId, {
        draft: this.buildDraftPayload(),
      })
      wx.hideLoading()
      this._prePolishSnapshot = null
      this.setData({
        confirmed: true,
        editable: false,
        fromComplete: false,
        canRevertPolish: false,
      })
      await this.loadDraft()
      wx.showModal({
        title: '已确认并完工',
        content:
          '案例稿已锁定，不可再改。公开配图已开始脱敏，并进入平台案例审核。审核通过后车主可自行发布；驳回后你可再编辑。可复制当前文字发自媒体（不含配图，平台不代发），或返回相册。',
        confirmText: '复制文案',
        cancelText: '返回相册',
        success: (res) => {
          if (res.confirm) this.onCopyExport()
          else wx.navigateBack({ delta: 1 })
        },
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ completing: false })
    }
  },

  async onCopyExport() {
    try {
      let text = ''
      if (this.data.confirmed) {
        wx.showLoading({ title: '准备文案', mask: true })
        const data = await exportMerchantCaseDraftCopy(this.albumId)
        wx.hideLoading()
        text = (data && data.text) || ''
      }
      if (!text) {
        const { draftToPlainText } = require('../../../../utils/merchant-case-draft-display')
        text = draftToPlainText({
          title: this.data.title,
          caseSummary: this.data.caseSummary,
          sections: this.data.sections,
        })
      }
      if (!text) {
        wx.showToast({ title: '暂无可复制文案', icon: 'none' })
        return
      }
      await wx.setClipboardData({ data: text })
      wx.showToast({ title: '已复制文字（不含图）', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
    }
  },
})
