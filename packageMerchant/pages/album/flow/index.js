const {
  fetchMerchantServiceAlbum,
  fetchMerchantAlbumFlow,
  saveMerchantServiceAlbum,
  completeMerchantServiceAlbum,
  completeMerchantFlowNode,
  updateMerchantFlowNode,
  proxyConfirmMerchantFlowNode,
} = require('../../../../services/merchant-service-album')
const {
  SERVICE_ALBUM_STATUS,
  SERVICE_ALBUM_STATUS_LABEL,
  SERVICE_ALBUM_STATUS_VARIANT,
} = require('../../../../constants/service-album-status')
const { resolveLegacyStageIdsForFlowNode } = require('../../../../constants/service-flow-nodes')
const { buildFlowProgressView } = require('../../../../utils/service-flow-progress')
const { persistAlbumNodeImages, uploadImage } = require('../../../../utils/media-upload')
const { MERCHANT_ALBUM_EDIT_PAGE } = require('../../../../utils/merchant-album-nav')

const STAGE_LABELS = {
  stage_1: { title: '接车照片', tips: '里程表必拍；外观、故障部位；每张写本图说明' },
  stage_2: { title: '检测照片', tips: '故障点、读数、对比；每张写本图说明' },
  stage_5: { title: '施工过程', tips: '拆装、新旧对比；每张写本图说明' },
  stage_6: { title: '完工照片', tips: '试车、交车；每张写本图说明' },
}

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
    saving: false,
    confirming: false,
    progressLabel: '',
    lockedHint: '',
    completedSteps: [],
    expandedCompletedId: '',
    activeNode: null,
    activeIsPhoto: false,
    activeIsDoc: false,
    sections: [],
    docPayload: {},
    quoteLines: [],
    conclusion: '',
    confirmCopy: '',
    proxyProofImages: [],
    captionHint: '',
    allDone: false,
  },

  onLoad(options) {
    this.albumId = String(options.albumId || '').trim()
    this.setData({ albumId: this.albumId })
    this.bootstrap()
  },

  onShow() {
    if (this._loadedOnce) this.loadFlow({ silent: true })
  },

  async bootstrap() {
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '缺少相册 ID' })
      return
    }
    await this.loadFlow()
    this._loadedOnce = true
  },

  buildSections(album, node) {
    const ids = resolveLegacyStageIdsForFlowNode(node)
    return ids.map((stageId) => {
      const meta = STAGE_LABELS[stageId] || { title: stageId, tips: '' }
      const stage = (album.nodes || []).find((n) => n.id === stageId) || { images: [] }
      return {
        stageId,
        title: meta.title,
        tips: meta.tips,
        images: (stage.images || []).map((img) => ({
          url: typeof img === 'string' ? img : img.url,
          caption: typeof img === 'object' ? img.caption || '' : '',
          id: typeof img === 'object' ? img.id || '' : '',
        })),
      }
    })
  },

  async loadFlow(options = {}) {
    const { silent = false } = options
    if (!silent) this.setData({ status: 'loading', errorMessage: '' })
    try {
      const [album, flow] = await Promise.all([
        fetchMerchantServiceAlbum(this.albumId),
        fetchMerchantAlbumFlow(this.albumId),
      ])
      this._album = album
      const status = album.status || SERVICE_ALBUM_STATUS.DRAFT
      const readOnly = album.contentLocked || album.editable === false
      const flowNodes = flow.flowNodes || []
      const progress = flow.progress || buildFlowProgressView(flowNodes)
      const active = progress.activeNode
      const activeIsPhoto = Boolean(
        active &&
          (active.nodeCategory === 'photo' ||
            (active.legacyStageIds && active.legacyStageIds.length)),
      )
      const activeIsDoc = Boolean(active && active.document)
      const docPayload = (active && active.document && active.document.payload) || {}

      this.setData({
        status: 'ready',
        serviceName: album.serviceName || '服务相册',
        statusLabel: SERVICE_ALBUM_STATUS_LABEL[status] || status,
        statusVariant: SERVICE_ALBUM_STATUS_VARIANT[status] || 'default',
        readOnly,
        completedSteps: progress.completedSteps || [],
        activeNode: active,
        activeIsPhoto,
        activeIsDoc,
        sections: activeIsPhoto && active ? this.buildSections(album, active) : [],
        docPayload,
        quoteLines: Array.isArray(docPayload.lines) ? docPayload.lines : [{ name: '', note: '', priceHint: '' }],
        conclusion: docPayload.conclusion || '',
        confirmCopy: docPayload.confirmCopy || '',
        proxyProofImages: ((active && active.document && active.document.proxyProofImages) || []).map(
          (url) => ({ url }),
        ),
        progressLabel:
          progress.totalSteps > 0
            ? `第 ${Math.min(progress.currentStep, progress.totalSteps)} / ${progress.totalSteps} 步`
            : '',
        lockedHint: progress.lockedHint || '完成当前步骤后，将自动出现下一步',
        captionHint: '',
        allDone: Boolean(progress.allDone),
      })
    } catch (e) {
      this.setData({ status: 'error', errorMessage: (e && e.message) || '加载失败' })
    }
  },

  onRetry() {
    this.bootstrap()
  },

  onCompletedTap(e) {
    const id = String((e.detail && e.detail.id) || '')
    this.setData({
      expandedCompletedId: this.data.expandedCompletedId === id ? '' : id,
    })
  },

  onSectionImagesChange(e) {
    if (this.data.readOnly) return
    const index = Number(e.currentTarget.dataset.index)
    const images = (e.detail && e.detail.images) || []
    const sections = this.data.sections.map((section, i) =>
      i === index ? { ...section, images } : section,
    )
    this.setData({ sections })
  },

  onConclusionInput(e) {
    this.setData({ conclusion: e.detail.value })
  },

  onConfirmCopyInput(e) {
    this.setData({ confirmCopy: e.detail.value })
  },

  onQuoteLineInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    const quoteLines = this.data.quoteLines.map((line, i) =>
      i === index ? { ...line, [field]: e.detail.value } : line,
    )
    this.setData({ quoteLines })
  },

  onAddQuoteLine() {
    this.setData({
      quoteLines: this.data.quoteLines.concat([{ name: '', note: '', priceHint: '' }]),
    })
  },

  async persistPhotos() {
    const album = this._album || (await fetchMerchantServiceAlbum(this.albumId))
    const sectionMap = {}
    this.data.sections.forEach((section) => {
      sectionMap[section.stageId] = section.images
    })
    const nodes = (album.nodes || []).map((node) => {
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

  countMissingCaptions() {
    let missing = 0
    this.data.sections.forEach((section) => {
      ;(section.images || []).forEach((img) => {
        if (!String(img.caption || '').trim()) missing += 1
      })
    })
    return missing
  },

  async onConfirmPhotoStep() {
    if (this.data.readOnly || this.data.confirming) return
    const total = this.data.sections.reduce((sum, s) => sum + (s.images || []).length, 0)
    if (total < 1) {
      wx.showToast({ title: '请至少上传 1 张照片', icon: 'none' })
      return
    }
    const missing = this.countMissingCaptions()
    const run = async () => {
      this.setData({ confirming: true })
      try {
        await this.persistPhotos()
        const res = await completeMerchantFlowNode(this.albumId, this.data.activeNode.id, {})
        wx.showToast({ title: (res && res.message) || '本步已完成', icon: 'success' })
        await this.loadFlow({ silent: true })
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
      } finally {
        this.setData({ confirming: false })
      }
    }
    if (missing > 0) {
      wx.showModal({
        title: '建议补全本图说明',
        content: `还有 ${missing} 张未写说明，建议每张写一句。仍可继续。`,
        confirmText: '仍要继续',
        success: (res) => {
          if (res.confirm) run()
        },
      })
      return
    }
    await run()
  },

  buildDocPayloadForSave() {
    const kind = this.data.activeNode && this.data.activeNode.kind
    const base = { ...(this.data.docPayload || {}) }
    if (kind === 'inspection_report') {
      return { ...base, conclusion: this.data.conclusion }
    }
    if (kind === 'quote_confirm') {
      return {
        ...base,
        lines: this.data.quoteLines.filter((l) => String(l.name || '').trim()),
        confirmCopy:
          this.data.confirmCopy ||
          '确认按上述方案施工；费用以到店实际结算为准；配件说明以门店告知为准。',
      }
    }
    if (kind === 'repair_report') {
      return { ...base, confirmCopy: this.data.confirmCopy || base.confirmCopy }
    }
    if (kind === 'work_order') {
      return base
    }
    return base
  },

  async onSaveDocDraft() {
    if (this.data.readOnly || this.data.saving) return
    this.setData({ saving: true })
    try {
      await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        document: {
          status: this.data.activeNode.document.status || 'draft',
          payload: this.buildDocPayloadForSave(),
        },
      })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  async onMarkWorkOrderDone() {
    if (this.data.readOnly || this.data.confirming) return
    this.setData({ confirming: true })
    try {
      await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        document: {
          status: 'draft',
          payload: this.buildDocPayloadForSave(),
        },
        markComplete: true,
      })
      wx.showToast({ title: '工单已确认，可开始施工', icon: 'success' })
      await this.loadFlow({ silent: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  onAddProxyProof() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: async (res) => {
        const file = (res.tempFiles && res.tempFiles[0]) || null
        if (!file) return
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

  async onProxyConfirm() {
    if (this.data.readOnly || this.data.confirming) return
    const kind = this.data.activeNode && this.data.activeNode.kind
    if (kind === 'quote_confirm') {
      const lines = this.data.quoteLines.filter((l) => String(l.name || '').trim())
      if (!lines.length) {
        wx.showToast({ title: '请至少填写一行报价项目', icon: 'none' })
        return
      }
    }
    this.setData({ confirming: true })
    try {
      await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        document: {
          status: 'pending_confirm',
          payload: this.buildDocPayloadForSave(),
        },
      })
      await proxyConfirmMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        proxyProofImages: this.data.proxyProofImages.map((p) => p.url).filter(Boolean),
        document: { payload: this.buildDocPayloadForSave() },
      })
      wx.showToast({ title: '已代确认', icon: 'success' })
      await this.loadFlow({ silent: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  onOpenLegacyEdit() {
    wx.navigateTo({
      url: `${MERCHANT_ALBUM_EDIT_PAGE}?albumId=${encodeURIComponent(this.albumId)}`,
    })
  },

  async onCompleteAlbum() {
    if (this.data.readOnly || this.data.completing) return
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
