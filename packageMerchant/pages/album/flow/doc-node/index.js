const {
  fetchMerchantAlbumFlow,
  updateMerchantFlowNode,
  proxyConfirmMerchantFlowNode,
} = require('../../../../../services/merchant-service-album')
const { uploadImage } = require('../../../../../utils/media-upload')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    nodeId: '',
    nodeTitle: '',
    docType: '',
    statusLabel: '草稿',
    requiresConfirm: false,
    readOnly: false,
    saving: false,
    confirming: false,
    note: '',
    proxyProofImages: [],
    generateHint: '',
  },

  onLoad(options) {
    this.albumId = String(options.albumId || '').trim()
    this.nodeId = String(options.nodeId || '').trim()
    this.setData({ albumId: this.albumId, nodeId: this.nodeId })
    this.bootstrap()
  },

  async bootstrap() {
    if (!this.albumId || !this.nodeId) {
      this.setData({ status: 'error', errorMessage: '参数不完整' })
      return
    }
    await this.loadNode()
  },

  resolveGenerateHint(kind) {
    const map = {
      inspection_report: '由接车、检测照片一键生成（二期）',
      quote_confirm: '由检测报告生成（二期）',
      work_order: '由报价确认单生成（二期）',
      repair_report: '由全流程节点汇总生成（二期）',
      warranty: '由维修报告生成（二期）',
    }
    return map[kind] || '一期可先填写摘要，二期支持一键生成'
  },

  async loadNode() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const flow = await fetchMerchantAlbumFlow(this.albumId)
      const node = (flow.flowNodes || []).find((item) => item.id === this.nodeId)
      if (!node || !node.document) throw new Error('单据节点不存在')
      const doc = node.document
      wx.setNavigationBarTitle({ title: node.title || '单据节点' })
      this.setData({
        status: 'ready',
        nodeTitle: node.title,
        docType: doc.docType || node.kind,
        statusLabel: doc.statusLabel || '草稿',
        requiresConfirm: Boolean(doc.requiresConfirm),
        readOnly: !flow.editable,
        note: String((doc.payload && doc.payload.summary) || ''),
        proxyProofImages: (doc.proxyProofImages || []).map((url) => ({ url })),
        generateHint: this.resolveGenerateHint(node.kind),
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  async onSaveDraft() {
    if (this.data.readOnly || this.data.saving) return
    this.setData({ saving: true })
    try {
      await updateMerchantFlowNode(this.albumId, this.nodeId, {
        document: {
          status: 'draft',
          payload: { summary: this.data.note },
        },
      })
      wx.showToast({ title: '已保存草稿', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  onAddProxyProof() {
    if (this.data.readOnly) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: async (res) => {
        const file = (res.tempFiles && res.tempFiles[0]) || null
        if (!file || !file.tempFilePath) return
        try {
          wx.showLoading({ title: '上传中' })
          const uploaded = await uploadImage(file.tempFilePath)
          const url = uploaded && (uploaded.url || uploaded)
          if (!url) throw new Error('上传失败')
          this.setData({
            proxyProofImages: this.data.proxyProofImages.concat({ url }).slice(0, 3),
          })
        } catch (e) {
          wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
    })
  },

  onRemoveProxyProof(e) {
    const index = Number(e.currentTarget.dataset.index)
    const next = this.data.proxyProofImages.slice()
    next.splice(index, 1)
    this.setData({ proxyProofImages: next })
  },

  async onProxyConfirm() {
    if (this.data.readOnly || this.data.confirming) return
    this.setData({ confirming: true })
    try {
      await updateMerchantFlowNode(this.albumId, this.nodeId, {
        document: {
          status: 'pending_confirm',
          payload: { summary: this.data.note },
        },
      })
      const proof = this.data.proxyProofImages.map((item) => item.url).filter(Boolean)
      await proxyConfirmMerchantFlowNode(this.albumId, this.nodeId, {
        proxyProofImages: proof,
      })
      wx.showToast({ title: '已代确认', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },
})
