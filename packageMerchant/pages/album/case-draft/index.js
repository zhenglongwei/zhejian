const {
  fetchMerchantCaseDraft,
  saveMerchantCaseDraft,
  polishMerchantCaseDraft,
  confirmAndCompleteMerchantCaseDraft,
  exportMerchantCaseDraftCopy,
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant-service-album')

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
    title: '',
    caseSummary: '',
    sections: [],
    media: [],
    confirmed: false,
  },

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

  async loadDraft() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const data = await fetchMerchantCaseDraft(this.albumId)
      const draft = data.draft || {}
      this.setData({
        status: 'normal',
        albumId: this.albumId,
        editable: Boolean(data.editable),
        confirmed: Boolean(data.confirmed || (draft && draft.confirmedAt)),
        title: draft.title || '',
        caseSummary: draft.caseSummary || '',
        sections: (draft.sections || []).map((sec) => ({ ...sec })),
        media: this.mapMedia(draft.media || []),
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    this.loadDraft()
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value || '' })
  },

  onSummaryInput(e) {
    this.setData({ caseSummary: e.detail.value || '' })
  },

  onSectionInput(e) {
    const { key } = e.currentTarget.dataset
    const value = e.detail.value || ''
    const sections = (this.data.sections || []).map((sec) =>
      sec.key === key ? { ...sec, body: value } : sec,
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
      sections: this.data.sections,
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
    this.setData({ polishing: true })
    try {
      wx.showLoading({ title: 'AI 润色中', mask: true })
      const data = await polishMerchantCaseDraft(this.albumId, {
        draft: this.buildDraftPayload(),
      })
      wx.hideLoading()
      const draft = data.draft || {}
      this.setData({
        title: draft.title || this.data.title,
        caseSummary: draft.caseSummary || this.data.caseSummary,
        sections: (draft.sections || []).map((sec) => ({ ...sec })),
        media: this.mapMedia(draft.media || this.data.media),
        confirmed: false,
      })
      wx.showToast({ title: '已润色，可继续修改', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '润色失败', icon: 'none' })
    } finally {
      this.setData({ polishing: false })
    }
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
      this.setData({
        title: draft.title || '',
        caseSummary: draft.caseSummary || '',
        sections: draft.sections || [],
        media: this.mapMedia(draft.media || []),
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
      this.setData({ confirmed: true, editable: false, fromComplete: false })
      await this.loadDraft()
      wx.showModal({
        title: '已确认并完工',
        content: '公开配图已开始脱敏。可复制确认稿发自媒体（平台不代发），或返回相册继续邀请车主。',
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
          sections: this.data.sections,
        })
      }
      if (!text) {
        wx.showToast({ title: '暂无可复制文案', icon: 'none' })
        return
      }
      await wx.setClipboardData({ data: text })
      wx.showToast({ title: '已复制文案', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
    }
  },
})
