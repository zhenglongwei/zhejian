const {
  fetchMerchantOrderAlbum,
  saveMerchantOrderAlbum,
  switchMerchantOrderAlbumTemplate,
} = require('../../../../services/order-album')
const { fetchMerchantProfile, MERCHANT_STATUS } = require('../../../../services/merchant')
const {
  listOrderAlbumTemplateOptions,
  TEMPLATE_SOURCE,
} = require('../../../../services/order-album-template')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    orderId: '',
    templateId: '',
    templateName: '',
    templateSource: 'auto',
    templateOptions: [],
    templatePickerIndex: 0,
    switching: false,
    completeness: null,
    summaryRows: [],
    nodes: [],
    storeNote: '',
    saving: false,
    uploadPrivacyHint:
      '原图供订单履约与用户查看；公开案例须用户授权并脱敏。请勿上传车牌、手机号、证件等敏感信息。',
  },

  onLoad(options) {
    this.orderId = options.orderId || ''
    this.setData({ templateOptions: listOrderAlbumTemplateOptions() })
    if (!this.orderId) {
      this.setData({
        status: 'error',
        errorMessage: '订单信息缺失',
      })
      return
    }
    this.initPage()
  },

  async initPage() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      this.setData({
        status: 'error',
        errorMessage: '请先完成商家入驻',
      })
      return
    }
    this.loadAlbum()
  },

  syncTemplatePickerIndex(templateId) {
    const { templateOptions } = this.data
    const index = templateOptions.findIndex((item) => item.id === templateId)
    return index >= 0 ? index : 0
  },

  applyAlbumState(album) {
    this.setData({
      status: 'normal',
      orderId: this.orderId,
      templateId: album.templateId || '',
      templateName: album.templateName || '—',
      templateSource: album.templateSource || TEMPLATE_SOURCE.AUTO,
      templatePickerIndex: this.syncTemplatePickerIndex(album.templateId),
      completeness: album.completeness || null,
      summaryRows: album.summaryRows || [],
      nodes: album.nodes || [],
      storeNote: album.storeNote || '',
    })
  },

  async loadAlbum() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const album = await fetchMerchantOrderAlbum(this.orderId)
      this.applyAlbumState(album)
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    this.loadAlbum()
  },

  onTemplateChange(e) {
    const index = Number(e.detail.value)
    const picked = this.data.templateOptions[index]
    if (!picked || picked.id === this.data.templateId) {
      this.setData({ templatePickerIndex: this.syncTemplatePickerIndex(this.data.templateId) })
      return
    }

    wx.showModal({
      title: '切换相册模板',
      content: `将切换为「${picked.name}」模板。已上传图片会保留在同节点上，节点完整度将重新计算。`,
      confirmText: '确认切换',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) {
          this.setData({
            templatePickerIndex: this.syncTemplatePickerIndex(this.data.templateId),
          })
          return
        }
        this.doSwitchTemplate(picked.id, index)
      },
    })
  },

  async doSwitchTemplate(templateId, pickerIndex) {
    if (this.data.switching) return
    this.setData({ switching: true })
    try {
      wx.showLoading({ title: '切换中', mask: true })
      const album = await switchMerchantOrderAlbumTemplate(this.orderId, templateId)
      wx.hideLoading()
      this.applyAlbumState(album)
      this.setData({ templatePickerIndex: pickerIndex })
      wx.showToast({ title: '已切换模板', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      this.setData({
        templatePickerIndex: this.syncTemplatePickerIndex(this.data.templateId),
      })
      wx.showToast({
        title: (e && e.message) || '切换失败',
        icon: 'none',
      })
    } finally {
      this.setData({ switching: false })
    }
  },

  onNodeImages(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const nodes = this.data.nodes.slice()
    nodes[index].images = (e.detail && e.detail.images) || []
    this.setData({ nodes })
  },

  onNodeNoteChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const nodes = this.data.nodes.slice()
    nodes[index].note = (e.detail && e.detail.value) || ''
    this.setData({ nodes })
  },

  async onSave() {
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      wx.showLoading({ title: '保存中', mask: true })
      const album = await saveMerchantOrderAlbum(this.orderId, {
        nodes: this.data.nodes,
        storeNote: this.data.storeNote,
        templateId: this.data.templateId,
        templateSource: this.data.templateSource,
      })
      wx.hideLoading()
      wx.showToast({ title: '已保存', icon: 'success' })
      this.setData({
        completeness: album.completeness || this.data.completeness,
      })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({
        title: (e && e.message) || '保存失败',
        icon: 'none',
      })
    } finally {
      this.setData({ saving: false })
    }
  },
})
