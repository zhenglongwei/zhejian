const {
  fetchMerchantServiceAlbum,
  fetchMerchantAlbumFlow,
  saveMerchantServiceAlbum,
} = require('../../../../../services/merchant-service-album')
const { resolveLegacyStageIdForFlowNode } = require('../../../../../constants/service-flow-nodes')
const { persistAlbumNodeImages } = require('../../../../../utils/media-upload')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    nodeId: '',
    nodeTitle: '',
    photoTips: '',
    captionPlaceholder: '',
    readOnly: false,
    saving: false,
    stageNode: null,
    images: [],
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
      inspection: '拍完后可在下一节点「检测报告」一键生成',
      delivery_photos: '拍完后可在下一节点「维修报告」一键生成',
    }
    return map[kind] || ''
  },

  async loadNode() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const [album, flow] = await Promise.all([
        fetchMerchantServiceAlbum(this.albumId),
        fetchMerchantAlbumFlow(this.albumId),
      ])
      const node = (flow.flowNodes || []).find((item) => item.id === this.nodeId)
      if (!node) throw new Error('节点不存在')
      const stageId = resolveLegacyStageIdForFlowNode(node)
      const stageNode = (album.nodes || []).find((item) => item.id === stageId) || {
        id: stageId,
        title: node.title,
        images: [],
        note: '',
      }
      wx.setNavigationBarTitle({ title: node.title || '拍照节点' })
      this.setData({
        status: 'ready',
        nodeTitle: node.title,
        photoTips: node.photoTips || '',
        captionPlaceholder: node.captionPlaceholder || '本图说明',
        readOnly: album.contentLocked || album.editable === false,
        stageNode,
        images: (stageNode.images || []).map((img) => ({
          url: typeof img === 'string' ? img : img.url,
          caption: typeof img === 'object' ? img.caption || '' : '',
        })),
        generateHint: this.resolveGenerateHint(node.kind),
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onImagesChange(e) {
    if (this.data.readOnly) return
    const images = (e.detail && e.detail.images) || []
    this.setData({ images })
  },

  async onSave() {
    if (this.data.readOnly || this.data.saving) return
    this.setData({ saving: true })
    try {
      const album = await fetchMerchantServiceAlbum(this.albumId)
      const stageId = this.data.stageNode && this.data.stageNode.id
      const nodes = (album.nodes || []).map((node) => {
        if (node.id !== stageId) return node
        return {
          ...node,
          images: this.data.images,
          status: this.data.images.length ? 'completed' : 'pending',
          updatedAt: new Date().toISOString(),
        }
      })
      const { nodes: persisted } = await persistAlbumNodeImages(
        nodes.map((node) => ({
          id: node.id,
          title: node.title,
          status: node.status,
          images: node.images || [],
          note: node.note || '',
          comparePairRows: node.comparePairRows || [],
          updatedAt: node.updatedAt || new Date().toISOString(),
        })),
      )
      await saveMerchantServiceAlbum(this.albumId, { nodes: persisted })
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
