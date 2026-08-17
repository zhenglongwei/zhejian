const {
  fetchMerchantCaseDraft,
  saveMerchantCaseDraft,
  polishMerchantCaseDraft,
  confirmAndCompleteMerchantCaseDraft,
  exportMerchantCaseDraftCopy,
  generateMerchantPublicCase,
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
    generateMode: false,
    resubmit: false,
    editable: false,
    saving: false,
    polishing: false,
    completing: false,
    generating: false,
    canRevertPolish: false,
    title: '',
    caseSummary: '',
    titleHeight: 40,
    summaryHeight: 40,
    sections: [],
    media: [],
    confirmed: false,
    primaryActionText: '确认完工',
    showCompletePrimary: false,
    showGeneratePrimary: false,
  },

  /** 仅保留最近一次「AI 润色」前的文案，不落库 */
  _prePolishSnapshot: null,

  /** 页面工作稿：同步更新，避免 setData 未完成就提交旧文 */
  _workingDraft: null,

  onLoad(options) {
    this.albumId = options.albumId || ''
    const fromComplete = options.from === 'complete' || options.gate === '1'
    const generateMode = options.from === 'generate'
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '服务相册信息缺失' })
      return
    }
    this.setData({ fromComplete, generateMode })
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
    const editable = extra.editable != null ? Boolean(extra.editable) : this.data.editable
    const resubmit = extra.resubmit != null ? Boolean(extra.resubmit) : this.data.resubmit
    const fromComplete = this.data.fromComplete
    const generateMode = this.data.generateMode
    const showGeneratePrimary = Boolean(editable && generateMode && !resubmit)
    const showCompletePrimary = Boolean(editable && (fromComplete || resubmit) && !generateMode)
    const primaryActionText = generateMode
      ? '勾选保证并送审'
      : resubmit
        ? '重新提交'
        : '确认完工'
    if (showGeneratePrimary) {
      wx.setNavigationBarTitle({ title: '生成公开案例' })
    } else if (showCompletePrimary) {
      wx.setNavigationBarTitle({
        title: resubmit ? '案例预览 · 重新提交' : '案例预览 · 确认完工',
      })
    }
    this._workingDraft = {
      title,
      caseSummary,
      sections: sections.map((sec) => ({
        key: sec.key,
        title: sec.title,
        body: sec.body || '',
      })),
      media: media.map((item) => ({
        nodeId: item.nodeId,
        idx: item.idx,
        maskedUrl: item.maskedUrl || '',
        previewUrl: item.previewUrl || '',
        caption: item.caption || '',
        sectionKey: item.sectionKey || '',
      })),
      source: draft.source || (this._workingDraft && this._workingDraft.source) || 'merchant_edit',
    }
    this.setData({
      ...extra,
      title,
      caseSummary,
      titleHeight: this.measureTextHeight(title, 1),
      summaryHeight: this.measureTextHeight(caseSummary, 2),
      sections,
      media,
      resubmit,
      primaryActionText,
      showCompletePrimary,
      showGeneratePrimary,
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
        resubmit: Boolean(data.resubmit),
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
    if (this._workingDraft) this._workingDraft.title = title
    this.setData({
      title,
      titleHeight: this.measureTextHeight(title, 1),
    })
  },

  onSummaryInput(e) {
    const caseSummary = e.detail.value || ''
    if (this._workingDraft) this._workingDraft.caseSummary = caseSummary
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
    if (this._workingDraft) {
      this._workingDraft.sections = sections.map((sec) => ({
        key: sec.key,
        title: sec.title,
        body: sec.body || '',
      }))
    }
    this.setData({ sections })
  },

  onRemoveMedia(e) {
    const { nodeId, idx } = e.currentTarget.dataset
    const media = (this.data.media || []).filter(
      (item) => !(String(item.nodeId) === String(nodeId) && Number(item.idx) === Number(idx)),
    )
    if (this._workingDraft) {
      this._workingDraft.media = media.map((item) => ({
        nodeId: item.nodeId,
        idx: item.idx,
        maskedUrl: item.maskedUrl || '',
        previewUrl: item.previewUrl || '',
        caption: item.caption || '',
        sectionKey: item.sectionKey || '',
      }))
    }
    this.setData({ media })
  },

  buildDraftPayload() {
    if (this._workingDraft) {
      return {
        title: this._workingDraft.title || '',
        caseSummary: this._workingDraft.caseSummary || '',
        sections: (this._workingDraft.sections || []).map((sec) => ({
          key: sec.key,
          title: sec.title,
          body: sec.body,
        })),
        media: (this._workingDraft.media || []).map((item) => ({
          nodeId: item.nodeId,
          idx: item.idx,
          maskedUrl: item.maskedUrl || '',
          previewUrl: item.previewUrl || '',
          caption: item.caption || '',
          sectionKey: item.sectionKey || '',
        })),
        source: this._workingDraft.source || 'merchant_edit',
      }
    }
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
      source: 'merchant_edit',
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
        resubmit: data.resubmit != null ? Boolean(data.resubmit) : this.data.resubmit,
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


  async onGenerateCase() {
    if (!this.data.editable || this.data.generating) return
    this.setData({ generating: true })
    try {
      wx.showLoading({ title: '送审中', mask: true })
      await generateMerchantPublicCase(this.albumId, {
        draft: this.buildDraftPayload(),
      })
      wx.hideLoading()
      wx.showModal({
        title: '已送审',
        content: '通过后将出现在店页。',
        showCancel: false,
        success: () => wx.navigateBack({ delta: 1 }),
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '送审失败', icon: 'none' })
    } finally {
      this.setData({ generating: false })
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
    const isResubmit = this.data.resubmit
    try {
      wx.showLoading({ title: isResubmit ? '重新提交中' : '确认完工中', mask: true })
      await confirmAndCompleteMerchantCaseDraft(this.albumId, {
        draft: this.buildDraftPayload(),
      })
      wx.hideLoading()
      this._prePolishSnapshot = null
      this.setData({
        confirmed: true,
        editable: false,
        fromComplete: false,
        resubmit: false,
        showCompletePrimary: false,
        canRevertPolish: false,
      })
      await this.loadDraft()
      wx.showModal({
        title: isResubmit ? '已重新提交' : '已确认完工',
        content: isResubmit
          ? '已再次进入平台案例审核。通过后将出现在店页。'
          : '相册已完工。之后可从相册点「生成案例」送审；通过后会出现在店页。',
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
