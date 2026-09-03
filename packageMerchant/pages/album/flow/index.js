const {
  fetchMerchantServiceAlbum,
  fetchMerchantAlbumFlow,
  completeMerchantServiceAlbum,
} = require('../../../../services/merchant-service-album')
const {
  SERVICE_ALBUM_STATUS,
  SERVICE_ALBUM_STATUS_LABEL,
  SERVICE_ALBUM_STATUS_VARIANT,
} = require('../../../../constants/service-album-status')
const {
  resolveFlowNodeCategoryLabel,
  resolveFlowNodeSummary,
  buildFlowNodeDetailPath,
} = require('../../../../utils/service-flow-display')
const { MERCHANT_ALBUM_EDIT_PAGE } = require('../../../../utils/merchant-album-nav')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    serviceName: '',
    statusLabel: '',
    statusVariant: 'default',
    flowNodes: [],
    readOnly: false,
    completing: false,
    completeHint: '',
  },

  onLoad(options) {
    this.albumId = String(options.albumId || '').trim()
    this.setData({ albumId: this.albumId })
    this.bootstrap()
  },

  onShow() {
    if (this._loadedOnce) {
      this.loadFlow({ silent: true })
    }
  },

  async bootstrap() {
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '缺少相册 ID' })
      return
    }
    await this.loadFlow()
    this._loadedOnce = true
  },

  decorateNodes(flowNodes = []) {
    return (flowNodes || []).map((node, index) => ({
      ...node,
      indexLabel: String(index + 1).padStart(2, '0'),
      categoryLabel: resolveFlowNodeCategoryLabel(node),
      summary: resolveFlowNodeSummary(node),
      isPhoto: Boolean(node.legacyStageId || node.nodeCategory === 'photo'),
      detailPath: buildFlowNodeDetailPath(this.albumId, node),
    }))
  },

  async loadFlow(options = {}) {
    const { silent = false } = options
    if (!silent) {
      this.setData({ status: 'loading', errorMessage: '' })
    }
    try {
      const [album, flow] = await Promise.all([
        fetchMerchantServiceAlbum(this.albumId),
        fetchMerchantAlbumFlow(this.albumId),
      ])
      const status = album.status || SERVICE_ALBUM_STATUS.DRAFT
      const readOnly = album.contentLocked || album.editable === false
      this.setData({
        status: 'ready',
        serviceName: album.serviceName || '服务相册',
        statusLabel: SERVICE_ALBUM_STATUS_LABEL[status] || status,
        statusVariant: SERVICE_ALBUM_STATUS_VARIANT[status] || 'default',
        flowNodes: this.decorateNodes(flow.flowNodes || []),
        readOnly,
        completeHint: this.buildCompleteHint(flow.flowNodes || []),
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  buildCompleteHint(flowNodes = []) {
    const pendingConfirm = flowNodes.find(
      (node) =>
        node.document &&
        node.document.requiresConfirm &&
        node.document.status !== 'confirmed',
    )
    if (pendingConfirm) {
      return `建议先完成「${pendingConfirm.title}」确认，仍可标记完工`
    }
    return ''
  },

  onRetry() {
    this.bootstrap()
  },

  onOpenNode(e) {
    const path = String((e.currentTarget.dataset && e.currentTarget.dataset.path) || '')
    if (!path) return
    wx.navigateTo({ url: path })
  },

  onOpenLegacyEdit() {
    wx.navigateTo({
      url: `${MERCHANT_ALBUM_EDIT_PAGE}?albumId=${encodeURIComponent(this.albumId)}`,
    })
  },

  async onCompleteAlbum() {
    if (this.data.readOnly || this.data.completing) return
    const hint = this.data.completeHint
    if (hint) {
      wx.showModal({
        title: '仍有建议项未完成',
        content: hint,
        confirmText: '仍要完工',
        success: (res) => {
          if (res.confirm) this.submitComplete()
        },
      })
      return
    }
    this.submitComplete()
  },

  async submitComplete() {
    this.setData({ completing: true })
    try {
      await completeMerchantServiceAlbum(this.albumId)
      wx.showToast({ title: '已标记完工', icon: 'success' })
      await this.loadFlow({ silent: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ completing: false })
    }
  },
})
