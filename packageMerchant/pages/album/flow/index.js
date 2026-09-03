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
  buildFlowNodeDetailPath,
} = require('../../../../utils/service-flow-display')
const {
  buildFlowProgressView,
  resolveActiveNodeCta,
} = require('../../../../utils/service-flow-progress')
const { MERCHANT_ALBUM_EDIT_PAGE } = require('../../../../utils/merchant-album-nav')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    serviceName: '',
    statusLabel: '',
    statusVariant: 'default',
    readOnly: false,
    completing: false,
    completeHint: '',
    progressLabel: '',
    lockedHint: '',
    completedSteps: [],
    activeNode: null,
    allDone: false,
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

  decorateActiveNode(node) {
    if (!node) return null
    const cta = resolveActiveNodeCta(node)
    return {
      ...node,
      summary: node.summary || '',
      detailPath: buildFlowNodeDetailPath(this.albumId, node),
      ctaText: cta.text,
      isPhoto: cta.type === 'photo',
    }
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
      const flowNodes = (flow.flowNodes || []).map((node) => ({
        ...node,
        summary: node.summary || '',
      }))
      const progress = flow.progress || buildFlowProgressView(flowNodes)
      const activeNode = this.decorateActiveNode(progress.activeNode)
      const currentStep = progress.currentStep || 0
      const totalSteps = progress.totalSteps || flowNodes.length

      this.setData({
        status: 'ready',
        serviceName: album.serviceName || '服务相册',
        statusLabel: SERVICE_ALBUM_STATUS_LABEL[status] || status,
        statusVariant: SERVICE_ALBUM_STATUS_VARIANT[status] || 'default',
        readOnly,
        completedSteps: progress.completedSteps || [],
        activeNode,
        allDone: Boolean(progress.allDone),
        progressLabel:
          totalSteps > 0 ? `第 ${Math.min(currentStep, totalSteps)} / ${totalSteps} 步` : '',
        lockedHint: progress.lockedHint || '',
        completeHint: this.buildCompleteHint(flowNodes),
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

  onOpenActive() {
    const path = this.data.activeNode && this.data.activeNode.detailPath
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
