const {
  fetchMerchantServiceAlbum,
  fetchMerchantAlbumFlow,
  saveMerchantServiceAlbum,
  completeMerchantFlowNode,
} = require('../../../../../services/merchant-service-album')
const { resolveLegacyStageIdsForFlowNode } = require('../../../../../constants/service-flow-nodes')
const { persistAlbumNodeImages } = require('../../../../../utils/media-upload')

const STAGE_SECTIONS = [
  { stageId: 'stage_1', title: '接车照片', tips: '里程表必拍；建议外观、故障部位' },
  { stageId: 'stage_2', title: '检测照片', tips: '故障点、读数、对比图' },
]

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    nodeId: '',
    nodeKind: '',
    nodeTitle: '',
    description: '',
    readOnly: false,
    saving: false,
    completing: false,
    note: '',
    sections: [],
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

  buildSections(album, node) {
    const stageIds = resolveLegacyStageIdsForFlowNode(node)
    const ids =
      node.kind === 'intake_inspection'
        ? STAGE_SECTIONS.map((s) => s.stageId)
        : stageIds.length
          ? stageIds
          : [node.legacyStageId].filter(Boolean)

    return ids.map((stageId) => {
      const meta = STAGE_SECTIONS.find((s) => s.stageId === stageId)
      const stageNode = (album.nodes || []).find((item) => item.id === stageId) || {
        id: stageId,
        title: meta ? meta.title : node.title,
        images: [],
      }
      return {
        stageId,
        title: meta ? meta.title : stageNode.title,
        tips: meta ? meta.tips : node.photoTips || '',
        images: (stageNode.images || []).map((img) => ({
          url: typeof img === 'string' ? img : img.url,
          caption: typeof img === 'object' ? img.caption || '' : '',
        })),
      }
    })
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
      wx.setNavigationBarTitle({ title: node.title || '拍照节点' })
      this.setData({
        status: 'ready',
        nodeKind: node.kind,
        nodeTitle: node.title,
        description: node.description || node.photoTips || '',
        readOnly: album.contentLocked || album.editable === false || node.status === 'completed',
        note: node.note || '',
        sections: this.buildSections(album, node),
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onSectionImagesChange(e) {
    if (this.data.readOnly) return
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const images = (e.detail && e.detail.images) || []
    const sections = this.data.sections.map((section, i) =>
      i === index ? { ...section, images } : section,
    )
    this.setData({ sections })
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  async persistPhotos() {
    const album = await fetchMerchantServiceAlbum(this.albumId)
    const sectionMap = {}
    this.data.sections.forEach((section) => {
      sectionMap[section.stageId] = section.images
    })
    let nodes = (album.nodes || []).map((node) => {
      if (!sectionMap[node.id]) return node
      return {
        ...node,
        images: sectionMap[node.id],
        status: sectionMap[node.id].length ? 'completed' : 'pending',
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
  },

  async onSaveDraft() {
    if (this.data.readOnly || this.data.saving) return
    this.setData({ saving: true })
    try {
      await this.persistPhotos()
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  async onConfirmStep() {
    if (this.data.readOnly || this.data.completing) return
    const totalPhotos = this.data.sections.reduce(
      (sum, section) => sum + (section.images || []).length,
      0,
    )
    if (totalPhotos < 1) {
      wx.showToast({ title: '请至少上传 1 张照片', icon: 'none' })
      return
    }
    if (this.data.nodeKind === 'intake_inspection' && !String(this.data.note || '').trim()) {
      wx.showToast({ title: '请填写检测说明', icon: 'none' })
      return
    }
    this.setData({ completing: true })
    try {
      await this.persistPhotos()
      const res = await completeMerchantFlowNode(this.albumId, this.nodeId, {
        note: this.data.note,
      })
      wx.showToast({ title: (res && res.message) || '本步已完成', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ completing: false })
    }
  },
})
