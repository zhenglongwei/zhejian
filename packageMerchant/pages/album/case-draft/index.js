const {
  fetchMerchantCaseDraft,
  saveMerchantCaseDraft,
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant-service-album')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    editable: false,
    saving: false,
    title: '',
    sections: [],
    media: [],
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '服务相册信息缺失' })
      return
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

  async loadDraft() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const data = await fetchMerchantCaseDraft(this.albumId)
      const draft = data.draft || {}
      this.setData({
        status: 'normal',
        albumId: this.albumId,
        editable: Boolean(data.editable),
        title: draft.title || '',
        sections: (draft.sections || []).map((sec) => ({ ...sec })),
        media: draft.media || [],
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

  async onSave(confirm) {
    if (!this.data.editable || this.data.saving) return
    this.setData({ saving: true })
    try {
      const data = await saveMerchantCaseDraft(this.albumId, {
        confirm: Boolean(confirm),
        draft: {
          title: this.data.title,
          sections: this.data.sections,
          media: this.data.media,
        },
      })
      const draft = data.draft || {}
      this.setData({
        title: draft.title || '',
        sections: draft.sections || [],
        media: draft.media || [],
        editable: Boolean(data.editable),
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
})
