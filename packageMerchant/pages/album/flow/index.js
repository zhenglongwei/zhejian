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
  collectDeliveryPhotoDraftGaps,
  normalizeFinding,
  mapFindingRows,
} = require('../../../../utils/service-flow-docs')
const { persistAlbumNodeImages, uploadImage } = require('../../../../utils/media-upload')
const { MERCHANT_ALBUM_EDIT_PAGE } = require('../../../../utils/merchant-album-nav')

const STAGE_LABELS = {
  stage_2: {
    title: '接车与检测照片',
    tips: '里程、外观、故障点均可拍。每张图下方须写清部位、现象、结果与处理建议（里程可写在部位，如：里程表 86420 公里）',
    captionPlaceholder: '检查部位/项目',
    findingMode: true,
  },
  stage_5: {
    title: '施工过程',
    tips: '拆装、新旧对比；每张写本图说明',
    captionPlaceholder: '本图说明（选填）',
    findingMode: false,
  },
  stage_6: {
    title: '完工照片',
    tips: '试车、交车；每张写本图说明。本步同时填写质保要点',
    captionPlaceholder: '本图说明（验收结论等，勿写金额）',
    findingMode: false,
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
    isIntakePhotoStep: false,
    isDeliveryPhotoStep: false,
    photoConfirmLabel: '确认本步并继续',
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
    warrantyPeriod: '',
    warrantyScope: '',
    warrantyExclusions: '',
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

  mapStageImages(stage) {
    return ((stage && stage.images) || []).map((img) => ({
      url: typeof img === 'string' ? img : img.url,
      caption: typeof img === 'object' ? img.caption || '' : '',
      id: typeof img === 'object' ? img.id || '' : '',
    }))
  },

  /** 接车与检测：统一入口；存量 stage_1 并入 stage_2 展示 */
  collectIntakeImages(album) {
    const stage1 = (album.nodes || []).find((n) => n.id === 'stage_1')
    const stage2 = (album.nodes || []).find((n) => n.id === 'stage_2')
    return this.mapStageImages(stage1).concat(this.mapStageImages(stage2))
  },

  buildSections(album, node, photoDraft = {}) {
    const draftFindings = Array.isArray(photoDraft.findings) ? photoDraft.findings : []

    if (node && node.kind === 'intake_inspection') {
      const meta = STAGE_LABELS.stage_2
      const images = this.collectIntakeImages(album)
      return [
        {
          stageId: 'stage_2',
          title: meta.title,
          tips: meta.tips,
          captionPlaceholder: meta.captionPlaceholder,
          findingMode: true,
          images,
          findings: mapFindingRows(images, draftFindings),
        },
      ]
    }

    const ids = resolveLegacyStageIdsForFlowNode(node)
    return ids.map((stageId) => {
      const meta = STAGE_LABELS[stageId] || { title: stageId, tips: '', findingMode: false }
      const stage = (album.nodes || []).find((n) => n.id === stageId) || { images: [] }
      const images = this.mapStageImages(stage)
      return {
        stageId,
        title: meta.title,
        tips: meta.tips,
        captionPlaceholder: meta.captionPlaceholder || '本图说明',
        findingMode: Boolean(meta.findingMode),
        images,
        findings: meta.findingMode ? mapFindingRows(images, draftFindings) : [],
      }
    })
  },

  collectFindingsFromSections(sections = this.data.sections) {
    const findingSection = (sections || []).find((s) => s.findingMode)
    if (!findingSection) return []
    return (findingSection.findings || []).map((item) => normalizeFinding(item))
  },

  buildPhotoDraftPayload() {
    const kind = this.data.activeNode && this.data.activeNode.kind
    if (kind === 'intake_inspection') {
      return {
        chiefComplaint: this.data.chiefComplaint,
        conclusion: this.data.conclusion,
        findings: this.collectFindingsFromSections(),
      }
    }
    if (kind === 'delivery_photos') {
      return {
        warrantyPeriod: this.data.warrantyPeriod,
        warrantyScope: this.data.warrantyScope,
        warrantyExclusions: this.data.warrantyExclusions,
        confirmCopy: this.data.confirmCopy,
      }
    }
    return {}
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
      const photoDraft = (active && active.photoDraft) || {}
      const isIntakePhotoStep = Boolean(activeIsPhoto && active && active.kind === 'intake_inspection')
      const isDeliveryPhotoStep = Boolean(
        activeIsPhoto && active && active.kind === 'delivery_photos',
      )
      const completedSteps = (progress.completedSteps || []).map((step) => ({
        ...step,
        summary: step.summary || step.desc || '已完成',
      }))

      let findings = []
      let chiefComplaint = ''
      let conclusion = ''
      let confirmCopy = ''
      let warrantyPeriod = ''
      let warrantyScope = ''
      let warrantyExclusions = ''
      let sections = []

      if (activeIsPhoto && active) {
        sections = this.buildSections(album, active, photoDraft)
        if (isIntakePhotoStep) {
          chiefComplaint = photoDraft.chiefComplaint || ''
          conclusion = photoDraft.conclusion || ''
          findings = this.collectFindingsFromSections(sections)
        }
        if (isDeliveryPhotoStep) {
          warrantyPeriod = photoDraft.warrantyPeriod || '以门店公示为准'
          warrantyScope = photoDraft.warrantyScope || '本次已确认施工项目'
          warrantyExclusions =
            photoDraft.warrantyExclusions || '外力撞击、涉水、未按约定使用等除外'
          confirmCopy =
            photoDraft.confirmCopy || '本人确认上述施工与交车状态，并知悉质保条款。'
        }
      } else if (activeIsDoc) {
        findings = Array.isArray(docPayload.findings)
          ? docPayload.findings.map((item) => normalizeFinding(item))
          : []
        chiefComplaint = docPayload.chiefComplaint || ''
        conclusion = docPayload.conclusion || ''
        confirmCopy = docPayload.confirmCopy || ''
        warrantyPeriod = docPayload.warrantyPeriod || ''
        warrantyScope = docPayload.warrantyScope || ''
        warrantyExclusions = docPayload.warrantyExclusions || ''
      }

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
        isIntakePhotoStep,
        isDeliveryPhotoStep,
        photoConfirmLabel:
          isIntakePhotoStep || isDeliveryPhotoStep
            ? '确认本步并生成单据'
            : '确认本步并继续',
        sections,
        docPayload,
        findings,
        chiefComplaint,
        quoteLines: Array.isArray(docPayload.lines) && docPayload.lines.length
          ? docPayload.lines
          : [{ name: '', note: '', priceHint: '' }],
        conclusion,
        confirmCopy,
        warrantyPeriod,
        warrantyScope,
        warrantyExclusions,
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

  syncFindingsWithImages(prevFindings = [], images = []) {
    const prevByKey = {}
    prevFindings.forEach((item) => {
      const key = item.imageId || item.id || item.url
      if (key) prevByKey[key] = item
    })
    return (images || []).map((img) => {
      const url = typeof img === 'string' ? img : img.url || ''
      const id = typeof img === 'object' ? img.id || '' : ''
      const caption = typeof img === 'object' ? img.caption || '' : ''
      const prev = prevByKey[id] || prevByKey[url] || {}
      return normalizeFinding({
        ...prev,
        url,
        imageId: id || prev.imageId || '',
        caption,
        partName: prev.partName || caption || '',
      })
    })
  },

  onSectionImagesChange(e) {
    if (this.data.readOnly) return
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const images = (e.detail && e.detail.images) || []
    const sections = this.data.sections.map((section, i) => {
      if (i !== index) return section
      const next = { ...section, images }
      if (section.findingMode) {
        next.findings = this.syncFindingsWithImages(section.findings || [], images)
      }
      return next
    })
    const patch = { sections, autoSaveLabel: '保存中…' }
    if (this.data.isIntakePhotoStep) {
      patch.findings = this.collectFindingsFromSections(sections)
    }
    this.setData(patch, () => {
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
      this.resyncSectionsAfterPersist()
      await this.persistPhotoDraft()
      this.setData({ autoSaveLabel: '已自动保存' })
    } catch (e) {
      this.setData({
        autoSaveLabel: (e && e.message) || '自动保存失败，请检查网络',
      })
    } finally {
      this._photoSaving = false
    }
  },

  /** 上传后用落库 URL 回写 sections/findings，避免草稿仍持本地临时路径 */
  resyncSectionsAfterPersist() {
    const album = this._album
    const active = this.data.activeNode
    if (!album || !active || !this.data.activeIsPhoto) return
    const prevFindings = this.collectFindingsFromSections()
    const sections = this.buildSections(album, active, { findings: prevFindings })
    const patch = { sections }
    if (this.data.isIntakePhotoStep) {
      patch.findings = this.collectFindingsFromSections(sections)
    }
    this.setData(patch)
  },

  async persistPhotoDraft() {
    const kind = this.data.activeNode && this.data.activeNode.kind
    if (kind !== 'intake_inspection' && kind !== 'delivery_photos') return
    await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
      photoDraft: this.buildPhotoDraftPayload(),
    })
  },

  onChiefComplaintInput(e) {
    if (this.data.isIntakePhotoStep) {
      this.setData({ chiefComplaint: e.detail.value, autoSaveLabel: '保存中…' }, () => {
        this.scheduleAutoSavePhotos()
      })
      return
    }
    this.setData({ chiefComplaint: e.detail.value })
  },

  onSectionFindingFieldInput(e) {
    if (this.data.readOnly) return
    const sectionIndex = Number(e.currentTarget.dataset.sectionIndex)
    const findingIndex = Number(e.currentTarget.dataset.findingIndex)
    const field = e.currentTarget.dataset.field
    if (!Number.isFinite(sectionIndex) || !Number.isFinite(findingIndex) || !field) return
    const sections = this.data.sections.map((section, i) => {
      if (i !== sectionIndex) return section
      const findings = (section.findings || []).map((item, fi) => {
        if (fi !== findingIndex) return item
        const next = { ...item, [field]: e.detail.value }
        if (field === 'partName') next.caption = e.detail.value
        return next
      })
      const images = (section.images || []).map((img, ii) => {
        if (ii !== findingIndex) return img
        if (field === 'partName') return { ...img, caption: e.detail.value }
        return img
      })
      return { ...section, findings, images }
    })
    this.setData(
      {
        sections,
        findings: this.collectFindingsFromSections(sections),
        autoSaveLabel: '保存中…',
      },
      () => {
        this.scheduleAutoSavePhotos()
      },
    )
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
    const patch = { conclusion: e.detail.value }
    if (this.data.isIntakePhotoStep) {
      patch.autoSaveLabel = '保存中…'
      this.setData(patch, () => this.scheduleAutoSavePhotos())
      return
    }
    this.setData(patch)
  },

  onConfirmCopyInput(e) {
    const patch = { confirmCopy: e.detail.value }
    if (this.data.isDeliveryPhotoStep) {
      patch.autoSaveLabel = '保存中…'
      this.setData(patch, () => this.scheduleAutoSavePhotos())
      return
    }
    this.setData(patch)
  },

  onWarrantyFieldInput(e) {
    const field = e.currentTarget.dataset.field
    if (!field) return
    if (this.data.isDeliveryPhotoStep) {
      this.setData({ [field]: e.detail.value, autoSaveLabel: '保存中…' }, () => {
        this.scheduleAutoSavePhotos()
      })
      return
    }
    this.setData({ [field]: e.detail.value })
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
      // 发现项部位回写到 caption，便于过程图列表展示
      if (section.findingMode) {
        sectionMap[section.stageId] = (section.images || []).map((img, i) => {
          const finding = (section.findings || [])[i] || {}
          return {
            ...img,
            caption: finding.partName || img.caption || '',
          }
        })
      } else {
        sectionMap[section.stageId] = section.images
      }
    })
    // 接车与检测统一写入 stage_2，清空旧 stage_1
    if (this.data.activeNode && this.data.activeNode.kind === 'intake_inspection') {
      sectionMap.stage_1 = []
      if (!sectionMap.stage_2) sectionMap.stage_2 = []
    }
    let nodes = (album.nodes || []).map((node) => {
      if (!Object.prototype.hasOwnProperty.call(sectionMap, node.id)) return node
      return {
        ...node,
        images: sectionMap[node.id],
        status: sectionMap[node.id].length ? 'completed' : 'pending',
        updatedAt: new Date().toISOString(),
      }
    })
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
      if (section.findingMode) return
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

    const kind = this.data.activeNode && this.data.activeNode.kind
    if (kind === 'intake_inspection') {
      const draftPayload = {
        chiefComplaint: this.data.chiefComplaint,
        findings: this.collectFindingsFromSections(),
        conclusion: this.data.conclusion,
      }
      const gaps = collectInspectionReportGaps(draftPayload)
      if (gaps.length) {
        wx.showModal({
          title: '请先补全检测内容',
          content: `${gaps.slice(0, 4).join('\n')}${gaps.length > 4 ? `\n…共 ${gaps.length} 项` : ''}`,
          showCancel: false,
          confirmText: '去补全',
        })
        return
      }
    }
    if (kind === 'delivery_photos') {
      const gaps = collectDeliveryPhotoDraftGaps({
        warrantyPeriod: this.data.warrantyPeriod,
        warrantyScope: this.data.warrantyScope,
      })
      if (gaps.length) {
        wx.showModal({
          title: '请先补全质保信息',
          content: gaps.join('\n'),
          showCancel: false,
          confirmText: '去补全',
        })
        return
      }
    }

    const run = async () => {
      this.setData({ confirming: true })
      try {
        await this.persistPhotos()
        this.resyncSectionsAfterPersist()
        await this.persistPhotoDraft()
        const res = await completeMerchantFlowNode(
          this.albumId,
          this.data.activeNode.id,
          this.buildPhotoDraftPayload(),
        )
        wx.showToast({ title: (res && res.message) || '本步已完成', icon: 'success' })
        await this.loadFlow({ silent: true })
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
      } finally {
        this.setData({ confirming: false })
      }
    }

    if (kind === 'intake_inspection' || kind === 'delivery_photos') {
      await run()
      return
    }

    const missing = this.countMissingCaptions()
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
      return {
        ...base,
        confirmCopy: this.data.confirmCopy || base.confirmCopy,
        warrantyPeriod: this.data.warrantyPeriod || base.warrantyPeriod,
        warrantyScope: this.data.warrantyScope || base.warrantyScope,
        warrantyExclusions: this.data.warrantyExclusions || base.warrantyExclusions,
      }
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
