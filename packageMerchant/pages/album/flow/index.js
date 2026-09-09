const {
  fetchMerchantServiceAlbum,
  fetchMerchantAlbumFlow,
  saveMerchantServiceAlbum,
  completeMerchantServiceAlbum,
  completeMerchantFlowNode,
  updateMerchantFlowNode,
  proxyConfirmMerchantFlowNode,
  deliverMerchantFlowNode,
  insertMerchantAddonPlan,
  cancelMerchantAddonPlan,
} = require('../../../../services/merchant-service-album')
const {
  SERVICE_ALBUM_STATUS,
  SERVICE_ALBUM_STATUS_LABEL,
  SERVICE_ALBUM_STATUS_VARIANT,
} = require('../../../../constants/service-album-status')
const {
  resolveLegacyStageIdsForFlowNode,
  FINDING_RESULT,
  FINDING_RESULT_OPTIONS,
  FINDING_ADVICE_NONE,
  QUOTE_CONFIRM_COPY,
  REPAIR_CONFIRM_COPY,
  isValidFindingResult,
  findingAdviceRequired,
} = require('../../../../constants/service-flow-nodes')
const { buildFlowProgressView } = require('../../../../utils/service-flow-progress')
const {
  collectInspectionReportGaps,
  collectDeliveryPhotoDraftGaps,
  collectWorkPhotoDraftGaps,
  collectQuoteConfirmGaps,
  normalizeFinding,
  normalizeWorkFinding,
  workFindingHasPhoto,
  WORK_IMAGES_MAX,
  normalizeQuoteLine,
  mapFindingRows,
  sumQuoteAmounts,
  buildQuoteLinesFromFindings,
  resolveWarrantyNotes,
  isVagueWarrantyPeriod,
} = require('../../../../utils/service-flow-docs')
const { persistAlbumNodeImages, uploadImage } = require('../../../../utils/media-upload')

/** 已完成步骤「查看」：单据走 service-doc-sheet；拍照步仍用缩略图 */
function buildSheetMetaLine(payload = {}, album = {}) {
  const parts = []
  const dateText = String(payload.reportDate || '').trim()
  if (dateText) parts.push(dateText.slice(0, 10))
  const vehicle = [payload.vehicleBrand, payload.vehicleSeries].filter(Boolean).join(' ').trim()
  const albumVehicle = String((album && album.vehicleDisplay) || '').trim()
  if (vehicle) parts.push(vehicle)
  else if (albumVehicle) parts.push(albumVehicle)
  const mileage = String(payload.mileageText || '').trim()
  if (mileage) parts.push(mileage)
  return parts.join(' · ')
}

/** 商家时间线：步号写在标题上，不用顶部「第 n / 总步数」 */
function withFlowStepOrdinal(title, stepNo) {
  const t = String(title || '').trim()
  const n = Number(stepNo)
  if (!t || !Number.isFinite(n) || n < 1) return t
  if (/^第\s*\d+\s*步/.test(t)) return t
  return `第${n}步 · ${t}`
}

function mapCompletedStepPreview(step, node, album = {}) {
  const base = {
    ...step,
    summary: (step && step.summary) || (step && step.desc) || '已完成',
    detailKind: 'empty',
  }
  if (!node) return base
  const kind = node.kind || ''
  const payload = (node.document && node.document.payload) || {}
  const summary = base.summary || node.summary || '已完成'
  const storeName = String((album && album.storeName) || '').trim()
  const metaLine = buildSheetMetaLine(payload, album)

  if (kind === 'intake_inspection' || kind === 'work' || kind === 'delivery_photos') {
    const previewImages = Array.isArray(node.previewImages) ? node.previewImages : []
    return {
      ...base,
      kind,
      detailKind: 'photos',
      summary,
      previewImages,
      photoCount: Number(node.photoCount) || previewImages.length,
      chiefComplaint:
        kind === 'intake_inspection'
          ? String((node.photoDraft && node.photoDraft.chiefComplaint) || '')
          : '',
    }
  }

  if (kind === 'inspection_report') {
    const findings = Array.isArray(payload.findings)
      ? payload.findings
          .map((item, index) => {
            const row = normalizeFinding(item)
            return {
              ...row,
              listKey: row.url || `${row.partName || 'f'}_${index}`,
            }
          })
          .filter((row) => row.url || row.partName)
      : []
    return {
      ...base,
      kind,
      detailKind: 'doc_sheet',
      summary,
      sheetDoc: {
        kind,
        title: node.title || '检测报告',
        statusLabel: summary,
        storeName,
        metaLine,
        styleVariant: 'evidence',
        chiefComplaint: String(payload.chiefComplaint || ''),
        conclusion: String(payload.conclusion || ''),
        findings,
      },
    }
  }

  if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
    const lines = Array.isArray(payload.lines)
      ? payload.lines.map((line) => normalizeQuoteLine(line)).filter((row) => String(row.name || '').trim())
      : []
    const total = sumQuoteAmounts(lines)
    const sheetTitle =
      node.insertedReason === 'addon'
        ? '施工中新发现'
        : node.title || '方案确认'
    const statusLabel =
      String((node.document && node.document.status) || '') === 'cancelled'
        ? '门店已取消'
        : summary === '草稿'
          ? ''
          : summary
    const cancelReason = String((node.document && node.document.cancelReason) || '').trim()
    return {
      ...base,
      kind,
      detailKind: 'doc_sheet',
      summary: cancelReason ? `${statusLabel}：${cancelReason}` : statusLabel,
      sheetDoc: {
        kind,
        title: sheetTitle,
        statusLabel,
        storeName,
        metaLine,
        styleVariant: 'document',
        lines,
        totalAmountLabel: `合计 ¥${total.toFixed(2)}`,
        confirmCopy: statusLabel === '门店已取消' ? '' : QUOTE_CONFIRM_COPY,
        cancelled: statusLabel === '门店已取消',
        cancelReason,
      },
    }
  }

  if (kind === 'work_order') {
    const items = Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.workItems)
        ? payload.workItems
        : []
    const mapped = items.map((row) => ({
      name: String((row && row.name) || ''),
      brand: String((row && row.brand) || ''),
      amount: row && row.amount != null ? row.amount : '',
      note: String((row && row.note) || ''),
    }))
    const total = mapped.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
    return {
      ...base,
      kind,
      detailKind: 'doc_sheet',
      summary,
      sheetDoc: {
        kind,
        title: node.title || '工单',
        statusLabel: summary === '草稿' ? '已确认' : summary,
        storeName,
        metaLine,
        styleVariant: 'document',
        items: mapped,
        totalAmountLabel: `合计 ¥${total.toFixed(2)}`,
      },
    }
  }

  if (kind === 'repair_report') {
    const workItems = Array.isArray(payload.workItems)
      ? payload.workItems
      : Array.isArray(payload.items)
        ? payload.items
        : []
    const mapped = workItems.map((row) => ({
      name: String((row && row.name) || ''),
      brand: String((row && row.brand) || ''),
      amount: row && row.amount != null ? row.amount : '',
    }))
    const total =
      payload.totalAmount != null
        ? Number(payload.totalAmount) || 0
        : mapped.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
    return {
      ...base,
      kind,
      detailKind: 'doc_sheet',
      summary,
      sheetDoc: {
        kind,
        title: node.title || '完工确认',
        statusLabel: summary === '草稿' ? '' : summary,
        storeName,
        metaLine,
        styleVariant: 'document',
        workItems: mapped,
        totalAmountLabel: `合计 ¥${total.toFixed(2)}`,
        deliveryPhotos: Array.isArray(payload.deliveryPhotos) ? payload.deliveryPhotos : [],
        warrantyPeriod: String(payload.warrantyPeriod || ''),
        warrantyNotes: resolveWarrantyNotes(payload),
        confirmCopy: REPAIR_CONFIRM_COPY,
      },
    }
  }

  return { ...base, kind, summary }
}

const STAGE_LABELS = {
  stage_2: {
    title: '接车与检测照片',
    tips: '里程、外观、故障点均可拍；点选检查结果，需处理时写建议',
    captionPlaceholder: '检查部位',
    findingMode: true,
    findingKind: 'inspection',
  },
  stage_5: {
    title: '施工过程',
    tips: '按维修项留证；同一部位可拍多张（最多 6 张）',
    captionPlaceholder: '说明（选填）',
    findingMode: true,
    findingKind: 'work',
  },
  stage_6: {
    title: '交车证据',
    tips: '整车外观必选；其他交车图可从施工图勾选（不重复存档）',
    captionPlaceholder: '',
    findingMode: false,
    findingKind: '',
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
    isWorkPhotoStep: false,
    quoteTotalLabel: '',
    photoConfirmLabel: '确认并继续',
    sections: [],
    expandedFindingKey: '',
    findingResultOptions: FINDING_RESULT_OPTIONS,
    docPayload: {},
    quoteLines: [],
    quoteTotalLabel: '合计 ¥0.00',
    quoteNodeId: '',
    docStatus: '',
    showCombinedPlan: false,
    quotePendingOwner: false,
    confirmAwaitingOwner: false,
    isAddonQuote: false,
    showCancelAddonModal: false,
    cancelAddonReason: '',
    conclusion: '',
    confirmCopy: '',
    proxyProofImages: [],
    captionHint: '',
    autoSaveLabel: '',
    findings: [],
    chiefComplaint: '',
    warrantyPeriod: '',
    warrantyNotes: '',
    allDone: false,
    needManualComplete: false,
    workImagePool: [],
    deliveryExteriorUrl: '',
    deliveryPickMode: '',
  },

  onLoad(options) {
    this.albumId = String(options.albumId || '').trim()
    this.setData({ albumId: this.albumId })
    this.bootstrap()
  },

  async bootstrap() {
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '缺少相册 ID' })
      return
    }
    await this.loadFlow()
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

  collectMergedWorkDraftFindings(flowNodes = [], activeNode = null, photoDraft = {}) {
    const byKey = {}
    const put = (raw) => {
      const item = normalizeFinding(raw)
      const key = item.imageId || item.url
      if (!key) return
      const prev = byKey[key]
      if (!prev) {
        byKey[key] = item
        return
      }
      byKey[key] = {
        ...prev,
        ...item,
        partName: item.partName || prev.partName,
        caption: item.caption || prev.caption,
      }
    }
    ;(flowNodes || []).forEach((node) => {
      if (!node || node.kind !== 'work') return
      ;((node.photoDraft && node.photoDraft.findings) || []).forEach(put)
    })
    ;((photoDraft && photoDraft.findings) || []).forEach(put)
    ;((activeNode && activeNode.photoDraft && activeNode.photoDraft.findings) || []).forEach(put)
    return Object.keys(byKey).map((k) => byKey[k])
  },

  resolveRelatedWorkOrder(flowNodes = [], activeNode = null) {
    if (!activeNode) return null
    if (activeNode.parentNodeId) {
      const parent = (flowNodes || []).find((n) => n && n.id === activeNode.parentNodeId)
      if (parent && parent.kind === 'work_order') return parent
    }
    const sorted = (flowNodes || [])
      .slice()
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    const idx = sorted.findIndex((n) => n && n.id === activeNode.id)
    for (let i = idx - 1; i >= 0; i -= 1) {
      if (sorted[i] && sorted[i].kind === 'work_order') return sorted[i]
    }
    return null
  },

  seedPendingWorkParts(findings = [], flowNodes = [], activeNode = null) {
    const order = this.resolveRelatedWorkOrder(flowNodes, activeNode)
    const items =
      (order &&
        order.document &&
        order.document.payload &&
        order.document.payload.items) ||
      []
    if (!items.length) return findings
    const used = new Set(
      (findings || [])
        .map((row) => String((row && row.partName) || '').trim())
        .filter(Boolean),
    )
    const pending = items
      .map((row) => normalizeQuoteLine(row))
      .filter((row) => row.name && !used.has(row.name))
      .map((row) => ({
        partName: row.name,
        url: '',
        caption: '',
        imageId: '',
        images: [],
        result: '',
        advice: '',
        pendingPhoto: true,
      }))
    return (findings || []).concat(pending)
  },

  flattenWorkSectionImages(findings = []) {
    const out = []
    ;(findings || []).forEach((raw) => {
      const item = normalizeWorkFinding(raw)
      item.images.forEach((img) => {
        out.push({
          url: img.url,
          imageId: img.imageId || '',
          caption: '',
        })
      })
    })
    return out
  },

  collectAllWorkImages(album = {}, flowNodes = []) {
    const byUrl = {}
    const put = (url, partName = '') => {
      const key = String(url || '').trim()
      if (!key || byUrl[key]) return
      byUrl[key] = {
        url: key,
        partName: String(partName || '').trim(),
        selected: false,
      }
    }
    ;((album && album.nodes) || []).forEach((node) => {
      if (!node || node.id !== 'stage_5') return
      ;(node.images || []).forEach((img) => {
        const url = typeof img === 'string' ? img : img.url
        put(url, typeof img === 'object' ? img.caption || '' : '')
      })
    })
    ;(flowNodes || []).forEach((node) => {
      if (!node || node.kind !== 'work') return
      ;((node.photoDraft && node.photoDraft.findings) || []).forEach((raw) => {
        const item = normalizeWorkFinding(raw)
        item.images.forEach((img) => put(img.url, item.partName))
      })
    })
    return Object.keys(byUrl).map((k) => byUrl[k])
  },

  buildSections(album, node, photoDraft = {}, flowNodes = []) {
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
          findingKind: 'inspection',
          images,
          findings: mapFindingRows(images, draftFindings),
        },
      ]
    }

    const ids = resolveLegacyStageIdsForFlowNode(node)
    return ids.map((stageId) => {
      const meta = STAGE_LABELS[stageId] || {
        title: stageId,
        tips: '',
        findingMode: false,
        findingKind: '',
      }
      const stage = (album.nodes || []).find((n) => n.id === stageId) || { images: [] }
      const images = this.mapStageImages(stage)
      const findingMode = Boolean(meta.findingMode)
      const findingKind = meta.findingKind || (findingMode ? 'inspection' : '')
      let findings = []
      if (findingMode) {
        const mergedDraft =
          findingKind === 'work'
            ? this.collectMergedWorkDraftFindings(flowNodes, node, photoDraft)
            : draftFindings
        findings = mapFindingRows(images, mergedDraft, {
          mode: findingKind === 'work' ? 'work' : 'inspection',
        })
        if (findingKind === 'work') {
          findings = this.seedPendingWorkParts(findings, flowNodes, node)
        }
      }
      return {
        stageId,
        title: meta.title,
        tips: meta.tips,
        captionPlaceholder: meta.captionPlaceholder || '本图说明',
        findingMode,
        findingKind,
        images,
        findings,
      }
    })
  },

  collectFindingsFromSections(sections = this.data.sections) {
    const findingSection = (sections || []).find((s) => s.findingMode)
    if (!findingSection) return []
    const kind = findingSection.findingKind || 'inspection'
    return (findingSection.findings || [])
      .map((item) =>
        kind === 'work' ? normalizeWorkFinding(item) : normalizeFinding(item),
      )
      .filter((item) => (kind === 'work' ? item.images.length || item.partName : item.url))
  },

  countFindingMissingFields(item = {}, findingKind = 'inspection') {
    if (findingKind === 'work') {
      const row = normalizeWorkFinding(item)
      let missing = 0
      if (!row.partName) missing += 1
      if (!row.images.length) missing += 1
      return missing
    }
    const row = normalizeFinding(item)
    let missing = 0
    if (!row.partName) missing += 1
    if (!row.result || !isValidFindingResult(row.result)) missing += 1
    else if (findingAdviceRequired(row.result) && !row.advice) missing += 1
    return missing
  },

  decorateFinding(item = {}, expanded = false, listKey = '', findingKind = 'inspection') {
    if (findingKind === 'work') {
      const row = normalizeWorkFinding(item)
      const missing = this.countFindingMissingFields(row, findingKind)
      const hasPhoto = row.images.length > 0
      return {
        ...row,
        findingKind: 'work',
        pendingPhoto: !hasPhoto,
        listKey: listKey || row.imageId || row.url || `pending-${row.partName || ''}`,
        expanded: Boolean(expanded),
        complete: hasPhoto && missing === 0,
        summaryText: row.partName || '待填写',
        completenessLabel: !hasPhoto
          ? '待拍照'
          : missing === 0
            ? row.caption || `${row.images.length} 张`
            : '缺部位',
        adviceRequired: false,
        resultTone: '',
        resultToneClass: '',
        evidenceRowClass: '',
        resultOptions: [],
      }
    }
    const row = normalizeFinding(item)
    const missing = this.countFindingMissingFields(row, findingKind)
    const resultOptions = FINDING_RESULT_OPTIONS.map((opt) => ({
      ...opt,
      selected: row.result === opt.value,
    }))
    const resultTone =
      row.result === FINDING_RESULT.OK
        ? 'ok'
        : row.result === FINDING_RESULT.WATCH
          ? 'watch'
          : row.result === FINDING_RESULT.ACTION
            ? 'action'
            : ''
    return {
      ...row,
      findingKind: 'inspection',
      listKey: listKey || row.imageId || row.url || '',
      expanded: Boolean(expanded),
      complete: missing === 0,
      summaryText: row.partName || '待填写',
      completenessLabel: missing === 0 ? row.result || '已齐' : `缺 ${missing} 项`,
      adviceRequired: findingAdviceRequired(row.result),
      resultTone,
      resultToneClass: resultTone
        ? `merchant-flow-page__result-tone-${resultTone}`
        : '',
      evidenceRowClass: resultTone
        ? `merchant-flow-page__evidence-row--${resultTone}`
        : '',
      resultOptions,
    }
  },

  decorateSections(sections = [], expandedFindingKey = this.data.expandedFindingKey) {
    return (sections || []).map((section, sectionIndex) => {
      if (!section.findingMode) return section
      const findingKind = section.findingKind || 'inspection'
      const findings = (section.findings || []).map((item, findingIndex) => {
        const key = `${sectionIndex}:${findingIndex}`
        const listKey = `idx-${sectionIndex}-${findingIndex}`
        return this.decorateFinding(item, key === expandedFindingKey, listKey, findingKind)
      })
      return { ...section, findings }
    })
  },

  setSectionsWithFindings(sections, extra = {}, expandKey) {
    const expandedFindingKey =
      expandKey === undefined ? this.data.expandedFindingKey : expandKey
    const decorated = this.decorateSections(sections, expandedFindingKey)
    const patch = {
      sections: decorated,
      expandedFindingKey,
      ...extra,
    }
    if (this.data.isIntakePhotoStep) {
      patch.findings = this.collectFindingsFromSections(decorated)
    }
    this.setData(patch)
  },

  findFirstIncompleteFindingKey(sections = this.data.sections) {
    for (let si = 0; si < (sections || []).length; si += 1) {
      const section = sections[si]
      if (!section || !section.findingMode) continue
      const findingKind = section.findingKind || 'inspection'
      const list = section.findings || []
      for (let fi = 0; fi < list.length; fi += 1) {
        if (this.countFindingMissingFields(list[fi], findingKind) > 0) {
          return `${si}:${fi}`
        }
      }
    }
    return ''
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
    if (kind === 'work') {
      return {
        findings: this.collectFindingsFromSections(),
      }
    }
    if (kind === 'delivery_photos') {
      const exterior = String(this.data.deliveryExteriorUrl || '').trim()
      return {
        warrantyPeriod: this.data.warrantyPeriod,
        warrantyNotes: this.data.warrantyNotes,
        confirmCopy: REPAIR_CONFIRM_COPY,
        deliveryExteriorUrl: exterior,
        selectedDeliveryUrls: (this.data.workImagePool || [])
          .filter((row) => row && row.selected && row.url && row.url !== exterior)
          .map((row) => row.url),
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
      this._flowNodes = flowNodes
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
      const isWorkPhotoStep = Boolean(activeIsPhoto && active && active.kind === 'work')
      const nodeById = {}
      flowNodes.forEach((node) => {
        if (node && node.id) nodeById[node.id] = node
      })
      const completedSteps = (progress.completedSteps || []).map((step, index) => {
        const preview = mapCompletedStepPreview(step, nodeById[step.id], album)
        return {
          ...preview,
          title: withFlowStepOrdinal(preview.title || step.title, index + 1),
        }
      })

      let findings = []
      let chiefComplaint = ''
      let conclusion = ''
      let confirmCopy = ''
      let warrantyPeriod = ''
      let warrantyNotes = ''
      let sections = []
      let quoteLines = [{ name: '', amount: '', note: '' }]
      let expandedFindingKey = ''
      let workImagePool = []
      let deliveryExteriorUrl = ''
      let deliveryPickMode = ''

      if (activeIsPhoto && active) {
        sections = this.buildSections(album, active, photoDraft, flowNodes)
        if (isIntakePhotoStep) {
          chiefComplaint = photoDraft.chiefComplaint || ''
          conclusion = photoDraft.conclusion || ''
          findings = this.collectFindingsFromSections(sections)
        }
        if (isDeliveryPhotoStep) {
          warrantyPeriod = String(photoDraft.warrantyPeriod || '').trim()
          warrantyNotes = resolveWarrantyNotes(photoDraft)
          confirmCopy =
            photoDraft.confirmCopy || '本人确认上述施工与交车状态，并知悉质保条款。'
          deliveryExteriorUrl = String(photoDraft.deliveryExteriorUrl || '').trim()
          // 兼容：旧数据仅写在 stage_6、未记引用字段
          if (!deliveryExteriorUrl) {
            const stage6 = ((album && album.nodes) || []).find((n) => n && n.id === 'stage_6')
            const first = stage6 && Array.isArray(stage6.images) && stage6.images[0]
            const fallbackUrl =
              typeof first === 'string' ? first : first && first.url ? first.url : ''
            if (fallbackUrl) deliveryExteriorUrl = String(fallbackUrl).trim()
          }
          const selectedSet = {}
          ;(photoDraft.selectedDeliveryUrls || []).forEach((url) => {
            if (url && url !== deliveryExteriorUrl) selectedSet[url] = true
          })
          workImagePool = this.collectAllWorkImages(album, flowNodes).map((row) => ({
            ...row,
            selected: Boolean(selectedSet[row.url]),
            isExterior: row.url === deliveryExteriorUrl,
          }))
          // 兼容旧草稿：仅有 selectedDeliveryUrls 无外观时，不自动猜外观
        }
        const keepKey = this.data.expandedFindingKey
        const parts = String(keepKey || '').split(':')
        const si = Number(parts[0])
        const fi = Number(parts[1])
        if (
          keepKey &&
          Number.isFinite(si) &&
          Number.isFinite(fi) &&
          sections[si] &&
          sections[si].findings &&
          sections[si].findings[fi]
        ) {
          expandedFindingKey = keepKey
        }
        sections = this.decorateSections(sections, expandedFindingKey)
      } else if (activeIsDoc) {
        findings = Array.isArray(docPayload.findings)
          ? docPayload.findings.map((item) => {
              const row = normalizeFinding(item)
              const resultTone =
                row.result === FINDING_RESULT.OK
                  ? 'ok'
                  : row.result === FINDING_RESULT.WATCH
                    ? 'watch'
                    : row.result === FINDING_RESULT.ACTION
                      ? 'action'
                      : ''
              return {
                ...row,
                resultTone,
                resultToneClass: resultTone
                  ? `merchant-flow-page__result-tone-${resultTone}`
                  : '',
                evidenceRowClass: resultTone
                  ? `merchant-flow-page__evidence-row--${resultTone}`
                  : '',
                adviceRequired: findingAdviceRequired(row.result),
                resultOptions: FINDING_RESULT_OPTIONS.map((opt) => ({
                  ...opt,
                  selected: row.result === opt.value,
                })),
              }
            })
          : []
        chiefComplaint = docPayload.chiefComplaint || ''
        conclusion = docPayload.conclusion || ''
        confirmCopy =
          docPayload.confirmCopy ||
          (active.kind === 'quote_confirm'
            ? '本人同意按上述项目施工，费用以本单为准。'
            : docPayload.confirmCopy || '')
        warrantyPeriod = docPayload.warrantyPeriod || ''
        warrantyNotes = resolveWarrantyNotes(docPayload)
        if (Array.isArray(docPayload.lines) && docPayload.lines.length) {
          quoteLines = docPayload.lines.map((line) => normalizeQuoteLine(line))
        }
        if (active.kind === 'inspection_report') {
          const quoteNode = flowNodes.find(
            (n) => n && n.kind === 'quote_confirm' && !n.insertedReason,
          )
          const quotePayload =
            (quoteNode && quoteNode.document && quoteNode.document.payload) || {}
          const fromQuote = Array.isArray(quotePayload.lines)
            ? quotePayload.lines.map((line) => normalizeQuoteLine(line))
            : []
          const hasNamed = fromQuote.some((row) => String(row.name || '').trim())
          quoteLines = hasNamed
            ? fromQuote
            : buildQuoteLinesFromFindings(findings).map((line) => normalizeQuoteLine(line))
          if (!quoteLines.length) {
            quoteLines = [{ name: '', amount: '', note: '' }]
          }
          confirmCopy =
            quotePayload.confirmCopy ||
            '本人同意按上述项目施工，费用以本单为准。'
          this._quoteNodeId = (quoteNode && quoteNode.id) || ''
        } else {
          this._quoteNodeId = active.kind === 'quote_confirm' ? (active.id || '') : ''
        }
      }

      const showCombinedPlan = Boolean(active && active.kind === 'inspection_report')
      const docStatus = (active && active.document && active.document.status) || ''
      const isConfirmDoc = Boolean(
        active &&
          (active.kind === 'quote_confirm' ||
            active.kind === 'addon_quote_confirm' ||
            active.kind === 'repair_report'),
      )
      const confirmAwaitingOwner = Boolean(isConfirmDoc && docStatus === 'pending_confirm')
      const quotePendingOwner = confirmAwaitingOwner
      const isAddonQuote = Boolean(
        active && active.kind === 'quote_confirm' && active.insertedReason === 'addon',
      )
      const rawSummary = showCombinedPlan
        ? ''
        : (active && (active.photoTips || active.summary)) || ''
      const activeSummary = rawSummary === '草稿' ? '' : rawSummary
      const activeTitleRaw = showCombinedPlan
        ? '核对报告与方案'
        : isAddonQuote
          ? '施工中新发现'
          : (active && active.title) || ''
      const activeTitle = active
        ? withFlowStepOrdinal(activeTitleRaw, completedSteps.length + 1)
        : ''

      this.setData({
        status: 'ready',
        serviceName: album.serviceName || '服务相册',
        statusLabel: SERVICE_ALBUM_STATUS_LABEL[status] || status,
        statusVariant: SERVICE_ALBUM_STATUS_VARIANT[status] || 'default',
        readOnly,
        completedSteps,
        activeNode: active,
        activeTitle,
        activeSummary,
        activeCategory: activeIsPhoto ? '拍照' : active ? '单据' : '',
        activeKind: (active && active.kind) || '',
        showActive: Boolean(active),
        activeIsPhoto,
        activeIsDoc,
        isIntakePhotoStep,
        isDeliveryPhotoStep,
        isWorkPhotoStep,
        photoConfirmLabel: '确认并继续',
        sections,
        expandedFindingKey,
        docPayload,
        findings,
        chiefComplaint,
        quoteLines,
        quoteTotalLabel: `合计 ¥${sumQuoteAmounts(quoteLines).toFixed(2)}`,
        quoteNodeId: this._quoteNodeId || '',
        docStatus,
        showCombinedPlan,
        quotePendingOwner,
        confirmAwaitingOwner,
        isAddonQuote,
        conclusion,
        confirmCopy,
        warrantyPeriod,
        warrantyNotes,
        proxyProofImages: ((active && active.document && active.document.proxyProofImages) || []).map(
          (url) => ({ url }),
        ),
        progressLabel: '',
        lockedHint: progress.lockedHint || '完成当前步骤后，将自动出现下一步',
        captionHint: '',
        autoSaveLabel: '',
        allDone: Boolean(progress.allDone),
        needManualComplete: Boolean(
          progress.allDone &&
            !readOnly &&
            status !== SERVICE_ALBUM_STATUS.COMPLETED &&
            status !== 'published',
        ),
        workImagePool,
        deliveryExteriorUrl,
        deliveryPickMode,
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

  syncFindingsWithImages(prevFindings = [], images = [], findingKind = 'inspection') {
    const prevByKey = {}
    prevFindings.forEach((item) => {
      const key = item.imageId || item.id || item.url
      if (key) prevByKey[key] = item
    })
    return (images || []).map((img) => {
      const url = typeof img === 'string' ? img : img.url || ''
      const id = typeof img === 'object' ? img.id || '' : ''
      const imgCaption = typeof img === 'object' ? img.caption || '' : ''
      const prev = prevByKey[id] || prevByKey[url] || {}
      if (findingKind === 'work') {
        const partName = String(prev.partName || '').trim()
        let caption = String(prev.caption || '').trim()
        if (!caption && imgCaption && imgCaption !== partName) caption = imgCaption
        return normalizeFinding({
          ...prev,
          url,
          imageId: id || prev.imageId || '',
          partName,
          caption,
        })
      }
      return normalizeFinding({
        ...prev,
        url,
        imageId: id || prev.imageId || '',
        caption: imgCaption,
        partName: prev.partName || imgCaption || '',
      })
    })
  },

  onSectionImagesChange(e) {
    if (this.data.readOnly) return
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const images = (e.detail && e.detail.images) || []
    const prevLen =
      (this.data.sections[index] && this.data.sections[index].images
        ? this.data.sections[index].images.length
        : 0) || 0
    const sections = this.data.sections.map((section, i) => {
      if (i !== index) return section
      const next = { ...section, images }
      if (section.findingMode) {
        next.findings = this.syncFindingsWithImages(
          section.findings || [],
          images,
          section.findingKind || 'inspection',
        )
      }
      return next
    })
    let expandKey = this.data.expandedFindingKey
    if (sections[index] && sections[index].findingMode && images.length > prevLen) {
      expandKey = `${index}:${images.length - 1}`
    }
    this.setSectionsWithFindings(
      sections,
      { autoSaveLabel: '保存中…' },
      expandKey,
    )
    this.scheduleAutoSavePhotos()
  },

  onToggleFinding(e) {
    const sectionIndex = Number(e.currentTarget.dataset.sectionIndex)
    const findingIndex = Number(e.currentTarget.dataset.findingIndex)
    if (!Number.isFinite(sectionIndex) || !Number.isFinite(findingIndex)) return
    const key = `${sectionIndex}:${findingIndex}`
    const nextKey = this.data.expandedFindingKey === key ? '' : key
    this.setSectionsWithFindings(this.data.sections, {}, nextKey)
  },

  onRemoveFinding(e) {
    if (this.data.readOnly) return
    const sectionIndex = Number(e.currentTarget.dataset.sectionIndex)
    const findingIndex = Number(e.currentTarget.dataset.findingIndex)
    if (!Number.isFinite(sectionIndex) || !Number.isFinite(findingIndex)) return
    const section = this.data.sections[sectionIndex]
    if (!section) return
    const target = (section.findings || [])[findingIndex] || {}
    const sections = this.data.sections.map((row, i) => {
      if (i !== sectionIndex) return row
      if (row.findingKind === 'work') {
        const findings = (row.findings || []).filter((_, idx) => idx !== findingIndex)
        return {
          ...row,
          findings,
          images: this.flattenWorkSectionImages(findings),
        }
      }
      if (!target.url) {
        return {
          ...row,
          findings: (row.findings || []).filter((_, idx) => idx !== findingIndex),
        }
      }
      const images = (row.images || []).filter((img) => {
        const url = typeof img === 'string' ? img : img.url
        return url !== target.url
      })
      const kept = (row.findings || []).filter((_, idx) => idx !== findingIndex)
      const findings = this.syncFindingsWithImages(kept.filter((f) => f.url), images).concat(
        kept.filter((f) => !f.url),
      )
      return { ...row, images, findings }
    })
    let expandKey = this.data.expandedFindingKey
    const [esi, efi] = String(expandKey || '').split(':').map(Number)
    if (esi === sectionIndex) {
      if (efi === findingIndex) expandKey = ''
      else if (efi > findingIndex) expandKey = `${sectionIndex}:${efi - 1}`
    }
    this.setSectionsWithFindings(sections, { autoSaveLabel: '保存中…' }, expandKey)
    this.scheduleAutoSavePhotos()
  },

  onAttachFindingPhoto(e) {
    if (this.data.readOnly) return
    const ds = (e.currentTarget && e.currentTarget.dataset) || {}
    const si = Number(ds.sectionIndex)
    const fi = Number(ds.findingIndex)
    if (!Number.isFinite(si) || !Number.isFinite(fi)) return
    const section = this.data.sections[si]
    if (!section || !section.findings || !section.findings[fi]) return
    const current = normalizeWorkFinding(section.findings[fi])
    const remain = Math.max(0, WORK_IMAGES_MAX - current.images.length)
    if (remain < 1) {
      wx.showToast({ title: `每项最多 ${WORK_IMAGES_MAX} 张`, icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: Math.min(remain, 6),
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const files = res.tempFiles || []
        if (!files.length) return
        try {
          wx.showLoading({ title: '上传中' })
          const uploadedList = []
          for (let i = 0; i < files.length; i += 1) {
            const uploaded = await uploadImage(files[i].tempFilePath)
            const url = uploaded && (uploaded.url || uploaded)
            if (url) uploadedList.push({ url, imageId: '' })
          }
          if (!uploadedList.length) throw new Error('上传失败')
          const sections = this.data.sections.map((row, i) => {
            if (i !== si) return row
            const findings = (row.findings || []).map((item, idx) => {
              if (idx !== fi) return item
              const prev = normalizeWorkFinding(item)
              const images = prev.images.concat(uploadedList).slice(0, WORK_IMAGES_MAX)
              return normalizeWorkFinding({
                ...prev,
                images,
                partName: prev.partName,
                caption: prev.caption,
              })
            })
            return {
              ...row,
              findings,
              images: this.flattenWorkSectionImages(findings),
            }
          })
          this.setSectionsWithFindings(sections, { autoSaveLabel: '保存中…' }, `${si}:${fi}`)
          this.scheduleAutoSavePhotos()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
    })
  },

  onRemoveWorkFindingImage(e) {
    if (this.data.readOnly) return
    const si = Number(e.currentTarget.dataset.sectionIndex)
    const fi = Number(e.currentTarget.dataset.findingIndex)
    const imgIndex = Number(e.currentTarget.dataset.imgIndex)
    if (!Number.isFinite(si) || !Number.isFinite(fi) || !Number.isFinite(imgIndex)) return
    const sections = this.data.sections.map((row, i) => {
      if (i !== si) return row
      const findings = (row.findings || []).map((item, idx) => {
        if (idx !== fi) return item
        const prev = normalizeWorkFinding(item)
        const images = prev.images.filter((_, j) => j !== imgIndex)
        return normalizeWorkFinding({ ...prev, images })
      })
      return {
        ...row,
        findings,
        images: this.flattenWorkSectionImages(findings),
      }
    })
    this.setSectionsWithFindings(sections, { autoSaveLabel: '保存中…' }, `${si}:${fi}`)
    this.scheduleAutoSavePhotos()
  },

  onToggleDeliveryWorkImage(e) {
    if (this.data.readOnly) return
    const url = String(e.currentTarget.dataset.url || '')
    if (!url) return
    if (this.data.deliveryPickMode === 'exterior') {
      const workImagePool = (this.data.workImagePool || []).map((row) => ({
        ...row,
        isExterior: row.url === url,
        selected: row.url === url ? false : row.selected,
      }))
      const sections = (this.data.sections || []).map((section) =>
        section.stageId === 'stage_6' ? { ...section, images: [] } : section,
      )
      this.setData({
        deliveryExteriorUrl: url,
        deliveryPickMode: '',
        workImagePool,
        sections,
        autoSaveLabel: '保存中…',
      })
      this.scheduleAutoSavePhotos()
      return
    }
    if (url === this.data.deliveryExteriorUrl) {
      wx.showToast({ title: '已用作整车外观', icon: 'none' })
      return
    }
    const workImagePool = (this.data.workImagePool || []).map((row) =>
      row.url === url ? { ...row, selected: !row.selected } : row,
    )
    this.setData({ workImagePool, autoSaveLabel: '保存中…' })
    this.scheduleAutoSaveDraftOnly()
  },

  onStartPickExterior() {
    if (this.data.readOnly) return
    if (!(this.data.workImagePool || []).length) {
      wx.showToast({ title: '暂无施工图，请补拍外观', icon: 'none' })
      return
    }
    this.setData({ deliveryPickMode: 'exterior' })
    wx.showToast({ title: '请点选一张整车外观', icon: 'none' })
  },

  onClearExterior() {
    if (this.data.readOnly) return
    const workImagePool = (this.data.workImagePool || []).map((row) => ({
      ...row,
      isExterior: false,
    }))
    const sections = (this.data.sections || []).map((section) =>
      section.stageId === 'stage_6' ? { ...section, images: [] } : section,
    )
    this.setData({
      deliveryExteriorUrl: '',
      deliveryPickMode: '',
      workImagePool,
      sections,
      autoSaveLabel: '保存中…',
    })
    this.scheduleAutoSavePhotos()
  },

  onCaptureExterior() {
    if (this.data.readOnly) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const file = (res.tempFiles && res.tempFiles[0]) || null
        if (!file) return
        try {
          wx.showLoading({ title: '上传中' })
          const uploaded = await uploadImage(file.tempFilePath)
          const url = uploaded && (uploaded.url || uploaded)
          if (!url) throw new Error('上传失败')
          const workImagePool = (this.data.workImagePool || []).map((row) => ({
            ...row,
            isExterior: false,
            selected: row.url === url ? false : row.selected,
          }))
          const sections = (this.data.sections || []).map((section) => {
            if (section.stageId !== 'stage_6') return section
            return {
              ...section,
              images: [{ url, caption: '整车外观' }],
            }
          })
          this.setData({
            deliveryExteriorUrl: url,
            deliveryPickMode: '',
            workImagePool,
            sections,
            autoSaveLabel: '保存中…',
          })
          this.scheduleAutoSavePhotos()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
    })
  },

  onCancelPickExterior() {
    this.setData({ deliveryPickMode: '' })
  },

  onAddFindingPhotos(e) {
    if (this.data.readOnly) return
    const sectionIndex = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(sectionIndex)) return
    const section = this.data.sections[sectionIndex]
    if (!section) return
    if (section.findingKind === 'work') {
      if ((section.findings || []).length >= 12) {
        wx.showToast({ title: '最多 12 个维修项', icon: 'none' })
        return
      }
      wx.chooseMedia({
        count: WORK_IMAGES_MAX,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: async (res) => {
          const files = res.tempFiles || []
          if (!files.length) return
          try {
            wx.showLoading({ title: '上传中' })
            const uploadedList = []
            for (let i = 0; i < files.length; i += 1) {
              const uploaded = await uploadImage(files[i].tempFilePath)
              const url = uploaded && (uploaded.url || uploaded)
              if (url) uploadedList.push({ url, imageId: '' })
            }
            if (!uploadedList.length) throw new Error('上传失败')
            const sections = this.data.sections.map((row, i) => {
              if (i !== sectionIndex) return row
              const findings = (row.findings || []).concat([
                normalizeWorkFinding({
                  partName: '',
                  caption: '',
                  images: uploadedList.slice(0, WORK_IMAGES_MAX),
                }),
              ])
              return {
                ...row,
                findings,
                images: this.flattenWorkSectionImages(findings),
              }
            })
            const expandKey = `${sectionIndex}:${(section.findings || []).length}`
            this.setSectionsWithFindings(sections, { autoSaveLabel: '保存中…' }, expandKey)
            this.scheduleAutoSavePhotos()
          } catch (err) {
            wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
          } finally {
            wx.hideLoading()
          }
        },
      })
      return
    }
    const remain = Math.max(0, 12 - ((section.images && section.images.length) || 0))
    if (remain < 1) {
      wx.showToast({ title: '最多 12 张', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res.tempFiles || []).map((file) => ({
          url: file.tempFilePath,
          caption: '',
        }))
        if (!files.length) return
        const images = (section.images || []).concat(files).slice(0, 12)
        const sections = this.data.sections.map((row, i) => {
          if (i !== sectionIndex) return row
          return {
            ...row,
            images,
            findings: this.syncFindingsWithImages(row.findings || [], images),
          }
        })
        const expandKey = `${sectionIndex}:${images.length - 1}`
        this.setSectionsWithFindings(sections, { autoSaveLabel: '保存中…' }, expandKey)
        this.scheduleAutoSavePhotos()
      },
    })
  },

  scheduleAutoSavePhotos() {
    if (this._photoSaveTimer) clearTimeout(this._photoSaveTimer)
    this._photoSaveTimer = setTimeout(() => {
      this.runAutoSavePhotos()
    }, 700)
  },

  /** 仅保存发现项文案草稿，避免上传回写打断输入 */
  scheduleAutoSaveDraftOnly() {
    if (this._draftSaveTimer) clearTimeout(this._draftSaveTimer)
    this._draftSaveTimer = setTimeout(async () => {
      if (this.data.readOnly) return
      try {
        await this.persistPhotoDraft()
        this.setData({ autoSaveLabel: '已自动保存' })
      } catch (e) {
        this.setData({
          autoSaveLabel: (e && e.message) || '自动保存失败，请检查网络',
        })
      }
    }, 700)
  },

  async runAutoSavePhotos() {
    if (this.data.readOnly || this._photoSaving) return
    this._photoSaving = true
    const keepExpandKey = this.data.expandedFindingKey
    try {
      await this.persistPhotos()
      this.resyncSectionsAfterPersist(keepExpandKey)
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
  resyncSectionsAfterPersist(preferredExpandKey) {
    const album = this._album
    const active = this.data.activeNode
    if (!album || !active || !this.data.activeIsPhoto) return
    const prevFindings = this.collectFindingsFromSections()
    const keepKey =
      preferredExpandKey !== undefined ? preferredExpandKey : this.data.expandedFindingKey
    const expandedUrl = (() => {
      if (!keepKey) return ''
      const [si, fi] = String(keepKey).split(':').map(Number)
      const section = this.data.sections[si]
      const finding = section && section.findings && section.findings[fi]
      return (finding && finding.url) || ''
    })()
    let sections = this.buildSections(album, active, { findings: prevFindings }, this._flowNodes || [])
    let expandKey = ''
    if (expandedUrl) {
      sections.forEach((section, si) => {
        if (!section.findingMode || expandKey) return
        const fi = (section.findings || []).findIndex((item) => item.url === expandedUrl)
        if (fi >= 0) expandKey = `${si}:${fi}`
      })
    }
    // URL 从临时路径换成正式地址时，按原索引保展开
    if (!expandKey && keepKey) {
      const [si, fi] = String(keepKey).split(':').map(Number)
      if (
        Number.isFinite(si) &&
        Number.isFinite(fi) &&
        sections[si] &&
        sections[si].findings &&
        sections[si].findings[fi]
      ) {
        expandKey = keepKey
      }
    }
    this.setSectionsWithFindings(sections, {}, expandKey)
  },

  async persistPhotoDraft() {
    const kind = this.data.activeNode && this.data.activeNode.kind
    if (kind !== 'intake_inspection' && kind !== 'work' && kind !== 'delivery_photos') return
    await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
      photoDraft: this.buildPhotoDraftPayload(),
    })
  },

  onChiefComplaintInput(e) {
    if (this.data.isIntakePhotoStep) {
      this.setData({ chiefComplaint: e.detail.value, autoSaveLabel: '保存中…' }, () => {
        this.scheduleAutoSaveDraftOnly()
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
    const section = this.data.sections[sectionIndex]
    if (!section || !section.findings || !section.findings[findingIndex]) return
    const findingKind = section.findingKind || 'inspection'
    const prev = section.findings[findingIndex]
    const nextRaw = { ...prev, [field]: e.detail.value }
    // 检测：部位同步到图注；施工：部位与本图说明分开，不互相带出
    if (findingKind !== 'work' && field === 'partName') {
      nextRaw.caption = e.detail.value
    }
    const expandKey = `${sectionIndex}:${findingIndex}`
    const listKey = `idx-${sectionIndex}-${findingIndex}`
    const decorated = this.decorateFinding(nextRaw, true, listKey, findingKind)
    const patch = {
      [`sections[${sectionIndex}].findings[${findingIndex}]`]: decorated,
      expandedFindingKey: expandKey,
      autoSaveLabel: '保存中…',
    }
    if (findingKind === 'work') {
      // 施工：部位/说明只写在项上，不按索引回写 images
    } else if (field === 'partName') {
      patch[`sections[${sectionIndex}].images[${findingIndex}].caption`] = e.detail.value
    }
    this.setData(patch)
    this.scheduleAutoSaveDraftOnly()
  },

  onSelectFindingResult(e) {
    if (this.data.readOnly) return
    const sectionIndex = Number(e.currentTarget.dataset.sectionIndex)
    const findingIndex = Number(e.currentTarget.dataset.findingIndex)
    const value = String(e.currentTarget.dataset.value || '').trim()
    if (!Number.isFinite(sectionIndex) || !Number.isFinite(findingIndex) || !value) return
    const section = this.data.sections[sectionIndex]
    if (!section || !section.findings || !section.findings[findingIndex]) return
    const prev = section.findings[findingIndex]
    const nextRaw = { ...prev, result: value }
    if (value === FINDING_RESULT.OK) {
      if (!nextRaw.advice || nextRaw.advice === FINDING_ADVICE_NONE) {
        nextRaw.advice = FINDING_ADVICE_NONE
      }
    } else if (nextRaw.advice === FINDING_ADVICE_NONE) {
      nextRaw.advice = ''
    }
    const expandKey = `${sectionIndex}:${findingIndex}`
    const listKey = `idx-${sectionIndex}-${findingIndex}`
    const findingKind = section.findingKind || 'inspection'
    const decorated = this.decorateFinding(nextRaw, true, listKey, findingKind)
    this.setData({
      [`sections[${sectionIndex}].findings[${findingIndex}]`]: decorated,
      expandedFindingKey: expandKey,
      autoSaveLabel: '保存中…',
    })
    this.scheduleAutoSaveDraftOnly()
  },

  onFindingFieldInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    if (!Number.isFinite(index) || !field) return
    const findings = this.data.findings.map((item, i) => {
      if (i !== index) return item
      const next = { ...item, [field]: e.detail.value }
      if (field === 'partName') next.caption = e.detail.value
      return next
    })
    this.setData({ findings })
  },

  onSelectReportFindingResult(e) {
    if (this.data.readOnly) return
    const index = Number(e.currentTarget.dataset.index)
    const value = String(e.currentTarget.dataset.value || '').trim()
    if (!Number.isFinite(index) || !value) return
    const findings = this.data.findings.map((item, i) => {
      if (i !== index) return item
      const next = { ...normalizeFinding(item), result: value }
      if (value === FINDING_RESULT.OK) {
        next.advice =
          next.advice && next.advice !== FINDING_ADVICE_NONE ? next.advice : FINDING_ADVICE_NONE
      } else if (next.advice === FINDING_ADVICE_NONE) {
        next.advice = ''
      }
      next.resultOptions = FINDING_RESULT_OPTIONS.map((opt) => ({
        ...opt,
        selected: next.result === opt.value,
      }))
      next.adviceRequired = findingAdviceRequired(next.result)
      next.resultTone =
        next.result === FINDING_RESULT.OK
          ? 'ok'
          : next.result === FINDING_RESULT.WATCH
            ? 'watch'
            : next.result === FINDING_RESULT.ACTION
              ? 'action'
              : ''
      next.resultToneClass = next.resultTone
        ? `merchant-flow-page__result-tone-${next.resultTone}`
        : ''
      next.evidenceRowClass = next.resultTone
        ? `merchant-flow-page__evidence-row--${next.resultTone}`
        : ''
      return next
    })
    this.setData({ findings })
  },

  onConclusionInput(e) {
    const patch = { conclusion: e.detail.value }
    if (this.data.isIntakePhotoStep) {
      patch.autoSaveLabel = '保存中…'
      this.setData(patch, () => this.scheduleAutoSaveDraftOnly())
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
    this.setData({
      quoteLines,
      quoteTotalLabel: `合计 ¥${sumQuoteAmounts(quoteLines).toFixed(2)}`,
    })
  },

  onAddQuoteLine() {
    const quoteLines = this.data.quoteLines.concat([
      { name: '', brand: '', amount: '', note: '', evidenceUrl: '' },
    ])
    this.setData({
      quoteLines,
      quoteTotalLabel: `合计 ¥${sumQuoteAmounts(quoteLines).toFixed(2)}`,
    })
  },

  onRemoveQuoteLine(e) {
    if (this.data.readOnly || this.data.confirmAwaitingOwner) return
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const prev = this.data.quoteLines || []
    let quoteLines = prev.filter((_, i) => i !== index)
    if (!quoteLines.length) {
      quoteLines = [{ name: '', brand: '', amount: '', note: '', evidenceUrl: '' }]
    }
    this.setData({
      quoteLines,
      quoteTotalLabel: `合计 ¥${sumQuoteAmounts(quoteLines).toFixed(2)}`,
    })
  },

  onAddQuoteEvidence(e) {
    if (this.data.readOnly || this.data.confirmAwaitingOwner) return
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const file = (res.tempFiles && res.tempFiles[0]) || null
        if (!file) return
        try {
          wx.showLoading({ title: '上传中' })
          const uploaded = await uploadImage(file.tempFilePath)
          const url = uploaded && (uploaded.url || uploaded)
          if (!url) throw new Error('上传失败')
          const quoteLines = this.data.quoteLines.map((line, i) =>
            i === index ? { ...line, evidenceUrl: url } : line,
          )
          this.setData({ quoteLines })
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
    })
  },

  onRemoveQuoteEvidence(e) {
    if (this.data.readOnly || this.data.confirmAwaitingOwner) return
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const quoteLines = this.data.quoteLines.map((line, i) =>
      i === index ? { ...line, evidenceUrl: '' } : line,
    )
    this.setData({ quoteLines })
  },

  onPreviewQuoteEvidence(e) {
    const index = Number(e.currentTarget.dataset.index)
    const line = this.data.quoteLines[index]
    const url = line && line.evidenceUrl
    if (!url) return
    wx.previewImage({
      current: url,
      urls: this.data.quoteLines.map((row) => row.evidenceUrl).filter(Boolean),
    })
  },

  async persistPhotos() {
    const album = this._album || (await fetchMerchantServiceAlbum(this.albumId))
    const sectionMap = {}
    this.data.sections.forEach((section) => {
      if (section.findingMode && section.findingKind === 'work') {
        sectionMap[section.stageId] = this.flattenWorkSectionImages(section.findings || [])
      } else if (section.findingMode) {
        sectionMap[section.stageId] = (section.images || []).map((img, i) => {
          const finding = (section.findings || [])[i] || {}
          return {
            ...img,
            caption: finding.partName || img.caption || '',
          }
        })
      } else if (section.stageId === 'stage_6' && this.data.isDeliveryPhotoStep) {
        // 仅落库「外观补拍」；从施工图选用的只记引用，不复制
        const exterior = String(this.data.deliveryExteriorUrl || '').trim()
        const workUrlSet = {}
        this.collectAllWorkImages(album, this._flowNodes || []).forEach((row) => {
          if (row && row.url) workUrlSet[row.url] = true
        })
        if (exterior && !workUrlSet[exterior]) {
          sectionMap[section.stageId] = [{ url: exterior, caption: '整车外观' }]
        } else {
          sectionMap[section.stageId] = []
        }
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
        const expandKey = this.findFirstIncompleteFindingKey()
        if (expandKey) {
          this.setSectionsWithFindings(this.data.sections, {}, expandKey)
        }
        wx.showModal({
          title: '请先补全检测内容',
          content: `${gaps.slice(0, 4).join('\n')}${gaps.length > 4 ? `\n…共 ${gaps.length} 项` : ''}`,
          showCancel: false,
          confirmText: '去补全',
        })
        return
      }
    }
    if (kind === 'work') {
      const order = this.resolveRelatedWorkOrder(this._flowNodes || [], this.data.activeNode)
      const orderItems =
        (order &&
          order.document &&
          order.document.payload &&
          order.document.payload.items) ||
        []
      const draftPayload = {
        findings: this.collectFindingsFromSections(),
      }
      const gaps = collectWorkPhotoDraftGaps(draftPayload, { orderItems })
      if (gaps.length) {
        const expandKey = this.findFirstIncompleteFindingKey()
        if (expandKey) {
          this.setSectionsWithFindings(this.data.sections, {}, expandKey)
        }
        wx.showModal({
          title: '请先补全施工内容',
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
        warrantyNotes: this.data.warrantyNotes,
        deliveryExteriorUrl: this.data.deliveryExteriorUrl,
        selectedDeliveryUrls: (this.data.workImagePool || [])
          .filter((row) => row && row.selected)
          .map((row) => row.url),
      })
      if (gaps.length) {
        wx.showModal({
          title: '请先补全交车信息',
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

    if (kind === 'intake_inspection' || kind === 'work' || kind === 'delivery_photos') {
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
      const lines = this.data.quoteLines
        .map((l) => normalizeQuoteLine(l))
        .filter((l) => String(l.name || '').trim())
      return {
        ...base,
        lines,
        confirmCopy: QUOTE_CONFIRM_COPY,
      }
    }
    if (kind === 'repair_report') {
      return {
        ...base,
        confirmCopy: REPAIR_CONFIRM_COPY,
        warrantyPeriod: this.data.warrantyPeriod || base.warrantyPeriod,
        warrantyNotes: this.data.warrantyNotes || base.warrantyNotes,
      }
    }
    if (kind === 'work_order') {
      return base
    }
    return base
  },

  buildQuotePayloadForSave() {
    const lines = (this.data.quoteLines || [])
      .map((l) => normalizeQuoteLine(l))
      .filter((l) => String(l.name || '').trim())
    return {
      lines,
      confirmCopy: QUOTE_CONFIRM_COPY,
    }
  },

  async onNotifyOwnerPlan() {
    if (this.data.readOnly || this.data.confirming) return
    const reportPayload = this.buildDocPayloadForSave()
    const quotePayload = this.buildQuotePayloadForSave()
    const reportGaps = collectInspectionReportGaps(reportPayload)
    if (reportGaps.length) {
      wx.showModal({
        title: '请先补全报告',
        content: reportGaps.slice(0, 4).join('\n'),
        showCancel: false,
      })
      return
    }
    const quoteGaps = collectQuoteConfirmGaps(quotePayload)
    if (quoteGaps.length) {
      wx.showModal({
        title: '请先填写方案金额',
        content: quoteGaps.slice(0, 4).join('\n'),
        showCancel: false,
      })
      return
    }
    this.setData({ confirming: true })
    try {
      await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        document: {
          status: 'draft',
          payload: reportPayload,
        },
      })
      const quoteNodeId = this.data.quoteNodeId || this._quoteNodeId
      if (quoteNodeId) {
        await updateMerchantFlowNode(this.albumId, quoteNodeId, {
          document: {
            status: 'draft',
            payload: quotePayload,
          },
        })
      }
      const res = await deliverMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        document: { payload: reportPayload },
        quote: { payload: quotePayload },
      })
      wx.showToast({ title: (res && res.message) || '已通知车主', icon: 'success' })
      await this.loadFlow({ silent: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  async onDeliverReport() {
    return this.onNotifyOwnerPlan()
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
      wx.showToast({ title: '可以开始施工', icon: 'success' })
      await this.loadFlow({ silent: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  async onAddAddonPlan() {
    if (this.data.readOnly || this.data.confirming) return
    this.setData({ confirming: true })
    try {
      // 先落库施工图与部位，再打断插入增项，避免部位名丢失
      if (this._photoSaveTimer) {
        clearTimeout(this._photoSaveTimer)
        this._photoSaveTimer = null
      }
      if (this._draftSaveTimer) {
        clearTimeout(this._draftSaveTimer)
        this._draftSaveTimer = null
      }
      if (this.data.isWorkPhotoStep) {
        await this.persistPhotos()
        this.resyncSectionsAfterPersist()
        await this.persistPhotoDraft()
      }
      await insertMerchantAddonPlan(this.albumId)
      wx.showToast({ title: '请填写施工中新发现', icon: 'none' })
      await this.loadFlow({ silent: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  onOpenCancelAddon() {
    if (this.data.readOnly || !this.data.isAddonQuote) return
    const docStatus = String(this.data.docStatus || '')
    if (docStatus === 'confirmed' || docStatus === 'cancelled') {
      wx.showToast({ title: '当前不可取消', icon: 'none' })
      return
    }
    // 未发送：当误点，直接确认删除，不填原因
    if (docStatus !== 'pending_confirm') {
      wx.showModal({
        title: '取消本项',
        content: '尚未发送车主，取消后不留记录，回到施工。',
        confirmText: '确认取消',
        cancelText: '返回',
        success: (res) => {
          if (!res.confirm) return
          this.submitCancelAddon('')
        },
      })
      return
    }
    this.setData({ showCancelAddonModal: true, cancelAddonReason: '' })
  },

  onCloseCancelAddonModal() {
    this.setData({ showCancelAddonModal: false, cancelAddonReason: '' })
  },

  onCancelAddonReasonInput(e) {
    this.setData({ cancelAddonReason: e.detail.value })
  },

  async onConfirmCancelAddon() {
    const reason = String(this.data.cancelAddonReason || '').trim()
    if (!reason) {
      wx.showToast({ title: '请填写取消原因', icon: 'none' })
      return
    }
    await this.submitCancelAddon(reason)
  },

  async submitCancelAddon(cancelReason) {
    if (this.data.readOnly || this.data.confirming) return
    const nodeId = (this.data.activeNode && this.data.activeNode.id) || ''
    if (!nodeId) return
    this.setData({ confirming: true })
    try {
      const payload = { nodeId }
      if (cancelReason) payload.cancelReason = cancelReason
      await cancelMerchantAddonPlan(this.albumId, payload)
      this.setData({ showCancelAddonModal: false, cancelAddonReason: '' })
      wx.showToast({ title: '已取消，回到施工', icon: 'none' })
      await this.loadFlow({ silent: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '取消失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  async onSendForOwnerConfirm() {
    if (this.data.readOnly || this.data.confirming) return
    const kind = this.data.activeNode && this.data.activeNode.kind
    if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
      const gaps = collectQuoteConfirmGaps(this.buildDocPayloadForSave(), {
        requireEvidence: this.data.isAddonQuote,
      })
      if (gaps.length) {
        wx.showModal({
          title: '请先补全项目与金额',
          content: gaps.slice(0, 4).join('\n'),
          showCancel: false,
        })
        return
      }
    }
    if (kind === 'repair_report') {
      const period = String(this.data.warrantyPeriod || '').trim()
      if (!period || isVagueWarrantyPeriod(period)) {
        wx.showModal({
          title: '请先补全质保期限',
          content: '请写清时长或里程，勿填「以门店公示为准」',
          showCancel: false,
        })
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
      wx.showToast({ title: '已发送车主', icon: 'success' })
      await this.loadFlow({ silent: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '发送失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  async onProxyConfirm() {
    if (this.data.readOnly || this.data.confirming) return
    if (!this.data.confirmAwaitingOwner) {
      wx.showToast({ title: '请先发送车主确认', icon: 'none' })
      return
    }
    const kind = this.data.activeNode && this.data.activeNode.kind
    if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
      const gaps = collectQuoteConfirmGaps(this.buildDocPayloadForSave(), {
        requireEvidence: this.data.isAddonQuote,
      })
      if (gaps.length) {
        wx.showModal({
          title: '请先补全项目与金额',
          content: gaps.slice(0, 4).join('\n'),
          showCancel: false,
        })
        return
      }
    }
    wx.showModal({
      title: '车主已口头确认？',
      content: '请确认已当面或通过电话/微信获得车主同意。',
      confirmText: '已确认',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        wx.showActionSheet({
          itemList: ['直接确认', '附带沟通截图后确认'],
          success: (sheet) => {
            if (sheet.tapIndex === 1) {
              this.pickProxyProofThenConfirm()
              return
            }
            this.setData({ proxyProofImages: [] }, () => this.runProxyConfirm())
          },
          fail: () => {
            // 用户取消选单，不代确认
          },
        })
      },
    })
  },

  pickProxyProofThenConfirm() {
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
          this.setData({ proxyProofImages: [{ url }] }, () => this.runProxyConfirm())
        } catch (e) {
          wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
    })
  },

  async runProxyConfirm() {
    if (this.data.readOnly || this.data.confirming) return
    const kind = this.data.activeNode && this.data.activeNode.kind
    const payload = this.buildDocPayloadForSave()
    if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
      payload.confirmCopy = QUOTE_CONFIRM_COPY
    }
    if (kind === 'repair_report') {
      payload.confirmCopy = REPAIR_CONFIRM_COPY
    }
    this.setData({ confirming: true })
    try {
      await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        document: {
          status: 'pending_confirm',
          payload,
        },
      })
      const result = await proxyConfirmMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        proxyProofImages: this.data.proxyProofImages.map((p) => p.url).filter(Boolean),
        document: { payload },
      })
      const autoDone = Boolean(result && result.albumAutoCompleted)
      wx.showToast({
        title: kind === 'repair_report' && autoDone ? '已确认并完工' : '已代确认',
        icon: 'success',
      })
      await this.loadFlow({ silent: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  async onSaveDocDraft() {
    if (this.data.readOnly || this.data.saving) return
    this.setData({ saving: true })
    try {
      await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        document: {
          status: (this.data.activeNode.document && this.data.activeNode.document.status) || 'draft',
          payload: this.buildDocPayloadForSave(),
        },
      })
      if (this.data.showCombinedPlan) {
        const quoteNodeId = this.data.quoteNodeId || this._quoteNodeId
        if (quoteNodeId) {
          await updateMerchantFlowNode(this.albumId, quoteNodeId, {
            document: {
              status: 'draft',
              payload: this.buildQuotePayloadForSave(),
            },
          })
        }
      }
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
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
