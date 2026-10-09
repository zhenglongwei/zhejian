const {
  fetchMerchantServiceAlbum,
  fetchMerchantAlbumFlow,
  saveMerchantServiceAlbum,
  completeMerchantServiceAlbum,
  completeMerchantFlowNode,
  fetchMerchantFlowNodeAiReview,
  organizeMerchantFlowNodePhotos,
  fetchMerchantAlbumMediaLibrary,
  updateMerchantFlowNode,
  proxyConfirmMerchantFlowNode,
  deliverMerchantFlowNode,
  insertMerchantAddonPlan,
  cancelMerchantAddonPlan,
  recognizeVehicleIntakeOcr,
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
  WALKAROUND_PARTS,
  QUOTE_CONFIRM_COPY,
  REPAIR_CONFIRM_COPY,
  INTAKE_RECORD_CATEGORIES,
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
  FINDING_IMAGES_MAX,
  normalizeQuoteLine,
  mapFindingRows,
  mediaKey,
  sumQuoteAmounts,
  listQuoteLineEvidenceUrls,
  isQuoteEvidenceFinding,
  resolveWarrantyNotes,
  isVagueWarrantyPeriod,
  parseMileageKm,
  pickOdometerSlot,
  isOdometerFinding,
  applyOrganizeGroups,
  applyIntakeOrganizeGroups,
  collectConfirmedQuoteNames,
  workOutsideQuoteOf,
  normalizeIntakeResult,
  normalizePendingImages,
  buildQuoteDraft,
} = require('../../../../utils/service-flow-docs')
const { getFlowPlaceholders } = require('../../../../utils/service-flow-placeholders')
const {
  bindSuggestionPart,
  isOdometerSuggestion,
  resolveAiReviewFindingIndex,
} = require('../../../../utils/ai-review-target')
const { persistAlbumNodeImages, uploadImage } = require('../../../../utils/media-upload')

/** 系统选图最多 9 张；超过会直接失败且不弹界面。失败时再试 chooseImage。 */
function pickLocalImages(options = {}) {
  const count = Math.max(1, Math.min(9, Number(options.count) || 1))
  const success = typeof options.success === 'function' ? options.success : function () {}
  const isCancel = (err) => /cancel/i.test(String((err && err.errMsg) || ''))
  const onFail = (err) => {
    if (isCancel(err)) return
    wx.showToast({ title: '无法打开相册，请检查权限', icon: 'none' })
  }
  const fromChooseImage = (res) => {
    success({
      tempFiles: (res.tempFilePaths || []).map((tempFilePath) => ({ tempFilePath })),
    })
  }
  if (typeof wx.chooseMedia === 'function') {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success,
      fail: (err) => {
        if (isCancel(err) || typeof wx.chooseImage !== 'function') {
          onFail(err)
          return
        }
        wx.chooseImage({
          count,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: fromChooseImage,
          fail: onFail,
        })
      },
    })
    return
  }
  if (typeof wx.chooseImage === 'function') {
    wx.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: fromChooseImage,
      fail: onFail,
    })
    return
  }
  onFail({ errMsg: 'chooseImage:fail not support' })
}

function organizeFailHint(err) {
  const code = err && err.code
  const msg = String((err && err.message) || '')
  if (code === 'NETWORK_ERROR' || /网络/.test(msg)) {
    return '照片已保存，这次没归上，请自己归'
  }
  return msg || '这次没归上'
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const ORGANIZE_FLOW_WAIT_MS = 180000
const ORGANIZE_POLL_MS = 2000

function flowDraftStorageKey(albumId, nodeId) {
  return `zj_flow_draft_${String(albumId || '').trim()}_${String(nodeId || '').trim()}`
}

function readLocalFlowDraft(albumId, nodeId) {
  if (!String(albumId || '').trim() || !String(nodeId || '').trim()) return null
  try {
    const raw = wx.getStorageSync(flowDraftStorageKey(albumId, nodeId))
    if (raw && typeof raw === 'object' && raw.photoDraft) return raw
  } catch (_) {
    /* ignore */
  }
  return null
}

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

  if (
    kind === 'intake_inspection' ||
    kind === 'intake' ||
    kind === 'inspection' ||
    kind === 'work' ||
    kind === 'delivery_photos'
  ) {
    const previewImages = Array.isArray(node.previewImages) ? node.previewImages : []
    return {
      ...base,
      kind,
      detailKind: 'photos',
      summary,
      previewImages,
      photoCount: Number(node.photoCount) || previewImages.length,
      chiefComplaint:
        kind === 'intake_inspection' || kind === 'intake'
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
  stage_1: {
    title: '接车照片',
    tips: '连拍进场外观，把里程表拍进去',
    captionPlaceholder: '本图说明（选填）',
    findingMode: false,
    findingKind: '',
  },
  stage_2: {
    title: '',
    tips: '',
    captionPlaceholder: '检查部位',
    findingMode: true,
    findingKind: 'inspection',
  },
  stage_5: {
    title: '',
    tips: '',
    captionPlaceholder: '说明（选填）',
    findingMode: true,
    findingKind: 'work',
  },
  stage_6: {
    title: '交车证据',
    tips: '整车外观必选；拍车身',
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
    pendingImages: [],
    organizingPhotos: false,
    organizeResultHint: '',
    hasOutsideQuoteItems: false,
    intakeResults: [],
    fuelReading: '',
    intakeImagePool: [],
    isAppearanceService: false,
    showLibrary: false,
    libraryBusy: false,
    libraryItems: [],
    canUseLibrary: false,
    organizedOnce: false,
    hasFindingItems: false,
    organizeActionLabel: '整理',
    showOrganizeAction: false,
    showAssignSheet: false,
    assignKind: 'finding',
    assignSheetTitle: '并入哪一项',
    assignPendingIndex: -1,
    assignTargets: [],
    walkaround: [],
    walkaroundParts: WALKAROUND_PARTS.map((row) => ({ ...row, checked: false })),
    isInspectionPhotoStep: false,
    expandedFindingKey: '',
    findingResultOptions: FINDING_RESULT_OPTIONS,
    docPayload: {},
    quoteLines: [],
    quoteDraftHint: '',
    quoteEvidenceFindings: [],
    quoteTotalLabel: '合计 ¥0.00',
    quoteNodeId: '',
    docStatus: '',
    showCombinedPlan: false,
    quotePendingOwner: false,
    confirmAwaitingOwner: false,
    isAddonQuote: false,
    addonDiscoveryImages: [],
    addonDiscoveryNote: '',
    addonDiscoveryReady: false,
    ownerRejectReason: '',
    quoteEvidenceLocked: false,
    showCancelAddonModal: false,
    cancelAddonReason: '',
    conclusion: '',
    confirmCopy: '',
    proxyProofImages: [],
    captionHint: '',
    autoSaveLabel: '',
    showAutoSave: false,
    findings: [],
    chiefComplaint: '',
    mileageKm: '',
    odometerUrl: '',
    odometerImageId: '',
    odometerOcrBusy: false,
    odometerHint: null,
    vehicleBrand: '',
    vehicleSeries: '',
    vehicleYear: '',
    warrantyPeriod: '',
    warrantyNotes: '',
    allDone: false,
    needManualComplete: false,
    albumCompleted: false,
    showHostEntry: false,
    hosted: false,
    hostVisibility: 'private',
    workImagePool: [],
    deliveryExtraCount: 0,
    deliveryExteriorUrl: '',
    deliveryPickMode: '',
    aiReview: null,
    aiReviewBusy: false,
    aiReviewTimedOut: false,
    chiefComplaintHint: null,
    warrantyHint: null,
    orphanPhotoHints: [],
    notifyOwnerLabel: '通知车主',
    photoConfirmDisabled: false,
    notifyConfirmDisabled: false,
    aiTextBatchCanApply: false,
    aiTextBatchCanUndo: false,
    chiefComplaintPlaceholder: '例：到店检查异响',
    findingPartPlaceholder: '例：检查部位',
    findingAdvicePlaceholder: '例：该部位有可见磨损',
    quoteJobPlaceholder: '例：全车补漆',
    quoteNotePlaceholder: '例：写清更换范围和做法',
    workJobPlaceholder: '例：全车补漆',
    workCaptionPlaceholder: '例：已按规范安装',
  },

  onLoad(options) {
    this.albumId = String(options.albumId || '').trim()
    this.setData({ albumId: this.albumId })
    this.bootstrap()
  },

  onShow() {
    this.resumeAiReviewIfNeeded()
  },

  onHide() {
    this.writeLocalFlowDraft()
    this.stopAiReviewPoll()
  },

  onUnload() {
    this.writeLocalFlowDraft()
    this.stopAiReviewPoll()
    this.clearFlowTimers()
  },

  clearFlowTimers() {
    if (this._autoSaveHideTimer) {
      clearTimeout(this._autoSaveHideTimer)
      this._autoSaveHideTimer = null
    }
    if (this._photoSaveTimer) {
      clearTimeout(this._photoSaveTimer)
      this._photoSaveTimer = null
    }
    if (this._draftSaveTimer) {
      clearTimeout(this._draftSaveTimer)
      this._draftSaveTimer = null
    }
  },

  setAutoSaveLabel(label) {
    const text = String(label || '')
    if (this._autoSaveHideTimer) {
      clearTimeout(this._autoSaveHideTimer)
      this._autoSaveHideTimer = null
    }
    this.setData({
      autoSaveLabel: text,
      showAutoSave: Boolean(text) && text !== '保存中…',
    })
    if (text !== '已自动保存') return
    this._autoSaveHideTimer = setTimeout(() => {
      if (this.data.autoSaveLabel === '已自动保存') {
        this.setData({ autoSaveLabel: '', showAutoSave: false })
      }
      this._autoSaveHideTimer = null
    }, 2200)
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
    const rows = []
    const urlToIndex = {}
    const reindexRow = (idx) => {
      Object.keys(urlToIndex).forEach((u) => {
        if (urlToIndex[u] === idx) delete urlToIndex[u]
      })
      ;((rows[idx] && rows[idx].images) || []).forEach((img) => {
        const key = mediaKey(img && img.url)
        if (key) urlToIndex[key] = idx
      })
    }
    const unionImages = (prevImages, nextImages) => {
      const seen = {}
      const out = []
      ;(prevImages || []).concat(nextImages || []).forEach((img) => {
        const key = mediaKey(img && img.url)
        if (!img || !key || seen[key]) return
        seen[key] = true
        out.push(img)
      })
      return out
    }
    const put = (raw, replaceImages) => {
      const item = normalizeWorkFinding(raw)
      if (!item.images.length && !item.partName) return
      let idx = -1
      for (let i = 0; i < item.images.length; i += 1) {
        const key = mediaKey(item.images[i] && item.images[i].url)
        if (key && urlToIndex[key] !== undefined) {
          idx = urlToIndex[key]
          break
        }
      }
      if (idx < 0 && item.partName && !item.images.length) {
        idx = rows.findIndex((row) => row.partName === item.partName)
      }
      if (idx < 0) {
        rows.push(item)
        reindexRow(rows.length - 1)
        return
      }
      const prev = rows[idx]
      rows[idx] = normalizeWorkFinding({
        ...prev,
        ...item,
        partName: item.partName || prev.partName,
        caption: item.caption || prev.caption,
        images: replaceImages ? item.images : unionImages(prev.images, item.images),
      })
      reindexRow(idx)
    }
    if (Array.isArray(photoDraft && photoDraft.findings)) {
      return (photoDraft.findings || []).map((raw, index) => normalizeWorkFinding(raw, index))
    }
    const currentId = activeNode && activeNode.id
    ;(flowNodes || []).forEach((node) => {
      if (!node || node.kind !== 'work') return
      if (currentId && node.id === currentId) return
      ;((node.photoDraft && node.photoDraft.findings) || []).forEach((raw) => put(raw, false))
    })
    const currentFindings =
      (activeNode && activeNode.photoDraft && activeNode.photoDraft.findings) || []
    currentFindings.forEach((raw) => put(raw, true))
    return rows
  },



  findingImagesFromRows(findings = [], odometerUrl = '') {
    const seen = new Set()
    const odoKey = mediaKey(odometerUrl)
    const out = []
    ;(findings || []).forEach((raw) => {
      const item = normalizeFinding(raw)
      const shots = item.images.length ? item.images : item.url ? [{ url: item.url, imageId: item.imageId }] : []
      shots.forEach((shot) => {
        const url = String((shot && shot.url) || '').trim()
        const key = mediaKey(url)
        if (!url || !key || (odoKey && key === odoKey) || seen.has(key)) return
        seen.add(key)
        out.push({
          url,
          id: shot.imageId || '',
          imageId: shot.imageId || '',
          caption: String(item.partName || '').trim(),
        })
      })
    })
    return out
  },

  suggestionIdsOnFinding(item = {}) {
    return [
      item.aiSuggestionId,
      item.photoHint && item.photoHint.id,
      item.adviceHint && item.adviceHint.id,
      item.captionHint && item.captionHint.id,
    ]
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  },

  dismissAiSuggestionIds(ids = []) {
    if (!this._dismissedAiSuggestionIds) this._dismissedAiSuggestionIds = new Set()
    ids.forEach((id) => {
      const key = String(id || '').trim()
      if (key) this._dismissedAiSuggestionIds.add(key)
    })
    const review = this.data.aiReview
    if (!review || !Array.isArray(review.suggestions)) return null
    const suggestions = review.suggestions.map((row) =>
      row && this._dismissedAiSuggestionIds.has(row.id) ? { ...row, applied: true } : row,
    )
    return this.decorateAiReview({ ...review, suggestions })
  },

  appendPendingToImages(images = []) {
    const seen = new Set()
    const out = []
    ;(images || []).concat(normalizePendingImages(this.data.pendingImages)).forEach((img) => {
      const url = String((img && img.url) || '').trim()
      const key = mediaKey(url)
      if (!url || !key || seen.has(key)) return
      seen.add(key)
      out.push({
        url,
        imageId: (img && (img.imageId || img.id)) || '',
        caption: String((img && img.caption) || '').trim(),
      })
    })
    return out
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
    const byKey = {}
    const normalizeKey = (url, imageId = '') => {
      const id = String(imageId || '').trim()
      if (id) return `id:${id}`
      const key = mediaKey(url)
      return key ? `url:${key}` : ''
    }
    const put = (url, partName = '', imageId = '') => {
      const u = String(url || '').trim()
      const key = normalizeKey(u, imageId)
      if (!key || byKey[key]) return
      byKey[key] = {
        url: u,
        imageId: String(imageId || '').trim(),
        partName: String(partName || '').trim(),
        selected: false,
      }
    }

    // 施工图以 photoDraft 为真源；stage_5 是落库镜像，再并入会因 URL 差异整批翻倍
    ;(flowNodes || []).forEach((node) => {
      if (!node || node.kind !== 'work') return
      ;((node.photoDraft && node.photoDraft.findings) || []).forEach((raw) => {
        const item = normalizeWorkFinding(raw)
        item.images.forEach((img) => put(img.url, item.partName, img.imageId))
      })
    })
    if (!Object.keys(byKey).length) {
      ;((album && album.nodes) || []).forEach((node) => {
        if (!node || node.id !== 'stage_5') return
        ;(node.images || []).forEach((img) => {
          const url = typeof img === 'string' ? img : img && img.url
          const imageId =
            typeof img === 'object' ? img.id || img.imageId || '' : ''
          put(url, typeof img === 'object' ? img.caption || '' : '', imageId)
        })
      })
    }
    return Object.keys(byKey).map((k) => byKey[k])
  },

  buildSections(album, node, photoDraft = {}, flowNodes = []) {
    const draftFindings = Array.isArray(photoDraft.findings) ? photoDraft.findings : []
    const strictFindings = Object.prototype.hasOwnProperty.call(photoDraft, 'findings')

    // 接车＝留证：照片 + 主诉/里程/车型 + 环车清单勾选，**不做**故障判定
    if (node && node.kind === 'intake') {
      const meta = STAGE_LABELS.stage_1
      const stage = (album.nodes || []).find((n) => n.id === 'stage_1') || { images: [] }
      const images = this.mapStageImages(stage)
      const odoKey = mediaKey(photoDraft.odometerUrl)
      return [
        {
          stageId: 'stage_1',
          title: meta.title,
          tips: meta.tips,
          captionPlaceholder: meta.captionPlaceholder,
          findingMode: false,
          findingKind: '',
          images: odoKey
            ? images.filter((img) => mediaKey(img && img.url) !== odoKey)
            : images,
          findings: [],
          odometerUrl: String(photoDraft.odometerUrl || ''),
          odometerImageId: String(photoDraft.odometerImageId || ''),
          walkaround: Array.isArray(photoDraft.walkaround) ? photoDraft.walkaround : [],
        },
      ]
    }

    // 检测＝细查：部位级 findings（结论进检测报告）
    if (node && node.kind === 'inspection') {
      const meta = STAGE_LABELS.stage_2
      const stage = (album.nodes || []).find((n) => n.id === 'stage_2') || { images: [] }
      const images = this.mapStageImages(stage)
      return [
        {
          stageId: 'stage_2',
          title: meta.title,
          tips: '',
          captionPlaceholder: meta.captionPlaceholder,
          findingMode: true,
          findingKind: 'inspection',
          images,
          findings: mapFindingRows(images, draftFindings, {
            pendingKeys: (photoDraft.pendingImages || []).map((img) => img && img.url),
            strictFindings,
          }),
          odometerUrl: '',
          odometerImageId: '',
        },
      ]
    }

    // 存量合并节点（v5）：统一入口，stage_1 并入 stage_2 展示
    if (node && node.kind === 'intake_inspection') {
      const meta = STAGE_LABELS.stage_2
      const images = this.collectIntakeImages(album)
      const mapped = mapFindingRows(images, draftFindings, {
        odometerUrl: photoDraft.odometerUrl,
        pendingKeys: (photoDraft.pendingImages || []).map((img) => img && img.url),
        strictFindings,
      })
      const slot = pickOdometerSlot(photoDraft, mapped)
      const odoKey = mediaKey(slot.odometerUrl)
      const findingImages = images.filter((img) => {
        const key = mediaKey(img && img.url)
        if (odoKey && key === odoKey) return false
        return String((img && img.caption) || '').trim() !== '仪表'
      })
      return [
        {
          stageId: 'stage_2',
          title: meta.title,
          tips: '',
          captionPlaceholder: meta.captionPlaceholder,
          findingMode: true,
          findingKind: 'inspection',
          images: findingImages,
          findings: slot.findings,
          odometerUrl: slot.odometerUrl,
          odometerImageId: slot.odometerImageId,
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
          pendingKeys: (photoDraft.pendingImages || []).map((img) => img && img.url),
          strictFindings,
        })
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

  decorateQuoteLines(lines = [], evidenceFindings = []) {
    const pool = (evidenceFindings || []).filter((row) => isQuoteEvidenceFinding(row))
    const taken = {}
    const evidenceKey = (url) => mediaKey(url) || String(url || '').trim()
    ;(lines || []).forEach((line, index) => {
      listQuoteLineEvidenceUrls(line).forEach((url) => {
        const key = evidenceKey(url)
        if (key) taken[key] = index
      })
    })
    return (lines || []).map((line, index) => {
      const normalized = normalizeQuoteLine(line)
      const urls = listQuoteLineEvidenceUrls(normalized)
      return {
        ...line,
        ...normalized,
        lineKey: line.lineKey || `ql-${index}-${Math.random().toString(36).slice(2, 8)}`,
        evidenceThumbs: urls.map((url) => {
          const key = evidenceKey(url)
          const hit = pool.find((row) => evidenceKey(row.url) === key)
          return { url: (hit && hit.url) || url, partName: (hit && hit.partName) || '' }
        }),
        evidencePool: pool.map((row) => {
          const key = evidenceKey(row.url)
          return {
            url: row.url,
            partName: row.partName || '',
            selected: taken[key] === index,
            taken: taken[key] !== undefined && taken[key] !== index,
          }
        }),
      }
    })
  },

  expandQuoteEvidence(findings = []) {
    const out = []
    ;(findings || []).filter((row) => isQuoteEvidenceFinding(row)).forEach((row) => {
      const item = normalizeFinding(row)
      const shots = item.images.length ? item.images : []
      shots.forEach((shot) => {
        if (!shot || !shot.url) return
        out.push({ ...item, url: shot.url, imageId: shot.imageId || '' })
      })
    })
    return out
  },

  quoteEvidenceSource() {
    if (this.data.isAddonQuote) return []
    return this.data.quoteEvidenceFindings || this.data.findings || []
  },

  setQuoteLines(lines) {
    const quoteLines = this.decorateQuoteLines(lines, this.quoteEvidenceSource())
    this.setData(
      {
        quoteLines,
        quoteTotalLabel: `合计 ¥${sumQuoteAmounts(quoteLines).toFixed(2)}`,
        autoSaveLabel: '保存中…',
      },
      () => this.scheduleAutoSaveDoc(),
    )
  },

  syncQuoteEvidenceFromFindings() {
    if (this.data.isAddonQuote || this.data.activeKind !== 'inspection_report') return
    const quoteEvidenceFindings = this.expandQuoteEvidence(this.data.findings)
    const quoteLines = this.decorateQuoteLines(this.data.quoteLines, quoteEvidenceFindings)
    this.setData({
      quoteEvidenceFindings,
      quoteLines,
      quoteTotalLabel: `合计 ¥${sumQuoteAmounts(quoteLines).toFixed(2)}`,
    })
  },

  collectFindingsFromSections(sections = this.data.sections) {
    const findingSection = (sections || []).find((s) => s.findingMode)
    if (!findingSection) return []
    const kind = findingSection.findingKind || 'inspection'
    return (findingSection.findings || [])
      .filter((raw) => {
        if (!raw || !raw.fromAi) return true
        if (kind === 'work') return Boolean((raw.images && raw.images.length) || raw.url || raw.partName)
        return Boolean(raw.url || raw.partName)
      })
      .map((item, index) =>
        kind === 'work'
          ? normalizeWorkFinding(item, index)
          : normalizeFinding(item, index),
      )
      .filter((item) => {
        if (kind === 'work') return item.images.length || item.partName
        return item.url || item.partName || (item.images && item.images.length)
      })
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
    const extras = {
      fromAi: Boolean(item.fromAi),
      aiSuggestionId: item.aiSuggestionId || '',
      captionPlaceholder: item.captionPlaceholder || '',
      advicePlaceholder: item.advicePlaceholder || '',
      photoHint: item.photoHint || null,
      adviceHint: item.adviceHint || null,
      captionHint: item.captionHint || null,
      hasCollapsedHints: Boolean(
        (item.photoHint && !item.photoHint.applied) ||
          (item.captionHint && !item.captionHint.applied) ||
          (item.adviceHint && !item.adviceHint.applied),
      ),
    }
    if (findingKind === 'work') {
      const row = normalizeWorkFinding(item)
      const missing = this.countFindingMissingFields(row, findingKind)
      const hasPhoto = row.images.length > 0
      return {
        ...row,
        ...extras,
        findingKind: 'work',
        pendingPhoto: !hasPhoto,
        captionPlaceholder:
          extras.captionPlaceholder ||
          (this._placeholders && this._placeholders.workCaption) ||
          this.data.workCaptionPlaceholder ||
          '选填，例：已按规定扭矩紧固并排气',
        listKey: listKey || row.imageId || row.url || `pending-${row.partName || extras.aiSuggestionId || ''}`,
        expanded: Boolean(expanded),
        complete: hasPhoto && missing === 0,
        summaryText: row.partName || '待填写',
        completenessLabel: !hasPhoto
          ? '待拍照'
          : missing === 0
            ? row.outsideQuote
              ? '报价没有'
              : row.caption || `${row.images.length} 张`
            : '缺项目',
        labelToneDanger: !hasPhoto || missing > 0 || row.outsideQuote,
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
    const hasPhoto = (row.images && row.images.length > 0) || Boolean(row.url)
    return {
      ...row,
      ...extras,
      findingKind: 'inspection',
      pendingPhoto: !hasPhoto,
      recordOnly: row.result === FINDING_RESULT.RECORD,
      listKey: listKey || row.imageId || row.url || `pending-${row.partName || extras.aiSuggestionId || ''}`,
      expanded: Boolean(expanded),
      complete: missing === 0 && hasPhoto,
      summaryText: row.partName || '待填写',
      completenessLabel: !hasPhoto
        ? '待拍照'
        : missing === 0
          ? row.result || '已齐'
          : `缺 ${missing} 项`,
      labelToneDanger: !hasPhoto || missing > 0,
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

  findingChromePatch(sections, pendingImages) {
    const findingSection = (sections || []).find((row) => row && row.findingMode)
    const findings = (findingSection && findingSection.findings) || []
    return {
      hasFindingItems: findings.length > 0,
      hasOutsideQuoteItems: findings.some((row) => row && row.outsideQuote),
    }
  },

  setSectionsWithFindings(sections, extra = {}, expandKey) {
    const expandedFindingKey =
      expandKey === undefined ? this.data.expandedFindingKey : expandKey
    const decorated = this.decorateSections(sections, expandedFindingKey)
    const pending =
      extra.pendingImages !== undefined ? extra.pendingImages : this.data.pendingImages
    const patch = {
      sections: decorated,
      expandedFindingKey,
      ...this.findingChromePatch(decorated, pending),
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
    // 接车＝留证：主诉 / 里程 / 对外车型 / 仪表 / 环车清单勾选
    if (kind === 'intake') {
      return {
        chiefComplaint: this.data.chiefComplaint,
        mileageKm: parseMileageKm(this.data.mileageKm),
        fuelReading: String(this.data.fuelReading || '').trim(),
        vehicleBrand: String(this.data.vehicleBrand || '').trim(),
        vehicleSeries: String(this.data.vehicleSeries || '').trim(),
        vehicleYear: String(this.data.vehicleYear || '').trim(),
        odometerUrl: String(this.data.odometerUrl || '').trim(),
        odometerImageId: String(this.data.odometerImageId || '').trim(),
        intakeResults: (this.data.intakeResults || []).map((row) => normalizeIntakeResult(row)),
        pendingImages: normalizePendingImages(this.data.pendingImages),
      }
    }
    // 检测＝细查：部位 findings + 结论（结论进检测报告）
    if (kind === 'inspection') {
      return {
        findings: this.collectFindingsFromSections(),
        conclusion: this.data.conclusion,
        pendingImages: normalizePendingImages(this.data.pendingImages),
      }
    }
    // 存量合并节点（v5）
    if (kind === 'intake_inspection') {
      const odometerUrl = String(this.data.odometerUrl || '').trim()
      return {
        chiefComplaint: this.data.chiefComplaint,
        mileageKm: parseMileageKm(this.data.mileageKm),
        vehicleBrand: String(this.data.vehicleBrand || '').trim(),
        vehicleSeries: String(this.data.vehicleSeries || '').trim(),
        vehicleYear: String(this.data.vehicleYear || '').trim(),
        conclusion: this.data.conclusion,
        odometerUrl,
        odometerImageId: String(this.data.odometerImageId || '').trim(),
        findings: this.collectFindingsFromSections().filter(
          (row) => row.url !== odometerUrl && !isOdometerFinding(row),
        ),
        pendingImages: normalizePendingImages(this.data.pendingImages),
      }
    }
    if (kind === 'work') {
      return {
        findings: this.collectFindingsFromSections(),
        pendingImages: normalizePendingImages(this.data.pendingImages),
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
      const placeholders = getFlowPlaceholders(album.templateId, album.serviceName)
      this._placeholders = placeholders
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
            active.kind === 'intake' ||
            active.kind === 'inspection' ||
            active.kind === 'work' ||
            active.kind === 'delivery_photos'),
      )
      const activeIsDoc = Boolean(active && active.document)
      const docPayload = (active && active.document && active.document.payload) || {}
      let photoDraft = { ...((active && active.photoDraft) || {}) }
      if (active && active.id) {
        const local = readLocalFlowDraft(this.albumId, active.id)
        if (local && local.photoDraft) {
          photoDraft = { ...photoDraft, ...local.photoDraft }
        }
      }
      const isIntakePhotoStep = Boolean(
        activeIsPhoto &&
          active &&
          (active.kind === 'intake' || active.kind === 'intake_inspection'),
      )
      const isInspectionPhotoStep = Boolean(
        activeIsPhoto && active && (active.kind === 'inspection' || active.kind === 'intake_inspection'),
      )
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
      let walkaround = []
      let quoteLines = [{ name: '', amount: '', note: '' }]
      this._quoteDraftHint = ''
      let expandedFindingKey = ''
      let workImagePool = []
      let deliveryExteriorUrl = ''
      let deliveryPickMode = ''
      let deliveryExtraCount = 0

      if (activeIsPhoto && active) {
        sections = this.buildSections(album, active, photoDraft, flowNodes)
        // 主诉 / 环车勾选记在接车步
        if (isIntakePhotoStep) {
          chiefComplaint = photoDraft.chiefComplaint || ''
          walkaround = Array.isArray(photoDraft.walkaround) ? photoDraft.walkaround : []
        }
        // findings / 结论记在检测步（结论进检测报告）
        if (isInspectionPhotoStep) {
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
          const packed = this.hydrateDeliveryPool(album, flowNodes, photoDraft, deliveryExteriorUrl)
          workImagePool = packed.workImagePool
          deliveryExtraCount = packed.deliveryExtraCount
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
                recordOnly: row.result === FINDING_RESULT.RECORD,
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
          const quoteDraft = buildQuoteDraft({
            findings,
            templateId: album.templateId,
            serviceName: album.serviceName,
          })
          const unpriced =
            !fromQuote.some((row) => {
              const n = Number(row.amount)
              return Number.isFinite(n) && n > 0
            })
          const canRefreshOpenDraft =
            unpriced &&
            quoteDraft.mode === 'teardown' &&
            (!hasNamed || String((fromQuote[0] && fromQuote[0].name) || '') === '拆检')
          quoteLines =
            hasNamed && !canRefreshOpenDraft
              ? fromQuote
              : quoteDraft.lines.length
                ? quoteDraft.lines.map((line) => normalizeQuoteLine(line))
                : [{ name: '', brand: '', amount: '', note: '', evidenceUrl: '', evidenceUrls: [] }]
          if (!quoteLines.length) {
            quoteLines = [{ name: '', brand: '', amount: '', note: '', evidenceUrl: '', evidenceUrls: [] }]
          }
          confirmCopy = quotePayload.confirmCopy || quoteDraft.confirmCopy
          this._quoteDraftHint = quoteDraft.merchantHint
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
      const discovery =
        isAddonQuote && docPayload.discovery && typeof docPayload.discovery === 'object'
          ? docPayload.discovery
          : {}
      const addonDiscoveryImages = Array.isArray(discovery.images)
        ? discovery.images.filter(Boolean)
        : []
      const addonDiscoveryNote = String(discovery.note || '')
      const addonDiscoveryReady = Boolean(
        discovery.ready && addonDiscoveryImages.length && addonDiscoveryNote.trim(),
      )
      const ownerRejectReason = String(
        (active && active.document && active.document.ownerRejectReason) || '',
      ).trim()
      let quoteEvidenceFindings = []
      if (!isAddonQuote) {
        if (active && active.kind === 'inspection_report') {
          quoteEvidenceFindings = this.expandQuoteEvidence(findings)
        } else if (active && active.kind === 'quote_confirm') {
          const report = flowNodes.find((n) => n && n.kind === 'inspection_report')
          const reportFindings =
            (report &&
              report.document &&
              report.document.payload &&
              report.document.payload.findings) ||
            []
          quoteEvidenceFindings = this.expandQuoteEvidence(reportFindings)
          if (!(quoteLines || []).some((row) => String(row.name || '').trim())) {
            const quoteDraft = buildQuoteDraft({
              findings: reportFindings,
              templateId: album.templateId,
              serviceName: album.serviceName,
            })
            this._quoteDraftHint = quoteDraft.merchantHint
            if (quoteDraft.lines.length) {
              quoteLines = quoteDraft.lines.map((line) => normalizeQuoteLine(line))
            }
            if (!String(confirmCopy || '').trim()) confirmCopy = quoteDraft.confirmCopy
          } else {
            const quoteDraft = buildQuoteDraft({
              findings: reportFindings,
              templateId: album.templateId,
              serviceName: album.serviceName,
            })
            this._quoteDraftHint = quoteDraft.merchantHint
          }
        }
      }
      const quoteDraftHint = isAddonQuote ? '' : this._quoteDraftHint || ''
      quoteLines = this.decorateQuoteLines(quoteLines, quoteEvidenceFindings)
      const rawSummary = showCombinedPlan
        ? ''
        : (active && (active.photoTips || active.summary)) || ''
      let activeSummary = rawSummary === '草稿' ? '' : rawSummary
      if (isInspectionPhotoStep && placeholders.inspectionTips) {
        activeSummary = placeholders.inspectionTips
      } else if (isWorkPhotoStep) {
        activeSummary = placeholders.workTips || '新旧配件、关键工序'
      } else if (isIntakePhotoStep || isDeliveryPhotoStep) {
        activeSummary = ''
      }
      const activeTitleRaw = showCombinedPlan
        ? '核对报告与方案'
        : isAddonQuote
          ? '施工中新发现'
          : (active && active.title) || ''
      const activeTitle = active
        ? withFlowStepOrdinal(activeTitleRaw, completedSteps.length + 1)
        : ''

      const albumVehicle = (album && album.vehicle) || {}
      const mileageKm = isIntakePhotoStep
        ? parseMileageKm(photoDraft.mileageKm || albumVehicle.mileage || albumVehicle.mileageKm)
        : parseMileageKm(photoDraft.mileageKm)
      const vehicleBrand = isIntakePhotoStep
        ? String(photoDraft.vehicleBrand || albumVehicle.brand || '').trim()
        : String(photoDraft.vehicleBrand || '').trim()
      const vehicleSeries = isIntakePhotoStep
        ? String(photoDraft.vehicleSeries || albumVehicle.series || '').trim()
        : String(photoDraft.vehicleSeries || '').trim()
      const vehicleYear = isIntakePhotoStep
        ? String(
            photoDraft.vehicleYear || albumVehicle.modelYear || albumVehicle.year || '',
          ).trim()
        : String(photoDraft.vehicleYear || '').trim()

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
        activeCategory: '',
        activeKind: (active && active.kind) || '',
        showActive: Boolean(active),
        activeIsPhoto,
        activeIsDoc,
        isIntakePhotoStep,
        isInspectionPhotoStep,
        isDeliveryPhotoStep,
        isWorkPhotoStep,
        photoConfirmLabel: '确认并继续',
        chiefComplaintPlaceholder: isIntakePhotoStep
          ? '记录你要修的问题、故障出现时机等'
          : placeholders.chiefComplaint,
        findingPartPlaceholder: placeholders.findingPart,
        findingAdvicePlaceholder: placeholders.findingAdvice,
        quoteJobPlaceholder: placeholders.quoteJob,
        quoteNotePlaceholder: placeholders.quoteNote,
        workJobPlaceholder: placeholders.quoteJob,
        workCaptionPlaceholder: placeholders.workCaption,
        photoConfirmDisabled: false,
        notifyOwnerLabel: '通知车主',
        notifyConfirmDisabled: false,
        chiefComplaintHint: null,
        odometerHint: null,
        warrantyHint: null,
        orphanPhotoHints: [],
        aiReview: null,
        sections,
        pendingImages: normalizePendingImages(photoDraft.pendingImages),
        organizingPhotos: false,
        organizeResultHint: '',
        intakeResults: Array.isArray(photoDraft.intakeResults)
          ? photoDraft.intakeResults.map((row) => normalizeIntakeResult(row))
          : [],
        fuelReading: String(photoDraft.fuelReading || '').trim(),
        intakeImagePool: [],
        isAppearanceService: ['body_paint', 'accident'].indexOf(placeholders.category) >= 0,
        canUseLibrary: Boolean(isInspectionPhotoStep || isWorkPhotoStep),
        organizedOnce: Boolean(
          (isInspectionPhotoStep || isWorkPhotoStep) &&
            sections.some((row) => row && row.findingMode && (row.findings || []).length),
        ),
        ...this.findingChromePatch(sections, photoDraft.pendingImages),
        showLibrary: false,
        libraryBusy: false,
        libraryItems: [],
        walkaround,
        walkaroundParts: WALKAROUND_PARTS.map((row) => ({
          ...row,
          checked: walkaround.indexOf(row.id) >= 0,
        })),
        expandedFindingKey,
        docPayload,
        findings,
        chiefComplaint,
        mileageKm,
        odometerUrl: isIntakePhotoStep ? String((sections[0] && sections[0].odometerUrl) || '').trim() : '',
        odometerImageId: isIntakePhotoStep
          ? String((sections[0] && sections[0].odometerImageId) || '').trim()
          : '',
        odometerOcrBusy: false,
        vehicleBrand,
        vehicleSeries,
        vehicleYear,
        quoteLines,
        quoteDraftHint,
        quoteEvidenceFindings,
        quoteTotalLabel: `合计 ¥${sumQuoteAmounts(quoteLines).toFixed(2)}`,
        quoteNodeId: this._quoteNodeId || '',
        docStatus,
        showCombinedPlan,
        quotePendingOwner,
        confirmAwaitingOwner,
        isAddonQuote,
        addonDiscoveryImages,
        addonDiscoveryNote,
        addonDiscoveryReady,
        ownerRejectReason,
        quoteEvidenceLocked: Boolean(readOnly || confirmAwaitingOwner),
        conclusion,
        confirmCopy,
        warrantyPeriod,
        warrantyNotes,
        proxyProofImages: ((active && active.document && active.document.proxyProofImages) || []).map(
          (url) => ({ url }),
        ),
        progressLabel: '',
        lockedHint: '',
        captionHint: '',
        autoSaveLabel: '',
        showAutoSave: false,
        allDone: Boolean(progress.allDone),
        needManualComplete: Boolean(
          progress.allDone &&
            !readOnly &&
            status !== SERVICE_ALBUM_STATUS.COMPLETED &&
            status !== 'published',
        ),
        albumCompleted:
          status === SERVICE_ALBUM_STATUS.COMPLETED || status === 'published',
        showHostEntry:
          status === SERVICE_ALBUM_STATUS.COMPLETED || status === 'published',
        hosted: Boolean((album.hostMeta && album.hostMeta.hosted) || false),
        hostVisibility: (album.hostMeta && album.hostMeta.visibility) || 'private',
        workImagePool,
        deliveryExtraCount,
        deliveryExteriorUrl,
        deliveryPickMode,
      })
      this._nodeAiReviewEntitled = Boolean(flow.nodeAiReview && flow.nodeAiReview.entitled)
      this.resumeAiReviewFromNode(active)
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
    const next = (images || []).map((img) => {
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
    const pending = (prevFindings || []).filter((item) => {
      if (findingKind === 'work') {
        const row = normalizeWorkFinding(item)
        return !row.images.length && (item.fromAi || row.partName)
      }
      return !item.url && (item.fromAi || item.pendingPhoto || item.aiSuggestionId)
    })
    return next.concat(pending)
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
      const findings = (row.findings || []).filter((_, idx) => idx !== findingIndex)
      return {
        ...row,
        findings,
        images:
          row.findingKind === 'work'
            ? row.images
            : this.findingImagesFromRows(findings, this.data.odometerUrl),
      }
    })
    let expandKey = this.data.expandedFindingKey
    const [esi, efi] = String(expandKey || '').split(':').map(Number)
    if (esi === sectionIndex) {
      if (efi === findingIndex) expandKey = ''
      else if (efi > findingIndex) expandKey = `${sectionIndex}:${efi - 1}`
    }
    const aiReview = this.dismissAiSuggestionIds(this.suggestionIdsOnFinding(target))
    this.setSectionsWithFindings(
      sections,
      {
        autoSaveLabel: '保存中…',
        ...(aiReview ? { aiReview } : {}),
      },
      expandKey,
    )
    this.scheduleAutoSavePhotos()
    this.scheduleParkDetachedPhotos()
  },

  withFindingMeta(item, nextRaw, extra = {}) {
    const placeholder =
      extra.captionPlaceholder ||
      item.captionPlaceholder ||
      (item.photoHint && item.photoHint.body) ||
      ''
    const photoHint = extra.photoHint !== undefined
      ? extra.photoHint
      : item.photoHint
        ? { ...item.photoHint, ...((extra.photoHintPatch) || {}) }
        : null
    return {
      ...nextRaw,
      fromAi: Boolean(item.fromAi),
      aiSuggestionId: item.aiSuggestionId || '',
      captionPlaceholder: placeholder,
      advicePlaceholder: extra.advicePlaceholder || item.advicePlaceholder || '',
      photoHint,
      adviceHint: item.adviceHint || null,
      captionHint: item.captionHint || null,
    }
  },

  markAiSuggestionApplied(id) {
    if (!id || !this.data.aiReview) return null
    const suggestions = (this.data.aiReview.suggestions || []).map((row) =>
      row && row.id === id ? { ...row, applied: true } : row,
    )
    return this.decorateAiReview({ ...this.data.aiReview, suggestions })
  },

  onAttachFindingPhoto(e) {
    if (this.data.readOnly) return
    const ds = (e.currentTarget && e.currentTarget.dataset) || {}
    const si = Number(ds.sectionIndex)
    const fi = Number(ds.findingIndex)
    if (!Number.isFinite(si) || !Number.isFinite(fi)) return
    const section = this.data.sections[si]
    if (!section || !section.findings || !section.findings[fi]) return
    const currentItem = section.findings[fi]
    const isWork = section.findingKind === 'work'
    if (isWork) {
      const current = normalizeWorkFinding(currentItem)
      const remain = Math.max(0, WORK_IMAGES_MAX - current.images.length)
      if (remain < 1) {
        wx.showToast({ title: `每项最多 ${WORK_IMAGES_MAX} 张`, icon: 'none' })
        return
      }
      pickLocalImages({
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
            const hintBody = (currentItem.photoHint && currentItem.photoHint.body) || currentItem.captionPlaceholder || ''
            const sections = this.data.sections.map((row, i) => {
              if (i !== si) return row
              const findings = (row.findings || []).map((item, idx) => {
                if (idx !== fi) return item
                const prev = normalizeWorkFinding(item)
                const images = prev.images.concat(uploadedList).slice(0, WORK_IMAGES_MAX)
                return this.withFindingMeta(
                  item,
                  normalizeWorkFinding({
                    ...prev,
                    images,
                    partName: prev.partName,
                    caption: prev.caption,
                  }),
                  {
                    captionPlaceholder: hintBody,
                    photoHint: item.photoHint ? { ...item.photoHint, applied: true } : null,
                  },
                )
              })
              return {
                ...row,
                findings,
                images: this.flattenWorkSectionImages(findings),
              }
            })
            const appliedId = currentItem.aiSuggestionId || (currentItem.photoHint && currentItem.photoHint.id)
            this.setSectionsWithFindings(
              sections,
              {
                autoSaveLabel: '保存中…',
                aiReview: this.markAiSuggestionApplied(appliedId) || this.data.aiReview,
              },
              `${si}:${fi}`,
            )
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
    const remain = Math.max(0, WORK_IMAGES_MAX - normalizeFinding(currentItem).images.length)
    if (remain < 1) {
      wx.showToast({ title: `每项最多 ${WORK_IMAGES_MAX} 张`, icon: 'none' })
      return
    }
    pickLocalImages({
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
          const hintBody = (currentItem.photoHint && currentItem.photoHint.body) || currentItem.captionPlaceholder || ''
          const sections = this.data.sections.map((row, i) => {
            if (i !== si) return row
            const findings = (row.findings || []).map((item, idx) => {
              if (idx !== fi) return item
              const base = normalizeFinding(item)
              const images = base.images.concat(uploadedList).slice(0, WORK_IMAGES_MAX)
              return this.withFindingMeta(
                item,
                normalizeFinding({
                  ...base,
                  images,
                  url: images[0].url,
                  imageId: images[0].imageId || '',
                  partName: base.partName,
                  result: base.result,
                  advice: base.advice,
                }),
                {
                  advicePlaceholder: String(base.advice || '').trim()
                    ? item.advicePlaceholder
                    : hintBody,
                  photoHint: item.photoHint ? { ...item.photoHint, applied: true } : null,
                },
              )
            })
            return {
              ...row,
              findings,
              images: this.findingImagesFromRows(findings, this.data.odometerUrl),
            }
          })
          const appliedId = currentItem.aiSuggestionId || (currentItem.photoHint && currentItem.photoHint.id)
          this.setSectionsWithFindings(
            sections,
            {
              autoSaveLabel: '保存中…',
              aiReview: this.markAiSuggestionApplied(appliedId) || this.data.aiReview,
            },
            `${si}:${fi}`,
          )
          this.scheduleAutoSavePhotos()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
    })
  },

  onAttachReportFindingPhoto(e) {
    if (this.data.readOnly) return
    const fi = Number((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index))
    if (!Number.isFinite(fi)) return
    const currentItem = (this.data.findings || [])[fi]
    if (!currentItem) return
    const current = normalizeFinding(currentItem)
    const remain = Math.max(0, FINDING_IMAGES_MAX - (current.images || []).length)
    if (remain < 1) {
      wx.showToast({ title: `每项最多 ${FINDING_IMAGES_MAX} 张`, icon: 'none' })
      return
    }
    pickLocalImages({
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
          const findings = (this.data.findings || []).map((row, idx) => {
            if (idx !== fi) return row
            const base = normalizeFinding(row)
            const images = (base.images || []).concat(uploadedList).slice(0, FINDING_IMAGES_MAX)
            const first = images[0] || {}
            return {
              ...row,
              ...base,
              images,
              url: first.url || '',
              imageId: first.imageId || '',
              photoHint: row.photoHint ? { ...row.photoHint, applied: true } : null,
            }
          })
          const appliedId = currentItem.aiSuggestionId || (currentItem.photoHint && currentItem.photoHint.id)
          this.setData({
            findings,
            autoSaveLabel: '保存中…',
            aiReview: this.markAiSuggestionApplied(appliedId) || this.data.aiReview,
          })
          this.scheduleAutoSaveDoc()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
    })
  },

  onRemoveFindingImage(e) {
    if (this.data.readOnly) return
    const si = Number(e.currentTarget.dataset.sectionIndex)
    const fi = Number(e.currentTarget.dataset.findingIndex)
    const imgIndex = Number(String(e.currentTarget.dataset.imgIndex || '').replace(/^idx-/, ''))
    if (!Number.isFinite(si) || !Number.isFinite(fi) || !Number.isFinite(imgIndex)) return
    const sections = this.data.sections.map((row, i) => {
      if (i !== si) return row
      const findings = (row.findings || []).map((item, idx) => {
        if (idx !== fi) return item
        if (row.findingKind === 'work') {
          const prev = normalizeWorkFinding(item)
          const images = prev.images.filter((_, j) => j !== imgIndex)
          return this.withFindingMeta(
            item,
            normalizeWorkFinding({
              ...prev,
              images,
              url: '',
              imageId: '',
            }),
          )
        }
        const prev = normalizeFinding(item)
        const images = prev.images.filter((_, j) => j !== imgIndex)
        return this.withFindingMeta(
          item,
          normalizeFinding({
            ...prev,
            images,
            url: (images[0] && images[0].url) || '',
            imageId: (images[0] && images[0].imageId) || '',
          }),
        )
      })
      return {
        ...row,
        findings,
        images:
          row.findingKind === 'work'
            ? this.flattenWorkSectionImages(findings)
            : this.findingImagesFromRows(findings, this.data.odometerUrl),
      }
    })
    this.setSectionsWithFindings(sections, { autoSaveLabel: '保存中…' }, `${si}:${fi}`)
    this.scheduleAutoSavePhotos()
    this.scheduleParkDetachedPhotos()
  },

  packDeliveryPool(pool = [], exteriorUrl = '') {
    const exterior = String(exteriorUrl || '').trim()
    const workImagePool = (pool || []).map((row) => ({
      ...row,
      isExterior: row.url === exterior,
    }))
    return {
      workImagePool,
      deliveryExtraCount: workImagePool.filter((row) => row.url && row.url !== exterior).length,
    }
  },

  collectWorkUrlSet(album = {}, flowNodes = []) {
    const set = {}
    this.collectAllWorkImages(album, flowNodes).forEach((row) => {
      const key = mediaKey(row && row.url)
      if (key) set[key] = true
    })
    return set
  },

  hydrateDeliveryPool(album = {}, flowNodes = [], photoDraft = {}, exteriorUrl = '') {
    const exterior = String(exteriorUrl || '').trim()
    const selectedSet = {}
    const exteriorKey = mediaKey(exterior)
    ;(photoDraft.selectedDeliveryUrls || []).forEach((url) => {
      const key = mediaKey(url)
      if (key && key !== exteriorKey) selectedSet[key] = true
    })
    const pool = this.collectAllWorkImages(album, flowNodes).map((row) => ({
      ...row,
      selected: Boolean(selectedSet[mediaKey(row.url)]),
    }))
    const seen = {}
    pool.forEach((row) => {
      const key = mediaKey(row && row.url)
      if (key) seen[key] = true
    })
    const pushCaptured = (url, caption = '') => {
      const u = String(url || '').trim()
      const key = mediaKey(u)
      if (!u || !key || key === exteriorKey || seen[key]) return
      seen[key] = true
      pool.push({
        url: u,
        partName: String(caption || '').trim(),
        selected: true,
        captured: true,
      })
    }
    ;(photoDraft.selectedDeliveryUrls || []).forEach((url) => pushCaptured(url))
    const stage6 = ((album && album.nodes) || []).find((n) => n && n.id === 'stage_6')
    ;((stage6 && stage6.images) || []).forEach((img) => {
      const url = typeof img === 'string' ? img : img && img.url
      const caption = typeof img === 'object' ? img.caption || '' : ''
      pushCaptured(url, caption)
    })
    return this.packDeliveryPool(pool, exterior)
  },

  appendDeliveryExtra(url, caption = '') {
    const extra = String(url || '').trim()
    const exterior = String(this.data.deliveryExteriorUrl || '').trim()
    const pool = (this.data.workImagePool || []).slice()
    if (!extra) return this.packDeliveryPool(pool, exterior)
    const sameShot = (row) =>
      row && (row.url === extra || (mediaKey(row.url) && mediaKey(row.url) === mediaKey(extra)))
    const exists = pool.find(sameShot)
    if (exists) {
      return this.packDeliveryPool(
        pool.map((row) =>
          sameShot(row) ? { ...row, selected: mediaKey(extra) !== mediaKey(exterior) } : row,
        ),
        exterior,
      )
    }
    pool.push({
      url: extra,
      partName: String(caption || '').trim(),
      selected: extra !== exterior,
      captured: true,
    })
    return this.packDeliveryPool(pool, exterior)
  },

  onToggleDeliveryWorkImage(e) {
    if (this.data.readOnly) return
    const url = String(e.currentTarget.dataset.url || '')
    if (!url) return
    if (this.data.deliveryPickMode === 'exterior') {
      const mapped = (this.data.workImagePool || []).map((row) => ({
        ...row,
        selected: row.url === url ? false : row.selected,
      }))
      const packed = this.packDeliveryPool(mapped, url)
      const sections = (this.data.sections || []).map((section) =>
        section.stageId === 'stage_6' ? { ...section, images: [] } : section,
      )
      this.setData({
        ...packed,
        deliveryExteriorUrl: url,
        deliveryPickMode: '',
        sections,
        autoSaveLabel: '保存中…',
      })
      this.scheduleAutoSavePhotos()
      return
    }
    if (url === this.data.deliveryExteriorUrl) {
      wx.showToast({ title: '已用作全车照片', icon: 'none' })
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
      wx.showToast({ title: '暂无施工图，请补拍', icon: 'none' })
      return
    }
    this.setData({ deliveryPickMode: 'exterior' })
  },

  onClearExterior() {
    if (this.data.readOnly) return
    const packed = this.packDeliveryPool(this.data.workImagePool || [], '')
    const sections = (this.data.sections || []).map((section) =>
      section.stageId === 'stage_6' ? { ...section, images: [] } : section,
    )
    this.setData({
      ...packed,
      deliveryExteriorUrl: '',
      deliveryPickMode: '',
      sections,
      autoSaveLabel: '保存中…',
    })
    this.scheduleAutoSavePhotos()
  },

  onCaptureExterior() {
    if (this.data.readOnly) return
    pickLocalImages({
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
          const packed = this.packDeliveryPool(
            (this.data.workImagePool || []).map((row) => ({
              ...row,
              selected: row.url === url ? false : row.selected,
            })),
            url,
          )
          const sections = (this.data.sections || []).map((section) => {
            if (section.stageId !== 'stage_6') return section
            return {
              ...section,
              images: [{ url, caption: '全车照片' }],
            }
          })
          this.setData({
            ...packed,
            deliveryExteriorUrl: url,
            deliveryPickMode: '',
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

  onPreviewExterior() {
    const url = String(this.data.deliveryExteriorUrl || '').trim()
    if (!url) return
    wx.previewImage({ current: url, urls: [url] })
  },

  onCaptureDeliveryExtra() {
    this.captureDeliveryExtraPhoto()
  },

  captureDeliveryExtraPhoto(appliedId = '') {
    if (this.data.readOnly) return
    const suggestion = ((this.data.aiReview && this.data.aiReview.suggestions) || []).find(
      (row) => row && row.id === appliedId,
    )
    const caption = String((suggestion && (suggestion.part || suggestion.title || suggestion.targetLabel)) || '')
      .replace(/^(补拍|补充)/, '')
      .trim()
    pickLocalImages({
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
          const packed = this.appendDeliveryExtra(url, caption)
          const patch = {
            ...packed,
            autoSaveLabel: '保存中…',
          }
          if (appliedId) {
            patch.aiReview = this.markAiSuggestionApplied(appliedId) || this.data.aiReview
            patch.orphanPhotoHints = (this.data.orphanPhotoHints || []).map((hint) =>
              hint && hint.id === appliedId ? { ...hint, applied: true } : hint,
            )
          }
          this.setData(patch)
          this.scheduleAutoSavePhotos()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
    })
  },

  onAddFindingPhotos() {
    if (this.data.readOnly) return
    const pending = normalizePendingImages(this.data.pendingImages)
    const remain = Math.max(0, 12 - pending.length)
    if (remain < 1) {
      wx.showToast({ title: '一次最多 12 张', icon: 'none' })
      return
    }
    pickLocalImages({
      count: remain,
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
            if (!url) continue
            uploadedList.push({
              url,
              imageId: (uploaded && (uploaded.id || uploaded.imageId)) || '',
            })
          }
          if (!uploadedList.length) throw new Error('上传失败')
          const pendingImages = normalizePendingImages(pending.concat(uploadedList))
          this.setData({
            pendingImages,
            ...this.findingChromePatch(this.data.sections, pendingImages),
          })
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
          return
        } finally {
          wx.hideLoading()
        }
        await this.onOrganizePhotos()
      },
    })
  },

  pendingIndexFromEvent(e) {
    const detail = (e && e.detail) || {}
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const raw = detail.index != null ? detail.index : ds.pendingIndex
    const n = Number(raw)
    return Number.isFinite(n) ? n : -1
  },

  intakeUnusedCategories() {
    const used = new Set((this.data.intakeResults || []).map((row) => row && row.category))
    return INTAKE_RECORD_CATEGORIES.filter((row) => !used.has(row.id))
  },

  onRemovePendingPhoto(e) {
    if (this.data.readOnly) return
    const index = this.pendingIndexFromEvent(e)
    if (index < 0) return
    const pendingImages = normalizePendingImages(this.data.pendingImages).filter(
      (_, i) => i !== index,
    )
    this.setData({
      pendingImages,
      autoSaveLabel: '保存中…',
      showAssignSheet: false,
      ...this.findingChromePatch(this.data.sections, pendingImages),
    })
    this.scheduleAutoSavePhotos()
    this.scheduleParkDetachedPhotos()
  },

  findingSectionIndex(sections = this.data.sections) {
    return (sections || []).findIndex((row) => row && row.findingMode)
  },

  onAddFindingItem(e) {
    if (this.data.readOnly) return
    let sectionIndex = Number(e.currentTarget.dataset.sectionIndex)
    if (!Number.isFinite(sectionIndex) || sectionIndex < 0) {
      sectionIndex = this.findingSectionIndex()
    }
    const section = this.data.sections[sectionIndex]
    if (!section || !section.findingMode) return
    const id = `fid_new_${Date.now()}`
    const blank =
      section.findingKind === 'work'
        ? normalizeWorkFinding({
            id,
            partName: '',
            caption: '',
            images: [],
            outsideQuote: workOutsideQuoteOf('', collectConfirmedQuoteNames(this._flowNodes || [])),
          })
        : normalizeFinding({ id, partName: '', result: '', advice: '', images: [] })
    const findings = (section.findings || []).concat([blank])
    const sections = this.data.sections.map((row, i) => {
      if (i !== sectionIndex) return row
      return {
        ...row,
        findings,
        images:
          row.findingKind === 'work'
            ? this.flattenWorkSectionImages(findings)
            : this.findingImagesFromRows(findings, this.data.odometerUrl),
      }
    })
    this.setSectionsWithFindings(
      sections,
      { autoSaveLabel: '保存中…' },
      `${sectionIndex}:${findings.length - 1}`,
    )
    this.scheduleAutoSavePhotos()
  },

  onOpenAssignPending(e) {
    if (this.data.readOnly) return
    const pendingIndex = this.pendingIndexFromEvent(e)
    if (pendingIndex < 0) return
    if (this.data.isIntakePhotoStep) {
      const list = this.data.intakeResults || []
      if (!list.length) {
        wx.showToast({ title: '先新开', icon: 'none' })
        return
      }
      this.setData({
        showAssignSheet: true,
        assignKind: 'intake',
        assignSheetTitle: '并入哪一类',
        assignPendingIndex: pendingIndex,
        assignTargets: list.map((row) => ({
          key: row.category,
          title: String((row && row.label) || row.category || '').trim() || '未命名',
        })),
      })
      return
    }
    const si = this.findingSectionIndex()
    const section = this.data.sections[si]
    const list = (section && section.findings) || []
    if (!list.length) {
      wx.showToast({ title: '先新开', icon: 'none' })
      return
    }
    this.setData({
      showAssignSheet: true,
      assignKind: 'finding',
      assignSheetTitle: '并入哪一项',
      assignPendingIndex: pendingIndex,
      assignTargets: list.map((row, index) => ({
        key: String(index),
        title: String((row && row.partName) || '').trim() || `第${index + 1}项`,
      })),
    })
  },

  onCloseAssignSheet() {
    this.setData({
      showAssignSheet: false,
      assignKind: 'finding',
      assignSheetTitle: '并入哪一项',
      assignPendingIndex: -1,
      assignTargets: [],
    })
  },

  onPickAssignTarget(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '')
    if (!key) return
    if (this.data.assignKind === 'intake') {
      this.attachPendingToIntake(this.data.assignPendingIndex, key)
      return
    }
    this.assignPendingToFinding(this.data.assignPendingIndex, Number(key))
  },

  attachPendingToIntake(pendingIndex, categoryId) {
    if (this.data.readOnly) return
    const pending = normalizePendingImages(this.data.pendingImages)
    const shot = pending[pendingIndex]
    if (!shot || !categoryId) return
    const leftover = pending.filter((_, i) => i !== pendingIndex)
    let found = false
    const intakeResults = (this.data.intakeResults || []).map((row) => {
      if (row.category !== categoryId) return row
      found = true
      return normalizeIntakeResult({
        ...row,
        images: (row.images || []).concat([{ url: shot.url, imageId: shot.imageId || '' }]),
      })
    })
    if (!found) {
      intakeResults.push(
        normalizeIntakeResult({
          category: categoryId,
          images: [{ url: shot.url, imageId: shot.imageId || '' }],
        }),
      )
    }
    const odo = intakeResults.find((row) => row.category === 'odometer')
    const odoShot = odo && odo.images && odo.images[0]
    this.setData({
      intakeResults,
      pendingImages: leftover,
      odometerUrl: odoShot ? odoShot.url : this.data.odometerUrl,
      odometerImageId: odoShot ? odoShot.imageId || '' : this.data.odometerImageId,
      showAssignSheet: false,
      assignPendingIndex: -1,
      assignTargets: [],
      autoSaveLabel: '保存中…',
    })
    this.scheduleAutoSavePhotos()
  },

  assignPendingToFinding(pendingIndex, findingIndex) {
    if (this.data.readOnly) return
    const pending = normalizePendingImages(this.data.pendingImages)
    const shot = pending[pendingIndex]
    const si = this.findingSectionIndex()
    const section = this.data.sections[si]
    if (!shot || !section || !section.findings || !section.findings[findingIndex]) return
    const isWork = section.findingKind === 'work'
    const current = isWork
      ? normalizeWorkFinding(section.findings[findingIndex])
      : normalizeFinding(section.findings[findingIndex])
    if (current.images.length >= WORK_IMAGES_MAX) {
      wx.showToast({ title: `每项最多 ${WORK_IMAGES_MAX} 张`, icon: 'none' })
      return
    }
    const nextImages = current.images.concat([{ url: shot.url, imageId: shot.imageId || '' }]).slice(
      0,
      WORK_IMAGES_MAX,
    )
    const leftover = pending.filter((_, i) => i !== pendingIndex)
    const sections = this.data.sections.map((row, i) => {
      if (i !== si) return row
      const findings = (row.findings || []).map((item, idx) => {
        if (idx !== findingIndex) return item
        if (isWork) {
          return this.withFindingMeta(
            item,
            normalizeWorkFinding({ ...current, images: nextImages }),
          )
        }
        return this.withFindingMeta(
          item,
          normalizeFinding({
            ...current,
            images: nextImages,
            url: nextImages[0].url,
            imageId: nextImages[0].imageId || '',
          }),
        )
      })
      return {
        ...row,
        findings,
        images: isWork
          ? this.flattenWorkSectionImages(findings)
          : this.findingImagesFromRows(findings, this.data.odometerUrl),
      }
    })
    this.setSectionsWithFindings(
      sections,
      {
        pendingImages: leftover,
        autoSaveLabel: '保存中…',
        showAssignSheet: false,
        assignPendingIndex: -1,
        assignTargets: [],
      },
      `${si}:${findingIndex}`,
    )
    this.scheduleAutoSavePhotos()
  },

  onPromotePendingToFinding(e) {
    if (this.data.readOnly) return
    const pendingIndex = this.pendingIndexFromEvent(e)
    const pending = normalizePendingImages(this.data.pendingImages)
    const shot = pending[pendingIndex]
    if (!shot) return
    if (this.data.isIntakePhotoStep) {
      const unused = this.intakeUnusedCategories()
      const list = unused.length ? unused : INTAKE_RECORD_CATEGORIES
      this.setData({
        showAssignSheet: true,
        assignKind: 'intake',
        assignSheetTitle: '新开哪一类',
        assignPendingIndex: pendingIndex,
        assignTargets: list.map((row) => ({
          key: row.id,
          title: row.label,
        })),
      })
      return
    }
    const si = this.findingSectionIndex()
    const section = this.data.sections[si]
    if (!section) return
    const id = `fid_new_${Date.now()}`
    const created =
      section.findingKind === 'work'
        ? normalizeWorkFinding({
            id,
            partName: '',
            caption: '',
            images: [{ url: shot.url, imageId: shot.imageId || '' }],
            outsideQuote: workOutsideQuoteOf('', collectConfirmedQuoteNames(this._flowNodes || [])),
          })
        : normalizeFinding({
            id,
            partName: '',
            result: '',
            advice: '',
            images: [{ url: shot.url, imageId: shot.imageId || '' }],
          })
    const leftover = pending.filter((_, i) => i !== pendingIndex)
    const findings = (section.findings || []).concat([created])
    const sections = this.data.sections.map((row, i) => {
      if (i !== si) return row
      return {
        ...row,
        findings,
        images:
          row.findingKind === 'work'
            ? this.flattenWorkSectionImages(findings)
            : this.findingImagesFromRows(findings, this.data.odometerUrl),
      }
    })
    this.setSectionsWithFindings(
      sections,
      { pendingImages: leftover, autoSaveLabel: '保存中…' },
      `${si}:${findings.length - 1}`,
    )
    this.scheduleAutoSavePhotos()
  },

  onPreviewPendingPhoto(e) {
    const url = String(
      (e.detail && e.detail.url) ||
        (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.url) ||
        '',
    ).trim()
    const urls = normalizePendingImages(this.data.pendingImages).map((img) => img.url)
    if (!urls.length) return
    wx.previewImage({ current: url || urls[0], urls })
  },

  collectPendingForOrganize(kind) {
    if (kind === 'intake') {
      const section = (this.data.sections || []).find((row) => row && !row.findingMode) || this.data.sections[0]
      const byKey = {}
      normalizePendingImages(section && section.images)
        .concat(normalizePendingImages(this.data.pendingImages))
        .forEach((img) => {
          const key = mediaKey(img && img.url)
          if (key) byKey[key] = img
        })
      return Object.keys(byKey).map((k) => byKey[k])
    }
    return normalizePendingImages(this.data.pendingImages)
  },

  applyIntakeOrganize(res) {
    const pending = this.collectPendingForOrganize('intake')
    const applied = applyIntakeOrganizeGroups({
      pendingImages: pending,
      groups: (res && res.groups) || [],
      prevResults: this.data.intakeResults,
    })
    const leftover = applied.pendingImages
    const leftoverKeys = new Set(leftover.map((img) => mediaKey(img && img.url)))
    const usedKeys = new Set()
    pending.forEach((img) => {
      const key = mediaKey(img && img.url)
      if (key && !leftoverKeys.has(key)) usedKeys.add(key)
    })
    const sections = (this.data.sections || []).map((row) => {
      if (row.findingMode) return row
      return {
        ...row,
        images: normalizePendingImages(row.images).filter((img) => {
          const key = mediaKey(img && img.url)
          if (!key) return false
          if (leftoverKeys.has(key) || usedKeys.has(key)) return false
          return true
        }),
      }
    })
    this.setData({
      sections,
      intakeResults: applied.intakeResults,
      pendingImages: leftover,
      mileageKm: applied.mileageKm || this.data.mileageKm,
      fuelReading: applied.fuelReading || this.data.fuelReading,
      odometerUrl: applied.odometerUrl || this.data.odometerUrl,
      odometerImageId: applied.odometerImageId || this.data.odometerImageId,
      autoSaveLabel: '保存中…',
    })
    this.scheduleAutoSavePhotos()
  },

  summarizeOrganizeResult(pending = [], findings = [], leftover = []) {
    const names = []
    const seen = new Set()
    ;(pending || []).forEach((img) => {
      const key = mediaKey(img && img.url)
      if (!key) return
      const host = (findings || []).find((row) =>
        ((row && row.images) || []).some((shot) => mediaKey(shot && shot.url) === key),
      )
      if (!host) return
      const name = String((host && host.partName) || '').trim() || '未填部位'
      if (seen.has(name)) return
      seen.add(name)
      names.push(name)
    })
    const leftoverCount = (leftover || []).length
    if (!names.length) {
      return leftoverCount ? `未成项，余 ${leftoverCount} 张` : ''
    }
    const shown = names.length > 3 ? `${names.slice(0, 3).join('、')} 等${names.length}项` : names.join('、')
    const placed = `已归入 ${shown}`
    return leftoverCount ? `${placed}。余 ${leftoverCount} 张` : placed
  },

  async waitForOrganizeResult(payload) {
    const node = this.data.activeNode
    const deadline = Date.now() + ORGANIZE_FLOW_WAIT_MS
    let last = { skipped: true, groups: [] }
    let lastErr = null
    while (Date.now() < deadline) {
      try {
        last = await organizeMerchantFlowNodePhotos(this.albumId, node.id, payload)
        lastErr = null
        if (!last || !last.skipped) return last || {}
      } catch (err) {
        lastErr = err
      }
      await sleepMs(ORGANIZE_POLL_MS)
    }
    if (lastErr) throw lastErr
    return last
  },

  async onOrganizePhotos() {
    if (this.data.readOnly || this.data.organizingPhotos) return
    const node = this.data.activeNode
    const rawKind = (node && node.kind) || ''
    if (rawKind === 'delivery_photos') return
    const kind =
      rawKind === 'intake_inspection' ? 'inspection' : rawKind
    const pending = this.collectPendingForOrganize(kind)
    if (!pending.length) {
      wx.showToast({ title: '先上传照片', icon: 'none' })
      return
    }
    const pageWait = kind !== 'intake'
    this.setData({ organizingPhotos: true, organizeResultHint: '' })
    if (!pageWait) wx.showLoading({ title: '归组中' })
    try {
      await this.persistPhotos()
      await this.persistPhotoDraft()
      const findings = this.collectFindingsFromSections()
      const res = await this.waitForOrganizeResult({
        kind,
        pendingImages: pending,
        findings,
      })
      if (kind === 'intake') {
        if (res && res.skipped) {
          wx.showToast({ title: '这次没归上，稍后再试', icon: 'none' })
          return
        }
        this.applyIntakeOrganize(res || {})
        wx.showToast({ title: '核对里程和油量', icon: 'none' })
        return
      }
      const groups = (res && res.groups) || []
      if (!groups.length) {
        this.setData({
          organizeResultHint: (res && res.skipped)
            ? '照片已保存，这次没归上，请自己归'
            : '没写成项，请自己归或改部位名后再传',
        })
        return
      }
      const mode = kind === 'work' ? 'work' : 'inspection'
      const applied = applyOrganizeGroups({
        pendingImages: pending,
        findings,
        groups,
        mode,
        quoteNames: collectConfirmedQuoteNames(this._flowNodes || []),
      })
      const sections = this.data.sections.map((row) => {
        if (!row.findingMode) return row
        const nextFindings = applied.findings
        return {
          ...row,
          findings: nextFindings,
          images:
            mode === 'work'
              ? this.flattenWorkSectionImages(nextFindings)
              : this.findingImagesFromRows(nextFindings, this.data.odometerUrl),
        }
      })
      const leftover = applied.pendingImages
      const organizeResultHint = this.summarizeOrganizeResult(
        pending,
        applied.findings,
        leftover,
      )
      this.setSectionsWithFindings(
        sections,
        {
          pendingImages: leftover,
          autoSaveLabel: '保存中…',
          organizedOnce: true,
          organizeResultHint,
        },
        this.findFirstIncompleteFindingKey(sections) || '',
      )
      this.scheduleAutoSavePhotos()
    } catch (err) {
      this.setData({
        organizeResultHint: organizeFailHint(err),
      })
      this.scheduleAutoSavePhotos()
    } finally {
      this.setData({ organizingPhotos: false })
      if (!pageWait) wx.hideLoading()
    }
  },

  writeLocalFlowDraft() {
    if (this.data.readOnly || !this.data.activeIsPhoto) return
    const node = this.data.activeNode
    if (!this.albumId || !node || !node.id) return
    try {
      wx.setStorageSync(flowDraftStorageKey(this.albumId, node.id), {
        savedAt: Date.now(),
        photoDraft: this.buildPhotoDraftPayload(),
      })
    } catch (_) {
      this.setAutoSaveLabel('本机记下失败')
    }
  },

  clearLocalFlowDraft(nodeId) {
    const id = String(nodeId || (this.data.activeNode && this.data.activeNode.id) || '').trim()
    if (!this.albumId || !id) return
    try {
      wx.removeStorageSync(flowDraftStorageKey(this.albumId, id))
    } catch (_) {
      /* ignore */
    }
  },

  scheduleAutoSavePhotos() {
    if (this._photoSaveTimer) clearTimeout(this._photoSaveTimer)
    this._photoSaveTimer = setTimeout(() => {
      this.runAutoSavePhotos()
    }, 700)
  },

  /** 从项上卸下的图立刻改挂到本单图库，不删文件 */
  scheduleParkDetachedPhotos() {
    if (this.data.readOnly) return
    if (this._parkTimer) clearTimeout(this._parkTimer)
    this._parkTimer = setTimeout(() => {
      if (this.data.organizingPhotos) return
      this.persistPhotos().catch(() => {})
    }, 500)
  },

  /** 改字只记本机，不写服务器 */
  scheduleAutoSaveDraftOnly() {
    if (this._draftSaveTimer) clearTimeout(this._draftSaveTimer)
    this._draftSaveTimer = setTimeout(() => {
      if (this.data.readOnly) return
      this.writeLocalFlowDraft()
      this.setAutoSaveLabel('已自动保存')
    }, 700)
  },

  scheduleAutoSaveDoc() {
    if (this.data.readOnly) return
    if (this._draftSaveTimer) clearTimeout(this._draftSaveTimer)
    this._draftSaveTimer = setTimeout(async () => {
      if (this.data.readOnly) return
      try {
        await this.persistAiReviewDraft()
        this.setAutoSaveLabel('已自动保存')
      } catch (e) {
        this.setAutoSaveLabel((e && e.message) || '自动保存失败，请检查网络')
      }
    }, 700)
  },

  async flushDocDraftSave() {
    if (this._draftSaveTimer) {
      clearTimeout(this._draftSaveTimer)
      this._draftSaveTimer = null
    }
    if (this.data.readOnly || this.data.activeIsPhoto) return
    await this.persistAiReviewDraft()
  },

  async runAutoSavePhotos() {
    if (this.data.readOnly || this.data.organizingPhotos) return
    this.writeLocalFlowDraft()
    this.setAutoSaveLabel('已自动保存')
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
    let sections = this.buildSections(
      album,
      active,
      {
        findings: prevFindings,
        odometerUrl: this.data.odometerUrl,
        odometerImageId: this.data.odometerImageId,
        pendingImages: this.data.pendingImages,
      },
      this._flowNodes || [],
    )
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
    this.setSectionsWithFindings(
      sections,
      {
        odometerUrl: String((sections[0] && sections[0].odometerUrl) || this.data.odometerUrl || '').trim(),
        odometerImageId: String(
          (sections[0] && sections[0].odometerImageId) || this.data.odometerImageId || '',
        ).trim(),
      },
      expandKey,
    )
    if (this.data.aiReview && this.data.aiReview.isReady) {
      this.applyInlineAiReview(this.data.aiReview, this._aiReviewAction)
    }
  },

  async persistPhotoDraft() {
    const kind = this.data.activeNode && this.data.activeNode.kind
    if (
      kind !== 'intake_inspection' &&
      kind !== 'intake' &&
      kind !== 'inspection' &&
      kind !== 'work' &&
      kind !== 'delivery_photos'
    ) {
      return
    }
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
    this.setData({ chiefComplaint: e.detail.value, autoSaveLabel: '保存中…' }, () => {
      this.scheduleAutoSaveDoc()
    })
  },

  onIntakeReadingInput(e) {
    if (this.data.readOnly) return
    const category = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.category) || '')
    const value = String((e.detail && e.detail.value) || '').trim()
    const intakeResults = (this.data.intakeResults || []).map((row) =>
      row.category === category ? { ...row, reading: value } : row,
    )
    const patch = { intakeResults, autoSaveLabel: '保存中…' }
    if (category === 'odometer') patch.mileageKm = parseMileageKm(value) || value
    if (category === 'fuel') patch.fuelReading = value
    this.setData(patch, () => this.scheduleAutoSaveDraftOnly())
  },

  onOpenLibrary() {
    if (this.data.readOnly) return
    this.setData({ showLibrary: true, libraryBusy: true, libraryItems: [] })
    fetchMerchantAlbumMediaLibrary(this.data.albumId)
      .then((res) => {
        const pendingKeys = new Set(
          normalizePendingImages(this.data.pendingImages).map((img) => mediaKey(img.url)),
        )
        const items = ((res && res.items) || []).map((item) => {
          const inPending = pendingKeys.has(mediaKey(item.url))
          return {
            ...item,
            metaLine: [item.timeLabel, item.stageTitle].filter(Boolean).join(' · '),
            inPending,
            picked: inPending,
          }
        })
        this.setData({ libraryBusy: false, libraryItems: items })
      })
      .catch(() => {
        this.setData({ libraryBusy: false, libraryItems: [] })
        wx.showToast({ title: '图库加载失败', icon: 'none' })
      })
  },

  onLibraryPanelTap() {},

  onCloseLibrary() {
    this.setData({ showLibrary: false, libraryBusy: false })
  },

  onToggleLibraryItem(e) {
    const url = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.url) || '').trim()
    if (!url) return
    const items = (this.data.libraryItems || []).map((item) => {
      if (mediaKey(item.url) !== mediaKey(url) || item.inPending) return item
      return { ...item, picked: !item.picked }
    })
    this.setData({ libraryItems: items })
  },

  onConfirmLibrary() {
    const pending = normalizePendingImages(this.data.pendingImages)
    const pendingKeys = new Set(pending.map((img) => mediaKey(img.url)))
    const picked = (this.data.libraryItems || []).filter((item) => item.picked && !item.inPending)
    const room = Math.max(0, 12 - pending.length)
    const extra = picked.slice(0, room).filter((item) => !pendingKeys.has(mediaKey(item.url)))
    if (!extra.length) {
      this.setData({ showLibrary: false })
      if (picked.length && room === 0) wx.showToast({ title: '一次最多 12 张', icon: 'none' })
      return
    }
    const pendingImages = pending.concat(
      extra.map((item) => ({ url: item.url, imageId: item.imageId || '' })),
    )
    this.setData({
      showLibrary: false,
      pendingImages,
      autoSaveLabel: '保存中…',
      ...this.findingChromePatch(this.data.sections, pendingImages),
    })
    this.onOrganizePhotos()
  },

  onAddOdometerPhoto() {
    if (this.data.readOnly) return
    pickLocalImages({
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
          this.setData({
            odometerUrl: url,
            odometerImageId: (uploaded && (uploaded.id || uploaded.imageId)) || '',
            odometerOcrBusy: true,
            autoSaveLabel: '保存中…',
          })
          await this.persistPhotos()
          await this.persistPhotoDraft()
          try {
            const result = await recognizeVehicleIntakeOcr(url, { mode: 'mileage' })
            const km = parseMileageKm(result && result.mileageKm)
            if (km) {
              this.setData({ mileageKm: km })
              await this.persistPhotoDraft()
            } else {
              wx.showToast({ title: '未读出公里数，请手填', icon: 'none' })
            }
          } catch (ocrErr) {
            wx.showToast({
              title: (ocrErr && ocrErr.message) || '未读出公里数，请手填',
              icon: 'none',
            })
          }
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
        } finally {
          this.setData({ odometerOcrBusy: false })
          this.setAutoSaveLabel('已自动保存')
          wx.hideLoading()
        }
      },
    })
  },

  onPreviewOdometer() {
    const url = String(this.data.odometerUrl || '').trim()
    if (!url) return
    wx.previewImage({ current: url, urls: [url] })
  },

  onRemoveOdometer() {
    if (this.data.readOnly) return
    this.setData(
      {
        odometerUrl: '',
        odometerImageId: '',
        autoSaveLabel: '保存中…',
      },
      () => this.scheduleAutoSavePhotos(),
    )
  },

  /** 接车 · 环车清单勾选：只记「拍没拍到」，不做故障判定 */
  onToggleWalkaround(e) {
    if (this.data.readOnly) return
    const id = String(
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '',
    ).trim()
    if (!id) return
    const list = Array.isArray(this.data.walkaround) ? this.data.walkaround.slice() : []
    const at = list.indexOf(id)
    if (at >= 0) list.splice(at, 1)
    else list.push(id)
    this.setData(
      {
        walkaround: list,
        walkaroundParts: (this.data.walkaroundParts || []).map((row) => ({
          ...row,
          checked: list.indexOf(row.id) >= 0,
        })),
        autoSaveLabel: '保存中…',
      },
      () => this.scheduleAutoSaveDraftOnly(),
    )
  },

  onVehicleFieldInput(e) {
    const field = e.currentTarget.dataset.field
    if (!['vehicleBrand', 'vehicleSeries', 'vehicleYear'].includes(field)) return
    this.setData({ [field]: e.detail.value, autoSaveLabel: '保存中…' }, () => {
      this.scheduleAutoSaveDraftOnly()
    })
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
    if (findingKind === 'work' && field === 'partName') {
      nextRaw.outsideQuote = workOutsideQuoteOf(
        e.detail.value,
        collectConfirmedQuoteNames(this._flowNodes || []),
      )
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
    if (findingKind === 'work' && field === 'partName') {
      const nextSections = this.data.sections.map((row, i) => {
        if (i !== sectionIndex) return row
        const findings = (row.findings || []).map((item, idx) =>
          idx === findingIndex ? decorated : item,
        )
        return { ...row, findings }
      })
      Object.assign(patch, this.findingChromePatch(nextSections))
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
    this.setData({ findings, autoSaveLabel: '保存中…' }, () => {
      this.syncQuoteEvidenceFromFindings()
      this.scheduleAutoSaveDoc()
    })
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
      next.recordOnly = next.result === FINDING_RESULT.RECORD
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
    this.setData({ findings, autoSaveLabel: '保存中…' }, () => {
      this.syncQuoteEvidenceFromFindings()
      this.scheduleAutoSaveDoc()
    })
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
    this.setData({ [field]: e.detail.value, autoSaveLabel: '保存中…' }, () => {
      this.scheduleAutoSaveDoc()
    })
  },

  onQuoteLineInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    const quoteLines = this.data.quoteLines.map((line, i) =>
      i === index ? { ...line, [field]: e.detail.value } : line,
    )
    this.setQuoteLines(quoteLines)
  },

  onAddQuoteLine() {
    this.setQuoteLines(
      this.data.quoteLines.concat([
        { name: '', brand: '', amount: '', note: '', evidenceUrl: '', evidenceUrls: [] },
      ]),
    )
  },

  onRemoveQuoteLine(e) {
    if (this.data.readOnly || this.data.confirmAwaitingOwner) return
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const prev = this.data.quoteLines || []
    let quoteLines = prev.filter((_, i) => i !== index)
    if (!quoteLines.length) {
      quoteLines = [{ name: '', brand: '', amount: '', note: '', evidenceUrl: '', evidenceUrls: [] }]
    }
    this.setQuoteLines(quoteLines)
  },

  onToggleQuoteEvidence(e) {
    if (this.data.readOnly || this.data.confirmAwaitingOwner) return
    const index = Number(e.currentTarget.dataset.index)
    const url = String(e.currentTarget.dataset.url || '').trim()
    if (!Number.isFinite(index) || !url) return
    const line = (this.data.quoteLines || [])[index]
    if (!line) return
    if (line.evidencePool) {
      const chip = (line.evidencePool || []).find((row) => row.url === url)
      if (chip && chip.taken) {
        wx.showToast({ title: '已挂到其他项目', icon: 'none' })
        return
      }
    }
    const current = listQuoteLineEvidenceUrls(line)
    const sameEvidence = (item) => item === url || (mediaKey(item) && mediaKey(item) === mediaKey(url))
    const nextUrls = current.some(sameEvidence)
      ? current.filter((item) => !sameEvidence(item))
      : current.concat([url])
    const quoteLines = this.data.quoteLines.map((row, i) =>
      i === index
        ? { ...row, evidenceUrls: nextUrls, evidenceUrl: nextUrls[0] || '' }
        : row,
    )
    this.setQuoteLines(quoteLines)
  },

  onAddQuoteEvidence(e) {
    if (this.data.readOnly || this.data.confirmAwaitingOwner) return
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    pickLocalImages({
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
            i === index
              ? { ...line, evidenceUrl: url, evidenceUrls: [url] }
              : line,
          )
          this.setQuoteLines(quoteLines)
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
      i === index ? { ...line, evidenceUrl: '', evidenceUrls: [] } : line,
    )
    this.setQuoteLines(quoteLines)
  },

  onPreviewQuoteEvidence(e) {
    const index = Number(e.currentTarget.dataset.index)
    const line = this.data.quoteLines[index]
    const urls = listQuoteLineEvidenceUrls(line)
    if (!urls.length) return
    const current = String(e.currentTarget.dataset.url || '').trim() || urls[0]
    wx.previewImage({
      current,
      urls,
    })
  },

  async persistPhotos() {
    const album = (await fetchMerchantServiceAlbum(this.albumId).catch(() => this._album)) || this._album || {}
    const sectionMap = {}
    this.data.sections.forEach((section) => {
      if (section.findingMode && section.findingKind === 'work') {
        sectionMap[section.stageId] = this.appendPendingToImages(
          this.flattenWorkSectionImages(section.findings || []),
        )
      } else if (section.findingMode) {
        const odo = String(this.data.odometerUrl || '').trim()
        const findingImgs = this.findingImagesFromRows(section.findings || [], odo)
        const withOdo = odo
          ? [{ url: odo, caption: '仪表' }].concat(findingImgs)
          : findingImgs
        sectionMap[section.stageId] = this.appendPendingToImages(withOdo)
      } else if (section.stageId === 'stage_6' && this.data.isDeliveryPhotoStep) {
        // 施工图只记引用；补拍的全车/其他交车图才写入 stage_6
        const exterior = String(this.data.deliveryExteriorUrl || '').trim()
        const workUrlSet = this.collectWorkUrlSet(album, this._flowNodes || [])
        const images = []
        const pushImg = (url, caption) => {
          const u = String(url || '').trim()
          const key = mediaKey(u)
          if (!u || !key || images.some((row) => mediaKey(row.url) === key)) return
          images.push({ url: u, caption: String(caption || '').trim() })
        }
        const isWorkRef = (url) => {
          const key = mediaKey(url)
          return Boolean(key && workUrlSet[key])
        }
        if (exterior && !isWorkRef(exterior)) pushImg(exterior, '整车外观')
        ;(this.data.workImagePool || []).forEach((row) => {
          if (!row || !row.selected || row.url === exterior) return
          if (isWorkRef(row.url)) return
          pushImg(row.url, row.partName || '交车图')
        })
        sectionMap[section.stageId] = images
      } else {
        sectionMap[section.stageId] = section.images
      }
    })
    // 接车与检测统一写入 stage_2，清空旧 stage_1
    if (this.data.activeNode && this.data.activeNode.kind === 'intake_inspection') {
      sectionMap.stage_1 = []
      if (!sectionMap.stage_2) sectionMap.stage_2 = []
    }
    const imagesByNode = {}
    ;(album.imageMeta || []).forEach((img) => {
      const nid = String((img && (img.nodeId || img.node_id)) || '')
      if (!nid) return
      if (!imagesByNode[nid]) imagesByNode[nid] = []
      imagesByNode[nid].push({
        url: img.rawUrl || img.url,
        id: img.id || '',
        caption: img.caption || '',
      })
    })
    let nodes = (album.nodes || []).filter((node) => {
      const id = String((node && (node.id || node.nodeId)) || '')
      return id && id !== 'library'
    }).map((node) => {
      const id = node.id || node.nodeId
      const fallback = (node.images && node.images.length)
        ? node.images
        : (imagesByNode[id] || [])
      const images = Object.prototype.hasOwnProperty.call(sectionMap, id)
        ? sectionMap[id]
        : fallback
      if (!Object.prototype.hasOwnProperty.call(sectionMap, id)) {
        return { ...node, id, images: fallback }
      }
      return {
        ...node,
        id,
        images,
        status: images.length ? 'completed' : 'pending',
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
    const nodePatches = persisted.filter((node) =>
      Object.prototype.hasOwnProperty.call(sectionMap, node.id),
    )
    await saveMerchantServiceAlbum(this.albumId, {
      nodePatches: nodePatches.length ? nodePatches : persisted,
    })
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

  decorateAiReview(review) {
    const raw = review || {}
    const status = String(raw.status || '')
    const prevApplied = new Set(
      ((this.data.aiReview && this.data.aiReview.suggestions) || [])
        .filter((row) => row && row.applied)
        .map((row) => row.id),
    )
    const findings = this.data.activeIsPhoto
      ? this.collectFindingsFromSections()
      : this.data.findings || []
    const suggestions = (Array.isArray(raw.suggestions) ? raw.suggestions : []).map((item) => {
      const type = item && item.type === 'photo' ? 'photo' : 'text'
      const field = this.inferAiReviewField(item)
      const currentText = this.resolveAiReviewCurrentText(item, field, findings)
      const suggestedText = type === 'text' ? String((item && item.suggestedText) || '').trim() : ''
      const targetLabel = type === 'photo'
        ? String((item && (item.part || item.title)) || '相关部位')
            .replace(/^(补拍|补充)/, '')
            .trim() || '相关部位'
        : field === 'chiefComplaint'
          ? '主诉'
          : field === 'findingAdvice'
            ? '检查发现'
            : field === 'findingCaption'
              ? '图注'
              : field === 'warrantyPeriod'
                ? '质保'
                : field === 'quoteLineName'
                  ? '方案行名'
                  : '本步文字'
      const dismissed = this._dismissedAiSuggestionIds || new Set()
      const applied =
        item && item.applied === false
          ? false
          : Boolean(item && item.applied) ||
            prevApplied.has(item && item.id) ||
            dismissed.has(item && item.id)
      const currentShown = applied && suggestedText ? suggestedText : currentText
      const canApply =
        type === 'text' && Boolean(suggestedText) && !applied && suggestedText !== currentText
      return {
        ...item,
        type,
        field,
        isPhoto: type === 'photo',
        isText: type === 'text',
        kindLabel: type === 'photo' ? '补拍' : '改文案',
        targetLabel,
        howText: type === 'photo' ? String((item && item.how) || '').trim() : '',
        currentText: currentShown,
        suggestedText,
        showCurrent: Boolean(
          type === 'text' && currentText && currentText !== suggestedText && !applied,
        ),
        boundPart: bindSuggestionPart(findings, item),
        applied,
        canApply,
        canGoPhoto: type === 'photo' && !applied,
        actionLabel: type === 'photo' ? '补拍' : applied ? '已应用' : '应用',
      }
    })
    return {
      ...raw,
      status,
      suggestions,
      isWaiting: status === 'queued' || status === 'running',
      isReady: status === 'ready',
      isFailed: status === 'failed',
      hasSuggestions: suggestions.some((row) => row && !row.applied),
      waitHint: raw.waitHint || '正在检查',
      waitDetail: '对照本步照片和说明',
      emptyHint: raw.emptyHint || '未发现可改之处',
      canApplyAllText: suggestions.some((row) => row && row.canApply),
    }
  },

  inferAiReviewField(item) {
    const field = String((item && item.field) || '').trim()
    let resolved = field
    if (!resolved) {
      const blob = `${(item && item.title) || ''} ${(item && item.itemKey) || ''} ${(item && item.how) || ''}`
      if (/主诉/.test(blob) || (item && item.itemKey) === 'complaint') resolved = 'chiefComplaint'
      else if (/图注|施工说明/.test(blob)) resolved = 'findingCaption'
      else if (/施工方案/.test(blob)) resolved = 'quoteLineNote'
      else if (/方案/.test(blob)) resolved = 'quoteLineName'
      else if (/质保/.test(blob)) resolved = 'warrantyPeriod'
      else if (/建议|处理|检查发现/.test(blob)) resolved = 'findingAdvice'
    }
    // 检测只有「检查发现」，没有图注/说明栏
    if (
      resolved === 'findingCaption' &&
      (this.data.isIntakePhotoStep || this.data.activeKind === 'inspection_report')
    ) {
      return 'findingAdvice'
    }
    return resolved
  },

  resolveAiReviewCurrentText(item, field, findings) {
    if (field === 'chiefComplaint') return String(this.data.chiefComplaint || '').trim()
    if (field === 'warrantyPeriod') return String(this.data.warrantyPeriod || '').trim()
    if (field === 'findingAdvice' || field === 'findingCaption') {
      const idx = Number.isFinite(Number(item && item.findingIndex))
        ? Number(item.findingIndex)
        : -1
      const row = idx >= 0 ? findings[idx] : findings[0]
      if (!row) return ''
      return String((field === 'findingAdvice' ? row.advice : row.caption) || '').trim()
    }
    if (field === 'quoteLineName' || field === 'quoteLineNote') {
      const idx = Number.isFinite(Number(item && item.lineIndex)) ? Number(item.lineIndex) : 0
      const line = (this.data.quoteLines || [])[idx]
      if (!line) return ''
      return String((field === 'quoteLineNote' ? line.note : line.name) || '').trim()
    }
    return ''
  },

  toAiFieldHint(item, kind) {
    const isPhoto = kind === 'photo' || (item && item.isPhoto)
    const body = isPhoto
      ? String((item && (item.howText || item.how)) || '').trim()
      : String((item && item.suggestedText) || '').trim()
    if (!body) return null
    return {
      id: item.id,
      kicker: isPhoto ? '建议补拍' : '建议改成',
      body,
      canApply: !isPhoto && Boolean(item.canApply),
      canGoPhoto: isPhoto && !item.applied,
      applied: Boolean(item.applied),
    }
  },

  matchFindingIndex(findings, item, used, mode) {
    return resolveAiReviewFindingIndex(findings, item, used, mode)
  },

  computeInlineHintPatch(review) {
    const suggestions = (review && review.suggestions) || []
    let chiefComplaintHint = null
    let odometerHint = null
    let warrantyHint = null
    const orphanPhotoHints = []
    let quoteLines = (this.data.quoteLines || []).map((row) => ({ ...row, nameHint: null, noteHint: null }))
    let reportFindings = (this.data.findings || []).map((row) => ({
      ...row,
      adviceHint: null,
      captionHint: null,
      photoHint: null,
    }))
    let sections = (this.data.sections || []).map((section) => ({
      ...section,
      photoHint: null,
      findings: (section.findings || []).map((row) => ({
        ...row,
        photoHint: null,
        adviceHint: null,
        captionHint: null,
      })),
    }))
    let expandKey = this.data.expandedFindingKey
    const photoUsed = new Set()
    const textUsed = new Set()

    suggestions.forEach((item) => {
      if (!item || item.applied) return
      if (item.isText) {
        const hint = this.toAiFieldHint(item, 'text')
        if (!hint) return
        if (item.field === 'chiefComplaint') {
          chiefComplaintHint = hint
          return
        }
        if (item.field === 'warrantyPeriod') {
          warrantyHint = hint
          return
        }
        if (item.field === 'quoteLineName' || item.field === 'quoteLineNote') {
          const idx = Number.isFinite(Number(item.lineIndex)) ? Number(item.lineIndex) : 0
          if (quoteLines[idx]) {
            quoteLines[idx] =
              item.field === 'quoteLineNote'
                ? { ...quoteLines[idx], noteHint: hint }
                : { ...quoteLines[idx], nameHint: hint }
          }
          return
        }
        if (item.field === 'findingAdvice' || item.field === 'findingCaption') {
          const si = sections.findIndex((section) => section.findingMode)
          const useAdvice = item.field === 'findingAdvice' || (si >= 0 && sections[si].findingKind !== 'work')
          if (si >= 0) {
            const fi = this.matchFindingIndex(sections[si].findings || [], item, textUsed, 'text')
            if (fi >= 0) textUsed.add(fi)
            if (fi >= 0) {
              const findings = (sections[si].findings || []).map((row, idx) => {
                if (idx !== fi) return row
                if (useAdvice) {
                  return {
                    ...row,
                    adviceHint: hint,
                    advicePlaceholder: row.advice ? row.advicePlaceholder : hint.body,
                  }
                }
                return {
                  ...row,
                  captionHint: hint,
                  captionPlaceholder: row.caption ? row.captionPlaceholder : hint.body,
                }
              })
              sections[si] = { ...sections[si], findings }
            }
          }
          if (!this.data.activeIsPhoto) {
            const fi = this.matchFindingIndex(reportFindings, item, textUsed, 'text')
            if (fi >= 0) textUsed.add(fi)
            const idx = fi
            if (reportFindings[idx]) {
              reportFindings[idx] =
                item.field === 'findingAdvice' || this.data.activeKind === 'inspection_report'
                  ? {
                      ...reportFindings[idx],
                      adviceHint: hint,
                      advicePlaceholder: reportFindings[idx].advice
                        ? reportFindings[idx].advicePlaceholder
                        : hint.body,
                    }
                  : { ...reportFindings[idx], captionHint: hint }
            }
          }
        }
        return
      }
      const hint = this.toAiFieldHint(item, 'photo')
      if (!hint) return
      if (!this.data.activeIsPhoto && this.data.activeKind === 'inspection_report') {
        const fi = this.matchFindingIndex(reportFindings, item, photoUsed, 'photo')
        if (fi >= 0) {
          photoUsed.add(fi)
          reportFindings[fi] = {
            ...reportFindings[fi],
            photoHint: hint,
            aiSuggestionId: reportFindings[fi].aiSuggestionId || item.id,
          }
          return
        }
      }
      const si = sections.findIndex((section) => section.findingMode)
      if (si < 0) {
        orphanPhotoHints.push(hint)
        return
      }
      let fi = this.matchFindingIndex(sections[si].findings || [], item, photoUsed, 'photo')
      if (fi < 0 && isOdometerSuggestion(item) && this.data.isIntakePhotoStep) {
        odometerHint = hint
        return
      }
      if (fi >= 0) {
        photoUsed.add(fi)
        const findings = (sections[si].findings || []).map((row, idx) => {
          if (idx !== fi) return row
          return {
            ...row,
            photoHint: hint,
            captionPlaceholder: row.caption ? row.captionPlaceholder : hint.body,
            aiSuggestionId: row.aiSuggestionId || item.id,
          }
        })
        sections[si] = { ...sections[si], findings }
        return
      }
      const partName = String(item.boundPart || '').trim()
      if (!partName) {
        orphanPhotoHints.push(hint)
        return
      }
      const pending =
        sections[si].findingKind === 'work'
          ? {
              fromAi: true,
              aiSuggestionId: item.id,
              partName,
              caption: '',
              captionPlaceholder: hint.body,
              photoHint: hint,
              images: [],
            }
          : {
              fromAi: true,
              aiSuggestionId: item.id,
              partName,
              caption: '',
              captionPlaceholder: hint.body,
              photoHint: hint,
              pendingPhoto: true,
              url: '',
            }
      const findings = (sections[si].findings || []).concat([pending])
      photoUsed.add(findings.length - 1)
      sections[si] = { ...sections[si], findings }
    })

    return {
      sections,
      quoteLines: this.decorateQuoteLines(quoteLines, this.quoteEvidenceSource()),
      quoteTotalLabel: `合计 ¥${sumQuoteAmounts(quoteLines).toFixed(2)}`,
      chiefComplaintHint,
      odometerHint,
      warrantyHint,
      orphanPhotoHints,
      expandedFindingKey: expandKey,
      ...(this.data.activeIsPhoto ? {} : { findings: reportFindings }),
    }
  },

  applyInlineAiReview(review, action) {
    this._aiReviewAction = action || this._aiReviewAction || 'complete'
    const fingerprint = String((review && review.fingerprint) || '')
    if (fingerprint && fingerprint !== this._aiReviewFingerprint) {
      this._aiTextBatchSnapshot = null
      this._aiTextBatchAppliedIds = []
      this._aiReviewFingerprint = fingerprint
    }
    const decorated = this.decorateAiReview(review)
    const waiting = Boolean(decorated.isWaiting)
    const timedOut = waiting && this.data.aiReviewTimedOut
    const canProceed = Boolean(decorated.isReady || decorated.isFailed || timedOut)
    const patch = {
      aiReview: decorated,
      aiReviewBusy: false,
    }
    if (this._aiReviewAction === 'deliver' || this._aiReviewAction === 'notify') {
      patch.notifyOwnerLabel = '通知车主'
      patch.notifyConfirmDisabled = waiting && !timedOut
    } else {
      patch.photoConfirmLabel = canProceed ? '进入下一步' : '确认并继续'
      patch.photoConfirmDisabled = waiting && !timedOut
    }
    if (waiting || decorated.isFailed || !decorated.hasSuggestions) {
      patch.chiefComplaintHint = waiting ? this.data.chiefComplaintHint : null
      patch.odometerHint = waiting ? this.data.odometerHint : null
      patch.warrantyHint = waiting ? this.data.warrantyHint : null
      if (!waiting) {
        patch.orphanPhotoHints = []
      }
    } else {
      const hintPatch = this.computeInlineHintPatch(decorated)
      Object.assign(patch, hintPatch)
      if (hintPatch.sections) {
        patch.sections = this.decorateSections(
          hintPatch.sections,
          hintPatch.expandedFindingKey,
        )
        if (this.data.isIntakePhotoStep) {
          patch.findings = this.collectFindingsFromSections(patch.sections)
        }
      }
    }
    this.setData(patch)
    if (waiting) this.startAiReviewPoll()
    else this.stopAiReviewPoll()
  },

  buildAiReviewAckExtra() {
    const review = this.data.aiReview
    if (!review) return {}
    if (review.isReady || review.isFailed || this.data.aiReviewTimedOut) {
      return { aiReviewAck: true }
    }
    return {}
  },

  resumeAiReviewFromNode(active) {
    if (this.data.readOnly || !active || !this._nodeAiReviewEntitled) return
    const kind = active.kind
    if (
      kind === 'intake_inspection' ||
      kind === 'intake' ||
      kind === 'inspection' ||
      kind === 'work' ||
      kind === 'delivery_photos'
    ) {
      return
    }
    const review = active.aiReview
    if (!review || review.acknowledged) return
    if (review.status !== 'queued' && review.status !== 'running' && review.status !== 'ready') return
    let action = ''
    if (kind === 'inspection_report') action = 'deliver'
    else if (kind === 'quote_confirm' || kind === 'addon_quote_confirm' || kind === 'repair_report') {
      action = 'notify'
    }
    if (!action) return
    this.applyInlineAiReview(review, action)
  },

  resumeAiReviewIfNeeded() {
    const active = this.data.activeNode
    if (this.data.aiReview && this.data.aiReview.isWaiting) {
      this.startAiReviewPoll()
      return
    }
    this.resumeAiReviewFromNode(active)
  },

  stopAiReviewPoll() {
    if (this._aiReviewTimer) {
      clearTimeout(this._aiReviewTimer)
      this._aiReviewTimer = null
    }
  },

  startAiReviewPoll() {
    if (this._aiReviewTimer) return
    this._aiReviewPollStartedAt = Date.now()
    const tick = async () => {
      if (!this.data.aiReview) return
      const node = this.data.activeNode
      if (!node || !this.albumId) return
      try {
        const data = await fetchMerchantFlowNodeAiReview(this.albumId, node.id)
        const review = this.decorateAiReview(data && data.review)
        if (review.isReady || review.isFailed) {
          this.stopAiReviewPoll()
          this.setData({ aiReviewTimedOut: false })
          this.applyInlineAiReview(data && data.review, this._aiReviewAction)
          return
        }
        this.setData({ aiReview: review })
      } catch (_) {
        /* keep waiting */
      }
      if (Date.now() - (this._aiReviewPollStartedAt || 0) > 20000 && !this.data.aiReviewTimedOut) {
        const waitingPatch = { aiReviewTimedOut: true }
        if (this._aiReviewAction === 'deliver' || this._aiReviewAction === 'notify') {
          waitingPatch.notifyOwnerLabel = '通知车主'
          waitingPatch.notifyConfirmDisabled = false
        } else {
          waitingPatch.photoConfirmLabel = '进入下一步'
          waitingPatch.photoConfirmDisabled = false
        }
        this.setData(waitingPatch)
      }
      this._aiReviewTimer = setTimeout(tick, 2000)
    }
    this._aiReviewTimer = setTimeout(tick, 1600)
  },

  async onApplyAiSuggestion(e, options = {}) {
    const skipPersist = Boolean(options && options.skipPersist)
    const skipToast = Boolean(options && options.skipToast)
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    const review = this.data.aiReview
    const item = ((review && review.suggestions) || []).find((row) => row && row.id === id)
    if (!item) return
    if (item.type === 'photo' || item.canGoPhoto) {
      if (isOdometerSuggestion(item) && this.data.isIntakePhotoStep) {
        this.onAddOdometerPhoto()
        return
      }
      if (this.data.isDeliveryPhotoStep) {
        this.captureDeliveryExtraPhoto(id)
        return
      }
      if (this.data.activeKind === 'inspection_report') {
        let fi = (this.data.findings || []).findIndex(
          (row) => (row.aiSuggestionId || (row.photoHint && row.photoHint.id)) === id,
        )
        if (fi < 0) {
          fi = this.matchFindingIndex(this.data.findings || [], item, new Set(), 'photo')
        }
        if (fi < 0) {
          wx.showToast({ title: '对不上部位', icon: 'none' })
          return
        }
        this.onAttachReportFindingPhoto({
          currentTarget: { dataset: { index: fi } },
        })
        return
      }
      const si = (this.data.sections || []).findIndex((section) =>
        (section.findings || []).some(
          (row) => (row.aiSuggestionId || (row.photoHint && row.photoHint.id)) === id,
        ),
      )
      if (si < 0) return
      const fi = (this.data.sections[si].findings || []).findIndex(
        (row) => (row.aiSuggestionId || (row.photoHint && row.photoHint.id)) === id,
      )
      this.onAttachFindingPhoto({
        currentTarget: { dataset: { sectionIndex: si, findingIndex: fi } },
      })
      return
    }
    if (item.type !== 'text' || !item.suggestedText) return
    const field = this.inferAiReviewField(item) || String(item.field || '')
    const sectionIndex = (this.data.sections || []).findIndex((section) => section && section.findingMode)
    const sectionFindings = sectionIndex >= 0 ? this.data.sections[sectionIndex].findings || [] : []
    const findingsPool = this.data.activeIsPhoto ? sectionFindings : this.data.findings || []
    let findingIndex = -1
    if (field === 'findingAdvice' || field === 'findingCaption') {
      findingIndex = this.matchFindingIndex(findingsPool, item, new Set(), 'text')
      if (findingIndex < 0) {
        wx.showToast({ title: '对不上部位', icon: 'none' })
        return
      }
    }
    const patch = {}
    if (field === 'chiefComplaint') {
      patch.chiefComplaint = item.suggestedText
      patch.chiefComplaintHint = this.data.chiefComplaintHint
        ? { ...this.data.chiefComplaintHint, applied: true }
        : null
    }
    if (field === 'warrantyPeriod') {
      patch.warrantyPeriod = item.suggestedText
      patch.warrantyHint = this.data.warrantyHint
        ? { ...this.data.warrantyHint, applied: true }
        : null
    }
    if (field === 'findingAdvice' && findingIndex >= 0) {
      if (this.data.activeIsPhoto) {
        const sections = (this.data.sections || []).map((section, si) => {
          if (si !== sectionIndex) return section
          return {
            ...section,
            findings: (section.findings || []).map((row, fi) => {
              if (fi !== findingIndex) return row
              return {
                ...row,
                advice: item.suggestedText,
                adviceHint: row.adviceHint ? { ...row.adviceHint, applied: true } : null,
              }
            }),
          }
        })
        patch.sections = this.decorateSections(sections)
        if (this.data.isIntakePhotoStep) {
          patch.findings = this.collectFindingsFromSections(patch.sections)
        }
      } else {
        const findings = (this.data.findings || []).map((row, fi) =>
          fi === findingIndex
            ? {
                ...row,
                advice: item.suggestedText,
                adviceHint: row.adviceHint ? { ...row.adviceHint, applied: true } : null,
              }
            : row,
        )
        patch.findings = findings
      }
    }
    if (field === 'findingCaption' && findingIndex >= 0) {
      const sections = (this.data.sections || []).map((section, si) => {
        if (si !== sectionIndex) return section
        return {
          ...section,
          findings: (section.findings || []).map((row, fi) => {
            if (fi !== findingIndex) return row
            return {
              ...row,
              caption: item.suggestedText,
              captionHint: row.captionHint ? { ...row.captionHint, applied: true } : null,
            }
          }),
        }
      })
      patch.sections = this.decorateSections(sections)
    }
    if (
      (field === 'quoteLineName' || field === 'quoteLineNote') &&
      Number.isFinite(Number(item.lineIndex))
    ) {
      const idx = Number(item.lineIndex)
      const quoteLines = (this.data.quoteLines || []).map((row, li) => {
        if (li !== idx) return row
        if (field === 'quoteLineNote') {
          return {
            ...row,
            note: item.suggestedText,
            noteHint: row.noteHint ? { ...row.noteHint, applied: true } : null,
          }
        }
        return {
          ...row,
          name: item.suggestedText,
          nameHint: row.nameHint ? { ...row.nameHint, applied: true } : null,
        }
      })
      patch.quoteLines = this.decorateQuoteLines(quoteLines, this.quoteEvidenceSource())
      patch.quoteTotalLabel = `合计 ¥${sumQuoteAmounts(quoteLines).toFixed(2)}`
    }
    const suggestions = (review.suggestions || []).map((row) =>
      row && row.id === id ? { ...row, applied: true } : row,
    )
    patch.aiReview = this.decorateAiReview({ ...review, suggestions })
    this.setData(patch)
    if (skipPersist) return true
    try {
      await this.persistAiReviewDraft(field)
      const partName =
        findingIndex >= 0
          ? String((findingsPool[findingIndex] && findingsPool[findingIndex].partName) || '').trim()
          : ''
      if (!skipToast) {
        wx.showToast({ title: partName ? `已写入${partName}` : '已应用', icon: 'none' })
      }
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '未写入', icon: 'none' })
    }
  },

  currentDocAlreadySent() {
    const status = String(
      (this.data.activeNode && this.data.activeNode.document && this.data.activeNode.document.status) ||
        this.data.docStatus ||
        '',
    )
    return status === 'pending_confirm' || status === 'confirmed' || status === 'cancelled' || status === 'delivered'
  },

  async persistAiReviewDraft(field) {
    if (this.data.readOnly || this.currentDocAlreadySent()) return
    if (this.data.activeIsPhoto) {
      await this.persistPhotoDraft()
      return
    }
    const kind = this.data.activeKind
    if (kind === 'inspection_report') {
      await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        document: { status: 'draft', payload: this.buildDocPayloadForSave() },
      })
      const quoteNodeId = this.data.quoteNodeId || this._quoteNodeId
      if (quoteNodeId) {
        const quoteNode = (this._flowNodes || []).find((n) => n && n.id === quoteNodeId)
        const quoteStatus = String((quoteNode && quoteNode.document && quoteNode.document.status) || '')
        if (quoteStatus !== 'pending_confirm' && quoteStatus !== 'confirmed' && quoteStatus !== 'cancelled') {
          await updateMerchantFlowNode(this.albumId, quoteNodeId, {
            document: { status: 'draft', payload: this.buildQuotePayloadForSave() },
          })
        }
      }
      return
    }
    if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
      await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        document: { status: 'draft', payload: this.buildQuotePayloadForSave() },
      })
      return
    }
    if (kind === 'repair_report') {
      await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        document: { status: 'draft', payload: this.buildDocPayloadForSave() },
      })
    }
  },

  async onConfirmPhotoStep() {
    if (this.data.readOnly || this.data.confirming || this.data.photoConfirmDisabled) return
    if (this._photoSaveTimer) {
      clearTimeout(this._photoSaveTimer)
      this._photoSaveTimer = null
    }
    const kind = this.data.activeNode && this.data.activeNode.kind
    // 完工照：外观可从施工图引用，不要求再往 stage_6 落一份实体图
    if (kind !== 'delivery_photos') {
      const total = this.data.sections.reduce((sum, s) => sum + (s.images || []).length, 0)
      if (total < 1) {
        wx.showToast({ title: '请至少上传 1 张照片', icon: 'none' })
        return
      }
    }
    if (
      (kind === 'inspection' || kind === 'work' || kind === 'intake_inspection' || kind === 'intake') &&
      normalizePendingImages(this.data.pendingImages).length
    ) {
      wx.showToast({ title: '先处理未归组的图', icon: 'none' })
      return
    }

    if (kind === 'inspection' || kind === 'intake_inspection') {
      // 主诉记在接车节点，检测步跨节点取（存量合并节点自带）
      const intakeNode = (this._flowNodes || []).find((n) => n && n.kind === 'intake')
      const draftPayload = {
        chiefComplaint:
          kind === 'intake_inspection'
            ? this.data.chiefComplaint
            : String(
                (intakeNode && intakeNode.photoDraft && intakeNode.photoDraft.chiefComplaint) ||
                  this.data.chiefComplaint ||
                  '',
              ).trim(),
        mileageKm: parseMileageKm(this.data.mileageKm),
        vehicleBrand: String(this.data.vehicleBrand || '').trim(),
        vehicleSeries: String(this.data.vehicleSeries || '').trim(),
        vehicleYear: String(this.data.vehicleYear || '').trim(),
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
      const draftPayload = {
        findings: this.collectFindingsFromSections(),
      }
      // 工单如实记录：不再强制每个方案行都要有对应图，
      // 漏项/多做交给工单定稿时的核对去提醒
      const gaps = collectWorkPhotoDraftGaps(draftPayload)
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

    const run = async (extra = {}) => {
      this.setData({ confirming: true })
      this.stopAiReviewPoll()
      try {
        await this.persistPhotos()
        this.resyncSectionsAfterPersist()
        await this.persistPhotoDraft()
        this.clearLocalFlowDraft()
        const res = await completeMerchantFlowNode(
          this.albumId,
          this.data.activeNode.id,
          Object.assign({}, this.buildPhotoDraftPayload(), extra),
        )
        if (res && res.nextAction === 'ai_review') {
          this.applyInlineAiReview(res.review, 'complete')
          return
        }
        wx.showToast({ title: (res && res.message) || '本步已完成', icon: 'success' })
        await this.loadFlow({ silent: true })
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
      } finally {
        this.setData({ confirming: false })
      }
    }

    if (
      kind === 'intake_inspection' ||
      kind === 'intake' ||
      kind === 'inspection' ||
      kind === 'work' ||
      kind === 'delivery_photos'
    ) {
      await run(this.buildAiReviewAckExtra())
      return
    }

    const missing = this.countMissingCaptions()
    if (missing > 0) {
      wx.showModal({
        title: '建议补全本图说明',
        content: `还有 ${missing} 张未写说明，建议每张写一句。仍可继续。`,
        confirmText: '仍要继续',
        success: (res) => {
          if (res.confirm) run(this.buildAiReviewAckExtra())
        },
      })
      return
    }
    await run(this.buildAiReviewAckExtra())
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
      const payload = {
        ...base,
        lines,
        confirmCopy: this.data.confirmCopy || QUOTE_CONFIRM_COPY,
      }
      if (this.data.isAddonQuote) {
        payload.discovery = {
          images: (this.data.addonDiscoveryImages || []).filter(Boolean),
          note: String(this.data.addonDiscoveryNote || '').trim(),
          ready: Boolean(this.data.addonDiscoveryReady),
        }
      }
      return payload
    }
    if (kind === 'repair_report') {
      return {
        ...base,
        confirmCopy: REPAIR_CONFIRM_COPY,
        warrantyPeriod: this.data.warrantyPeriod || base.warrantyPeriod,
        warrantyNotes: this.data.warrantyNotes || base.warrantyNotes,
      }
    }
    return base
  },

  buildQuotePayloadForSave() {
    const lines = (this.data.quoteLines || [])
      .map((l) => normalizeQuoteLine(l))
      .filter((l) => String(l.name || '').trim())
    return {
      lines,
      confirmCopy: this.data.confirmCopy || QUOTE_CONFIRM_COPY,
    }
  },

  async onNotifyOwnerPlan() {
    if (this.data.readOnly || this.data.confirming || this.data.notifyConfirmDisabled) return
    try {
      await this.flushDocDraftSave()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '请先保存当前修改', icon: 'none' })
      return
    }
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
    this.stopAiReviewPoll()
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
        ...this.buildAiReviewAckExtra(),
      })
      if (res && res.nextAction === 'ai_review') {
        this.applyInlineAiReview(res.review, 'deliver')
        return
      }
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
      const added = await insertMerchantAddonPlan(this.albumId)
      const seeded = Boolean(added && added.addonSeeded)
      wx.showToast({
        title:
          seeded
            ? '补金额后通知车主'
            : added && added.addonAlreadyOpen
              ? '新发现已在这一页'
              : '请先拍故障、写看见什么',
        icon: 'none',
      })
      await this.loadFlow({ silent: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  async persistAddonDocument() {
    if (!this.data.isAddonQuote || this.data.readOnly || this.data.confirmAwaitingOwner) return
    const nodeId = this.data.activeNode && this.data.activeNode.id
    if (!nodeId) return
    await updateMerchantFlowNode(this.albumId, nodeId, {
      document: {
        status: 'draft',
        payload: this.buildDocPayloadForSave(),
      },
    })
  },

  onAddonDiscoveryInput(e) {
    this.setData({ addonDiscoveryNote: e.detail.value })
  },

  onAddAddonDiscoveryImage() {
    if (this.data.readOnly || this.data.confirmAwaitingOwner || this.data.addonDiscoveryReady) return
    const current = (this.data.addonDiscoveryImages || []).filter(Boolean)
    if (current.length >= 6) {
      wx.showToast({ title: '最多 6 张', icon: 'none' })
      return
    }
    pickLocalImages({
      count: Math.min(6 - current.length, 9),
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const files = (res && res.tempFiles) || []
        if (!files.length) return
        try {
          wx.showLoading({ title: '上传中' })
          const urls = current.slice()
          for (let i = 0; i < files.length && urls.length < 6; i += 1) {
            const file = files[i]
            if (!file || !file.tempFilePath) continue
            const uploaded = await uploadImage(file.tempFilePath)
            const url = uploaded && (uploaded.url || uploaded)
            if (url) urls.push(url)
          }
          this.setData({ addonDiscoveryImages: urls }, () => {
            this.persistAddonDocument().catch(() => {})
          })
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
    })
  },

  onRemoveAddonDiscoveryImage(e) {
    if (this.data.readOnly || this.data.confirmAwaitingOwner || this.data.addonDiscoveryReady) return
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const urls = (this.data.addonDiscoveryImages || []).filter((_, i) => i !== index)
    this.setData({ addonDiscoveryImages: urls }, () => {
      this.persistAddonDocument().catch(() => {})
    })
  },

  onFinishAddonDiscovery() {
    const images = (this.data.addonDiscoveryImages || []).filter(Boolean)
    const note = String(this.data.addonDiscoveryNote || '').trim()
    if (!images.length) {
      wx.showToast({ title: '请先拍下新故障', icon: 'none' })
      return
    }
    if (!note) {
      wx.showToast({ title: '请写一句看见什么', icon: 'none' })
      return
    }
    this.setData(
      {
        addonDiscoveryImages: images,
        addonDiscoveryNote: note,
        addonDiscoveryReady: true,
      },
      () => {
        this.persistAddonDocument().catch((err) => {
          wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
        })
      },
    )
  },

  onPreviewAddonDiscovery(e) {
    const url = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.url) || '')
    const urls = (this.data.addonDiscoveryImages || []).filter(Boolean)
    if (!url || !urls.length) return
    wx.previewImage({ current: url, urls })
  },

  onEditAddonDiscovery() {
    if (this.data.readOnly || this.data.confirmAwaitingOwner) return
    this.setData({ addonDiscoveryReady: false }, () => {
      this.persistAddonDocument().catch(() => {})
    })
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
    try {
      await this.flushDocDraftSave()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '请先保存当前修改', icon: 'none' })
      return
    }
    const kind = this.data.activeNode && this.data.activeNode.kind
    if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
      const gaps = collectQuoteConfirmGaps(this.buildDocPayloadForSave(), {
        requireDiscovery: this.data.isAddonQuote,
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
      const sent = await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        document: {
          status: 'pending_confirm',
          payload: this.buildDocPayloadForSave(),
        },
        ...this.buildAiReviewAckExtra(),
      })
      if (sent && sent.nextAction === 'ai_review') {
        this.applyInlineAiReview(sent.review, 'notify')
        return
      }
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
        requireDiscovery: this.data.isAddonQuote,
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
      title: '代车主确认',
      content: '车主当面、电话或微信已同意，但未在手机确认。',
      confirmText: '继续',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        wx.showActionSheet({
          itemList: ['附同意截图（聊天记录即可）', '不留痕，直接确认'],
          success: (sheet) => {
            if (sheet.tapIndex === 0) {
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
    pickLocalImages({
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
      payload.confirmCopy = this.data.confirmCopy || QUOTE_CONFIRM_COPY
    }
    if (kind === 'repair_report') {
      payload.confirmCopy = REPAIR_CONFIRM_COPY
    }
    this.setData({ confirming: true })
    try {
      const docStatus = String(
        (this.data.activeNode.document && this.data.activeNode.document.status) || '',
      )
      if (docStatus !== 'pending_confirm') {
        await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
          document: {
            status: 'pending_confirm',
            payload,
          },
        })
      }
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

  onAddProxyProof() {
    pickLocalImages({
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

  onGoHostAlbum() {
    if (!this.albumId) return
    wx.navigateTo({
      url: `/packageMerchant/pages/album/host/index?albumId=${encodeURIComponent(this.albumId)}`,
    })
  },
})
