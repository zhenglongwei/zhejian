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
const {
  collectInspectionReportGaps,
  normalizeFinding,
} = require('../../../../utils/service-flow-docs')
const { persistAlbumNodeImages, uploadImage } = require('../../../../utils/media-upload')
const { MERCHANT_ALBUM_EDIT_PAGE } = require('../../../../utils/merchant-album-nav')

const STAGE_LABELS = {
  stage_1: {
    title: '接车照片',
    tips: '里程表必拍；外观、故障部位。每张写本图说明（如：里程 86420 公里）',
    captionPlaceholder: '本图说明（如：里程 86420 公里）',
  },
  stage_2: {
    title: '检测照片',
    tips: '故障点、读数、对比。每张写清部位；报告中还需补症状、结果、建议',
    captionPlaceholder: '检查部位/项目（如：机油液位、右前小连杆）',
  },
  stage_5: {
    title: '施工过程',
    tips: '拆装、新旧对比；每张写本图说明',
    captionPlaceholder: '本图说明（选填）',
  },
  stage_6: {
    title: '完工照片',
    tips: '试车、交车；每张写本图说明',
    captionPlaceholder: '本图说明（验收结论等，勿写金额）',
  },
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
    activeTitle: '',
    activeSummary: '',
    activeCategory: '',
    activeKind: '',
    showActive: false,
    activeIsPhoto: false,
    activeIsDoc: false,
    sections: [],
    docPayload: {},
    quoteLines: [],
    conclusion: '',
    confirmCopy: '',
    proxyProofImages: [],
    captionHint: '',
    autoSaveLabel: '',
    findings: [],
    chiefComplaint: '',
    allDone: false,
  },

  onLoad(options) {
    this.albumId = String(options.albumId || '').trim()
    this.setData({ albumId: this.albumId })
    this.bootstrap()
  },

  onShow() {
    // 选图/预览会触发 onShow；仅从「高级编辑」返回时才静默刷新，避免冲掉未保存本地图
    if (this._loadedOnce && this._reloadOnShow) {
      this._reloadOnShow = false
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

  buildSections(album, node) {
    const ids = resolveLegacyStageIdsForFlowNode(node)
    return ids.map((stageId) => {
      const meta = STAGE_LABELS[stageId] || { title: stageId, tips: '' }
      const stage = (album.nodes || []).find((n) => n.id === stageId) || { images: [] }
      return {
        stageId,
        title: meta.title,
        tips: meta.tips,
        captionPlaceholder: meta.captionPlaceholder || '本图说明',
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
      const active = progress.activeNode || null
      const activeIsPhoto = Boolean(
        active &&
          (active.nodeCategory === 'photo' ||
            (active.legacyStageIds && active.legacyStageIds.length) ||
            active.kind === 'intake_inspection' ||
            active.kind === 'work' ||
            active.kind === 'delivery_photos'),
      )
      const activeIsDoc = Boolean(active && active.document)
      const docPayload = (active && active.document && active.document.payload) || {}
      const completedSteps = (progress.completedSteps || []).map((step) => ({
        ...step,
        summary: step.summary || step.desc || '已完成',
      }))

      this.setData({
        status: 'ready',
        serviceName: album.serviceName || '服务相册',
        statusLabel: SERVICE_ALBUM_STATUS_LABEL[status] || status,
        statusVariant: SERVICE_ALBUM_STATUS_VARIANT[status] || 'default',
        readOnly,
        completedSteps,
        activeNode: active,
        activeTitle: (active && active.title) || '',
        activeSummary: (active && (active.description || active.summary)) || '',
        activeCategory: activeIsPhoto ? '拍照' : active ? '单据' : '',
        activeKind: (active && active.kind) || '',
        showActive: Boolean(active),
        activeIsPhoto,
        activeIsDoc,
        sections: activeIsPhoto && active ? this.buildSections(album, active) : [],
        docPayload,
        findings: Array.isArray(docPayload.findings)
          ? docPayload.findings.map((item) => normalizeFinding(item))
          : [],
        chiefComplaint: docPayload.chiefComplaint || '',
        quoteLines: Array.isArray(docPayload.lines) && docPayload.lines.length
          ? docPayload.lines
          : [{ name: '', note: '', priceHint: '' }],
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
        autoSaveLabel: '',
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
    if (!Number.isFinite(index)) return
    const images = (e.detail && e.detail.images) || []
    const sections = this.data.sections.map((section, i) =>
      i === index ? { ...section, images } : section,
    )
    this.setData({ sections, autoSaveLabel: '保存中…' }, () => {
      this.scheduleAutoSavePhotos()
    })
  },

  scheduleAutoSavePhotos() {
    if (this._photoSaveTimer) clearTimeout(this._photoSaveTimer)
    this._photoSaveTimer = setTimeout(() => {
      this.runAutoSavePhotos()
    }, 700)
  },

  async runAutoSavePhotos() {
    if (this.data.readOnly || this._photoSaving) return
    this._photoSaving = true
    try {
      await this.persistPhotos()
      this._album = await fetchMerchantServiceAlbum(this.albumId)
      this.setData({ autoSaveLabel: '已自动保存' })
    } catch (e) {
      this.setData({
        autoSaveLabel: (e && e.message) || '自动保存失败，请检查网络',
      })
    } finally {
      this._photoSaving = false
    }
  },

  onChiefComplaintInput(e) {
    this.setData({ chiefComplaint: e.detail.value })
  },

  onFindingFieldInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    if (!Number.isFinite(index) || !field) return
    const findings = this.data.findings.map((item, i) =>
      i === index ? { ...item, [field]: e.detail.value } : item,
    )
    this.setData({ findings })
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
    let nodes = (album.nodes || []).map((node) => {
      if (!sectionMap[node.id]) return node
      return {
        ...node,
        images: sectionMap[node.id],
        status: sectionMap[node.id].length ? 'completed' : 'pending',
        updatedAt: new Date().toISOString(),
      }
    })
    // 相册可能缺 stage 节点时补空壳，避免照片无法写入
    Object.keys(sectionMap).forEach((stageId) => {
      if (nodes.some((n) => n.id === stageId)) return
      nodes = nodes.concat([
        {
          id: stageId,
          title: (STAGE_LABELS[stageId] && STAGE_LABELS[stageId].title) || stageId,
          status: sectionMap[stageId].length ? 'completed' : 'pending',
          images: sectionMap[stageId],
          note: '',
          updatedAt: new Date().toISOString(),
        },
      ])
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
    this._album = { ...album, nodes: persisted }
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
    if (this._photoSaveTimer) {
      clearTimeout(this._photoSaveTimer)
      this._photoSaveTimer = null
    }
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
      return {
        ...base,
        chiefComplaint: this.data.chiefComplaint,
        findings: (this.data.findings || []).map((item) => normalizeFinding(item)),
        conclusion: this.data.conclusion,
      }
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
    if (kind === 'inspection_report') {
      const gaps = collectInspectionReportGaps(this.buildDocPayloadForSave())
      if (gaps.length) {
        wx.showModal({
          title: '检测报告未填完整',
          content: `${gaps.slice(0, 4).join('\n')}${gaps.length > 4 ? `\n…共 ${gaps.length} 项` : ''}`,
          showCancel: false,
          confirmText: '去补全',
        })
        return
      }
    }
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
    this._reloadOnShow = true
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
