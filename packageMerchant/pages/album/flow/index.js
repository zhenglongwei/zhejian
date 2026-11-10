const {
  fetchMerchantServiceAlbum,
  fetchMerchantAlbumFlow,
  saveMerchantServiceAlbum,
  completeMerchantServiceAlbum,
  completeMerchantFlowNode,
  fetchMerchantFlowNodeAiReview,
  updateMerchantFlowNode,
  proxyConfirmMerchantFlowNode,
  deliverMerchantFlowNode,
  insertMerchantAddonPlan,
  cancelMerchantAddonPlan,
  recognizeVehicleIntakeOcr,
  fetchMerchantSocialCards,
} = require('../../../../services/merchant-service-album')
const {
  applySocialPayload,
  rememberSocialText,
  rememberSocialCaption,
  switchSocialPlatform,
  toggleSocialImage,
} = require('../../../../utils/social-card-session')
const { copyCurrentSocialText, saveCurrentSocialImages } = require('../../../../utils/social-card-actions')
const { fetchMerchantProfile } = require('../../../../services/merchant')
const { promptMerchantHostEntry } = require('../../../../utils/merchant-host-public-gate')
const {
  SERVICE_ALBUM_STATUS,
  SERVICE_ALBUM_STATUS_LABEL,
  SERVICE_ALBUM_STATUS_VARIANT,
} = require('../../../../constants/service-album-status')
const {
  FINDING_RESULT,
  FINDING_RESULT_OPTIONS,
  FINDING_ADVICE_NONE,
  WALKAROUND_PARTS,
  QUOTE_CONFIRM_COPY,
  REPAIR_CONFIRM_COPY,
  INTAKE_CONFIRM_COPY,
  INTAKE_RECORD_CATEGORIES,
  ACCEPTANCE_RESULT_OPTIONS,
  ACCEPTANCE_KIND,
  ACCEPTANCE_EXTERIOR_NAME,
  ACCEPTANCE_EXTERIOR_MAX,
  ACCEPTANCE_ITEM_MAX_IMAGES,
  isValidFindingResult,
  findingAdviceRequired,
} = require('../../../../constants/service-flow-nodes')
const { buildFlowProgressView, deliveryReportSent } = require('../../../../utils/service-flow-progress')
const {
  canOpenStage,
  canEnterStage,
  isStageFrozen,
  isNodeEditFrozen,
  familyOfStageKey,
  familyOfKind,
  freezeMessage,
} = require('../../../../utils/flow-stage-locks')
const { merchantDocTitle, presentMerchantTimeline } = require('../../../../utils/merchant-flow-steps')
const { buildMerchantAlbumOverview, buildMerchantDocBrief } = require('../../../../utils/merchant-album-overview')
const { stageChrome, stageGateFor } = require('../../../../utils/merchant-record-preview')
const {
  buildOwnerPreviewDoc,
  buildIntakePreviewFromContent,
  previewAlbumOf,
  workItemsFromFindings,
  quoteTotalsFromNodes,
  finishWorkItemsFromFindingsList,
} = require('../../../../utils/owner-preview-doc')
const {
  buildMerchantStageBoard,
  stageKeyOf,
  focusStaysEditable,
  stageReviewForm,
  stageEditorNode,
} = require('../../../../utils/merchant-stage-board')
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
  capImages,
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
  resolveAcceptanceItems,
  withExteriorAcceptanceRow,
  buildAcceptanceRowsFromWorkItems,
  applyInspectionSuggestion,
  foldInspectionPendingDraft,
  collectConfirmedQuoteNames,
  collectConfirmedQuoteLines,
  seedWorkFindingsFromQuoteLines,
  unmatchedCheckpoints,
  workOutsideQuoteOf,
  buildWorkAssignPickGroups,
  buildWorkAddPickGroups,
  normalizeIntakeResult,
  normalizePendingImages,
  buildQuoteDraft,
} = require('../../../../utils/service-flow-docs')
const { getFlowPlaceholders } = require('../../../../utils/service-flow-placeholders')
const { quoteFace } = require('../../../../utils/service-flow-quote-draft')
const {
  bindSuggestionPart,
  isOdometerSuggestion,
  resolveAiReviewFindingIndex,
} = require('../../../../utils/ai-review-target')
const {
  uploadImage,
  uploadImagesBatch,
} = require('../../../../utils/media-upload')

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** 节点签字时间：统一存 YYYY-MM-DD HH:mm，便于选择器 */
function formatClerkAtNow(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function parseClerkAt(value) {
  const raw = String(value || '').trim()
  if (!raw) return { date: '', time: '', text: '' }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (iso) {
    const date = `${iso[1]}-${iso[2]}-${iso[3]}`
    const time = `${iso[4] || '00'}:${iso[5] || '00'}`
    return { date, time, text: `${date} ${time}` }
  }
  const cn = raw.match(/^(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}):(\d{2}))?/)
  if (cn) {
    const y = new Date().getFullYear()
    const date = `${y}-${pad2(Number(cn[1]))}-${pad2(Number(cn[2]))}`
    const time = `${pad2(Number(cn[3] || 0))}:${cn[4] || '00'}`
    return { date, time, text: `${date} ${time}` }
  }
  // 无法解析时回落到此刻，保证选择器仍有合法 value
  return parseClerkAt(formatClerkAtNow())
}

function clerkAtPartsPatch(key, value) {
  const parts = parseClerkAt(value)
  if (!parts.text) {
    return {
      [key]: '',
      [`${key}Date`]: '',
      [`${key}Time`]: '',
    }
  }
  return {
    [key]: parts.text,
    [`${key}Date`]: parts.date,
    [`${key}Time`]: parts.time,
  }
}

/** 报告落款展示：10月20日 09:42 */
function formatClerkAtForDoc(value) {
  if (!String(value || '').trim()) return ''
  const parts = parseClerkAt(value)
  const bits = parts.date.split('-')
  return `${Number(bits[1])}月${Number(bits[2])}日 ${parts.time}`
}

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

function flowDraftStorageKey(albumId, nodeId) {
  return `zj_flow_draft_${String(albumId || '').trim()}_${String(nodeId || '').trim()}`
}

function nodeContentOf(node) {
  if (!node || typeof node !== 'object') return {}
  if (node.content && typeof node.content === 'object') return node.content
  if (node.photoDraft && typeof node.photoDraft === 'object') return node.photoDraft
  return {}
}

function applyNodeContent(node, bag) {
  if (!node || typeof node !== 'object') return
  const next = bag && typeof bag === 'object' ? bag : {}
  node.content = next
  node.photoDraft = next
}

function flowContentSave(bag) {
  const next = bag && typeof bag === 'object' ? bag : {}
  return { content: next, photoDraft: next }
}

/** 节点验收 rows：只认 acceptanceItems 新结构（旧数据由迁移脚本搬完），并保证有「外观」末行 */
function acceptanceItemsFromDraft(acc) {
  if (!acc) return withExteriorAcceptanceRow([])
  const rows = resolveAcceptanceItems(
    Array.isArray(acc) ? { acceptanceItems: acc } : acc,
  )
  return withExteriorAcceptanceRow(rows)
}

function quoteLinesOf(node) {
  const bag = nodeContentOf(node)
  const payload = (node && node.document && node.document.payload) || {}
  const fromContent = Array.isArray(bag.lines) ? bag.lines : []
  const fromDoc = Array.isArray(payload.lines) ? payload.lines : []
  return fromContent.length ? fromContent : fromDoc
}

function readLocalFlowDraft(albumId, nodeId) {
  if (!String(albumId || '').trim() || !String(nodeId || '').trim()) return null
  try {
    const raw = wx.getStorageSync(flowDraftStorageKey(albumId, nodeId))
    if (!raw || typeof raw !== 'object') return null
    const bag = raw.content || raw.photoDraft
    if (!bag || typeof bag !== 'object') return null
    return { savedAt: raw.savedAt, content: bag, photoDraft: bag }
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
          ? String((nodeContentOf(node).chiefComplaint) || '')
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
        title: merchantDocTitle(kind) || '检测报告',
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
    const sheetTitle = merchantDocTitle(kind) || '报价单'
    const docStatus = String((node.document && node.document.status) || '')
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
        sealed: docStatus === 'confirmed',
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
    // 单据预览：payload 可能是信封空壳，正文以节点 content 为准
    const bag = { ...nodeContentOf(node), ...payload }
    const workItems = Array.isArray(bag.workItems)
      ? bag.workItems
      : Array.isArray(bag.items)
        ? bag.items
        : []
    const mapped = workItems.map((row) => ({
      name: String((row && row.name) || ''),
      brand: String((row && row.brand) || ''),
      amount: row && row.amount != null ? row.amount : '',
    }))
    const total =
      bag.totalAmount != null
        ? Number(bag.totalAmount) || 0
        : mapped.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
    return {
      ...base,
      kind,
      detailKind: 'doc_sheet',
      summary,
      sheetDoc: {
        kind,
        title: merchantDocTitle(kind) || '交车报告',
        sealed: String((node.document && node.document.status) || '') === 'confirmed',
        statusLabel: summary === '草稿' ? '' : summary,
        storeName,
        metaLine: buildSheetMetaLine(bag, album),
        styleVariant: 'document',
        repairBrief: String(bag.repairBrief || '').trim(),
        workItems: mapped,
        totalAmountLabel: `合计 ¥${total.toFixed(2)}`,
        warrantyPeriod: String(bag.warrantyPeriod || ''),
        warrantyNotes: resolveWarrantyNotes(bag),
        ownerFaqs: (Array.isArray(bag.ownerFaqs) ? bag.ownerFaqs : [])
          .map((row, index) => ({
            id: String((row && row.id) || `faq_${index + 1}`),
            question: String((row && (row.question || row.q)) || '').trim(),
            answer: String((row && (row.answer || row.a)) || '').trim(),
          }))
          .filter((row) => row.question)
          .slice(0, 5),
        confirmCopy: REPAIR_CONFIRM_COPY,
      },
    }
  }

  return { ...base, kind, summary }
}

/** 进度屏分区标签（键用 kind，不再用 album.nodes stage_*） */
const SECTION_LABELS = {
  intake: {
    title: '接车照片',
    tips: '连拍进场外观，把里程表拍进去',
    captionPlaceholder: '本图说明（选填）',
    findingMode: false,
    findingKind: '',
  },
  inspection: {
    title: '',
    tips: '',
    captionPlaceholder: '检查部位',
    findingMode: true,
    findingKind: 'inspection',
  },
  work: {
    title: '',
    tips: '',
    captionPlaceholder: '说明（选填）',
    findingMode: true,
    findingKind: 'work',
  },
  delivery_photos: {
    title: '验收照片',
    tips: '拍验收的过程与结果：试车、仪表读数、修复部位运转状态；整车外观另加 1 张',
    captionPlaceholder: '',
    findingMode: false,
    findingKind: '',
  },
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    showOverview: true,
    overview: null,
    docBrief: null,
    briefSending: false,
    workOpen: false,
    workTitle: '',
    stageKey: '',
    stageBoard: null,
    stageEditor: false,
    stagePrimary: '',
    stagePrimaryAction: '',
    stageLocked: false,
    stageShowPreview: false,
    recordPreview: null,
    complaintFocus: false,
    intakePile: [],
    intakeDocStatus: '',
    intakeSent: false,
    doneView: null,
    statusBarHeight: 20,
    capsulePad: 16,
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
    canUseLibrary: false,
    organizedOnce: false,
    hasFindingItems: false,
    canAssignPending: false,
    organizeActionLabel: '整理',
    showOrganizeAction: false,
    showPickSheet: false,
    pickSheetKind: '',
    pickSheetTitle: '',
    pickSheetGroups: [],
    pickSheetExtra: '',
    assignPendingIndex: -1,
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
    quoteHeroAmount: '0',
    addonEntryLabel: '施工中新发现',
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
    receiverName: '',
    receivedAt: '',
    receivedAtDate: '',
    receivedAtTime: '',
    inspectorName: '',
    inspectedAt: '',
    inspectedAtDate: '',
    inspectedAtTime: '',
    workerName: '',
    workFinishedAt: '',
    workFinishedAtDate: '',
    workFinishedAtTime: '',
    delivererName: '',
    finishedAt: '',
    finishedAtDate: '',
    finishedAtTime: '',
    mileageKm: '',
    odometerUrl: '',
    odometerImageId: '',
    odometerOcrBusy: false,
    odometerHint: null,
    vehicleBrand: '',
    vehicleSeries: '',
    vehicleYear: '',
    vehicleLine: '',
    warrantyPeriod: '',
    warrantyNotes: '',
    repairBrief: '',
    acceptanceItems: [],
    acceptanceResultOptions: ACCEPTANCE_RESULT_OPTIONS,
    acceptanceExteriorMax: ACCEPTANCE_EXTERIOR_MAX,
    acceptanceItemMaxImages: ACCEPTANCE_ITEM_MAX_IMAGES,
    acceptanceWorkCount: 0,
    ownerFaqs: [],
    allDone: false,
    needManualComplete: false,
    albumCompleted: false,
    showHostEntry: false,
    hosted: false,
    hostVisibility: 'private',
    onPublicWeb: undefined,
    publicGate: null,
    aiReview: null,
    aiReviewBusy: false,
    aiReviewTimedOut: false,
    chiefComplaintHint: null,
    warrantyHint: null,
    orphanPhotoHints: [],
    notifyOwnerLabel: '通知车主',
    photoConfirmDisabled: false,
    notifyConfirmDisabled: false,
    showQuoteAiCheck: false,
    adviceOpen: false,
    advicePaintWaiting: false,
    adviceStale: false,
    adviceCanRefresh: false,
    adviceWaitHint: '',
    adviceApplyRows: [],
    inspectAdviceOpen: true,
    quoteNotifyReady: true,
    quoteAssist: null,
    intakeAdvice: null,
    workAdvice: null,
    deliveryAdvice: null,
    inspectionAdvice: null,
    checkpointMisses: [],
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
    this._focusNodeId = String(options.nodeId || '').trim()
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    let capsulePad = 16
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      if (menu && menu.left && sys.windowWidth) {
        capsulePad = Math.max(16, sys.windowWidth - menu.left + 8)
      }
    } catch (e) {
      capsulePad = 96
    }
    this.setData({
      albumId: this.albumId,
      statusBarHeight: sys.statusBarHeight || 20,
      capsulePad,
    })
    this.bootstrap()
  },

  onShow() {
    this.resumeAiReviewIfNeeded()
  },

  onHide() {
    this.flushClerkFields()
    this.writeLocalFlowDraft()
    this.stopAiReviewPoll()
    this.stopQuoteAssistPoll()
  },

  onUnload() {
    this.flushClerkFields()
    this.writeLocalFlowDraft()
    this.stopAiReviewPoll()
    this.stopQuoteAssistPoll()
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
    this.stopQuoteAssistPoll()
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

  mapPendingImages(list = []) {
    return (list || [])
      .map((img) => {
        if (!img) return null
        if (typeof img === 'string') return { url: img, caption: '', id: '' }
        const url = String(img.url || img.rawUrl || '').trim()
        if (!url) return null
        return {
          url,
          caption: String(img.caption || '').trim(),
          id: String(img.id || img.imageId || '').trim(),
        }
      })
      .filter(Boolean)
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
      ;(nodeContentOf(node).findings || []).forEach((raw) => put(raw, false))
    })
    const currentFindings = nodeContentOf(activeNode).findings || []
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

    // 施工图只认工单节点 content
    ;(flowNodes || []).forEach((node) => {
      if (!node || node.kind !== 'work') return
      ;(nodeContentOf(node).findings || []).forEach((raw) => {
        const item = normalizeWorkFinding(raw)
        item.images.forEach((img) => put(img.url, item.partName, img.imageId))
      })
    })
    return Object.keys(byKey).map((k) => byKey[k])
  },

  hydrateIntakePhotos(photoDraft, sections) {
    const first = (sections && sections[0]) || {}
    let odoUrl = String((photoDraft && photoDraft.odometerUrl) || first.odometerUrl || '').trim()
    let odoId = String((photoDraft && photoDraft.odometerImageId) || first.odometerImageId || '').trim()
    const odoReading = ((photoDraft && photoDraft.intakeResults) || []).find(
      (row) => row && row.category === 'odometer',
    )
    if (!odoUrl && odoReading && odoReading.images && odoReading.images[0]) {
      odoUrl = String(odoReading.images[0].url || '').trim()
      odoId = String(odoReading.images[0].imageId || odoReading.images[0].id || '').trim()
    }
    const seen = {}
    const appearance = []
    const take = (img, preferOdo) => {
      const url = String((img && img.url) || '').trim()
      if (!url) return
      const key = mediaKey(url)
      if (!key || seen[key]) return
      seen[key] = true
      if (preferOdo && !odoUrl) {
        odoUrl = url
        odoId = String((img && (img.imageId || img.id)) || '')
        return
      }
      if (key === mediaKey(odoUrl)) return
      appearance.push({
        url,
        imageId: String((img && (img.imageId || img.id)) || ''),
      })
    }
    ;(first.images || []).forEach((img) => take(img, false))
    ;((photoDraft && photoDraft.intakeResults) || []).forEach((row) => {
      ;(row && row.images ? row.images : []).forEach((img) => take(img, row.category === 'odometer'))
    })
    ;((photoDraft && photoDraft.pendingImages) || []).forEach((img) => take(img, false))
    return {
      sections: (sections || []).map((row, index) =>
        index === 0
          ? { ...row, images: appearance, odometerUrl: odoUrl, odometerImageId: odoId }
          : row,
      ),
      odometerUrl: odoUrl,
      odometerImageId: odoId,
      mileageKm: parseMileageKm(
        (photoDraft && photoDraft.mileageKm) || (odoReading && odoReading.reading) || '',
      ),
    }
  },

  buildSections(album, node, photoDraft = {}, flowNodes = []) {
    const draftFindings = Array.isArray(photoDraft.findings) ? photoDraft.findings : []
    const strictFindings = Object.prototype.hasOwnProperty.call(photoDraft, 'findings')

    // 接车＝留证：只读节点 content.pendingImages
    if (node && node.kind === 'intake') {
      const meta = SECTION_LABELS.intake
      const images = this.mapPendingImages(photoDraft.pendingImages)
      const odoKey = mediaKey(photoDraft.odometerUrl)
      return [
        {
          stageId: 'intake',
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
      const meta = SECTION_LABELS.inspection
      const findings = mapFindingRows([], draftFindings, {
        pendingKeys: (photoDraft.pendingImages || []).map((img) => img && img.url),
        strictFindings: true,
      })
      return [
        {
          stageId: 'inspection',
          title: meta.title,
          tips: '',
          captionPlaceholder: meta.captionPlaceholder,
          findingMode: true,
          findingKind: 'inspection',
          images: this.findingImagesFromRows(findings),
          findings,
          odometerUrl: '',
          odometerImageId: '',
        },
      ]
    }

    // 存量合并节点（v5）：检测 findings 仍只认 content
    if (node && node.kind === 'intake_inspection') {
      const meta = SECTION_LABELS.inspection
      const mapped = mapFindingRows([], draftFindings, {
        odometerUrl: photoDraft.odometerUrl,
        pendingKeys: (photoDraft.pendingImages || []).map((img) => img && img.url),
        strictFindings: true,
      })
      const slot = pickOdometerSlot(photoDraft, mapped)
      return [
        {
          stageId: 'inspection',
          title: meta.title,
          tips: '',
          captionPlaceholder: meta.captionPlaceholder,
          findingMode: true,
          findingKind: 'inspection',
          images: this.findingImagesFromRows(slot.findings, slot.odometerUrl),
          findings: slot.findings,
          odometerUrl: slot.odometerUrl,
          odometerImageId: slot.odometerImageId,
        },
      ]
    }

    if (node && node.kind === 'work') {
      const meta = SECTION_LABELS.work
      const mergedDraft = this.collectMergedWorkDraftFindings(flowNodes, node, photoDraft)
      let findings = mapFindingRows([], mergedDraft, {
        mode: 'work',
        pendingKeys: (photoDraft.pendingImages || []).map((img) => img && img.url),
        strictFindings,
      })
      const images = this.flattenWorkSectionImages(findings)
      return [
        {
          stageId: 'work',
          title: meta.title,
          tips: meta.tips,
          captionPlaceholder: meta.captionPlaceholder || '本图说明',
          findingMode: true,
          findingKind: 'work',
          images,
          findings,
        },
      ]
    }

    if (node && node.kind === 'delivery_photos') {
      const meta = SECTION_LABELS.delivery_photos
      const images = []
      const exteriorRow = resolveAcceptanceItems(photoDraft).find(
        (row) => row.kind === 'exterior',
      )
      ;(exteriorRow ? exteriorRow.images : []).forEach((row) => {
        const url = String((row && (row.url || row.rawUrl)) || row || '').trim()
        const key = mediaKey(url)
        if (!url || !key || images.some((item) => mediaKey(item.url) === key)) return
        images.push({ url, caption: '' })
      })
      return [
        {
          stageId: 'delivery_photos',
          title: meta.title,
          tips: meta.tips,
          captionPlaceholder: meta.captionPlaceholder || '本图说明',
          findingMode: false,
          findingKind: '',
          images,
          findings: [],
        },
      ]
    }

    return []
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
        bandChips: [],
        hasBands: false,
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

  quoteMoneyFields(lines) {
    const sum = Math.round(Number(sumQuoteAmounts(lines || [])) * 100) / 100
    const hero = Number.isInteger(sum)
      ? sum.toLocaleString('zh-CN')
      : sum.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return {
      quoteTotalLabel: `合计 ¥${sum.toFixed(2)}`,
      quoteHeroAmount: hero,
    }
  },

  setQuoteLines(lines, options = {}) {
    const quoteLines = this.decorateQuoteLines(lines, this.quoteEvidenceSource())
    const patch = {
      quoteLines,
      ...this.quoteMoneyFields(quoteLines),
      autoSaveLabel: '保存中…',
    }
    if (this.data.quoteAssist && this.data.quoteAssist.hasContent) {
      // 改表后不自动重跑；标「内容有变」提示可刷新
      patch.quoteAssist = {
        ...this.decorateQuoteAssist(this.data.quoteAssist, quoteLines),
        stale: true,
      }
      if (this.data.adviceOpen) {
        patch.adviceStale = true
        patch.adviceCanRefresh = !this.data.readOnly
      }
    }
    this.setData(patch, () => {
      if (options && options.persistNow) {
        this.flushDocDraftSave().catch((err) => {
          this.setAutoSaveLabel((err && err.message) || '自动保存失败，请检查网络')
        })
        return
      }
      this.scheduleAutoSaveDoc()
    })
  },

  syncQuoteEvidenceFromFindings() {
    if (this.data.isAddonQuote || this.data.activeKind !== 'inspection_report') return
    const quoteEvidenceFindings = this.expandQuoteEvidence(this.data.findings)
    const quoteLines = this.decorateQuoteLines(this.data.quoteLines, quoteEvidenceFindings)
    this.setData({
      quoteEvidenceFindings,
      quoteLines,
      ...this.quoteMoneyFields(quoteLines),
    })
  },

  presentInspectionGaps(gaps) {
    const list = Array.isArray(gaps) ? gaps.filter(Boolean) : []
    if (!list.length) return false
    const expandKey = this.findFirstIncompleteFindingKey()
    if (expandKey) this.setSectionsWithFindings(this.data.sections, {}, expandKey)
    const missingResult = list.some((row) => /检查结果/.test(row))
    wx.showModal({
      title: missingResult ? '请先选择检查结果' : '请先补全检测内容',
      content: `${list.slice(0, 4).join('\n')}${list.length > 4 ? `\n…共 ${list.length} 项` : ''}`,
      showCancel: false,
      confirmText: '去补全',
    })
    return true
  },

  /** 生成检测报告前：每一项都要点上检查结果。写了检查发现也不能过。 */
  blockInspectionUntilResultChosen() {
    const kind = this.data.activeNode && this.data.activeNode.kind
    if (kind !== 'inspection' && kind !== 'intake_inspection') return false
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
      findings: this.collectFindingsFromSections(),
    }
    return this.presentInspectionGaps(collectInspectionReportGaps(draftPayload))
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

  /** 检测/工单有图闸：只数各项 images[]，禁止用 section.images / stage_* 散图当真源 */
  countAttachedFindingPhotos(sections = this.data.sections) {
    return this.collectFindingsFromSections(sections).reduce((n, row) => {
      if (!row) return n
      if (Array.isArray(row.images) && row.images.length) return n + row.images.length
      return n + (row.url ? 1 : 0)
    }, 0)
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
      adviceHint: item.aiApply
        ? {
            id: item.aiApply.id,
            kicker: '建议',
            body: item.aiApply.body,
            canApply: true,
            applied: false,
          }
        : item.adviceHint || null,
      captionHint: item.captionHint || null,
      hasCollapsedHints: false,
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
        listKey: row.id || listKey || row.imageId || row.url || `pending-${row.partName || extras.aiSuggestionId || ''}`,
        expanded: Boolean(expanded),
        complete: hasPhoto && missing === 0,
        summaryText: row.partName || '待填写',
        summaryBody: row.caption || '',
        completenessLabel: !hasPhoto ? '待拍照' : missing > 0 ? '缺项目' : '',
        labelToneDanger: !hasPhoto || missing > 0,
        showQuoteAddon: Boolean(
          row.outsideQuote ||
            (this._workExtraTitles && this._workExtraTitles.has(String(row.partName || '').trim())),
        ),
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
      listKey: row.id || listKey || row.imageId || row.url || `pending-${row.partName || extras.aiSuggestionId || ''}`,
      expanded: Boolean(expanded),
      complete: missing === 0 && hasPhoto,
      summaryText: row.partName || '待填写',
      summaryBody: row.advice || '',
      completenessLabel: !hasPhoto
        ? '待拍照'
        : missing > 0
          ? `缺 ${missing} 项`
          : row.result || '',
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
    const isWork = Boolean(findingSection && findingSection.findingKind === 'work')
    const quoteNames = isWork ? collectConfirmedQuoteNames(this._flowNodes || []) : []
    const canAssignPending = isWork
      ? quoteNames.length > 0 || findings.some((row) => row && row.outsideQuote)
      : findings.length > 0
    return {
      hasFindingItems: findings.length > 0,
      hasOutsideQuoteItems: findings.some((row) => row && row.outsideQuote),
      canAssignPending,
    }
  },

  buildAdviceApplyRows(sections, review) {
    const rows = []
    const seen = new Set()
    ;(sections || []).forEach((section) => {
      ;(section && section.findings ? section.findings : []).forEach((finding) => {
        const apply = finding && finding.aiApply
        const body = String((apply && apply.body) || '').trim()
        if (!apply || !body || seen.has(apply.id)) return
        seen.add(apply.id)
        rows.push({ id: apply.id, body, canApply: true })
      })
    })
    const suggestions = (review && review.suggestions) || []
    suggestions.forEach((item) => {
      if (!item || item.applied || seen.has(item.id)) return
      const photo = item.isPhoto || item.type === 'photo'
      const body = photo
        ? String(item.howText || item.how || item.title || '').trim()
        : String(item.suggestedText || '').trim()
      if (!body) return
      if (!photo && !item.canApply) return
      seen.add(item.id)
      rows.push({ id: item.id, body, canApply: !photo && Boolean(item.canApply) })
    })
    return rows
  },

  setSectionsWithFindings(sections, extra = {}, expandKey, done) {
    const expandedFindingKey =
      expandKey === undefined ? this.data.expandedFindingKey : expandKey
    const decorated = this.decorateSections(sections, expandedFindingKey)
    const pending =
      extra.pendingImages !== undefined ? extra.pendingImages : this.data.pendingImages
    const patch = {
      sections: decorated,
      expandedFindingKey,
      adviceApplyRows: this.buildAdviceApplyRows(decorated, extra.aiReview || this.data.aiReview),
      ...this.findingChromePatch(decorated, pending),
      ...extra,
    }
    if (this.data.isIntakePhotoStep) {
      patch.findings = this.collectFindingsFromSections(decorated)
    }
    this.setData(patch, () => {
      if (typeof done === 'function') done()
    })
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
    // 接车＝留证：问诊 / 当前里程 / 里程表槽；外观图走相册节点
    if (kind === 'intake') {
      const intake = this.intakeNode()
      const draft = nodeContentOf(intake)
      const fromNode = normalizePendingImages(draft.pendingImages)
      const pile = normalizePendingImages(this.collectIntakePile())
      const pendingImages = fromNode.length ? fromNode : pile
      const intakeSave = {
        chiefComplaint: this.data.chiefComplaint || draft.chiefComplaint,
        receiverName: String(this.data.receiverName || draft.receiverName || '').trim(),
        receivedAt: String(this.data.receivedAt || draft.receivedAt || '').trim(),
        fuelReading: String(this.data.fuelReading || draft.fuelReading || '').trim(),
        vehicleBrand: String(this.data.vehicleBrand || draft.vehicleBrand || '').trim(),
        vehicleSeries: String(this.data.vehicleSeries || draft.vehicleSeries || '').trim(),
        vehicleYear: String(this.data.vehicleYear || draft.vehicleYear || '').trim(),
        odometerUrl: String(draft.odometerUrl || this.data.odometerUrl || '').trim(),
        odometerImageId: String(draft.odometerImageId || this.data.odometerImageId || '').trim(),
        intakeResults: [],
      }
      if (pendingImages.length) intakeSave.pendingImages = pendingImages
      return intakeSave
    }
    // 检测＝细查：部位 findings + 结论（结论进检测报告）
    if (kind === 'inspection') {
      return {
        findings: this.collectFindingsFromSections(),
        conclusion: this.data.conclusion,
        inspectorName: String(this.data.inspectorName || '').trim(),
        inspectedAt: String(this.data.inspectedAt || '').trim(),
        pendingImages: normalizePendingImages(this.data.pendingImages),
        inspectionAiKey: this._inspectionAiKey || '',
      }
    }
    // 存量合并节点（v5）
    if (kind === 'intake_inspection') {
      const odometerUrl = String(this.data.odometerUrl || '').trim()
      return {
        chiefComplaint: this.data.chiefComplaint,
        receiverName: String(this.data.receiverName || '').trim(),
        receivedAt: String(this.data.receivedAt || '').trim(),
        inspectorName: String(this.data.inspectorName || '').trim(),
        inspectedAt: String(this.data.inspectedAt || '').trim(),
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
        workerName: String(this.data.workerName || '').trim(),
        pendingImages: normalizePendingImages(this.data.pendingImages),
      }
    }
    if (kind === 'delivery_photos') {
      return {
        warrantyPeriod: this.data.warrantyPeriod,
        warrantyNotes: this.data.warrantyNotes,
        delivererName: String(this.data.delivererName || '').trim(),
        finishedAt: String(this.data.finishedAt || '').trim(),
        confirmCopy: REPAIR_CONFIRM_COPY,
        // 简述/问答不在界面展示；此处只负责把 AI 静默写入的内容一起落库
        repairBrief: String(this.data.repairBrief || '').trim(),
        // 一列到底：施工项目行 + 外观行（kind=exterior，最后一行）
        acceptanceItems: withExteriorAcceptanceRow(this.data.acceptanceItems || [])
          .map((row) => ({
            id: String((row && row.id) || '').trim(),
            kind: row && row.kind === 'exterior' ? 'exterior' : 'work',
            name: String((row && row.name) || '').trim(),
            images: (Array.isArray(row && row.images) ? row.images : [])
              .map((img) => String((img && img.url) || '').trim())
              .filter(Boolean)
              .map((url) => ({ url })),
            result: String((row && row.result) || '').trim(),
            note: String((row && row.note) || '').trim(),
          }))
          .filter((row) => row.name),
        ownerFaqs: (Array.isArray(this.data.ownerFaqs) ? this.data.ownerFaqs : [])
          .map((row, index) => ({
            id: String((row && row.id) || `faq_${index + 1}`),
            question: String((row && row.question) || '').trim(),
            answer: String((row && row.answer) || '').trim(),
          }))
          .filter((row) => row.question)
          .slice(0, 5),
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
      let completedWorkNow = false
      if (this._justCompletedWorkId) {
        const doneId = this._justCompletedWorkId
        this._justCompletedWorkId = ''
        flowNodes.forEach((node) => {
          if (node && node.id === doneId) {
            node.status = 'completed'
            completedWorkNow = true
          }
        })
      }
      this._flowNodes = flowNodes
      const progress = completedWorkNow
        ? buildFlowProgressView(flowNodes)
        : flow.progress || buildFlowProgressView(flowNodes)
      const forceStage = Boolean(this._forceStageOpen)
      this._forceStageOpen = false
      const stageKeyForBoard = this._pendingStageKey || this.data.stageKey
      this._pendingStageKey = ''
      const stageOpen = forceStage || Boolean(this.data.workOpen && stageKeyForBoard)
      let active = progress.activeNode || null
      if (stageOpen && stageKeyForBoard) {
        const previewBoard = buildMerchantStageBoard(album, flowNodes, stageKeyForBoard)
        const focus = flowNodes.find((node) => node && node.id === previewBoard.focusId)
        const workDone =
          previewBoard.family === 'work' && focus && String(focus.status || '') === 'completed'
        const review = stageReviewForm(previewBoard, focus, flowNodes)
        const editorNode = stageEditorNode(previewBoard, focus, flowNodes)
        const finishOpen = previewBoard.family === 'finish' && !review
        if (
          editorNode &&
          (previewBoard.state === 'current' || focusStaysEditable(previewBoard, focus) || workDone || review || finishOpen)
        ) {
          active = editorNode
        }
      }
      const activeIsPhoto = Boolean(
        active &&
          (active.nodeCategory === 'photo' ||
            active.kind === 'intake_inspection' ||
            active.kind === 'intake' ||
            active.kind === 'inspection' ||
            active.kind === 'work' ||
            active.kind === 'delivery_photos'),
      )
      const activeIsDoc = Boolean(active && active.document)
      // 单据正文在 content；payload 可能只是信封。合并后工作项/简述等才读得到
      const docPayload = {
        ...nodeContentOf(active),
        ...((active && active.document && active.document.payload) || {}),
      }
      let photoDraft = { ...nodeContentOf(active) }
      if (active && active.id) {
        const local = readLocalFlowDraft(this.albumId, active.id)
        if (local && (local.content || local.photoDraft)) {
          const bag = { ...(local.content || local.photoDraft) }
          if (
            !normalizePendingImages(bag.pendingImages).length &&
            normalizePendingImages(photoDraft.pendingImages).length
          ) {
            delete bag.pendingImages
          }
          if (
            !(Array.isArray(bag.acceptanceItems) && bag.acceptanceItems.length) &&
            Array.isArray(photoDraft.acceptanceItems) &&
            photoDraft.acceptanceItems.length
          ) {
            delete bag.acceptanceItems
          }
          // 本地草稿空简述/问答不得盖掉节点里已有内容（定稿后反复丢字的漏口）
          if (!String(bag.repairBrief || '').trim() && String(photoDraft.repairBrief || '').trim()) {
            delete bag.repairBrief
          }
          if (
            !(Array.isArray(bag.ownerFaqs) && bag.ownerFaqs.length) &&
            Array.isArray(photoDraft.ownerFaqs) &&
            photoDraft.ownerFaqs.length
          ) {
            delete bag.ownerFaqs
          }
          photoDraft = { ...photoDraft, ...bag }
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
      const completedPreview = (progress.completedSteps || []).map((step) =>
        mapCompletedStepPreview(step, nodeById[step.id], album),
      )
      const timeline = presentMerchantTimeline(completedPreview, active)
      const completedSteps = timeline.completed

      let findings = []
      let chiefComplaint = ''
      let conclusion = ''
      let confirmCopy = ''
      let warrantyPeriod = ''
      let warrantyNotes = ''
      let repairBrief = ''
      let acceptanceDraft = null
      let ownerFaqs = []
      let sections = []
      let walkaround = []
      let quoteLines = [{ name: '', amount: '', note: '' }]
      this._quoteDraftHint = ''
      let expandedFindingKey = ''

      if (activeIsPhoto && active) {
        if (active.kind === 'inspection') {
          const pendingBefore = normalizePendingImages(photoDraft.pendingImages).length
          photoDraft = foldInspectionPendingDraft(photoDraft)
          if (pendingBefore) this._foldInspectionPending = true
        }
        if (isWorkPhotoStep) {
          if (normalizePendingImages(photoDraft.pendingImages).length) {
            photoDraft = { ...photoDraft, pendingImages: [] }
            this._parkWorkPending = true
          }
          photoDraft = {
            ...photoDraft,
            findings: seedWorkFindingsFromQuoteLines(
              photoDraft.findings,
              collectConfirmedQuoteLines(flowNodes),
            ),
          }
        }
        const workAdviceRaw =
          (flowNodes.find((node) => node && node.kind === 'work' && node.workAdvice) || {}).workAdvice ||
          {}
        this._workExtraTitles = new Set(
          (Array.isArray(workAdviceRaw.gaps) ? workAdviceRaw.gaps : [])
            .filter((row) => row && (row.kind === 'extra' || row.kind === 'addon'))
            .map((row) => String((row && row.title) || '').trim())
            .filter(Boolean),
        )
        sections = this.buildSections(album, active, photoDraft, flowNodes)
        // 主诉 / 环车勾选记在接车步
        if (isIntakePhotoStep) {
          chiefComplaint = photoDraft.chiefComplaint || ''
          walkaround = Array.isArray(photoDraft.walkaround) ? photoDraft.walkaround : []
          const hydrated = this.hydrateIntakePhotos(photoDraft, sections)
          sections = hydrated.sections
          photoDraft = {
            ...photoDraft,
            odometerUrl: hydrated.odometerUrl,
            odometerImageId: hydrated.odometerImageId,
            mileageKm: hydrated.mileageKm || photoDraft.mileageKm,
            intakeResults: [],
          }
        }
        // findings / 结论记在检测步（结论进检测报告）
        if (isInspectionPhotoStep) {
          conclusion = photoDraft.conclusion || ''
          findings = this.collectFindingsFromSections(sections)
          const intake = flowNodes.find(
            (item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'),
          )
          const intakeDraft = nodeContentOf(intake)
          const intakeLocal = intake && readLocalFlowDraft(this.albumId, intake.id)
          const intakePayload = (intake && intake.document && intake.document.payload) || {}
          chiefComplaint = String(
            intakeDraft.chiefComplaint ||
              (intakeLocal && intakeLocal.photoDraft && intakeLocal.photoDraft.chiefComplaint) ||
              intakePayload.chiefComplaint ||
              '',
          ).trim()
        }
        if (isDeliveryPhotoStep) {
          warrantyPeriod = String(photoDraft.warrantyPeriod || '').trim()
          warrantyNotes = resolveWarrantyNotes(photoDraft)
          confirmCopy =
            photoDraft.confirmCopy || '本人确认上述施工与交车状态，并知悉质保条款。'
          repairBrief = String(photoDraft.repairBrief || '').trim()
          acceptanceDraft = photoDraft
          ownerFaqs = (Array.isArray(photoDraft.ownerFaqs) ? photoDraft.ownerFaqs : [])
            .map((row, index) => ({
              id: String((row && row.id) || `faq_${index + 1}`),
              question: String((row && (row.question || row.q)) || '').trim(),
              answer: String((row && (row.answer || row.a)) || '').trim(),
            }))
            .filter((row) => row.question)
            .slice(0, 5)
          // 外观已并入验收清单最后一行；旧 archiveCopy / 旧外观照由迁移脚本一次性完成
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
        {
          const fromNode = quoteLinesOf(active)
          if (fromNode.length) {
            quoteLines = fromNode.map((line) => normalizeQuoteLine(line))
          } else if (Array.isArray(docPayload.lines) && docPayload.lines.length) {
            quoteLines = docPayload.lines.map((line) => normalizeQuoteLine(line))
          }
        }
        if (active.kind === 'inspection_report') {
          const quoteNode = flowNodes.find(
            (n) => n && n.kind === 'quote_confirm' && !n.insertedReason,
          )
          const quotePayload =
            (quoteNode && quoteNode.document && quoteNode.document.payload) || {}
          const fromQuote = quoteLinesOf(quoteNode).map((line) => normalizeQuoteLine(line))
          const hasNamed = fromQuote.some((row) => String(row.name || '').trim())
          const quoteDraft = buildQuoteDraft({
            findings,
            templateId: album.templateId,
            serviceName: album.serviceName,
          })
          const assist = quoteNode && quoteNode.quoteAssist
          const skipRuleRefresh = Boolean(
            assist &&
              (assist.status === 'queued' ||
                assist.status === 'running' ||
                assist.status === 'ready'),
          )
          const unpriced =
            !fromQuote.some((row) => {
              const n = Number(row.amount)
              return Number.isFinite(n) && n > 0
            })
          const canRefreshOpenDraft =
            !skipRuleRefresh &&
            unpriced &&
            quoteDraft.mode === 'teardown' &&
            (!hasNamed || String((fromQuote[0] && fromQuote[0].name) || '') === '拆检')
          quoteLines =
            hasNamed && !canRefreshOpenDraft
              ? fromQuote
              : skipRuleRefresh
                ? fromQuote.length
                  ? fromQuote
                  : [{ name: '', brand: '', amount: '', note: '', evidenceUrl: '', evidenceUrls: [] }]
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
          const quoteAssistNode = flowNodes.find(
            (n) => n && n.kind === 'quote_confirm' && !n.insertedReason,
          )
          const quoteAssist = (quoteAssistNode && quoteAssistNode.quoteAssist) || null
          const assistBusy =
            quoteAssist &&
            (quoteAssist.status === 'queued' || quoteAssist.status === 'running')
          if (
            !(quoteLines || []).some((row) => String(row.name || '').trim()) &&
            !assistBusy
          ) {
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
      if (
        (active && (active.kind === 'delivery_photos' || active.kind === 'repair_report')) ||
        stageKeyOf(stageKeyForBoard || this.data.stageKey) === 'finish'
      ) {
        const filled = this.deliveryFormFromNodes(album, flowNodes, photoDraft)
        warrantyPeriod = filled.warrantyPeriod || warrantyPeriod
        warrantyNotes = filled.warrantyNotes || warrantyNotes
        repairBrief = filled.repairBrief || repairBrief
        if (filled.ownerFaqs.length) ownerFaqs = filled.ownerFaqs
        confirmCopy = filled.confirmCopy || confirmCopy
      }
      const quoteDraftHint = isAddonQuote ? '' : this._quoteDraftHint || ''
      const face = quoteFace({
        templateId: album && album.templateId,
        serviceName: (album && album.serviceName) || '',
      })
      this._pendingQuoteAssist = (
        (flowNodes.find((n) => n && n.kind === 'quote_confirm' && !n.insertedReason) || {})
          .quoteAssist ||
        (active && active.quoteAssist) ||
        null
      )
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
      const activeTitle = timeline.activeTitle

      const albumVehicle = (album && album.vehicle) || {}
      this._albumMileage = parseMileageKm(albumVehicle.mileage || albumVehicle.mileageKm)
      const mileageKm = isIntakePhotoStep ? '' : parseMileageKm(photoDraft.mileageKm)
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
      const vehicleLine = [
        String(albumVehicle.brand || vehicleBrand || '').trim(),
        String(albumVehicle.series || vehicleSeries || '').trim(),
        String(albumVehicle.modelYear || albumVehicle.year || vehicleYear || '').trim(),
      ]
        .filter(Boolean)
        .join(' · ')
      const intakeAdvice = this.decorateIntakeAdvice(
        (flowNodes.find((n) => n && (n.kind === 'intake' || n.kind === 'intake_inspection')) || {})
          .intakeAdvice,
      )
      const workAdvice = this.decorateWorkAdvice(
        (flowNodes.find((n) => n && n.kind === 'work' && n.workAdvice) || {}).workAdvice,
        sections,
      )
      const deliveryAdvice = this.decorateDeliveryAdvice(
        (flowNodes.find((n) => n && n.kind === 'delivery_photos') || {}).deliveryAdvice,
      )
      const inspectionAdvice = this.decorateInspectionAdvice(
        (flowNodes.find((n) => n && n.kind === 'inspection') || {}).inspectionAdvice,
        sections,
      )
      const openStageBoard = stageOpen
        ? buildMerchantStageBoard(album, flowNodes, stageKeyForBoard)
        : null
      const openStageBar = openStageBoard ? this.stageBarFields(flowNodes, openStageBoard, active) : {}
      const openAdvice = Boolean(this._openAdviceAfterLoad)
      this._openAdviceAfterLoad = false

      this._inspectionAiKey =
        nodeContentOf(active).inspectionAiKey || ''
      const initialAcceptanceItems = this.resolveInitialAcceptanceItems(
        this.collectDeliveryWorkItems(flowNodes),
        acceptanceItemsFromDraft(acceptanceDraft),
      )
      this.setData({
        status: 'ready',
        serviceName: album.serviceName || '服务相册',
        statusLabel: SERVICE_ALBUM_STATUS_LABEL[status] || status,
        statusVariant: SERVICE_ALBUM_STATUS_VARIANT[status] || 'default',
        readOnly:
          readOnly ||
          Boolean(
            openStageBoard &&
              isStageFrozen(flowNodes, openStageBoard.family || familyOfStageKey(openStageBoard.selectedKey)),
          ) ||
          Boolean(
            openStageBoard &&
              openStageBoard.family === 'quote' &&
              stageReviewForm(
                openStageBoard,
                openStageBoard && flowNodes.find((node) => node && node.id === openStageBoard.focusId),
                flowNodes,
              ),
          ),
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
        quoteAssist: this.decorateQuoteAssist(this._pendingQuoteAssist, quoteLines),
        intakeAdvice,
        workAdvice,
        deliveryAdvice,
        inspectionAdvice,
        inspectAdviceOpen: options.silent
          ? this.data.inspectAdviceOpen
          : Boolean(isInspectionPhotoStep && intakeAdvice && intakeAdvice.hasContent),
        checkpointMisses: this.computeCheckpointMisses(
          flowNodes,
          findings,
          isInspectionPhotoStep && (findings || []).some((row) => row && row.partName),
        ),
        adviceOpen: openAdvice ? true : options.silent ? this.data.adviceOpen : false,
        showQuoteAiCheck: Boolean(
          flow.nodeAiReview &&
            flow.nodeAiReview.entitled &&
            !readOnly &&
            !confirmAwaitingOwner &&
            (active &&
              (active.kind === 'inspection_report' ||
                active.kind === 'quote_confirm' ||
                active.kind === 'addon_quote_confirm' ||
                active.kind === 'intake' ||
                active.kind === 'repair_report' ||
                active.kind === 'delivery_photos')),
        ),
        quoteNotifyReady: true,
        chiefComplaintHint: null,
        odometerHint: null,
        warrantyHint: null,
        orphanPhotoHints: [],
        aiReview: null,
        sections,
        adviceApplyRows: this.buildAdviceApplyRows(sections, null),
        pendingImages: isIntakePhotoStep ? [] : normalizePendingImages(photoDraft.pendingImages),
        intakePile: isIntakePhotoStep
          ? this.intakePileFromPending(photoDraft.pendingImages)
          : this.data.intakePile,
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
        walkaround,
        walkaroundParts: WALKAROUND_PARTS.map((row) => ({
          ...row,
          checked: walkaround.indexOf(row.id) >= 0,
        })),
        expandedFindingKey,
        docPayload,
        findings,
        chiefComplaint,
        ...this.buildClerkFieldData(flowNodes, photoDraft, docPayload, {
          activeKind: (active && active.kind) || '',
          readOnly: this.data.readOnly,
        }),
        mileageKm,
        odometerUrl: isIntakePhotoStep ? String((sections[0] && sections[0].odometerUrl) || '').trim() : '',
        odometerImageId: isIntakePhotoStep
          ? String((sections[0] && sections[0].odometerImageId) || '').trim()
          : '',
        odometerOcrBusy: false,
        vehicleBrand,
        vehicleSeries,
        vehicleYear,
        vehicleLine,
        quoteLines,
        quoteDraftHint,
        addonEntryLabel: face.addonEntry,
        quoteEvidenceFindings,
        ...this.quoteMoneyFields(quoteLines),
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
        repairBrief,
        acceptanceItems: initialAcceptanceItems,
        acceptanceWorkCount: initialAcceptanceItems.filter((row) => row.kind !== 'exterior').length,
        ownerFaqs,
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
        onPublicWeb: album.hostMeta ? album.hostMeta.onPublicWeb : undefined,
        publicGate: album.publicGate || null,
        overview: buildMerchantAlbumOverview(album, flowNodes),
        workOpen: stageOpen ? true : this.data.workOpen,
        stageKey: openStageBoard ? openStageBoard.selectedKey : this.data.stageKey,
        stageBoard: openStageBoard,
        ...openStageBar,
      }, () => {
        this.syncAdviceChrome()
        this.settleAdvicePaintWaiting()
        if (this._foldInspectionPending) {
          this._foldInspectionPending = false
          this.persistPhotoDraft().catch(() => {})
        }
        if (this._parkWorkPending) {
          this._parkWorkPending = false
          this.persistPhotos()
            .then(() => this.persistPhotoDraft())
            .catch(() => {})
        }
      })
      this._focusNodeId = ''
      this._nodeAiReviewEntitled = Boolean(flow.nodeAiReview && flow.nodeAiReview.entitled)
      this.resumeAiReviewFromNode(active)
      this.resumeQuoteAssistPoll()
      if (isWorkPhotoStep && !this.data.readOnly && !options.silent) {
        this.scheduleAutoSavePhotos()
      }

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

  onOverviewBack() {
    wx.navigateBack({
      fail() {
        wx.redirectTo({ url: '/packageMerchant/pages/album/list/index' })
      },
    })
  },

  onBackToOverview() {
    this.setData({ workOpen: false, doneView: null })
  },

  onCloseWork() {
    this.setData({ workOpen: false, stageKey: '', stageBoard: null, stageEditor: false })
  },

  bucketKeyOf(id) {
    const sorted = (this._flowNodes || [])
      .slice()
      .sort((a, b) => Number((a && a.sortOrder) || 0) - Number((b && b.sortOrder) || 0))
    let quote = 0
    let work = 0
    for (let i = 0; i < sorted.length; i += 1) {
      const node = sorted[i]
      if (!node) continue
      if (node.kind === 'quote_confirm' || node.kind === 'addon_quote_confirm') {
        if (node.id === id) return `quote:${quote}`
        quote += 1
      } else if (node.kind === 'work') {
        if (node.id === id) return `work:${work}`
        work += 1
      }
    }
    return this.resolveStageKey(id)
  },

  resolveStageKey(id) {
    const overview = this.data.overview || {}
    const row = (overview.rows || []).find((item) => item && item.nodeId === id)
    if (row) return row.key || 'intake'
    const doc = (overview.docs || []).find((item) => item && item.nodeId === id)
    const title = String((doc && doc.title) || '')
    if (title === '接车报告') return 'intake'
    if (title === '检测报告') return 'inspect'
    if (title === '报价单') return 'quote'
    if (title === '维修工单') return 'work'
    if (title === '交车报告') return 'finish'
    return 'intake'
  },

  stageBarFields(flowNodes, board, activeNode) {
    const family = (board && board.family) || stageKeyOf((board && board.selectedKey) || this.data.stageKey)
    const focus = (flowNodes || []).find((node) => node && board && node.id === board.focusId)
    let chrome = stageChrome(
      family,
      stageGateFor(
        flowNodes || this._flowNodes || [],
        family,
        family === 'quote' ? focus : activeNode || this.data.activeNode,
      ),
    )
    const stay = focusStaysEditable(board, focus)
    const workDone = family === 'work' && focus && String(focus.status || '') === 'completed'
    const review = stageReviewForm(board, focus, flowNodes)
    const finishOpen = family === 'finish' && !review && !chrome.locked
    if (family === 'work' && workDone) {
      chrome = { preview: false, label: '', action: '', locked: false }
    } else if (family === 'work' && (!board || board.state !== 'current') && !stay) {
      chrome = { preview: false, label: '', action: '', locked: true }
    } else if (family === 'work') {
      chrome = { ...chrome, preview: false }
    }
    return {
      stageShowPreview: chrome.preview,
      stagePrimary: chrome.label,
      stagePrimaryAction: chrome.action,
      stageLocked: Boolean(chrome.locked),
      stageEditor: Boolean(
        board &&
          family !== 'intake' &&
          (((board.state === 'current' || stay || workDone || finishOpen) && !chrome.locked) || review || workDone),
      ),
    }
  },

  openStage(stageKey) {
    const nodes = this._flowNodes || []
    const stageBoard = buildMerchantStageBoard(this._album || {}, nodes, stageKey || 'intake')
    const family = stageBoard.family || stageKeyOf(stageBoard.selectedKey) || familyOfStageKey(stageKey)
    if (!canOpenStage(nodes, family === 'addon' ? 'addon' : family)) {
      wx.showToast({ title: '请先完成上一步', icon: 'none' })
      return
    }
    const focus = nodes.find((node) => node && node.id === stageBoard.focusId)
    let chrome = stageChrome(
      family,
      stageGateFor(nodes, family, family === 'quote' ? focus : this.data.activeNode),
    )
    const stay = focusStaysEditable(stageBoard, focus)
    const workDone = family === 'work' && focus && String(focus.status || '') === 'completed'
    const review = stageReviewForm(stageBoard, focus, nodes)
    const frozen = Boolean(
      review ||
        isStageFrozen(nodes, family === 'addon' ? 'quote' : family) ||
        (focus && isNodeEditFrozen(nodes, focus)),
    )
    const editorNode = stageEditorNode(stageBoard, focus, nodes)
    if (family === 'work' && workDone && !frozen) {
      chrome = { preview: false, label: '', action: '', locked: false }
    } else if (family === 'work' && stageBoard.state !== 'current' && !stay && !workDone) {
      chrome = { preview: false, label: '', action: '', locked: true }
    } else if (family === 'work') {
      chrome = { ...chrome, preview: false }
    }
    const finishOpen = family === 'finish' && !review && !chrome.locked
    const bindEditor = stay || workDone || review || stageBoard.state === 'current' || finishOpen
    if (bindEditor && editorNode && (!this.data.activeNode || this.data.activeNode.id !== editorNode.id)) {
      this._pendingStageKey = stageBoard.selectedKey
      this._forceStageOpen = true
      this.loadFlow({ silent: true })
      return
    }
    const openAdvice = Boolean(this._openAdviceAfterLoad)
    this._openAdviceAfterLoad = false
    const albumLocked = Boolean(
      this._album && (this._album.contentLocked || this._album.editable === false),
    )
    const clerkKind =
      family === 'intake'
        ? 'intake'
        : family === 'inspect'
          ? 'inspection'
          : family === 'work'
            ? 'work'
            : family === 'finish'
              ? 'delivery_photos'
              : ''
    const clerkNode =
      clerkKind === 'intake'
        ? this.intakeNode && this.intakeNode()
        : clerkKind === 'inspection'
          ? this.inspectionNode && this.inspectionNode()
          : clerkKind === 'work'
            ? focus || (nodes || []).find((n) => n && n.kind === 'work')
            : clerkKind === 'delivery_photos'
              ? (nodes || []).find((n) => n && n.kind === 'delivery_photos')
              : null
    const clerkPatch = clerkKind
      ? this.buildClerkFieldData(nodes, nodeContentOf(clerkNode), {}, {
          activeKind: clerkKind,
          readOnly: albumLocked || frozen,
        })
      : {}
    this.setData({
      workOpen: true,
      doneView: null,
      adviceOpen: openAdvice ? true : this.data.adviceOpen,
      stageEditor:
        family !== 'intake' &&
        (((stageBoard.state === 'current' || stay || workDone || finishOpen) && !chrome.locked) || review || workDone),
      stageKey: stageBoard.selectedKey,
      stageBoard,
      stageShowPreview: chrome.preview,
      stagePrimary: chrome.label,
      stagePrimaryAction: chrome.action,
      stageLocked: Boolean(chrome.locked),
      readOnly: albumLocked || frozen,
      intakePile: [],
      intakeDocStatus: this.intakeDocumentStatus(),
      intakeSent: this.intakeDocumentSent(),
      ...clerkPatch,
    })
    // 接车屏只绑节点 pendingImages 当场算出的列表
    if (family === 'intake') {
      const intake = this.intakeNode && this.intakeNode()
      this.syncIntakePileFromDraft(nodeContentOf(intake))
    }
  },

  onComplaintFocus() {
    this.setData({ complaintFocus: true })
  },

  onComplaintBlur() {
    this.setData({ complaintFocus: false })
  },

  /** 接车留证：只从节点 content.pendingImages 当场算出，不读板子/preview 副本 */
  collectIntakePile() {
    const intake = this.intakeNode && this.intakeNode()
    const draft = nodeContentOf(intake)
    return this.intakePileFromPending(draft.pendingImages)
  },

  intakePileFromPending(pendingImages) {
    const seen = {}
    const intakePile = []
    normalizePendingImages(pendingImages).forEach((item) => {
      const clean = String((item && item.url) || '').trim()
      const key = mediaKey(clean)
      if (!key || seen[key]) return
      seen[key] = true
      intakePile.push({
        url: clean,
        imageId: String((item && item.imageId) || ''),
        caption: String((item && item.caption) || '').trim(),
      })
    })
    return intakePile
  },

  /** 用节点草稿刷新屏上列表（屏上数组 = 节点当场投影，不另存真源） */
  syncIntakePileFromDraft(draft = {}) {
    const intakePile = this.intakePileFromPending(draft.pendingImages)
    const stageBoard = this.data.stageBoard
      ? {
          ...this.data.stageBoard,
          intake: {
            ...(this.data.stageBoard.intake || {}),
            photos: intakePile,
            photoCount: intakePile.length,
          },
        }
      : this.data.stageBoard
    this.setData({ intakePile, stageBoard, autoSaveLabel: '已保存' })
    return intakePile
  },

  /** 只从 pendingImages 卸下；顺带清掉存量旧袋里同键挂图，避免下次并回 */
  purgeIntakeDraftPhoto(draft = {}, targetUrl = '') {
    const key = mediaKey(targetUrl)
    if (!key) return { ...(draft || {}) }
    const dropImg = (raw) => {
      const u = typeof raw === 'string' ? raw : raw && (raw.url || raw.rawUrl)
      return mediaKey(u) !== key
    }
    const pendingImages = normalizePendingImages(draft.pendingImages).filter((item) =>
      dropImg(item),
    )
    const odo = String(draft.odometerUrl || '').trim()
    const findings = (Array.isArray(draft.findings) ? draft.findings : []).map((row) => {
      if (!row || typeof row !== 'object') return row
      const images = Array.isArray(row.images) ? row.images.filter(dropImg) : row.images
      const keepUrl = row.url && mediaKey(row.url) === key ? '' : row.url
      return { ...row, images, ...(keepUrl === '' ? { url: '' } : {}) }
    })
    const intakeResults = (Array.isArray(draft.intakeResults) ? draft.intakeResults : []).map(
      (row) => {
        if (!row || typeof row !== 'object') return row
        const images = Array.isArray(row.images) ? row.images.filter(dropImg) : row.images
        return { ...row, images }
      },
    )
    return {
      ...draft,
      pendingImages,
      findings,
      intakeResults,
      ...(mediaKey(odo) === key ? { odometerUrl: '', odometerImageId: '' } : {}),
    }
  },

  onIntakeShoot() {
    if (this.data.readOnly || this.data.intakeSent) return
    const remain = Math.max(0, 12 - this.collectIntakePile().length)
    if (remain < 1) {
      wx.showToast({ title: '最多 12 张', icon: 'none' })
      return
    }
    pickLocalImages({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const files = (res && res.tempFiles) || []
        if (!files.length) return
        try {
          wx.showLoading({ title: '上传中' })
          const uploadedList = await this.uploadPickedFiles(files)
          if (!uploadedList.length) throw new Error('上传失败')
          const intake = this.intakeNode()
          if (!intake) throw new Error('还没有接车记录')
          const draft = nodeContentOf(intake)
          const pendingImages = normalizePendingImages(draft.pendingImages).concat(uploadedList)
          const next = { ...draft, pendingImages }
          await updateMerchantFlowNode(this.albumId, intake.id, flowContentSave({ pendingImages }))
          applyNodeContent(intake, next)
          this.syncIntakePileFromDraft(next)
          if (typeof this.writeLocalFlowDraft === 'function') this.writeLocalFlowDraft()
          if (this.data.intakeAdvice && this.data.intakeAdvice.hasContent) {
            this.setData({
              intakeAdvice: {
                ...this.data.intakeAdvice,
                hasContent: false,
                covered: false,
                risks: [],
                hasRisks: false,
                status: '',
              },
            })
          }
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
    })
  },

  async onRemoveIntakePhoto(e) {
    if (this.data.readOnly || this.data.intakeSent || this.data.confirming) return
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const idx = Number(ds.index)
    const pile = Array.isArray(this.data.intakePile) ? this.data.intakePile : []
    // 优先用屏上序号对准这一张，避免 URL 签名参数对不上
    const fromPile =
      Number.isFinite(idx) && idx >= 0 && idx < pile.length ? pile[idx] : null
    const url = String((fromPile && fromPile.url) || ds.url || '').trim()
    if (!mediaKey(url)) return
    const intake = this.intakeNode()
    if (!intake) return
    const draft = nodeContentOf(intake)
    const photoDraft = this.purgeIntakeDraftPhoto(draft, url)
    this.setData({ confirming: true })
    try {
      await updateMerchantFlowNode(this.albumId, intake.id, flowContentSave(photoDraft))
      applyNodeContent(intake, photoDraft)
      // 未确认报告跟节点走（服务端也会 force 对齐）；客户端不维护 previewImages 副本
      if (intake.document && intake.document.payload && String(intake.document.status || '') !== 'confirmed') {
        intake.document = {
          ...intake.document,
          payload: {
            ...(intake.document.payload || {}),
            photos: normalizePendingImages(photoDraft.pendingImages).map((item) => ({
              url: item.url,
              ...(item.imageId ? { imageId: item.imageId } : {}),
            })),
          },
        }
      }
      this.syncIntakePileFromDraft(photoDraft)
      if (typeof this.writeLocalFlowDraft === 'function') this.writeLocalFlowDraft()
      if (this.data.intakeAdvice && this.data.intakeAdvice.hasContent) {
        this.setData({
          intakeAdvice: {
            ...this.data.intakeAdvice,
            hasContent: false,
            covered: false,
            risks: [],
            hasRisks: false,
            status: '',
          },
        })
        intake.intakeAdvice = null
      }
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  nodeDraft(node) {
    const saved = nodeContentOf(node)
    const local = node && readLocalFlowDraft(this.albumId, node.id)
    const merged = { ...saved, ...((local && (local.content || local.photoDraft)) || {}) }
    const live = this.data.activeNode && node && this.data.activeNode.id === node.id
    if (!live) return merged
    const patch = this.liveClerkDraft(node.kind)
    Object.keys(patch).forEach((key) => {
      const value = String(patch[key] == null ? '' : patch[key]).trim()
      if (value) merged[key] = value
    })
    return merged
  },

  clerkFieldsFromNodes(flowNodes, activeDraft = {}, docPayload = {}) {
    const list = flowNodes || []
    const intake = list.find((node) => node && (node.kind === 'intake' || node.kind === 'intake_inspection'))
    const inspection = list.find((node) => node && (node.kind === 'inspection' || node.kind === 'intake_inspection'))
    const report = list.find((node) => node && node.kind === 'inspection_report')
    const work = list.find((node) => node && node.kind === 'work')
    const delivery = list.find((node) => node && node.kind === 'delivery_photos')
    const repair = list.find((node) => node && node.kind === 'repair_report')
    const intakeDraft = this.nodeDraft(intake)
    const inspectionDraft = this.nodeDraft(inspection)
    const workDraft = this.nodeDraft(work)
    const deliveryDraft = this.nodeDraft(delivery)
    const reportPayload = (report && report.document && report.document.payload) || {}
    const repairPayload = (repair && repair.document && repair.document.payload) || {}
    const text = (value) => String(value || '').trim()
    return {
      receiverName: text(intakeDraft.receiverName || activeDraft.receiverName),
      receivedAt: text(intakeDraft.receivedAt || activeDraft.receivedAt),
      inspectorName: text(inspectionDraft.inspectorName || reportPayload.inspectorName || docPayload.inspectorName),
      inspectedAt: text(inspectionDraft.inspectedAt || reportPayload.inspectedAt || docPayload.inspectedAt),
      workerName: text(workDraft.workerName || activeDraft.workerName),
      workFinishedAt: text(workDraft.finishedAt || activeDraft.finishedAt),
      delivererName: text(deliveryDraft.delivererName || repairPayload.delivererName || docPayload.delivererName),
      finishedAt: text(deliveryDraft.finishedAt || repairPayload.finishedAt || docPayload.finishedAt),
    }
  },

  /** 空时间默认此刻；附带选择器用的 date/time 分片 */
  buildClerkFieldData(flowNodes, activeDraft = {}, docPayload = {}, options = {}) {
    const fields = this.clerkFieldsFromNodes(flowNodes, activeDraft, docPayload)
    const kind = String(options.activeKind || '')
    const canEdit = !options.readOnly
    const now = formatClerkAtNow()
    const defaulted = []
    if (canEdit) {
      if (
        (kind === 'intake' || kind === 'intake_inspection') &&
        !fields.receivedAt &&
        !this.data.intakeSent
      ) {
        fields.receivedAt = now
        defaulted.push('receivedAt')
      }
      if (
        (kind === 'inspection' || kind === 'intake_inspection') &&
        !fields.inspectedAt
      ) {
        fields.inspectedAt = now
        defaulted.push('inspectedAt')
      }
      if (kind === 'work' && !fields.workFinishedAt) {
        fields.workFinishedAt = now
        defaulted.push('workFinishedAt')
      }
      if (
        (kind === 'delivery_photos' || kind === 'repair_report') &&
        !fields.finishedAt
      ) {
        fields.finishedAt = now
        defaulted.push('finishedAt')
      }
    }
    if (defaulted.length) {
      defaulted.forEach((key) => this.schedulePersistClerk(key))
    }
    return {
      ...fields,
      ...clerkAtPartsPatch('receivedAt', fields.receivedAt),
      ...clerkAtPartsPatch('inspectedAt', fields.inspectedAt),
      ...clerkAtPartsPatch('workFinishedAt', fields.workFinishedAt),
      ...clerkAtPartsPatch('finishedAt', fields.finishedAt),
    }
  },

  onClerkAtPick(e) {
    if (this.data.readOnly) return
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const key = String(ds.key || '').trim()
    const part = String(ds.part || '').trim()
    const picked = String((e && e.detail && e.detail.value) || '').trim()
    if (!key || (part !== 'date' && part !== 'time') || !picked) return
    if (key === 'receivedAt' && this.data.intakeSent) return
    const dateKey = `${key}Date`
    const timeKey = `${key}Time`
    const fallback = parseClerkAt(this.data[key] || formatClerkAtNow())
    const date = part === 'date' ? picked : String(this.data[dateKey] || fallback.date)
    const time = part === 'time' ? picked : String(this.data[timeKey] || fallback.time)
    const text = `${date} ${time}`
    this.setData(
      {
        [key]: text,
        [dateKey]: date,
        [timeKey]: time,
        autoSaveLabel: '保存中…',
      },
      () => {
        this.schedulePersistClerk(key)
      },
    )
  },

  flushClerkFields() {
    if (this._clerkTimer) {
      clearTimeout(this._clerkTimer)
      this._clerkTimer = null
    }
    if (this._clerkKeys && this._clerkKeys.size) {
      this.persistClerkFields().catch(() => {})
    }
  },

  schedulePersistClerk(key) {
    this._clerkKeys = this._clerkKeys || new Set()
    if (key) this._clerkKeys.add(key)
    if (this._clerkTimer) clearTimeout(this._clerkTimer)
    this._clerkTimer = setTimeout(() => {
      this._clerkTimer = null
      this.persistClerkFields().catch((err) => {
        this.setAutoSaveLabel((err && err.message) || '自动保存失败，请检查网络')
      })
    }, 500)
  },

  async persistClerkFields() {
    const keys = this._clerkKeys || new Set()
    this._clerkKeys = new Set()
    if (!keys.size || this.data.readOnly) return
    const text = (name) => String(this.data[name] || '').trim()
    const nodes = this._flowNodes || []
    const jobs = []
    const patchDraft = (node, patch) => {
      if (!node) return
      if (node.status === 'completed' && !(node.kind === 'work' && !deliveryReportSent(nodes))) return
      jobs.push(
        updateMerchantFlowNode(this.albumId, node.id, flowContentSave(patch)).then(() => {
          applyNodeContent(node, { ...nodeContentOf(node), ...patch })
        }),
      )
    }
    const patchDoc = (node, patch) => {
      if (!node || !node.document) return
      const status = String(node.document.status || '')
      if (status === 'pending_confirm' || status === 'confirmed' || status === 'delivered' || status === 'cancelled') return
      jobs.push(
        updateMerchantFlowNode(this.albumId, node.id, {
          document: { status: status || 'draft', payload: patch },
        }).then(() => {
          node.document = {
            ...node.document,
            payload: { ...(node.document.payload || {}), ...patch },
          }
        }),
      )
    }
    if (keys.has('receiverName') || keys.has('receivedAt')) {
      const intake = nodes.find((node) => node && (node.kind === 'intake' || node.kind === 'intake_inspection'))
      patchDraft(intake, { receiverName: text('receiverName'), receivedAt: text('receivedAt') })
    }
    if (keys.has('inspectorName') || keys.has('inspectedAt')) {
      const patch = { inspectorName: text('inspectorName'), inspectedAt: text('inspectedAt') }
      const inspection = nodes.find((node) => node && (node.kind === 'inspection' || node.kind === 'intake_inspection'))
      patchDraft(inspection, patch)
      patchDoc(nodes.find((node) => node && node.kind === 'inspection_report'), patch)
    }
    if (keys.has('workerName') || keys.has('workFinishedAt')) {
      patchDraft(nodes.find((node) => node && node.kind === 'work'), {
        workerName: text('workerName'),
        finishedAt: text('workFinishedAt'),
      })
    }
    if (keys.has('delivererName') || keys.has('finishedAt')) {
      const patch = { delivererName: text('delivererName'), finishedAt: text('finishedAt') }
      patchDraft(nodes.find((node) => node && node.kind === 'delivery_photos'), patch)
      patchDoc(nodes.find((node) => node && node.kind === 'repair_report'), patch)
    }
    if (!jobs.length) return
    await Promise.all(jobs)
    this.writeLocalFlowDraft()
    this.setAutoSaveLabel('已自动保存')
    if (this.data.workOpen) {
      const stageBoard = buildMerchantStageBoard(this._album || {}, nodes, this.data.stageKey || 'intake')
      this.setData({ stageBoard })
    }
  },

  liveClerkDraft(kind) {
    if (kind === 'intake' || kind === 'intake_inspection') {
      const patch = { receiverName: this.data.receiverName, receivedAt: this.data.receivedAt }
      if (kind === 'intake_inspection') {
        patch.inspectorName = this.data.inspectorName
        patch.inspectedAt = this.data.inspectedAt
      }
      return patch
    }
    if (kind === 'inspection') {
      return { inspectorName: this.data.inspectorName, inspectedAt: this.data.inspectedAt }
    }
    if (kind === 'work') {
      return { workerName: this.data.workerName, finishedAt: this.data.workFinishedAt }
    }
    if (kind === 'delivery_photos' || kind === 'repair_report') {
      return { delivererName: this.data.delivererName, finishedAt: this.data.finishedAt }
    }
    return {}
  },

  reportPreviewFor(title, options = {}) {
    const album = this._album || {}
    const nodes = this._flowNodes || []
    const vehicle = album.vehicle || {}
    const mileage = Number(vehicle.mileage)
    const mileageText = Number.isFinite(mileage) && mileage > 0 ? `里程 ${mileage.toLocaleString('zh-CN')} km` : ''
    const intake = nodes.find((node) => node && (node.kind === 'intake' || node.kind === 'intake_inspection'))
    const intakeDraft = this.nodeDraft(intake)
    const inspection = nodes.find((node) => node && node.kind === 'inspection')
    const inspectionDraft = this.nodeDraft(inspection)
    const report = nodes.find((node) => node && node.kind === 'inspection_report')
    const reportPayload = (report && report.document && report.document.payload) || {}
    const delivery = nodes.find((node) => node && node.kind === 'delivery_photos')
    const deliveryDraft = this.nodeDraft(delivery)
    const repair = nodes.find((node) => node && node.kind === 'repair_report')
    const repairPayload = (repair && repair.document && repair.document.payload) || {}
    if (title === '接车报告') {
      const issued = this.intakeDocumentSent()
      // 发出后与车主同读定稿；未发出跟当前留证（与屏上列表一致）
      const content = issued
        ? intakeDraft
        : {
            ...intakeDraft,
            chiefComplaint: intakeDraft.chiefComplaint || this.intakeComplaintText(),
            pendingImages: this.intakePileFromPending(intakeDraft.pendingImages),
            belongings: intakeDraft.belongings,
            receiverName: intakeDraft.receiverName,
            receivedAt: intakeDraft.receivedAt || this.data.receivedAt,
          }
      return buildIntakePreviewFromContent(content, album, {
        issued,
        mileageText,
        signName: content.receiverName,
        signAt: content.receivedAt,
      })
    }
    if (title === '检测报告') {
      const reportStatus = String((report && report.document && report.document.status) || '')
      const official = Array.isArray(reportPayload.findings) ? reportPayload.findings : []
      const generated = Boolean(
        report &&
          report.status !== 'locked' &&
          (reportStatus === 'delivered' ||
            reportStatus === 'confirmed' ||
            report.status === 'completed' ||
            official.length),
      )
      if (options.issuedOnly && !generated) {
        return { doc: null, quoteLines: [], hasBody: false }
      }
      const liveInspect = !options.issuedOnly && (this.data.activeKind === 'inspection' || this.data.activeKind === 'intake_inspection')
      const findings = liveInspect
        ? this.collectFindingsFromSections()
        : (official.length ? official : options.issuedOnly ? [] : inspectionDraft.findings) || []
      return buildOwnerPreviewDoc({
        family: 'inspect',
        album,
        chiefComplaint: reportPayload.chiefComplaint || intakeDraft.chiefComplaint || this.intakeComplaintText(),
        findings,
        mileageText,
        quoteLines: ((nodes.find((node) => node && node.kind === 'quote_confirm' && !node.insertedReason) || {}).document || {}).payload
          ? nodes.find((node) => node && node.kind === 'quote_confirm' && !node.insertedReason).document.payload.lines
          : [],
        signName: reportPayload.inspectorName || inspectionDraft.inspectorName,
        signAt: formatClerkAtForDoc(
          reportPayload.inspectedAt || inspectionDraft.inspectedAt || this.data.inspectedAt,
        ),
      })
    }
    if (title === '报价单') {
      const quote = nodes.find((node) => node && (node.kind === 'quote_confirm' || node.kind === 'addon_quote_confirm'))
      const payload = (quote && quote.document && quote.document.payload) || {}
      const live = this.data.activeKind === 'quote_confirm' || this.data.activeKind === 'addon_quote_confirm'
      return buildOwnerPreviewDoc({
        family: 'quote',
        album,
        mileageText,
        isAddon: Boolean(quote && quote.insertedReason === 'addon'),
        lines: live ? this.data.quoteLines : payload.lines || [],
        discoveryNote: (payload.discovery && payload.discovery.note) || '',
        discoveryImages: (payload.discovery && payload.discovery.images) || [],
      })
    }
    if (title === '维修工单') {
      const work = nodes.find((node) => node && node.kind === 'work')
      const draft = this.nodeDraft(work)
      const source = this.data.activeKind === 'work' ? this.collectFindingsFromSections() : draft.findings || []
      let workItems = workItemsFromFindings(source)
      if (!workItems.length) {
        const sealed =
          (work && work.document && work.document.payload && work.document.payload.workItems) || []
        workItems = workItemsFromFindings(
          sealed.map((row) => ({
            partName: (row && (row.partName || row.name)) || '',
            caption: (row && (row.caption || row.note)) || '',
            brand: (row && row.brand) || '',
            material: (row && row.material) || '',
            qty: (row && row.qty) || '',
            images: (row && row.images) || [],
          })),
        )
      }
      return buildOwnerPreviewDoc({
        family: 'work',
        album: previewAlbumOf(album),
        mileageText,
        workItems,
        signName: draft.workerName || this.data.workerName,
        signAt: formatClerkAtForDoc(draft.finishedAt || this.data.workFinishedAt),
      })
    }
    const reportReady = Boolean(
      String(repairPayload.warrantyPeriod || '').trim() ||
        (Array.isArray(repairPayload.acceptanceItems) && repairPayload.acceptanceItems.length) ||
        (Array.isArray(repairPayload.workItems) && repairPayload.workItems.length),
    )
    if (reportReady && String((delivery && delivery.status) || '') === 'completed') {
      return buildOwnerPreviewDoc({
        family: 'finish',
        album: previewAlbumOf(album),
        mileageText,
        workItems: Array.isArray(repairPayload.workItems) ? repairPayload.workItems : [],
        totalAmount: repairPayload.totalAmount,
        acceptanceItems: repairPayload.acceptanceItems,
        warrantyPeriod: repairPayload.warrantyPeriod,
        warrantyNotes: repairPayload.warrantyNotes,
        signName: repairPayload.delivererName,
        signAt: formatClerkAtForDoc(repairPayload.finishedAt || ''),
      })
    }
    const works = nodes.filter((node) => node && node.kind === 'work')
    const { quoteByName, quoteTotal } = quoteTotalsFromNodes(nodes)
    const workItems = finishWorkItemsFromFindingsList(
      works.map((node) => this.nodeDraft(node).findings || []),
      quoteByName,
    )
    return buildOwnerPreviewDoc({
      family: 'finish',
      album: previewAlbumOf(album),
      mileageText,
      workItems,
      totalAmount: quoteTotal,
      acceptanceItems:
        resolveAcceptanceItems(deliveryDraft).length
          ? resolveAcceptanceItems(deliveryDraft)
          : this.data.acceptanceItems || [],
      warrantyPeriod: deliveryDraft.warrantyPeriod || this.data.warrantyPeriod,
      warrantyNotes: deliveryDraft.warrantyNotes || this.data.warrantyNotes,
      signName: deliveryDraft.delivererName,
      signAt: formatClerkAtForDoc(deliveryDraft.finishedAt || this.data.finishedAt),
    })
  },

  onOpenRecordPreview() {
    const board = this.data.stageBoard || {}
    const family = board.family || ''
    const title = family === 'intake'
      ? '接车报告'
      : family === 'inspect'
        ? '检测报告'
        : family === 'quote'
          ? '报价单'
          : family === 'work'
            ? '维修工单'
            : '交车报告'
    const preview = this.reportPreviewFor(title)
    if (!preview.hasBody) {
      this._previewAcceptAction = ''
      wx.showToast({ title: '还没有可给车主看的内容', icon: 'none' })
      return
    }
    const sending = String(this._previewAcceptAction || '')
    this.setData({
      recordPreview: {
        doc: preview.doc,
        quoteLines: preview.quoteLines || [],
        locked: !sending,
        acceptLabel: this.previewAcceptLabel(sending),
      },
    })
  },

  previewAcceptLabel(action) {
    if (action === 'generateReport') return '生成检测报告'
    if (action === 'remindDelivery') return '请车主确认'
    if (action === 'advance' || action === 'sendQuote') return '发给车主'
    return ''
  },

  onOpenOwnerView() {
    this._previewAcceptAction = ''
    this.onOpenRecordPreview()
  },

  onCloseRecordPreview() {
    this._previewAcceptAction = ''
    this.setData({ recordPreview: null })
  },

  onAcceptRecordPreview() {
    const action = String(this._previewAcceptAction || '')
    this._previewAcceptAction = ''
    this.setData({ recordPreview: null })
    if (!action || this.data.confirming) return
    if (action === 'advance') {
      this.onConfirmPhotoStep()
      return
    }
    if (action === 'generateReport') {
      const kind = this.data.activeNode && this.data.activeNode.kind
      if (kind === 'inspection' || kind === 'intake_inspection') {
        this.onConfirmPhotoStep()
        return
      }
      this.sendOwnerDocument('inspect')
      return
    }
    if (action === 'sendQuote') this.sendOwnerDocument('quote')
    if (action === 'remindDelivery') this.sendOwnerDocument('finish')
  },

  intakeNode() {
    return (this._flowNodes || []).find(
      (item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'),
    )
  },

  /** 车主诉求只住在接车。检测页自己的字段是空的，不能拿来判断写过没有。 */
  intakeComplaintText() {
    if (this.data.isIntakePhotoStep) {
      const live = String(this.data.chiefComplaint || '').trim()
      if (live) return live
    }
    const intake = this.intakeNode()
    const draft = nodeContentOf(intake)
    const local = intake && readLocalFlowDraft(this.albumId, intake.id)
    const payload = (intake && intake.document && intake.document.payload) || {}
    return String(
      draft.chiefComplaint ||
        (local && (local.content || local.photoDraft) && (local.content || local.photoDraft).chiefComplaint) ||
        payload.chiefComplaint ||
        '',
    ).trim()
  },

  intakeDocumentStatus() {
    const doc = this.intakeNode() && this.intakeNode().document
    return String((doc && doc.status) || '')
  },

  intakeDocumentSent() {
    const status = this.intakeDocumentStatus()
    return status === 'pending_confirm' || status === 'confirmed' || status === 'delivered'
  },

  intakeDraftFields() {
    const intake = this.intakeNode()
    const draft = nodeContentOf(intake)
    return {
      intake,
      pile: this.collectIntakePile(),
      complaint: String(
        this.data.chiefComplaint || draft.chiefComplaint || '',
      ).trim(),
    }
  },

  buildIntakeConfirmPayload() {
    const fields = this.intakeDraftFields()
    const results = this.data.intakeResults || []
    const reading = (id) => {
      const row = results.find((item) => item && item.category === id)
      return String((row && row.reading) || '').trim()
    }
    return {
      mileageKm: parseMileageKm(this._albumMileage),
      fuelReading: String(this.data.fuelReading || reading('fuel') || '').trim(),
      belongings: reading('belongings'),
      chiefComplaint: fields.complaint,
      photos: (fields.pile || [])
        .map((item) => String((item && item.url) || '').trim())
        .filter(Boolean)
        .map((url) => ({ url })),
      confirmCopy: INTAKE_CONFIRM_COPY,
    }
  },

  async sendIntakeConfirm(options = {}) {
    const quiet = Boolean(options.quiet)
    const node = this.intakeNode()
    if (!node) {
      if (!quiet) wx.showToast({ title: '还没有接车记录', icon: 'none' })
      return false
    }
    if (this.intakeDocumentSent()) return true
    const payload = this.buildIntakeConfirmPayload()
    if (!payload.photos.length) return false
    if (!quiet) this.setData({ confirming: true })
    try {
      await updateMerchantFlowNode(this.albumId, node.id, {
        document: { docType: 'intake_confirm', status: 'delivered', payload },
      })
      if (!quiet) {
        wx.showToast({ title: '已发给车主', icon: 'success' })
        await this.loadFlow({ silent: true })
        this.openStage('intake')
      }
      return true
    } catch (err) {
      if (!quiet) wx.showToast({ title: (err && err.message) || '发送失败', icon: 'none' })
      return false
    } finally {
      if (!quiet) this.setData({ confirming: false })
    }
  },

  async finishIntakeSend(fields) {
    const intake = fields && fields.intake
    if (!intake) return
    // 已发出且已完成：只进检测，不再二次发送（避免「先 delivered 再 complete」被冻结）
    if (this.intakeDocumentSent() && String(intake.status || '') === 'completed') {
      await this.loadFlow({ silent: true })
      this.openStage('inspect')
      return
    }
    const photos = (fields.pile || [])
      .map((item) => ({ url: String((item && item.url) || '').trim() }))
      .filter((item) => item.url)
    if (!photos.length) {
      wx.showToast({ title: '请先拍留证', icon: 'none' })
      return
    }
    this.setData({ confirming: true })
    try {
      // 一次完成：定稿发出 + 节点 completed + 解锁检测（勿先 update document 再 complete）
      await completeMerchantFlowNode(this.albumId, intake.id, {
        chiefComplaint: fields.complaint,
        content: {
          chiefComplaint: fields.complaint,
          pendingImages: photos,
          receiverName: String(this.data.receiverName || '').trim(),
          receivedAt: String(this.data.receivedAt || '').trim(),
        },
        photoDraft: {
          chiefComplaint: fields.complaint,
          pendingImages: photos,
          receiverName: String(this.data.receiverName || '').trim(),
          receivedAt: String(this.data.receivedAt || '').trim(),
        },
      })
      wx.showToast({ title: '已发给车主', icon: 'success' })
      await this.loadFlow({ silent: true })
      this.openStage('inspect')
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '没能发给车主', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  onProxyIntakeConfirm() {
    if (this.data.readOnly || this.data.confirming) return
    if (this.intakeDocumentStatus() !== 'pending_confirm') {
      wx.showToast({ title: '请先发给车主', icon: 'none' })
      return
    }
    const node = this.intakeNode()
    if (!node) return
    wx.showModal({
      title: '代车主确认',
      content: '车主当面、电话或微信已同意，但未在手机确认。',
      confirmText: '继续',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        this.runIntakeProxyConfirm(node.id)
      },
    })
  },

  async runIntakeProxyConfirm(nodeId) {
    if (this.data.confirming) return
    this.setData({ confirming: true })
    try {
      await proxyConfirmMerchantFlowNode(this.albumId, nodeId, {
        document: { payload: { confirmCopy: INTAKE_CONFIRM_COPY } },
      })
      wx.showToast({ title: '已代确认', icon: 'success' })
      await this.loadFlow({ silent: true })
      this.openStage('intake')
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  async sendOwnerDocument(key) {
    if (this.data.confirming) return
    const kind =
      key === 'inspect' ? 'inspection_report' : key === 'quote' ? 'quote_confirm' : key === 'finish' ? 'repair_report' : ''
    const node = (this._flowNodes || []).find((item) => item && item.kind === kind && item.document)
    if (!node) {
      wx.showToast({ title: '还没有可发的报告', icon: 'none' })
      return
    }
    const status = String((node.document && node.document.status) || '')
    if (status === 'pending_confirm' || status === 'confirmed' || (key === 'inspect' && status === 'delivered')) {
      wx.showToast({ title: '已经发给车主', icon: 'none' })
      this.setData({ recordPreview: null })
      return
    }
    const activeKind = this.data.activeNode && this.data.activeNode.kind
    if (key === 'finish' && activeKind === 'delivery_photos') {
      this.setData({ recordPreview: null })
      if (this.data.photoConfirmDisabled) {
        wx.showToast({ title: '正在检查，稍等', icon: 'none' })
        return
      }
      this.onConfirmPhotoStep()
      return
    }
    if ((key === 'quote' || key === 'finish') && activeKind === kind) {
      this.setData({ recordPreview: null })
      this.onSendForOwnerConfirm()
      return
    }
    let payload = (node.document && node.document.payload) || {}
    if (key === 'inspect' && activeKind === 'inspection_report') {
      try {
        await this.flushDocDraftSave()
      } catch (err) {
        wx.showToast({ title: (err && err.message) || '请先保存当前修改', icon: 'none' })
        return
      }
      payload = this.buildDocPayloadForSave()
    }
    if (key === 'inspect') {
      const intake = (this._flowNodes || []).find(
        (item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'),
      )
      const inspection = (this._flowNodes || []).find((item) => item && item.kind === 'inspection')
      const fromIntake = String(
        nodeContentOf(intake).chiefComplaint ||
          (intake && intake.document && intake.document.payload && intake.document.payload.chiefComplaint) ||
          '',
      ).trim()
      const fromPhoto =
        Array.isArray(nodeContentOf(inspection).findings)
          ? nodeContentOf(inspection).findings
          : []
      payload = {
        ...payload,
        chiefComplaint: String(payload.chiefComplaint || '').trim() || fromIntake,
        findings:
          Array.isArray(payload.findings) && payload.findings.length ? payload.findings : fromPhoto,
        inspectorName: String(
          payload.inspectorName || nodeContentOf(inspection).inspectorName || '',
        ).trim(),
        inspectedAt: String(
          payload.inspectedAt || nodeContentOf(inspection).inspectedAt || '',
        ).trim(),
      }
    }
    if (key === 'inspect') {
      const gaps = collectInspectionReportGaps(payload)
      if (gaps.length) {
        this.presentInspectionGaps(gaps)
        return
      }
    }
    const nextStatus = key === 'inspect' ? 'delivered' : 'pending_confirm'
    this.setData({ confirming: true })
    try {
      const sent = await updateMerchantFlowNode(this.albumId, node.id, {
        document: { status: nextStatus, payload },
      })
      if (sent && sent.nextAction === 'ai_review') {
        this.applyInlineAiReview(sent.review, 'notify')
        return
      }
      const toast =
        key === 'inspect' ? '已生成检测报告' : key === 'finish' ? '已提醒车主' : '已发给车主'
      wx.showToast({ title: toast, icon: 'success' })
      this.setData({ recordPreview: null })
      await this.loadFlow({ silent: true })
      this.openStage(key)
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '发送失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  onStagePrimary() {
    const action = this.data.stagePrimaryAction
    if (!action || this.data.confirming) return
    if (action === 'advance') {
      if (this.intakeDocumentSent()) {
        this.openStage('inspect')
        return
      }
      this._previewAcceptAction = 'advance'
      this.onOpenRecordPreview()
      return
    }
    if (action === 'generateReport' || action === 'sendQuote' || action === 'remindDelivery') {
      if (action === 'generateReport' && this.blockInspectionUntilResultChosen()) return
      this._previewAcceptAction = action
      this.onOpenRecordPreview()
      return
    }
    if (action === 'completeWork') {
      this.onConfirmPhotoStep()
      return
    }
    if (action === 'addWork') {
      if (!this.data.isWorkPhotoStep) {
        wx.showToast({ title: '先做到施工这一步', icon: 'none' })
        return
      }
      this.onAddFindingPhotos()
      return
    }
    if (action === 'proxyConfirm') {
      this.onProxyConfirm()
    }
  },

  onOpenStageEditor() {
    if (!this.data.stageBoard || this.data.stageBoard.state !== 'current') return
    this.setData({ stageEditor: true })
  },

  onPickStage(e) {
    const key = String((e.currentTarget.dataset && e.currentTarget.dataset.key) || '')
    if (!key || key === this.data.stageKey) return
    this.openStage(key)
  },

  onPreviewStage() {
    const id = String((this.data.stageBoard && this.data.stageBoard.previewNodeId) || '')
    if (!id) {
      wx.showToast({ title: '还没有可预览的记录', icon: 'none' })
      return
    }
    this.openDoneReview(id)
  },

  onPreviewStagePhoto(e) {
    const url = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || '')
    const urls = String((e.currentTarget.dataset && e.currentTarget.dataset.urls) || '')
      .split('|')
      .filter(Boolean)
    if (!url) return
    wx.previewImage({ current: url, urls: urls.length ? urls : [url] })
  },

  onCloseDone() {
    this.setData({ doneView: null })
  },

  workTitleFor(id) {
    const overview = this.data.overview || {}
    const row = (overview.rows || []).find((item) => item && item.nodeId === id)
    if (row && row.title) return row.title
    const doc = (overview.docs || []).find((item) => item && item.nodeId === id)
    if (doc && doc.title) return doc.title
    return '这一步'
  },

  onOpenOverview(e) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    this.openStage(this.resolveStageKey(id))
  },

  onOpenStepAdvice(e) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    this._openAdviceAfterLoad = true
    this.openStage(this.resolveStageKey(id))
  },

  onOpenDoc(e) {
    const title = String((e.currentTarget.dataset && e.currentTarget.dataset.title) || '')
    if (!title) return
    const brief = buildMerchantDocBrief(this._album || {}, this._flowNodes || [], title)
    if (brief.label === '待生成') return
    const preview = this.reportPreviewFor(title, { issuedOnly: true })
    if (!preview.hasBody) {
      wx.showToast({ title: '还没有这份报告', icon: 'none' })
      return
    }
    this.setData({
      docBrief: {
        ...brief,
        sheetDoc: preview.hasBody ? { ...preview.doc, statusLabel: preview.doc.statusLabel || brief.status } : null,
        quoteLines: preview.quoteLines || [],
      },
    })
  },

  onCloseDoc() {
    if (this.data.briefSending) return
    this.setData({ docBrief: null })
  },

  onBriefFull() {
    const brief = this.data.docBrief
    if (!brief || !brief.sheetDoc) {
      wx.showToast({ title: '还没有这份内容', icon: 'none' })
      return
    }
    this.setData({
      docBrief: null,
      recordPreview: {
        doc: brief.sheetDoc,
        quoteLines: brief.quoteLines || [],
        locked: true,
        acceptLabel: '',
      },
    })
  },

  onClerkInput(e) {
    const key = String((e.currentTarget.dataset && e.currentTarget.dataset.key) || '')
    if (!key || this.data.readOnly) return
    this.setData({ [key]: e.detail.value, autoSaveLabel: '保存中…' }, () => {
      this.schedulePersistClerk(key)
    })
  },

  async onBriefSend() {
    const brief = this.data.docBrief
    if (!brief || this.data.briefSending) return
    if (!brief.canSend || !brief.nodeId) {
      const already = brief.status === '已确认' || brief.status === '待确认'
      wx.showToast({ title: already ? '已经发给车主' : '还不能发给车主', icon: 'none' })
      return
    }
    const node = (this._flowNodes || []).find((item) => item && item.id === brief.nodeId)
    const payload = node && node.document && node.document.payload
    if (!payload) {
      wx.showToast({ title: '还不能发给车主', icon: 'none' })
      return
    }
    this.setData({ briefSending: true })
    try {
      await updateMerchantFlowNode(this.albumId, brief.nodeId, {
        document: { status: 'pending_confirm', payload },
      })
      wx.showToast({ title: '已发送车主', icon: 'success' })
      this.setData({ docBrief: null })
      await this.loadFlow({ silent: true })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '发送失败', icon: 'none' })
    } finally {
      this.setData({ briefSending: false })
    }
  },

  openDoneReview(nodeId) {
    const node = (this._flowNodes || []).find((item) => item && item.id === nodeId)
    if (!node) return
    const preview = mapCompletedStepPreview({ id: nodeId, summary: '' }, node, this._album || {})
    if (preview.detailKind === 'doc_sheet' && preview.sheetDoc) {
      this.setData({
        doneView: {
          mode: 'doc',
          title: preview.sheetDoc.title || this.workTitleFor(nodeId),
          sheetDoc: preview.sheetDoc,
        },
      })
      return
    }
    const images = (Array.isArray(preview.previewImages) ? preview.previewImages : [])
      .map((img) => (typeof img === 'string' ? { url: img } : { url: String((img && img.url) || '') }))
      .filter((img) => img.url)
    this.setData({
      doneView: {
        mode: 'photos',
        title: this.workTitleFor(nodeId),
        complaint: preview.chiefComplaint || '',
        images,
        photoCount: Number(preview.photoCount) || images.length,
      },
    })
  },

  onPreviewDonePhoto(e) {
    const url = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || '')
    const urls = ((this.data.doneView && this.data.doneView.images) || []).map((img) => img.url).filter(Boolean)
    if (!url || !urls.length) return
    wx.previewImage({ current: url, urls })
  },

  onCallOwner() {
    const phone = String((this.data.overview && this.data.overview.phone) || '').trim()
    if (!phone) {
      wx.showToast({ title: '还没有车主电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  syncFindingsWithImages(prevFindings = [], images = [], findingKind = 'inspection') {
    // 检测：一项多图；禁止按扁平面板图「一图一项」摊开（会静默拆项）
    if (findingKind === 'inspection' || findingKind === 'intake_inspection') {
      return (prevFindings || []).map((row, index) => normalizeFinding(row, index))
    }
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
    })
    const pending = (prevFindings || []).filter((item) => {
      const row = normalizeWorkFinding(item)
      return !row.images.length && (item.fromAi || row.partName)
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

  findingEventIndex(e) {
    const ds = (e.currentTarget && e.currentTarget.dataset) || {}
    const detail = e.detail && typeof e.detail === 'object' ? e.detail : {}
    const sectionIndex = Number(
      ds.sectionIndex != null && ds.sectionIndex !== '' ? ds.sectionIndex : detail.sectionIndex,
    )
    const findingIndex = Number(
      ds.findingIndex != null && ds.findingIndex !== '' ? ds.findingIndex : detail.findingIndex,
    )
    return { sectionIndex, findingIndex }
  },

  onToggleFinding(e) {
    const { sectionIndex, findingIndex } = this.findingEventIndex(e)
    if (!Number.isFinite(sectionIndex) || !Number.isFinite(findingIndex)) return
    const key = `${sectionIndex}:${findingIndex}`
    const nextKey = this.data.expandedFindingKey === key ? '' : key
    this.setSectionsWithFindings(this.data.sections, {}, nextKey)
  },

  onRemoveFinding(e) {
    if (this.data.readOnly) return
    const { sectionIndex, findingIndex } = this.findingEventIndex(e)
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
    const { sectionIndex: si, findingIndex: fi } = this.findingEventIndex(e)
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
            const uploadedList = await this.uploadPickedFiles(files)
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
    // 检测项不限张数；单次最多选 9 张（微信上限）
    const currentImages = normalizeFinding(currentItem).images || []
    if (FINDING_IMAGES_MAX > 0 && currentImages.length >= FINDING_IMAGES_MAX) {
      wx.showToast({ title: `每项最多 ${FINDING_IMAGES_MAX} 张`, icon: 'none' })
      return
    }
    const remain =
      FINDING_IMAGES_MAX > 0
        ? Math.max(0, FINDING_IMAGES_MAX - currentImages.length)
        : 9
    pickLocalImages({
      count: Math.min(remain, 9),
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const files = res.tempFiles || []
        if (!files.length) return
        try {
          wx.showLoading({ title: '上传中' })
          const uploadedList = await this.uploadPickedFiles(files)
          if (!uploadedList.length) throw new Error('上传失败')
          const hintBody = (currentItem.photoHint && currentItem.photoHint.body) || currentItem.captionPlaceholder || ''
          const sections = this.data.sections.map((row, i) => {
            if (i !== si) return row
            const findings = (row.findings || []).map((item, idx) => {
              if (idx !== fi) return item
              const base = normalizeFinding(item)
              const images = capImages(base.images.concat(uploadedList), FINDING_IMAGES_MAX)
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
    const have = (current.images || []).length
    if (FINDING_IMAGES_MAX > 0 && have >= FINDING_IMAGES_MAX) {
      wx.showToast({ title: `每项最多 ${FINDING_IMAGES_MAX} 张`, icon: 'none' })
      return
    }
    const remain = FINDING_IMAGES_MAX > 0 ? Math.max(0, FINDING_IMAGES_MAX - have) : 9
    pickLocalImages({
      count: Math.min(remain, 9),
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const files = res.tempFiles || []
        if (!files.length) return
        try {
          wx.showLoading({ title: '上传中' })
          const uploadedList = await this.uploadPickedFiles(files)
          if (!uploadedList.length) throw new Error('上传失败')
          const findings = (this.data.findings || []).map((row, idx) => {
            if (idx !== fi) return row
            const base = normalizeFinding(row)
            const images = capImages((base.images || []).concat(uploadedList), FINDING_IMAGES_MAX)
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

  /**
   * 验收项初始值（2026-11-10 定稿）：行=本单施工项目，只读不可增删。
   * 逐项生成，已填的图/结果/描述按行名回填；旧数据里没有逐项信息（如「整体验收」那一行）
   * 不再整段回读，避免旧汇总行挡住逐项清单。
   */
  resolveInitialAcceptanceItems(workItems = [], savedRows = []) {
    return buildAcceptanceRowsFromWorkItems(workItems, savedRows)
  },

  /** 本单施工项目（交车验收的行使）：工单节点 findings → 已定稿 workItems */
  collectDeliveryWorkItems(flowNodes = []) {
    const works = (flowNodes || []).filter((node) => node && node.kind === 'work')
    const fromDraft = works.flatMap((node) => {
      const draft = nodeContentOf(node)
      return workItemsFromFindings(
        Array.isArray(draft.findings) ? draft.findings : [],
      )
    })
    if (fromDraft.length) return fromDraft
    const sealed = works.flatMap((node) => {
      const payload =
        (node && node.document && node.document.payload) || {}
      return Array.isArray(payload.workItems) ? payload.workItems : []
    })
    return workItemsFromFindings(
      sealed.map((row) => ({
        partName: (row && (row.partName || row.name)) || '',
        caption: (row && (row.caption || row.note)) || '',
        brand: (row && row.brand) || '',
        material: (row && row.material) || '',
        qty: (row && row.qty) || '',
        amount: row && row.amount != null ? row.amount : '',
      })),
    )
  },

  deliveryFormFromNodes(album, flowNodes = [], photoDraft = {}) {
    const deliveryNode = (flowNodes || []).find((node) => node && node.kind === 'delivery_photos')
    const repairNode = (flowNodes || []).find((node) => node && node.kind === 'repair_report')
    const deliveryDraft = nodeContentOf(deliveryNode)
    const repairDraft = nodeContentOf(repairNode)
    const faqSource =
      (Array.isArray(deliveryDraft.ownerFaqs) && deliveryDraft.ownerFaqs.length
        ? deliveryDraft.ownerFaqs
        : null) ||
      (Array.isArray(photoDraft.ownerFaqs) && photoDraft.ownerFaqs.length
        ? photoDraft.ownerFaqs
        : null) ||
      (Array.isArray(repairDraft.ownerFaqs) && repairDraft.ownerFaqs.length
        ? repairDraft.ownerFaqs
        : null) ||
      []
    return {
      warrantyPeriod: String(
        deliveryDraft.warrantyPeriod || photoDraft.warrantyPeriod || repairDraft.warrantyPeriod || '',
      ).trim(),
      warrantyNotes:
        resolveWarrantyNotes(deliveryDraft) ||
        resolveWarrantyNotes(photoDraft) ||
        resolveWarrantyNotes(repairDraft),
      // 简述/问答不在界面展示；仍回读以便与 AI 静默写入的内容共存
      repairBrief: String(
        deliveryDraft.repairBrief || photoDraft.repairBrief || repairDraft.repairBrief || '',
      ).trim(),
      ownerFaqs: (Array.isArray(faqSource) ? faqSource : [])
        .map((row, index) => ({
          id: String((row && row.id) || `faq_${index + 1}`),
          question: String((row && (row.question || row.q)) || '').trim(),
          answer: String((row && (row.answer || row.a)) || '').trim(),
        }))
        .filter((row) => row.question)
        .slice(0, 5),
      confirmCopy:
        deliveryDraft.confirmCopy ||
        photoDraft.confirmCopy ||
        REPAIR_CONFIRM_COPY,
    }
  },

  // 验收项图片（每项自包含；施工项选填最多 6 张，外观行 1~3 张）
  onUploadAcceptanceImages(e) {
    if (this.data.readOnly) return
    const rowId = String((e.currentTarget.dataset && e.currentTarget.dataset.rowId) || '').trim()
    const row = (this.data.acceptanceItems || []).find((item) => item && item.id === rowId)
    if (!row) return
    const isExterior = row.kind === 'exterior'
    const maxImages = isExterior ? ACCEPTANCE_EXTERIOR_MAX : ACCEPTANCE_ITEM_MAX_IMAGES
    const current = Array.isArray(row.images) ? row.images : []
    const remain = Math.max(0, maxImages - current.length)
    if (!remain) {
      wx.showToast({
        title: isExterior ? `外观最多 ${maxImages} 张` : `每项最多 ${maxImages} 张`,
        icon: 'none',
      })
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
          const uploadedList = await this.uploadPickedFiles(files)
          if (!uploadedList.length) throw new Error('上传失败')
          const images = current.slice()
          const seen = {}
          images.forEach((img) => {
            const key = mediaKey(img && img.url)
            if (key) seen[key] = true
          })
          uploadedList.forEach((item) => {
            const url = String((item && item.url) || '').trim()
            const key = mediaKey(url)
            if (!url || !key || seen[key]) return
            if (images.length >= maxImages) return
            seen[key] = true
            images.push({ url })
          })
          this.applyAcceptanceImages(row.id, images)
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
    })
  },

  onRemoveAcceptanceImage(e) {
    if (this.data.readOnly) return
    const rowId = String((e.currentTarget.dataset && e.currentTarget.dataset.rowId) || '').trim()
    const url = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || '').trim()
    if (!rowId || !url) return
    const row = (this.data.acceptanceItems || []).find((item) => item && item.id === rowId)
    if (!row) return
    const images = (Array.isArray(row.images) ? row.images : []).filter(
      (img) => mediaKey(img && img.url) !== mediaKey(url),
    )
    this.applyAcceptanceImages(rowId, images)
  },

  onPreviewAcceptanceImage(e) {
    const rowId = String((e.currentTarget.dataset && e.currentTarget.dataset.rowId) || '').trim()
    const url = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || '').trim()
    const row = (this.data.acceptanceItems || []).find((item) => item && item.id === rowId)
    if (!row) return
    const urls = (Array.isArray(row.images) ? row.images : [])
      .map((img) => img && img.url)
      .filter(Boolean)
    if (!urls.length) return
    wx.previewImage({ current: url || urls[0], urls })
  },

  applyAcceptanceImages(rowId, images) {
    const acceptanceItems = (this.data.acceptanceItems || []).map((row) =>
      row && row.id === rowId ? { ...row, images: images || [] } : row,
    )
    this.setData({ acceptanceItems, autoSaveLabel: '保存中…' }, () => {
      this.scheduleAutoSaveDraftOnly()
    })
  },

  async uploadPickedFiles(files) {
    const rows = await uploadImagesBatch(files || [])
    return (rows || []).filter((row) => row && row.url)
  },

  onAddFindingPhotos() {
    if (this.data.readOnly || this.data.isWorkPhotoStep) return
    const batchAsOneItem = this.data.activeKind === 'inspection'
    const pending = normalizePendingImages(this.data.pendingImages)
    const remain = batchAsOneItem ? 9 : Math.max(0, 12 - pending.length)
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
          const uploadedList = await this.uploadPickedFiles(files)
          if (!uploadedList.length) throw new Error('上传失败')
          if (batchAsOneItem) {
            const sectionIndex = this.findingSectionIndex()
            this.addBlankFinding(sectionIndex, { images: uploadedList })
          } else {
            const pendingImages = normalizePendingImages(pending.concat(uploadedList))
            this.setData({
              pendingImages,
              ...this.findingChromePatch(this.data.sections, pendingImages),
            })
          }
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
          return
        } finally {
          wx.hideLoading()
        }
        const save = batchAsOneItem
          ? this.persistPhotoDraft()
          : this.persistPhotos().then(() => this.persistPhotoDraft())
        save
          .then(() => this.setAutoSaveLabel('已自动保存'))
          .catch((err) => {
            this.setAutoSaveLabel((err && err.message) || '自动保存失败，请检查网络')
          })
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
      showPickSheet: false,
      ...this.findingChromePatch(this.data.sections, pendingImages),
    })
    this.scheduleAutoSavePhotos()
    this.scheduleParkDetachedPhotos()
  },

  findingSectionIndex(sections = this.data.sections) {
    return (sections || []).findIndex((row) => row && row.findingMode)
  },

  confirmedQuoteNames() {
    return collectConfirmedQuoteNames(this._flowNodes || [])
  },

  closePickSheet(extra = {}) {
    this.setData({
      showPickSheet: false,
      pickSheetKind: '',
      pickSheetTitle: '',
      pickSheetGroups: [],
      pickSheetExtra: '',
      assignPendingIndex: -1,
      ...extra,
    })
  },

  openPickSheet({ kind, title, groups, extra = '', pendingIndex = -1 }) {
    if (!groups.length && !extra) {
      wx.showToast({ title: extra ? '' : '没有可选项', icon: 'none' })
      return
    }
    this.setData({
      showPickSheet: true,
      pickSheetKind: kind,
      pickSheetTitle: title,
      pickSheetGroups: groups,
      pickSheetExtra: extra,
      assignPendingIndex: pendingIndex,
    })
  },

  appendFindingToSection(sectionIndex, item, extra = {}) {
    const section = this.data.sections[sectionIndex]
    if (!section) return
    const findings = (section.findings || []).concat([item])
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
      {
        autoSaveLabel: '保存中…',
        showPickSheet: false,
        pickSheetKind: '',
        pickSheetGroups: [],
        pickSheetExtra: '',
        assignPendingIndex: -1,
        ...extra,
      },
      `${sectionIndex}:${findings.length - 1}`,
    )
    this.scheduleAutoSavePhotos()
  },

  addBlankFinding(sectionIndex, { workQuoteName = '', partName = '', images = [] } = {}) {
    const section = this.data.sections[sectionIndex]
    if (!section || !section.findingMode) return
    const id = `fid_new_${Date.now()}`
    const shots = Array.isArray(images) ? images : []
    const blank =
      section.findingKind === 'work'
        ? normalizeWorkFinding({
            id,
            partName: workQuoteName,
            caption: '',
            images: shots,
            outsideQuote: workOutsideQuoteOf(workQuoteName, this.confirmedQuoteNames()),
          })
        : normalizeFinding({
            id,
            partName: String(partName || '').trim(),
            result: '',
            advice: '',
            images: shots,
          })
    this.appendFindingToSection(sectionIndex, blank)
  },

  onAddFindingItem(e) {
    if (this.data.readOnly) return
    let sectionIndex = Number(e.currentTarget.dataset.sectionIndex)
    if (!Number.isFinite(sectionIndex) || sectionIndex < 0) {
      sectionIndex = this.findingSectionIndex()
    }
    const section = this.data.sections[sectionIndex]
    if (!section || !section.findingMode) return
    if (section.findingKind === 'work') {
      this.openPickSheet({
        kind: 'add-work',
        title: '加一项',
        groups: buildWorkAddPickGroups({
          quoteNames: this.confirmedQuoteNames(),
          findings: section.findings || [],
        }),
        extra: '新增一项',
      })
      return
    }
    this.addBlankFinding(sectionIndex)
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
      this.openPickSheet({
        kind: 'intake',
        title: '并入',
        pendingIndex,
        groups: [
          {
            label: '',
            items: list.map((row) => ({
              key: row.category,
              title: String((row && row.label) || row.category || '').trim() || '未命名',
              meta: '',
            })),
          },
        ],
      })
      return
    }
    const si = this.findingSectionIndex()
    const section = this.data.sections[si]
    if (!section) return
    if (section.findingKind === 'work') {
      const groups = buildWorkAssignPickGroups({
        quoteNames: this.confirmedQuoteNames(),
        findings: section.findings || [],
      })
      if (!groups.length) {
        wx.showToast({ title: '先新开', icon: 'none' })
        return
      }
      this.openPickSheet({
        kind: 'assign-work',
        title: '并入',
        pendingIndex,
        groups,
      })
      return
    }
    const list = section.findings || []
    if (!list.length) {
      wx.showToast({ title: '先新开', icon: 'none' })
      return
    }
    this.openPickSheet({
      kind: 'assign-finding',
      title: '并入',
      pendingIndex,
      groups: [
        {
          label: '',
          items: list.map((row, index) => ({
            key: String(index),
            title: String((row && row.partName) || '').trim() || '待填写',
            meta: '',
          })),
        },
      ],
    })
  },

  onClosePickSheet() {
    this.closePickSheet()
  },

  onPickSheetExtra() {
    if (this.data.pickSheetKind !== 'add-work') return
    this.addBlankFinding(this.findingSectionIndex())
  },

  onPickSheetItem(e) {
    const key = String((e.detail && e.detail.key) || '')
    if (!key) return
    const kind = this.data.pickSheetKind
    if (kind === 'intake' || kind === 'intake-promote') {
      this.attachPendingToIntake(this.data.assignPendingIndex, key)
      return
    }
    if (kind === 'assign-finding') {
      this.assignPendingToFinding(this.data.assignPendingIndex, Number(key))
      return
    }
    if (kind === 'assign-work') {
      this.assignPendingWorkKey(this.data.assignPendingIndex, key)
      return
    }
    if (kind === 'add-work') {
      const si = this.findingSectionIndex()
      if (key.indexOf('quote:') === 0) {
        this.addBlankFinding(si, { workQuoteName: key.slice('quote:'.length) })
      }
    }
  },

  workFindingIndexById(findings, id) {
    return (findings || []).findIndex((row) => String((row && row.id) || '') === String(id || ''))
  },

  workFindingIndexByQuoteName(findings, quoteName) {
    const name = String(quoteName || '').trim()
    if (!name) return -1
    return (findings || []).findIndex((row) => String((row && row.partName) || '').trim() === name)
  },

  assignPendingWorkKey(pendingIndex, key) {
    const si = this.findingSectionIndex()
    const section = this.data.sections[si]
    if (!section) return
    if (key.indexOf('finding:') === 0) {
      const idx = this.workFindingIndexById(section.findings, key.slice('finding:'.length))
      if (idx < 0) return
      this.assignPendingToFinding(pendingIndex, idx)
      return
    }
    if (key.indexOf('quote:') !== 0) return
    this.assignPendingToWorkQuote(pendingIndex, key.slice('quote:'.length))
  },

  assignPendingToWorkQuote(pendingIndex, quoteName) {
    if (this.data.readOnly) return
    const name = String(quoteName || '').trim()
    const pending = normalizePendingImages(this.data.pendingImages)
    const shot = pending[pendingIndex]
    const si = this.findingSectionIndex()
    const section = this.data.sections[si]
    if (!shot || !name || !section) return
    let hostIdx = this.workFindingIndexByQuoteName(section.findings, name)
    let findings = (section.findings || []).slice()
    if (hostIdx < 0) {
      findings.push(
        normalizeWorkFinding({
          id: `fid_new_${Date.now()}`,
          partName: name,
          caption: '',
          images: [],
          outsideQuote: false,
        }),
      )
      hostIdx = findings.length - 1
    }
    const current = normalizeWorkFinding(findings[hostIdx])
    if (current.images.length >= WORK_IMAGES_MAX) {
      wx.showToast({ title: `每项最多 ${WORK_IMAGES_MAX} 张`, icon: 'none' })
      return
    }
    const nextImages = current.images.concat([{ url: shot.url, imageId: shot.imageId || '' }]).slice(
      0,
      WORK_IMAGES_MAX,
    )
    findings[hostIdx] = this.withFindingMeta(
      current,
      normalizeWorkFinding({ ...current, partName: name, images: nextImages, outsideQuote: false }),
    )
    const leftover = pending.filter((_, i) => i !== pendingIndex)
    const sections = this.data.sections.map((row, i) => {
      if (i !== si) return row
      return {
        ...row,
        findings,
        images: this.flattenWorkSectionImages(findings),
      }
    })
    this.setSectionsWithFindings(
      sections,
      {
        pendingImages: leftover,
        autoSaveLabel: '保存中…',
        showPickSheet: false,
        pickSheetKind: '',
        pickSheetGroups: [],
        pickSheetExtra: '',
        assignPendingIndex: -1,
      },
      `${si}:${hostIdx}`,
    )
    this.scheduleAutoSavePhotos()
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
      showPickSheet: false,
      pickSheetKind: '',
      pickSheetGroups: [],
      pickSheetExtra: '',
      assignPendingIndex: -1,
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
        showPickSheet: false,
        pickSheetKind: '',
        pickSheetGroups: [],
        pickSheetExtra: '',
        assignPendingIndex: -1,
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
      this.openPickSheet({
        kind: 'intake-promote',
        title: '新开哪一类',
        pendingIndex,
        groups: [
          {
            label: '',
            items: list.map((row) => ({
              key: row.id,
              title: row.label,
              meta: '',
            })),
          },
        ],
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

  onPreviewFindingPhoto(e) {
    const url = String((e.detail && e.detail.url) || '').trim()
    const { sectionIndex, findingIndex } = this.findingEventIndex(e)
    const section = (this.data.sections || [])[sectionIndex]
    const finding = section && section.findings && section.findings[findingIndex]
    const urls = ((finding && finding.images) || [])
      .map((img) => (img && img.url) || '')
      .filter(Boolean)
    if (!urls.length) return
    wx.previewImage({ current: url || urls[0], urls })
  },

  collectInspectionAiBatch(findings) {
    const pending = normalizePendingImages(this.data.pendingImages)
    const seen = new Set(pending.map((img) => mediaKey(img && img.url)).filter(Boolean))
    const extra = []
    ;(findings || []).forEach((row) => {
      const part = String((row && row.partName) || '').trim()
      const advice = String((row && row.advice) || '').trim()
      if (part && advice) return
      ;(row.images || []).forEach((img) => {
        const key = mediaKey(img && img.url)
        if (!key || seen.has(key)) return
        seen.add(key)
        extra.push(img)
      })
    })
    return pending.concat(extra)
  },

  writeLocalFlowDraft() {
    if (this.data.readOnly || !this.data.activeIsPhoto) return
    const node = this.data.activeNode
    if (!this.albumId || !node || !node.id) return
    try {
      wx.setStorageSync(flowDraftStorageKey(this.albumId, node.id), {
        savedAt: Date.now(),
        content: this.buildPhotoDraftPayload(),
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

  /** 从项上卸下的图：随 persist 从本步名单拿掉（后端删相册图行，不进图库） */
  scheduleParkDetachedPhotos() {
    if (this.data.readOnly) return
    if (this._parkTimer) clearTimeout(this._parkTimer)
    this._parkTimer = setTimeout(() => {
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
    if (this.data.readOnly) return
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
    if (this.data.readOnly) return
    if (kind === 'delivery_photos' && String(this.data.activeNode.status || '') === 'completed') {
      return
    }
    if (kind === 'work' && String(this.data.activeNode.status || '') === 'completed') {
      return
    }
    if (
      (kind === 'intake' || kind === 'intake_inspection') &&
      (this.data.intakeSent || String(this.data.activeNode.status || '') === 'completed')
    ) {
      return
    }
    if (
      kind !== 'intake_inspection' &&
      kind !== 'intake' &&
      kind !== 'inspection' &&
      kind !== 'work' &&
      kind !== 'delivery_photos'
    ) {
      return
    }
    this.writeLocalFlowDraft()
    await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, flowContentSave(this.buildPhotoDraftPayload()))
  },

  commitAppliedPhotoDraft() {
    this.writeLocalFlowDraft()
    return this.persistPhotoDraft()
      .then(() => {
        this.writeLocalFlowDraft()
        this.setAutoSaveLabel('已自动保存')
      })
      .catch((err) => {
        this.setAutoSaveLabel((err && err.message) || '自动保存失败，请检查网络')
      })
  },

  onChiefComplaintInput(e) {
    if (this.data.isIntakePhotoStep) {
      const value = e.detail.value
      this.data.chiefComplaint = value
      const askOwner = (this.data.intakeAdvice && this.data.intakeAdvice.askOwner) || []
      const hasPick = askOwner.some((row) => (row.options || []).some((opt) => opt && opt.picked))
      if (!hasPick) this._askComplaintBase = String(value || '').trim()
      this.scheduleAutoSaveDraftOnly()
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
          const odometerImageId = (uploaded && (uploaded.id || uploaded.imageId)) || ''
          const sections = (this.data.sections || []).map((row, index) =>
            index === 0 ? { ...row, odometerUrl: url, odometerImageId } : row,
          )
          this.setData({
            sections,
            odometerUrl: url,
            odometerImageId,
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
    const sections = (this.data.sections || []).map((row, index) =>
      index === 0 ? { ...row, odometerUrl: '', odometerImageId: '' } : row,
    )
    this.setData(
      {
        sections,
        odometerUrl: '',
        odometerImageId: '',
        autoSaveLabel: '保存中…',
      },
      () => this.scheduleAutoSavePhotos(),
    )
  },

  onMileageKmInput(e) {
    if (this.data.readOnly || this.data.intakeSent) return
    this.setData({ mileageKm: String((e.detail && e.detail.value) || '') })
    this.scheduleAutoSavePhotos()
  },

  onAddIntakeWalkaround() {
    if (this.data.readOnly) return
    const section = (this.data.sections || [])[0] || { images: [] }
    const remain = Math.max(0, 12 - (section.images || []).length)
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
          const uploadedList = await this.uploadPickedFiles(files)
          if (!uploadedList.length) throw new Error('上传失败')
          const sections = (this.data.sections || []).map((row, index) =>
            index === 0 ? { ...row, images: (row.images || []).concat(uploadedList) } : row,
          )
          this.setData({ sections, autoSaveLabel: '保存中…' })
          this.scheduleAutoSavePhotos()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
    })
  },

  onPreviewIntakeWalkaround(e) {
    const url = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.url) || '')
    const urls = ((this.data.sections[0] && this.data.sections[0].images) || []).map((img) => img.url)
    if (!url) return
    wx.previewImage({ current: url, urls: urls.length ? urls : [url] })
  },

  onRemoveIntakeWalkaround(e) {
    if (this.data.readOnly) return
    const index = Number(e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const sections = (this.data.sections || []).map((row, si) => {
      if (si !== 0) return row
      return { ...row, images: (row.images || []).filter((_, i) => i !== index) }
    })
    this.setData({ sections, autoSaveLabel: '保存中…' }, () => this.scheduleAutoSavePhotos())
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
        if (field === 'repairBrief') {
          this.setData({ deliveryAdvice: this.decorateDeliveryAdvice(this.data.deliveryAdvice) })
        }
        this.scheduleAutoSavePhotos()
      })
      return
    }
    this.setData({ [field]: e.detail.value, autoSaveLabel: '保存中…' }, () => {
      this.scheduleAutoSaveDoc()
    })
  },

  /** 交车 AI 建议：逐项验收/质保，点哪行写哪行（只填空栏，不覆盖已写、不批量替换） */
  onApplyDeliveryAdvice(e) {
    if (this.data.readOnly || this.data.confirmAwaitingOwner) return
    const dataset = (e.currentTarget && e.currentTarget.dataset) || {}
    const kind = String(dataset.kind || '')
    const advice = this.data.deliveryAdvice
    if (!advice) return
    if (kind === 'warranty') {
      if (!advice.canApplyWarranty || !advice.warrantyText) return
      this.setData(
        { warrantyPeriod: advice.warrantyText, autoSaveLabel: '保存中…' },
        () => {
          this.setData(
            { deliveryAdvice: this.decorateDeliveryAdvice(this.data.deliveryAdvice) },
            () => this.commitAppliedPhotoDraft(),
          )
        },
      )
      wx.showToast({ title: '已写入质保期限', icon: 'none' })
      return
    }
    if (kind === 'split') {
      const adviceId = String(dataset.adviceId || '')
      const group = (advice.splitGroups || []).find((row) => row && row.id === adviceId && row.canApply)
      if (!group) return
      this.applyDeliveryPhotoSplit(group)
      return
    }
    if (kind !== 'acceptance') return
    const adviceId = String(dataset.adviceId || '')
    if (!adviceId || !advice.acceptance) return
    const target = (advice.acceptance.items || []).find((row) => row.adviceId === adviceId)
    if (!target || !target.canApply) return
    // 未施工项：草稿里没有，新建一行并写备注
    if (target.unbuilt) {
      const newRow = {
        id: `acc_unbuilt_${Date.now()}`,
        kind: 'work',
        name: String(target.name || '').trim(),
        images: [],
        result: '',
        note: String(target.note || target.basis || '本项未施工').trim(),
      }
      const acceptanceItems = [...(this.data.acceptanceItems || []), newRow]
      this.setData({ acceptanceItems, autoSaveLabel: '保存中…' }, () => {
        this.setData(
          { deliveryAdvice: this.decorateDeliveryAdvice(this.data.deliveryAdvice) },
          () => this.commitAppliedPhotoDraft(),
        )
      })
      wx.showToast({ title: '已标记未施工', icon: 'none' })
      return
    }
    const acceptanceItems = (this.data.acceptanceItems || []).map((row) => {
      if (row && row.id && target.id && row.id === target.id) {
        return {
          ...row,
          result: row.result || target.result || '',
          note: row.note || target.note || '',
        }
      }
      if (String((row && row.name) || '').trim() !== target.name) return row
      return {
        ...row,
        result: row.result || target.result || '',
        note: row.note || target.note || '',
      }
    })
    this.setData({ acceptanceItems, autoSaveLabel: '保存中…' }, () => {
      this.setData(
        { deliveryAdvice: this.decorateDeliveryAdvice(this.data.deliveryAdvice) },
        () => this.commitAppliedPhotoDraft(),
      )
    })
    wx.showToast({ title: '已写入该项', icon: 'none' })
  },

  /** 交车拆图：把挂错行的验收图挪到目标行。 */
  applyDeliveryPhotoSplit(group) {
    const targetId = String(group && group.targetId || '')
    const imageUrls = new Set(
      (group.images || []).map((img) => mediaKey(img && img.url)).filter(Boolean),
    )
    if (!targetId || !imageUrls.size) {
      wx.showToast({ title: '对不上验收行', icon: 'none' })
      return
    }
    let moved = false
    let full = false
    const items = (this.data.acceptanceItems || []).map((row) => {
      if (!row) return row
      // 目标行：追加图片
      if (String(row.id || '') === targetId) {
        const have = new Set((row.images || []).map((img) => mediaKey(img && img.url)).filter(Boolean))
        const add = []
        imageUrls.forEach((key) => {
          if (!have.has(key)) add.push(key)
        })
        if (!add.length) return row
        // 从其他行找到这些图
        return row
      }
      return row
    })
    // 先收集要挪的图对象（从其他行）
    const moving = []
    const stripped = items.map((row) => {
      if (!row || String(row.id || '') === targetId) return row
      const images = (row.images || []).filter((img) => {
        const key = mediaKey(img && img.url)
        if (imageUrls.has(key)) {
          moving.push(img)
          return false
        }
        return true
      })
      return images.length === (row.images || []).length ? row : { ...row, images }
    })
    if (!moving.length) {
      wx.showToast({ title: '没找到要挪的图', icon: 'none' })
      return
    }
    const next = stripped.map((row) => {
      if (!row || String(row.id || '') !== targetId) return row
      const have = new Set((row.images || []).map((img) => mediaKey(img && img.url)).filter(Boolean))
      const add = moving.filter((img) => !have.has(mediaKey(img && img.url)))
      const maxImages = row.kind === 'exterior' ? ACCEPTANCE_EXTERIOR_MAX : ACCEPTANCE_ITEM_MAX_IMAGES
      if ((row.images || []).length + add.length > maxImages) {
        full = true
        return row
      }
      moved = true
      return { ...row, images: (row.images || []).concat(add) }
    })
    if (full) {
      wx.showToast({ title: '目标行图片已满', icon: 'none' })
      return
    }
    if (!moved) {
      wx.showToast({ title: '对不上验收行', icon: 'none' })
      return
    }
    this.setData({ acceptanceItems: next, autoSaveLabel: '保存中…' }, () => {
      this.setData(
        { deliveryAdvice: this.decorateDeliveryAdvice(this.data.deliveryAdvice) },
        () => this.commitAppliedPhotoDraft(),
      )
    })
    wx.showToast({ title: '已挪到对应验收项', icon: 'none' })
  },

  onAcceptanceItemInput(e) {
    const rowId = String((e.currentTarget.dataset && e.currentTarget.dataset.rowId) || '').trim()
    const field = e.currentTarget.dataset.field
    if (!rowId || !['name', 'note'].includes(field)) return
    const acceptanceItems = (this.data.acceptanceItems || []).map((row) =>
      row && row.id === rowId ? { ...row, [field]: String(e.detail.value || '').trim() } : row,
    )
    this.setData({ acceptanceItems, autoSaveLabel: '保存中…' }, () => {
      this.scheduleAutoSaveDraftOnly()
    })
  },

  /** 验收结果只有店员实查后能点（三档：合格 / 建议观察 / 需返工），AI 不代点 */
  onAcceptanceResultTap(e) {
    if (this.data.readOnly) return
    const rowId = String((e.currentTarget.dataset && e.currentTarget.dataset.rowId) || '').trim()
    const value = String(e.currentTarget.dataset.value || '')
    if (!rowId) return
    if (!ACCEPTANCE_RESULT_OPTIONS.some((row) => row.value === value)) return
    const acceptanceItems = (this.data.acceptanceItems || []).map((row) =>
      row && row.id === rowId ? { ...row, result: row.result === value ? '' : value } : row,
    )
    this.setData({ acceptanceItems, autoSaveLabel: '保存中…' }, () => {
      this.scheduleAutoSaveDraftOnly()
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

  /**
   * 报价 AI「应用」：只写入项目名；品牌、金额、参考价档不进表。
   */
  onApplyQuoteAssistLine(e) {
    if (this.data.readOnly || this.data.confirmAwaitingOwner) return
    const source = String((e.currentTarget.dataset && e.currentTarget.dataset.source) || '')
    const index = Number(e.currentTarget.dataset && e.currentTarget.dataset.index)
    const assist = this.data.quoteAssist
    if (!assist) return
    let row = null
    if (source === 'ref') {
      row = (assist.quoteRefs || []).find((item) => item && Number(item.lineIndex) === index)
    } else if (source === 'omission') {
      row = (assist.omissions || []).find((item) => item && Number(item.index) === index)
    }
    if (!row || !row.canApply) return
    const name = String(row.applyName || row.name || row.title || '').trim()
    if (!name) return
    const onTable = this.quoteTableNameSet(this.data.quoteLines)
    if (onTable[name]) {
      this.setData({
        quoteAssist: this.decorateQuoteAssist(assist, this.data.quoteLines),
      })
      return
    }
    const blank = {
      name: '',
      brand: '',
      amount: '',
      note: '',
      evidenceUrl: '',
      evidenceUrls: [],
    }
    // 只写项目名；不带品牌、金额、参考价、原因
    const nextLine = { ...blank, name }
    const prev = Array.isArray(this.data.quoteLines) ? this.data.quoteLines.slice() : []
    const emptyIdx = prev.findIndex((line) => !String((line && line.name) || '').trim())
    let quoteLines
    if (emptyIdx >= 0) {
      quoteLines = prev.map((line, i) =>
        i === emptyIdx
          ? {
              ...line,
              name,
              brand: '',
              amount: '',
            }
          : line,
      )
    } else {
      quoteLines = prev.concat([nextLine])
    }
    this.setQuoteLines(quoteLines, { persistNow: true })
    wx.showToast({ title: `已写入${name}`, icon: 'none' })
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
    // 已废止：进度图只写节点 content，不再双写 album.nodes stage_*
    return
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

  quoteTableNameSet(lines) {
    const set = {}
    ;(lines || []).forEach((row) => {
      const name = String((row && row.name) || '').trim()
      if (name) set[name] = true
    })
    return set
  },

  decorateQuoteAssist(raw, quoteLines) {
    if (!raw || typeof raw !== 'object') {
      return {
        status: '',
        isWaiting: false,
        hasContent: false,
        suggestedLines: [],
        quoteRefs: [],
        hasQuoteRefs: false,
        hasOmissions: false,
        omissions: [],
        summary: '',
      }
    }
    const status = String(raw.status || '')
    const lines = quoteLines || this.data.quoteLines || []
    const onTable = this.quoteTableNameSet(lines)
    const tableHadNames = Object.keys(onTable).length > 0
    const suggestedLines = Array.isArray(raw.suggestedLines) ? raw.suggestedLines : []
    const buildBandChips = (row) => {
      const kind = String((row && row.kind) || 'parts')
      if (kind === 'labor') {
        return [
          row && row.dealer
            ? { key: 'dealer', k: '4S店', v: String(row.dealer).trim() }
            : null,
          row && row.indie
            ? { key: 'indie', k: '修理厂', v: String(row.indie).trim() }
            : null,
        ].filter((chip) => chip && chip.v)
      }
      return [
        row && row.oem ? { key: 'oem', k: '原厂', v: String(row.oem).trim() } : null,
        row && row.brand ? { key: 'brand', k: '品牌', v: String(row.brand).trim() } : null,
        row && row.economy
          ? { key: 'eco', k: '经济件', v: String(row.economy).trim() }
          : null,
      ].filter((chip) => chip && chip.v)
    }
    const quoteRefs = suggestedLines
      .map((row, lineIndex) => {
        const name = String((row && row.name) || '').trim()
        const reason = String((row && row.reason) || '').trim()
        const kind = String((row && row.kind) || 'parts')
        const optional = Boolean(row && row.optional)
        const bandChips = buildBandChips(row)
        if (!name && !reason && !bandChips.length) return null
        const displayName = name || '报价项'
        const hit = Boolean(name && onTable[name])
        // 空表建议 / 表上没有的行才可应用；已有同名行只出参考
        const isProposal = !tableHadNames || !hit
        return {
          lineIndex,
          source: 'ref',
          name: displayName,
          applyName: name,
          kind,
          reason,
          optional,
          bandChips,
          hasChips: bandChips.length > 0,
          canApply: Boolean(name) && isProposal && !hit,
          applied: Boolean(name) && isProposal && hit,
        }
      })
      .filter(Boolean)
    const omissions = (Array.isArray(raw.omissions) ? raw.omissions : [])
      .map((row, index) => {
        const name = String((row && (row.name || row.title)) || '').trim()
        const reason = String((row && (row.reason || row.body)) || '').trim()
        const kind = String((row && row.kind) || 'parts')
        const optional = Boolean(row && row.optional)
        const bandChips = buildBandChips(row)
        if (!name && !reason && !bandChips.length) return null
        // 总称袋不得应用进报价表
        if (/^建议补充|常规保养项目|以下项目|下列项目/.test(name)) return null
        const hit = Boolean(name && onTable[name])
        return {
          index,
          source: 'omission',
          name: name || '补充项',
          title: name || '补充项',
          applyName: name,
          kind,
          reason,
          body: reason,
          optional,
          bandChips,
          hasChips: bandChips.length > 0,
          hasTitle: Boolean(name),
          hasBody: Boolean(reason),
          canApply: Boolean(name) && !hit,
          applied: Boolean(name) && hit,
        }
      })
      .filter(Boolean)
    const hasQuoteRefs = quoteRefs.length > 0
    const hasOmissions = omissions.length > 0
    return {
      ...raw,
      status,
      suggestedLines,
      quoteRefs,
      hasQuoteRefs,
      omissions,
      hasOmissions,
      hasContent: hasQuoteRefs || hasOmissions,
      stale: Boolean(raw.stale),
      isWaiting: status === 'queued' || status === 'running',
      waitHint:
        raw.waitHint ||
        (status === 'queued' || status === 'running'
          ? hasQuoteRefs || hasOmissions
            ? '正在更新'
            : '正在出意见'
          : ''),
    }
  },

  decorateIntakeRows(rawRows, prevRows) {
    return (Array.isArray(rawRows) ? rawRows : [])
      .map((row, qi) => {
        const title = String((row && (row.title || row.partName)) || '').trim()
        const body = String((row && (row.body || row.why)) || '').trim()
        const prev =
          (prevRows || []).find((item) => item && item.title === title) || (prevRows || [])[qi] || {}
        const prevOpts = Array.isArray(prev.options) ? prev.options : []
        const options = (Array.isArray(row && row.options) ? row.options : [])
          .map((opt, oi) => {
            const label = String((opt && (opt.label || opt.title || opt)) || '').trim()
            const hit = prevOpts.find((item) => item && item.label === label)
            return { label, picked: Boolean(hit && hit.picked), q: qi, o: oi }
          })
          .filter((item) => item.label)
        return {
          seq: String(qi + 1),
          title,
          body,
          hasTitle: Boolean(title),
          hasBody: Boolean(body),
          options,
          hasOptions: options.length > 0,
          optionText: options.map((opt) => opt.label).join('、'),
        }
      })
      .filter((row) => row.hasTitle || row.hasBody || row.hasOptions)
  },

  decorateIntakeAdvice(raw) {
    if (!raw || typeof raw !== 'object') {
      return { status: '', isWaiting: false, hasContent: false }
    }
    const status = String(raw.status || '')
    const prev = this.data.intakeAdvice || {}
    const risks = this.decorateIntakeRows(raw.risks, prev.risks).map((row) => ({
      ...row,
      options: [],
      hasOptions: false,
    }))
    const noPhotos = Boolean(raw.noPhotos)
    const covered = Boolean(raw.covered) && !risks.length && !noPhotos
    const fp = `${status}|${covered}|${noPhotos}|${risks.map((row) => row.title).join(',')}`
    if (status === 'ready' && this._askAdviceFp !== fp) {
      this._askAdviceFp = fp
      this._askComplaintBase = String(this.data.chiefComplaint || '').trim()
    }
    return {
      ...raw,
      status,
      diagnosis: '',
      photoTips: [],
      askOwner: [],
      checkpoints: [],
      risks,
      fixes: [],
      noPhotos,
      covered,
      hasRisks: risks.length > 0,
      hasFixes: false,
      hasContent: Boolean(covered || noPhotos || risks.length),
      stale: Boolean(raw.stale),
      isWaiting: status === 'queued' || status === 'running',
      waitHint:
        raw.waitHint ||
        (status === 'queued' || status === 'running'
          ? covered || noPhotos || risks.length
            ? '正在更新'
            : '正在出意见'
          : ''),
    }
  },

  decorateWorkAdvice(raw, sections) {
    if (!raw || typeof raw !== 'object') {
      return { status: '', isWaiting: false, hasContent: false, hasLines: false, lines: [], items: [], sequence: [], splitGroups: [], newItems: [] }
    }
    const status = String(raw.status || '')
    const findings = this.collectFindingsFromSections(sections)
    const lines = []
    const gaps = (Array.isArray(raw.gaps) ? raw.gaps : [])
      .map((row, index) => {
        const body = String((row && row.body) || '').trim()
        const title = String((row && row.title) || '').trim()
        const kind = row && row.kind === 'extra' ? 'extra' : row && row.kind === 'missing' ? 'missing' : ''
        return body ? { id: `gap_${index}`, kind, title, body } : null
      })
      .filter(Boolean)
    this._workExtraTitles = new Set(
      gaps.filter((row) => row.kind === 'extra' && row.title).map((row) => row.title),
    )
    gaps.forEach((row) => {
      lines.push({ id: row.id, body: row.body, canApply: false })
    })
    // 施工顺序：只读
    const sequence = (Array.isArray(raw.sequence) ? raw.sequence : [])
      .map((row, index) => {
        const name = String((row && row.name) || '').trim()
        const how = String((row && row.how) || '').trim()
        const photo = String((row && row.photo) || '').trim()
        if (!name && !how && !photo) return null
        return { id: `seq_${index}`, name, how, photo }
      })
      .filter(Boolean)
    const items = (Array.isArray(raw.items) ? raw.items : []).map((row, index) => {
      const findingId = String((row && (row.findingId || row.id)) || '')
      const partName = String((row && row.partName) || '').trim()
      const findingIndex = Number.isInteger(row && row.findingIndex) ? row.findingIndex : index
      const current = this.pickAdviceFinding(findings, {
        findingId: findingId.startsWith('own_') || findingId.startsWith('gap_') ? '' : findingId,
        partName,
        findingIndex,
      })
      const caption = String((current && current.caption) || '').trim()
      const source = String((row && row.sourceNote) || '').trim()
      const body = String((row && row.body) || '').trim()
      const supplement = String((row && row.supplement) || '').trim()
      const applied = Boolean(!source && body && caption && caption === body)
      return {
        id: `own_${findingIndex}`,
        findingId,
        findingIndex,
        partName,
        body,
        supplement,
        canApply: Boolean(!source && body && !caption),
        applied,
      }
    })
    items.forEach((row) => {
      const sentence = String(row.body || '').trim()
      const name = String(row.partName || '').trim()
      const display = String(row.display || '').trim() || (name && sentence ? `${name}建议描述为：${sentence}` : '')
      if (display) {
        lines.push({ id: row.id, body: display, canApply: row.canApply, applied: row.applied })
      }
    })
    // 拆分建议：把一张施工项拆成多张（后端已按 findingId 归组）
    const splitGroups = (Array.isArray(raw.groups) ? raw.groups : [])
      .map((row) => {
        const id = String((row && row.id) || '')
        const findingId = String((row && row.findingId) || '')
        const groupList = Array.isArray(row && row.groups) ? row.groups : []
        if (!groupList.length) return null
        const body = String((row && row.body) || '').trim()
        const canApply = Boolean(row && row.canApply)
        return {
          id,
          findingId,
          body,
          canApply,
          hasGroups: groupList.length >= 2,
          groups: groupList.map((g, i) => ({
            id: `${id}_g${i}`,
            partName: String((g && g.partName) || '').trim(),
            advice: String((g && g.advice) || '').trim(),
            imageLabel: String((g && g.imageLabel) || '').trim(),
            images: (Array.isArray(g && g.images) ? g.images : [])
              .map((img) => ({ url: String((img && img.url) || '') }))
              .filter((img) => img.url),
          })),
        }
      })
      .filter(Boolean)
    // 新增项：不属于任何报价行的图
    const newItems = (Array.isArray(raw.newItems) ? raw.newItems : [])
      .map((row, index) => {
        const name = String((row && row.name) || '').trim()
        const description = String((row && row.description) || '').trim()
        const images = Array.isArray(row && row.images) ? row.images : []
        if (!images.length && !name && !description) return null
        return {
          id: `new_${index}`,
          name,
          description,
          images: images.map((img) => ({ url: String((img && img.url) || '') })),
          canApply: images.length > 0,
        }
      })
      .filter(Boolean)
    const photoPlan = (Array.isArray(raw.photoPlan) ? raw.photoPlan : [])
      .map((row, index) => {
        const title = String((row && row.title) || '').trim()
        const body = String((row && row.body) || '').trim()
        if (!title && !body) return null
        return {
          id: `photo_${index}`,
          title,
          body,
          hasTitle: Boolean(title),
          hasBody: Boolean(body),
        }
      })
      .filter(Boolean)
    if (!lines.length) {
      const note = String(raw.note || '').trim()
      if (note) lines.push({ id: 'note', body: note, canApply: false })
    }
    const hasContent =
      lines.length > 0 ||
      photoPlan.length > 0 ||
      sequence.length > 0 ||
      splitGroups.length > 0 ||
      newItems.length > 0
    return {
      status,
      scope: String(raw.scope || ''),
      lines,
      gaps,
      sequence,
      items,
      splitGroups,
      newItems,
      photoPlan,
      hasPhotoPlan: photoPlan.length > 0,
      hasSequence: sequence.length > 0,
      hasSplitGroups: splitGroups.length > 0,
      hasNewItems: newItems.length > 0,
      hasLines: lines.length > 0 || photoPlan.length > 0,
      hasContent,
      stale: Boolean(raw.stale),
      isWaiting: status === 'queued' || status === 'running',
      waitHint:
        raw.waitHint ||
        (status === 'queued' || status === 'running'
          ? hasContent
            ? '正在更新'
            : '正在出意见'
          : ''),
    }
  },

  isIntakeCoverageEcho(value) {
    const s = String(value || '').trim()
    return !s || /车身四周|接车留证|还缺这些侧面|补一张全景|四周都拍到/.test(s)
  },

  decorateInspectionAdvice(raw, sections) {
    if (!raw || typeof raw !== 'object') {
      return {
        status: '',
        isWaiting: false,
        hasContent: false,
        items: [],
        edits: [],
        lines: [],
        hasLines: false,
        faultAnalysis: '',
        faultLines: [],
        inspectOrder: [],
        partHints: [],
        hasFault: false,
        hasOrder: false,
        hasParts: false,
      }
    }
    const status = String(raw.status || '')
    const findings = this.collectFindingsFromSections(sections)
    const byId = new Map(
      findings.map((row) => [String((row && row.id) || ''), row]).filter((pair) => pair[0]),
    )
    const faultAnalysis = this.isIntakeCoverageEcho(raw.faultAnalysis)
      ? ''
      : String(raw.faultAnalysis || '').trim()
    const faultLines = faultAnalysis
      .split(/\n+/)
      .map((line) => line.replace(/^\d+[.、．)\]）]\s*/, '').trim())
      .filter((line) => line && !this.isIntakeCoverageEcho(line))
    const inspectOrder = (Array.isArray(raw.inspectOrder) ? raw.inspectOrder : [])
      .map((row) => String(row || '').trim())
      .filter((row) => row && !this.isIntakeCoverageEcho(row))
    ;(Array.isArray(raw.partHints) ? raw.partHints : []).forEach((row) => {
      const title = String((row && row.title) || '').trim()
      const body = String((row && row.body) || '').trim()
      const line = [title, body].filter(Boolean).join('：')
      if (line && !this.isIntakeCoverageEcho(line) && !inspectOrder.includes(line)) inspectOrder.push(line)
    })

    // 本单修改：只认意见 edits；每项一条（图+文打包），不再并入项上识图建议
    const seenFindings = new Set()
    const lines = []
    ;(Array.isArray(raw.edits) ? raw.edits : []).forEach((row, index) => {
      const kind = String((row && row.kind) || '')
      const body = String((row && row.body) || '').trim()
      if (!body || this.isIntakeCoverageEcho(body)) return
      if (kind === 'photo') {
        lines.push({
          id: String((row && row.id) || `edit_photo_${index}`),
          body,
          canApply: false,
          applied: false,
          applyKind: 'photo',
          groups: [],
          hasGroups: false,
        })
        return
      }
      // item / text / split 统一成「一项一条」
      const findingId = String((row && row.findingId) || '')
      if (!findingId || seenFindings.has(findingId)) return
      seenFindings.add(findingId)
      const current = byId.get(findingId)
      const groups = Array.isArray(row.groups) ? row.groups : []
      const wantSplit = groups.length >= 2
      const showGroups = groups.length >= 1
      const photosLanded = wantSplit && this.inspectSplitPhotosLanded(groups, findings)
      const partName = String((row && row.partName) || '').trim()
      const advice = String((row && row.advice) || '').trim()
      const curName = String((current && current.partName) || '').trim()
      const curAdvice = String((current && current.advice) || '').trim()
      const curResult = String((current && current.result) || '').trim()
      const singleGroup = !wantSplit && groups.length === 1 ? groups[0] : null
      const nextName = !curName ? (partName || String((singleGroup && singleGroup.partName) || '').trim()) : ''
      const nextAdvice = !curAdvice
        ? advice || String((singleGroup && (singleGroup.advice || singleGroup.note)) || '').trim()
        : ''
      const nextResult = singleGroup && !curResult ? String((singleGroup && singleGroup.result) || '').trim() : ''
      const stillThere = Boolean(current)
      const editId = String((row && row.id) || `edit_item_${findingId}`)
      if (!this._appliedInspectEditIds) this._appliedInspectEditIds = new Set()
      const markedApplied = this._appliedInspectEditIds.has(editId)
      let canApply = false
      let applied = false
      const resultPending =
        wantSplit &&
        groups.some((group) => {
          const name = String((group && group.partName) || '').trim()
          const opinion = String((group && group.result) || '').trim()
          if (!name || !opinion) return false
          const host = findings.find((row) => String((row && row.partName) || '').trim() === name)
          return Boolean(host && !String((host.result) || '').trim())
        })
      if (wantSplit) {
        // 图已经在对应检测项上、检查结果也点上，才算已应用。
        const hasPhotoHost =
          stillThere || findings.some((row) => ((row && row.images) || []).length > 0)
        canApply = (!photosLanded && hasPhotoHost) || resultPending
        applied = photosLanded && !resultPending
      } else if (showGroups) {
        // 一组（无需拆分）：AI 写的描述/检查结果还没落到检测项时，也可一键应用（不挪图）
        const suggestedAdvice = String((singleGroup && (singleGroup.advice || singleGroup.note)) || '').trim()
        const suggestedResult = String((singleGroup && singleGroup.result) || '').trim()
        const adviceLanded = !suggestedAdvice || Boolean(curAdvice)
        const resultLanded = !suggestedResult || Boolean(curResult)
        canApply = Boolean(stillThere && (!adviceLanded || !resultLanded))
        applied = Boolean(
          markedApplied || (stillThere && (suggestedAdvice || suggestedResult) && adviceLanded && resultLanded),
        )
      } else {
        canApply = Boolean(stillThere && (nextName || nextAdvice))
        applied = Boolean(
          markedApplied ||
            (stillThere && (partName || advice) && !canApply && (!partName || curName) && (!advice || curAdvice)),
        )
      }
      if (!canApply && !applied && !showGroups) return
      const shownGroups = showGroups
        ? groups.map((g, gi) => {
            const partNameG = String((g && g.partName) || '').trim()
            const adviceG = String((g && (g.advice || g.note)) || '').trim()
            const imageLabel =
              String((g && g.imageLabel) || '').trim() ||
              (Array.isArray(g && g.imageSlots) && g.imageSlots.length
                ? g.imageSlots.map((n) => `图${n}`).join('、')
                : '')
            const images = (Array.isArray(g && g.images) ? g.images : [])
              .map((img) => {
                if (typeof img === 'string') return { url: img }
                if (!img || typeof img !== 'object') return null
                const url = String(img.url || img.rawUrl || '').trim()
                if (!url) return null
                const maskedUrl = String(img.maskedUrl || img.preMaskedUrl || '').trim()
                return maskedUrl ? { url, maskedUrl, preMaskedUrl: maskedUrl } : { url }
              })
              .filter(Boolean)
            return {
              id: `${editId}_g_${gi}`,
              partName: partNameG,
              advice: adviceG,
              imageLabel,
              result: String((g && g.result) || '').trim(),
              images,
              imageSlots: images.length || !Array.isArray(g && g.imageSlots) ? [] : g.imageSlots,
            }
          })
        : []
      lines.push({
        id: editId,
        body,
        canApply,
        applied,
        applyKind: 'item',
        findingId,
        partName: nextName,
        advice: nextAdvice,
        result: nextResult,
        groups: shownGroups,
        hasGroups: shownGroups.length >= 1,
      })
    })

    const hasFault = Boolean(faultAnalysis)
    const hasOrder = inspectOrder.length > 0
    const hasLines = lines.length > 0
    return {
      status,
      scope: String(raw.scope || ''),
      faultAnalysis,
      faultLines,
      inspectOrder,
      partHints: [],
      hasFault,
      hasOrder,
      hasParts: false,
      edits: Array.isArray(raw.edits) ? raw.edits : [],
      shop: [],
      items: [],
      lines,
      hasLines,
      hasContent: hasFault || hasOrder || hasLines,
      stale: Boolean(raw.stale),
      isWaiting: status === 'queued' || status === 'running',
      waitHint:
        raw.waitHint ||
        (status === 'queued' || status === 'running'
          ? hasFault || hasOrder || hasLines
            ? '正在更新'
            : '正在出意见'
          : ''),
    }
  },

  decorateDeliveryAdvice(raw) {
    // 简述/问答只静默写库、不进面板；面板只用验收逐行建议与质保
    const empty = {
      status: '',
      isWaiting: false,
      hasContent: false,
      repairBrief: '',
      ownerFaqs: [],
      acceptance: null,
      splitGroups: [],
      hasSplitGroups: false,
      tips: [],
      hasTips: false,
      warrantyText: '',
      canApplyAcceptance: false,
      canApplyWarranty: false,
      acceptanceApplied: false,
    }
    if (!raw || typeof raw !== 'object') return empty
    const status = String(raw.status || '')
    const repairBrief = String(raw.repairBrief || '').trim()
    const ownerFaqs = (Array.isArray(raw.ownerFaqs) ? raw.ownerFaqs : [])
      .map((row, index) => {
        const question = String((row && (row.question || row.q)) || '').trim()
        const answer = String((row && (row.answer || row.a)) || '').trim()
        if (!question) return null
        return {
          id: String((row && row.id) || `suggest_${index + 1}`),
          question,
          answer,
        }
      })
      .filter(Boolean)
      .slice(0, 5)
    const rawItems =
      raw.acceptance && Array.isArray(raw.acceptance.items) ? raw.acceptance.items : []
    // AI 建议行：补齐类别（名字叫「外观」或 kind=exterior 即外观行）
    const draftRows = resolveAcceptanceItems({
      acceptanceItems: rawItems.map((row) => {
        const rawName = String((row && row.name) || '').trim()
        const kind =
          (row && row.kind === 'exterior') || rawName === ACCEPTANCE_EXTERIOR_NAME
            ? 'exterior'
            : 'work'
        const name = rawName || (kind === 'exterior' ? ACCEPTANCE_EXTERIOR_NAME : '')
        return { ...(row || {}), kind, name }
      }),
    })
    const liveItems = (this.data.acceptanceItems || []).map((row) => ({
      id: String((row && row.id) || '').trim(),
      name: String((row && row.name) || '').trim(),
      result: String((row && row.result) || '').trim(),
      note: String((row && row.note) || '').trim(),
    }))
    // 逐行判断：AI 给了结果或描述、且本行还空着，才可应用；点了才写入，写入后仍可改
    const acceptanceDraftItems = draftRows.map((item, index) => {
      const hit = liveItems.find(
        (row) => (item.id && row.id === item.id) || (item.name && row.name === item.name),
      )
      const unbuilt = Boolean(item && item.unbuilt)
      // 未施工项：草稿里不存在，应用时新建并写入备注
      const canApply = unbuilt
        ? true
        : Boolean(hit && ((item.result && !hit.result) || (item.note && !hit.note)))
      const resultLabel =
        (ACCEPTANCE_RESULT_OPTIONS.find((opt) => opt.value === item.result) || {}).label || ''
      return {
        ...item,
        adviceId: `acc_adv_${index + 1}`,
        canApply,
        resultLabel,
        unbuilt,
        standard: String((item && item.standard) || '').trim(),
        method: String((item && item.method) || '').trim(),
        photoAdvice: String((item && item.photoAdvice) || '').trim(),
        basis: String((item && item.basis) || '').trim(),
      }
    })
    const canApplyAcceptance = acceptanceDraftItems.some((item) => item.canApply)
    // 拆分建议：验收图挂错行，挪图
    const splitGroups = (Array.isArray(raw.groups) ? raw.groups : [])
      .map((row, index) => {
        const partName = String((row && row.partName) || '').trim()
        const slots = Array.isArray(row && row.slots) ? row.slots : []
        const images = Array.isArray(row && row.images) ? row.images : []
        const body = String((row && row.body) || '').trim()
        if (!partName || !slots.length) return null
        // 找目标验收行
        const target = (this.data.acceptanceItems || []).find(
          (r) => String((r && r.name) || '').trim() === partName,
        )
        return {
          id: `dsplit_${index}`,
          partName,
          slots,
          images: images.map((img) => ({ url: String((img && img.url) || '') })).filter((i) => i.url),
          body,
          targetId: target ? String(target.id || '') : '',
          canApply: Boolean(target),
        }
      })
      .filter(Boolean)
    const warrantyText = String((raw.warranty && raw.warranty.body) || '').trim()
    const liveWarranty = String(this.data.warrantyPeriod || '').trim()
    const canApplyWarranty = Boolean(warrantyText) && !liveWarranty
    const tips = (Array.isArray(raw.tips) ? raw.tips : [])
      .map((row, index) => {
        const title = String((row && row.title) || '').trim()
        const body = String((row && row.body) || '').trim()
        if (!title && !body) return null
        return { id: `tip_${index}`, title, body, hasTitle: Boolean(title), hasBody: Boolean(body) }
      })
      .filter(Boolean)
    const hasContent = Boolean(acceptanceDraftItems.length || warrantyText || splitGroups.length || tips.length)
    return {
      status,
      repairBrief,
      ownerFaqs,
      acceptance: acceptanceDraftItems.length ? { items: acceptanceDraftItems } : null,
      splitGroups,
      hasSplitGroups: splitGroups.length > 0,
      tips,
      hasTips: tips.length > 0,
      warrantyText,
      canApplyAcceptance,
      canApplyWarranty,
      acceptanceApplied: acceptanceDraftItems.length > 0 && !canApplyAcceptance,
      hasContent,
      stale: Boolean(raw.stale),
      isWaiting: status === 'queued' || status === 'running',
      waitHint:
        raw.waitHint ||
        (status === 'queued' || status === 'running'
          ? hasContent
            ? '正在更新'
            : '正在出意见'
          : ''),
    }
  },

  mergeAskPicksIntoComplaint(askOwner) {
    const base = String(this._askComplaintBase || this.data.chiefComplaint || '').trim()
    const picks = []
    ;(askOwner || []).forEach((row) => {
      ;(row.options || []).forEach((opt) => {
        if (opt && opt.picked && opt.label) picks.push(opt.label)
      })
    })
    if (!picks.length) return base
    return base ? `${base}；${picks.join('；')}` : picks.join('；')
  },

  onToggleInspectAdvice() {
    this.setData({ inspectAdviceOpen: !this.data.inspectAdviceOpen })
  },

  onToggleAskOption(e) {
    if (this.data.isInspectionPhotoStep) return
    const q = Number(e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.q)
    const o = Number(e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.o)
    const advice = this.data.intakeAdvice
    if (!advice || !Array.isArray(advice.fixes) || !Number.isFinite(q) || !Number.isFinite(o)) return
    const fixes = advice.fixes.map((row, qi) => {
      if (qi !== q) return row
      const options = (row.options || []).map((opt, oi) =>
        oi === o ? { ...opt, picked: !opt.picked } : opt,
      )
      return { ...row, options }
    })
    if (this._askComplaintBase == null) {
      this._askComplaintBase = String(this.data.chiefComplaint || '').trim()
    }
    const chiefComplaint = this.mergeAskPicksIntoComplaint(fixes)
    this.setData(
      {
        intakeAdvice: { ...advice, fixes, hasFixes: true },
        chiefComplaint,
        autoSaveLabel: '保存中…',
      },
      () => this.commitAppliedPhotoDraft(),
    )
  },

  computeCheckpointMisses(flowNodes, findings, enabled) {
    if (!enabled) return []
    const intake = (flowNodes || []).find(
      (item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'),
    )
    const checkpoints =
      (intake && intake.intakeAdvice && intake.intakeAdvice.checkpoints) || []
    return unmatchedCheckpoints(checkpoints, findings)
  },

  flattenBriefLine(item) {
    if (item && typeof item === 'object') {
      return String(
        item.text || item.title || item.how || item.content || item.point || item.issue || '',
      ).trim()
    }
    const line = String(item || '').trim()
    return line === '[object Object]' ? '' : line
  },

  decorateMerchantBrief(raw) {
    const brief = raw && typeof raw === 'object' ? raw : {}
    const issues = (Array.isArray(brief.issues) ? brief.issues : [])
      .map((row) => this.decorateBriefItem(row))
      .filter((row) => row.hasTitle || row.hasBody)
    const omissions = (Array.isArray(brief.omissions) ? brief.omissions : [])
      .map((row) => this.decorateBriefItem(row))
      .filter((row) => row.hasTitle || row.hasBody)
    const photoPlan = (Array.isArray(brief.photoPlan) ? brief.photoPlan : [])
      .map((row) => this.decorateBriefItem(row))
      .filter((row) => row.hasTitle || row.hasBody)
    const necessity = (Array.isArray(brief.necessity) ? brief.necessity : [])
      .map((row) => this.decorateBriefItem(row))
      .filter((row) => row.hasTitle || row.hasBody)
    const objections = (Array.isArray(brief.objections) ? brief.objections : [])
      .map((row) => this.decorateObjection(row))
      .filter((row) => row.hasAsk || row.hasHeard || row.hasOurs || row.hasSay)
    const priceBands = (Array.isArray(brief.priceBands) ? brief.priceBands : [])
      .map((row) => {
        const kind = String((row && row.kind) || 'parts')
        const bandChips =
          kind === 'labor'
            ? [
                row && row.dealer
                  ? { key: 'dealer', k: '4S店', v: String(row.dealer).trim() }
                  : null,
                row && row.indie
                  ? { key: 'indie', k: '修理厂', v: String(row.indie).trim() }
                  : null,
              ].filter((chip) => chip && chip.v)
            : [
                row && row.oem ? { key: 'oem', k: '原厂', v: String(row.oem).trim() } : null,
                row && row.brand ? { key: 'brand', k: '品牌', v: String(row.brand).trim() } : null,
                row && row.economy
                  ? { key: 'eco', k: '经济件', v: String(row.economy).trim() }
                  : null,
              ].filter((chip) => chip && chip.v)
        return {
          ...row,
          kind,
          name: String((row && row.name) || '').trim(),
          note: String((row && row.note) || '').trim(),
          bandChips,
          hasChips: bandChips.length > 0,
        }
      })
      // 没有区间就不占「市场参考价」空壳行
      .filter((row) => row.hasChips)
    return {
      kicker: 'AI意见',
      issues,
      omissions,
      photoPlan,
      necessity,
      objections,
      priceBands,
      hasIssues: issues.length > 0,
      hasOmissions: omissions.length > 0,
      hasPhotoPlan: photoPlan.length > 0,
      hasNecessity: necessity.length > 0,
      hasObjections: objections.length > 0,
      hasBands: priceBands.length > 0,
      hasContent:
        issues.length > 0 ||
        omissions.length > 0 ||
        photoPlan.length > 0 ||
        necessity.length > 0 ||
        objections.length > 0 ||
        priceBands.length > 0,
    }
  },

  decorateObjection(item) {
    const base = this.decorateBriefItem(item, true)
    const row = item && typeof item === 'object' ? item : {}
    const ask = String(row.ask || row.title || base.title || '').trim()
    const heard = String(row.heard || '').trim()
    const ours = String(row.ours || '').trim()
    const say = String(row.say || (!heard && !ours ? base.body : '') || '').trim()
    return {
      ask,
      heard,
      ours,
      say,
      hasAsk: Boolean(ask),
      hasHeard: Boolean(heard),
      hasOurs: Boolean(ours),
      hasSay: Boolean(say),
      hasTitle: Boolean(ask),
      hasBody: Boolean(say),
    }
  },

  decorateBriefItem(item, asQuestion) {
    if (item && typeof item === 'object' && (item.title || item.body)) {
      const title = String(item.title || '').trim()
      const body = String(item.body || '').trim()
      return { title, body, hasTitle: Boolean(title), hasBody: Boolean(body) }
    }
    const line = this.flattenBriefLine(item)
    if (!line) return { title: '', body: '', hasTitle: false, hasBody: false }
    if (asQuestion || /[？?]$/.test(line)) {
      return { title: line, body: '', hasTitle: true, hasBody: false }
    }
    const colon = line.match(/^(.{2,16}?)[:：]\s*(.+)$/)
    if (colon) {
      return { title: colon[1], body: colon[2], hasTitle: true, hasBody: true }
    }
    const stop = line.match(/^(.{2,16}?)[，。]\s*(.+)$/)
    if (stop && stop[2].length >= 6) {
      return { title: stop[1], body: stop[2], hasTitle: true, hasBody: true }
    }
    return { title: '', body: line, hasTitle: false, hasBody: true }
  },

  quoteAiButtonFlags() {
    const kind = (this.data.activeNode && this.data.activeNode.kind) || this.data.activeKind
    const adviceStep =
      kind === 'inspection_report' ||
      kind === 'quote_confirm' ||
      kind === 'addon_quote_confirm' ||
      kind === 'intake' ||
      kind === 'repair_report' ||
      kind === 'delivery_photos'
    const entitled = Boolean(this._nodeAiReviewEntitled)
    const awaiting = Boolean(this.data.confirmAwaitingOwner)
    return {
      showQuoteAiCheck: Boolean(adviceStep && entitled && !this.data.readOnly && !awaiting),
      quoteNotifyReady: true,
    }
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
      merchantBrief: this.decorateMerchantBrief(raw.merchantBrief),
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
      ...this.quoteMoneyFields(quoteLines),
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
      adviceApplyRows: this.buildAdviceApplyRows(this.data.sections, decorated),
    }
    Object.assign(patch, this.quoteAiButtonFlags())
    if (this._aiReviewAction === 'deliver' || this._aiReviewAction === 'notify') {
      patch.notifyOwnerLabel = '通知车主'
      patch.notifyConfirmDisabled = false
    } else {
      patch.photoConfirmLabel = canProceed ? '进入下一步' : '确认并继续'
      patch.photoConfirmDisabled = waiting && !timedOut
    }
    if (!waiting && decorated.merchantBrief && decorated.merchantBrief.hasContent) {
      patch.adviceOpen = true
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
    patch.adviceApplyRows = this.buildAdviceApplyRows(patch.sections || this.data.sections, decorated)
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
      kind === 'delivery_photos' ||
      kind === 'repair_report'
    ) {
      return
    }
    const review = active.aiReview
    if (!review || review.acknowledged) return
    if (review.status !== 'queued' && review.status !== 'running' && review.status !== 'ready') return
    let action = ''
    if (kind === 'delivery_photos') action = 'complete'
    else if (kind === 'repair_report') action = 'notify'
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

  resumeQuoteAssistPoll() {
    const assistWaiting = Boolean(this.data.quoteAssist && this.data.quoteAssist.isWaiting)
    const intakeWaiting = Boolean(this.data.intakeAdvice && this.data.intakeAdvice.isWaiting)
    const workWaiting = Boolean(this.data.workAdvice && this.data.workAdvice.isWaiting)
    const deliveryWaiting = Boolean(this.data.deliveryAdvice && this.data.deliveryAdvice.isWaiting)
    const inspectionWaiting = Boolean(this.data.inspectionAdvice && this.data.inspectionAdvice.isWaiting)
    if (assistWaiting || intakeWaiting || workWaiting || deliveryWaiting || inspectionWaiting) this.startQuoteAssistPoll()
    else this.stopQuoteAssistPoll()
  },

  stopQuoteAssistPoll() {
    if (this._quoteAssistTimer) {
      clearTimeout(this._quoteAssistTimer)
      this._quoteAssistTimer = null
    }
  },

  startQuoteAssistPoll() {
    if (this._quoteAssistTimer) return
    const tick = async () => {
      this._quoteAssistTimer = null
      try {
        // 只刷意见状态，不整页 loadFlow，避免节点图片跟着闪
        await this.refreshAdviceOnly()
      } catch (_) {
        this._quoteAssistTimer = setTimeout(tick, 2000)
      }
    }
    this._quoteAssistTimer = setTimeout(tick, 1600)
  },

  /**
   * 意见轮询：只拉流程节点上的意见字段并更新弹层，不重绑接车/检测/施工图。
   */
  async refreshAdviceOnly() {
    const flow = await fetchMerchantAlbumFlow(this.albumId)
    const flowNodes = (flow && flow.flowNodes) || []
    if (!flowNodes.length) return
    // 缓存节点意见，避免下次整页加载读到旧意见
    const prev = Array.isArray(this._flowNodes) ? this._flowNodes : []
    const byId = new Map(flowNodes.filter((n) => n && n.id).map((n) => [n.id, n]))
    this._flowNodes = prev.map((node) => {
      if (!node || !node.id || !byId.has(node.id)) return node
      const fresh = byId.get(node.id)
      return {
        ...node,
        intakeAdvice: fresh.intakeAdvice !== undefined ? fresh.intakeAdvice : node.intakeAdvice,
        inspectionAdvice:
          fresh.inspectionAdvice !== undefined ? fresh.inspectionAdvice : node.inspectionAdvice,
        workAdvice: fresh.workAdvice !== undefined ? fresh.workAdvice : node.workAdvice,
        deliveryAdvice:
          fresh.deliveryAdvice !== undefined ? fresh.deliveryAdvice : node.deliveryAdvice,
        quoteAssist: fresh.quoteAssist !== undefined ? fresh.quoteAssist : node.quoteAssist,
      }
    })
    // 本地还没有的新节点也并入（少见）
    flowNodes.forEach((fresh) => {
      if (!fresh || !fresh.id) return
      if (!this._flowNodes.some((n) => n && n.id === fresh.id)) this._flowNodes.push(fresh)
    })

    const nodes = this._flowNodes
    const sections = this.data.sections || []
    const quoteLines = this.data.quoteLines || []
    const quoteAssistRaw =
      (nodes.find((n) => n && n.kind === 'quote_confirm' && !n.insertedReason) || {}).quoteAssist ||
      null
    this._pendingQuoteAssist = quoteAssistRaw

    const intakeAdvice = this.decorateIntakeAdvice(
      (nodes.find((n) => n && (n.kind === 'intake' || n.kind === 'intake_inspection')) || {})
        .intakeAdvice,
    )
    const workAdvice = this.decorateWorkAdvice(
      (nodes.find((n) => n && n.kind === 'work' && n.workAdvice) || {}).workAdvice,
      sections,
    )
    const deliveryAdvice = this.decorateDeliveryAdvice(
      (nodes.find((n) => n && n.kind === 'delivery_photos') || {}).deliveryAdvice,
    )
    const inspectionAdvice = this.decorateInspectionAdvice(
      (nodes.find((n) => n && n.kind === 'inspection') || {}).inspectionAdvice,
      sections,
    )
    const quoteAssist = this.decorateQuoteAssist(quoteAssistRaw, quoteLines)

    this.setData(
      {
        intakeAdvice,
        workAdvice,
        deliveryAdvice,
        inspectionAdvice,
        quoteAssist,
      },
      () => {
        this.syncAdviceChrome()
        this.settleAdvicePaintWaiting()
        this.resumeQuoteAssistPoll()
        this.autoAdoptDeliveryCopy()
      },
    )
  },

  /** 简述/问答不在界面展示：AI 已生成时静默写入本单内容（只供托管预览与公网），已有字不覆盖 */
  autoAdoptDeliveryCopy() {
    if (this.data.readOnly || !this.data.isDeliveryPhotoStep) return
    const advice = this.data.deliveryAdvice || {}
    const patch = {}
    if (!String(this.data.repairBrief || '').trim() && String(advice.repairBrief || '').trim()) {
      patch.repairBrief = String(advice.repairBrief).trim()
    }
    if (
      !(Array.isArray(this.data.ownerFaqs) ? this.data.ownerFaqs : []).filter(
        (row) => row && String(row.question || '').trim(),
      ).length &&
      Array.isArray(advice.ownerFaqs) &&
      advice.ownerFaqs.length
    ) {
      patch.ownerFaqs = advice.ownerFaqs.map((row, index) => ({
        id: String((row && row.id) || `faq_${index + 1}`),
        question: String((row && row.question) || '').trim(),
        answer: String((row && row.answer) || '').trim(),
      }))
    }
    if (!Object.keys(patch).length) return
    this.setData({ ...patch, autoSaveLabel: '保存中…' }, () => this.scheduleAutoSaveDraftOnly())
  },

  applyInspectionProposal(id) {
    if (!id) return false
    const sectionIndex = (this.data.sections || []).findIndex((section) =>
      (section.findings || []).some((row) => row && row.aiApply && row.aiApply.id === id),
    )
    if (sectionIndex < 0) return false
    const section = this.data.sections[sectionIndex]
    const findings = applyInspectionSuggestion(section.findings || [], id)
    const sections = this.data.sections.map((row, index) => {
      if (index !== sectionIndex) return row
      return {
        ...row,
        findings,
        images:
          row.findingKind === 'work'
            ? this.flattenWorkSectionImages(findings)
            : this.findingImagesFromRows(findings, this.data.odometerUrl),
      }
    })
    this.setSectionsWithFindings(sections, { autoSaveLabel: '保存中…' }, undefined, () => {
      this.commitAppliedPhotoDraft()
    })
    return true
  },

  async onApplyAiSuggestion(e, options = {}) {
    const skipPersist = Boolean(options && options.skipPersist)
    const skipToast = Boolean(options && options.skipToast)
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    if (this.applyInspectionProposal(id)) return
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
      Object.assign(patch, this.quoteMoneyFields(quoteLines))
    }
    const suggestions = (review.suggestions || []).map((row) =>
      row && row.id === id ? { ...row, applied: true } : row,
    )
    patch.aiReview = this.decorateAiReview({ ...review, suggestions })
    patch.adviceApplyRows = this.buildAdviceApplyRows(patch.sections || this.data.sections, patch.aiReview)
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
      const reportPayload = this.buildDocPayloadForSave()
      await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        ...flowContentSave(reportPayload),
        document: { status: 'draft', payload: reportPayload },
      })
      const quoteNodeId = this.data.quoteNodeId || this._quoteNodeId
      if (quoteNodeId) {
        const quoteNode = (this._flowNodes || []).find((n) => n && n.id === quoteNodeId)
        const quoteStatus = String((quoteNode && quoteNode.document && quoteNode.document.status) || '')
        if (quoteStatus !== 'pending_confirm' && quoteStatus !== 'confirmed' && quoteStatus !== 'cancelled') {
          const quotePayload = this.buildQuotePayloadForSave()
          await updateMerchantFlowNode(this.albumId, quoteNodeId, {
            ...flowContentSave(quotePayload),
            document: { status: 'draft', payload: quotePayload },
          })
        }
      }
      return
    }
    if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
      const quotePayload = this.buildQuotePayloadForSave()
      await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        ...flowContentSave(quotePayload),
        document: { status: 'draft', payload: quotePayload },
      })
      return
    }
    if (kind === 'repair_report') {
      const reportPayload = this.buildDocPayloadForSave()
      await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        ...flowContentSave(reportPayload),
        document: { status: 'draft', payload: reportPayload },
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
    if (this.data.stageKey === 'intake') {
      const fields = this.intakeDraftFields()
      if (fields.intake && fields.intake.kind === 'intake') {
        if (!fields.complaint) {
          wx.showToast({ title: '先写车主诉求', icon: 'none' })
          return
        }
        if (!fields.pile.length) {
          wx.showToast({ title: '请先拍留证', icon: 'none' })
          return
        }
        await this.finishIntakeSend(fields)
        return
      }
    }
    if (kind === 'intake' || kind === 'intake_inspection') {
      const fields = this.intakeDraftFields()
      if (!fields.complaint) {
        wx.showToast({ title: '先写车主诉求', icon: 'none' })
        return
      }
      if (!fields.pile.length) {
        wx.showToast({ title: '请先拍留证', icon: 'none' })
        return
      }
    } else if (kind === 'inspection' || kind === 'work') {
      const shots = this.countAttachedFindingPhotos()
      const piled =
        kind === 'inspection' ? normalizePendingImages(this.data.pendingImages).length : 0
      if (shots + piled < 1) {
        wx.showToast({ title: '请至少上传 1 张照片', icon: 'none' })
        return
      }
    } else if (kind !== 'delivery_photos' && kind !== 'intake' && kind !== 'intake_inspection') {
      // 非检测/工单才允许看 section.images；检测/工单已在上面按 findings 计数
      const total = this.data.sections.reduce((sum, s) => sum + (s.images || []).length, 0)
      if (total < 1) {
        wx.showToast({ title: '请至少上传 1 张照片', icon: 'none' })
        return
      }
    }
    if (
      kind === 'intake_inspection' &&
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
        vehicleBrand: String(this.data.vehicleBrand || '').trim(),
        vehicleSeries: String(this.data.vehicleSeries || '').trim(),
        vehicleYear: String(this.data.vehicleYear || '').trim(),
        findings: this.collectFindingsFromSections(),
        conclusion: this.data.conclusion,
      }
      const gaps = collectInspectionReportGaps(draftPayload)
      if (gaps.length) {
        this.presentInspectionGaps(gaps)
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
        acceptanceItems: this.data.acceptanceItems || [],
        warrantyPeriod: this.data.warrantyPeriod,
        warrantyNotes: this.data.warrantyNotes,
        delivererName: this.data.delivererName,
      })
      if (gaps.length) {
        wx.showModal({
          title: '请先补全交车与验收信息',
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
        // 接车勿先单独写 document.delivered，否则 complete 会被「已发出冻结」拦住
        const res = await completeMerchantFlowNode(
          this.albumId,
          this.data.activeNode.id,
          Object.assign({}, flowContentSave(this.buildPhotoDraftPayload()), extra),
        )
        if (res && res.nextAction === 'ai_review') {
          this.applyInlineAiReview(res.review, 'complete')
          return
        }
        wx.showToast({
          title: kind === 'intake' || kind === 'intake_inspection' ? '已发给车主' : (res && res.message) || '本步已完成',
          icon: 'success',
        })
        if (kind === 'work') {
          this._justCompletedWorkId = this.data.activeNode && this.data.activeNode.id
          this._pendingStageKey = 'finish'
          this._forceStageOpen = true
        }
        await this.loadFlow({ silent: true })
        if (kind === 'intake' || kind === 'intake_inspection') this.openStage('inspect')
        else if (kind === 'inspection') this.openStage('inspect')
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
        inspectorName: String(this.data.inspectorName || '').trim(),
        inspectedAt: String(this.data.inspectedAt || '').trim(),
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
      const preview = this.reportPreviewFor('交车报告')
      const doc = (preview && preview.doc) || {}
      const faqs =
        (Array.isArray(this.data.ownerFaqs) && this.data.ownerFaqs.length
          ? this.data.ownerFaqs
          : null) ||
        (Array.isArray(base.ownerFaqs) && base.ownerFaqs.length ? base.ownerFaqs : null) ||
        doc.ownerFaqs ||
        []
      const workItems =
        (Array.isArray(base.workItems) && base.workItems.length
          ? base.workItems
          : null) ||
        doc.workItems ||
        []
      return {
        ...base,
        confirmCopy: REPAIR_CONFIRM_COPY,
        warrantyPeriod: this.data.warrantyPeriod || base.warrantyPeriod || doc.warrantyPeriod,
        warrantyNotes: this.data.warrantyNotes || base.warrantyNotes || doc.warrantyNotes,
        delivererName: String(this.data.delivererName || base.delivererName || doc.signName || '').trim(),
        finishedAt: String(this.data.finishedAt || base.finishedAt || doc.signAt || '').trim(),
        repairBrief: String(this.data.repairBrief || base.repairBrief || doc.repairBrief || '').trim(),
        acceptanceItems:
          (this.data.acceptanceItems && this.data.acceptanceItems.length
            ? this.data.acceptanceItems
            : null) ||
          base.acceptanceItems ||
          doc.acceptanceItems ||
          [],
        ownerFaqs: faqs,
        workItems,
        totalAmount: base.totalAmount != null ? base.totalAmount : doc.totalAmount,
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

  inspectionContentKey() {
    const intakePhotos = (this.collectIntakePile ? this.collectIntakePile() : [])
      .map((item) => String((item && item.url) || ''))
      .filter(Boolean)
      .sort()
    const findings = this.collectFindingsFromSections().map((row) => ({
      id: String((row && row.id) || ''),
      part: String((row && row.partName) || ''),
      result: String((row && row.result) || ''),
      advice: String((row && row.advice) || ''),
      photos: ((row && row.images) || [])
        .map((img) => String((img && img.url) || ''))
        .filter(Boolean)
        .sort(),
    }))
    return JSON.stringify({
      complaint: this.intakeComplaintText(),
      intakePhotos,
      findings,
    })
  },

  currentAdviceBundle() {
    const family = (this.data.stageBoard && this.data.stageBoard.family) || ''
    if (family === 'intake') return this.data.intakeAdvice
    if (family === 'inspect') return this.data.inspectionAdvice
    if (family === 'quote') return this.data.quoteAssist
    if (family === 'work') return this.data.workAdvice
    if (family === 'finish') return this.data.deliveryAdvice
    return null
  },

  syncAdviceChrome() {
    const advice = this.currentAdviceBundle()
    const hasContent = Boolean(advice && advice.hasContent)
    const failed = Boolean(advice && advice.status === 'failed')
    const isWaiting = Boolean(advice && advice.isWaiting)
    this.setData({
      adviceStale: Boolean(advice && advice.stale),
      adviceCanRefresh: !this.data.readOnly && (hasContent || failed) && !isWaiting,
      adviceWaitHint:
        (advice && advice.waitHint) ||
        (isWaiting ? (hasContent ? '正在更新' : '正在出意见') : ''),
      adviceFailText: failed && !isWaiting ? ((advice && advice.errorMessage) || '这次没出成，点刷新再试') : '',
    })
  },

  /** 弹层先进入等待，再保存、再请求。否则会空等两三秒。 */
  showAdviceWaiting() {
    const family = (this.data.stageBoard && this.data.stageBoard.family) || ''
    const prev = this.currentAdviceBundle() || {}
    const waitHint = prev.hasContent ? '正在更新' : '正在出意见'
    const next = {
      ...prev,
      status: prev.hasContent ? 'running' : 'queued',
      isWaiting: true,
      waitHint,
    }
    const patch = {
      adviceOpen: true,
      advicePaintWaiting: true,
      adviceWaitHint: waitHint,
      adviceCanRefresh: false,
    }
    if (family === 'intake') patch.intakeAdvice = next
    else if (family === 'inspect') patch.inspectionAdvice = next
    else if (family === 'quote') patch.quoteAssist = next
    else if (family === 'work') patch.workAdvice = next
    else if (family === 'finish') patch.deliveryAdvice = next
    else {
      patch.inspectionAdvice = next
      patch.intakeAdvice = next
    }
    this.setData(patch)
  },

  failAdviceWait(message, options = {}) {
    const family = (this.data.stageBoard && this.data.stageBoard.family) || ''
    const prev = this.currentAdviceBundle() || {}
    const next = {
      ...prev,
      status: 'failed',
      isWaiting: false,
      waitHint: '',
      errorMessage: message || '未能出意见',
    }
    const code = String((options && options.code) || '')
    const text = String(message || '')
    const quotaBlocked =
      code === 'AI_QUOTA_EXCEEDED' ||
      code === 'SUBSCRIPTION_EXPIRED' ||
      /额度已满|套餐已到期|升级套餐后再/.test(text)
    const closePanel = Boolean(options.closePanel) || quotaBlocked
    const patch = {
      advicePaintWaiting: false,
      adviceWaitHint: '',
      adviceCanRefresh: !this.data.readOnly && !quotaBlocked,
    }
    if (closePanel) {
      patch.adviceOpen = false
    }
    if (family === 'intake') patch.intakeAdvice = next
    else if (family === 'inspect') patch.inspectionAdvice = next
    else if (family === 'quote') patch.quoteAssist = next
    else if (family === 'work') patch.workAdvice = next
    else if (family === 'finish') patch.deliveryAdvice = next
    else patch.inspectionAdvice = next
    this.setData(patch, () => this.syncAdviceChrome())
  },

  /** 启动 AI 失败：清等待；额度/到期类再关弹层，避免一直「正在出意见」 */
  abortAdviceStart(error, fallbackMessage) {
    const message = (error && error.message) || fallbackMessage || '未能出意见'
    this.failAdviceWait(message, {
      code: error && error.code,
      closePanel: true,
    })
    wx.showToast({ title: message, icon: 'none' })
  },

  settleAdvicePaintWaiting() {
    if (!this.data.advicePaintWaiting) return
    const advice = this.currentAdviceBundle()
    if (advice && (advice.status === 'ready' || advice.status === 'failed') && !advice.isWaiting) {
      this.setData({ advicePaintWaiting: false }, () => this.syncAdviceChrome())
    }
  },

  /**
   * 打开 AI 面板：有上次结果默认只展示；force 才重跑。
   */
  openAdvicePanel(options = {}) {
    const force = Boolean(options && options.force)
    if (this.data.confirming) return
    if (this.data.adviceOpen && !force) {
      this.setData({ adviceOpen: false, advicePaintWaiting: false })
      return
    }
    const family = (this.data.stageBoard && this.data.stageBoard.family) || ''
    const advice = this.currentAdviceBundle()
    const hasPrior = Boolean(
      advice && (advice.hasContent || advice.isWaiting || advice.status === 'failed'),
    )
    this.setData({ adviceOpen: true }, () => this.syncAdviceChrome())
    if (this.data.readOnly) return
    if (advice && advice.isWaiting) return
    if (!force && hasPrior && advice.hasContent) return
    if (family === 'intake') return this.onStartIntakeAdvice({ force })
    if (family === 'inspect') return this.onStartInspectionAdvice({ force })
    if (family === 'quote') return this.onStartQuoteAiCheck({ force })
    if (family === 'work') return this.onStartWorkAdvice({ force })
    if (family === 'finish') return this.onStartDeliveryStepAdvice({ force })
  },

  onRefreshAdvice() {
    if (this.data.readOnly || this.data.confirming) return
    const advice = this.currentAdviceBundle()
    if (advice && advice.isWaiting) return
    this.openAdvicePanel({ force: true })
  },

  async onInspectionAi() {
    return this.openAdvicePanel()
  },

  onIntakeHeaderAi() {
    if (this.data.intakeSent && !this.data.adviceOpen) {
      this.openAdvicePanel()
      return
    }
    if (this.data.intakeSent) {
      this.setData({ adviceOpen: false })
      return
    }
    return this.openAdvicePanel()
  },

  onWorkHeaderAi() {
    return this.openAdvicePanel()
  },

  onAiFab() {
    const family = (this.data.stageBoard && this.data.stageBoard.family) || ''
    if (family === 'intake') return this.onIntakeHeaderAi()
    if (family === 'inspect') return this.onInspectionAi()
    if (family === 'quote') return this.onToggleAdvice()
    if (family === 'work') return this.onWorkHeaderAi()
    if (family === 'finish') return this.onToggleAdvice()
  },

  onToggleAdvice() {
    return this.openAdvicePanel()
  },

  onCloseAdvice() {
    this.setData({ adviceOpen: false, advicePaintWaiting: false })
  },

  onAdvicePanelTap() {},

  async onStartIntakeAdvice(options = {}) {
    const force = Boolean(options && options.force)
    if (this.data.readOnly || this.data.confirming) return
    if (this.data.intakeAdvice && this.data.intakeAdvice.isWaiting) return
    if (!this.intakeComplaintText()) {
      wx.showToast({ title: '先写车主诉求', icon: 'none' })
      return
    }
    if (!parseMileageKm(this._albumMileage)) {
      wx.showToast({ title: '建档没有里程', icon: 'none' })
      return
    }
    if (!String(this.data.vehicleBrand || '').trim() || !String(this.data.vehicleSeries || '').trim()) {
      wx.showToast({ title: '先填品牌车系', icon: 'none' })
      return
    }
    this.setData({ confirming: true })
    this.showAdviceWaiting()
    try {
      await this.persistPhotoDraft()
      await updateMerchantFlowNode(this.albumId, this.data.activeNode.id, {
        startIntakeAdvice: true,
        forceRefresh: force,
      })
      this.setData({ adviceOpen: true }, () => this.syncAdviceChrome())
      this.resumeQuoteAssistPoll()
    } catch (e) {
      this.abortAdviceStart(e, '未能出意见')
    } finally {
      this.setData({ confirming: false })
    }
  },

  async onStartQuoteAiCheck(options = {}) {
    const force = Boolean(options && options.force)
    if (this.data.readOnly || this.data.confirming) return
    if (this.data.quoteAssist && this.data.quoteAssist.isWaiting) return
    if (!this._nodeAiReviewEntitled) return
    this.setData({ confirming: true })
    this.showAdviceWaiting()
    try {
      await this.flushDocDraftSave()
    } catch (e) {
      this.abortAdviceStart(e, '请先保存当前修改')
      this.setData({ confirming: false })
      return
    }
    try {
      const quotePayload = this.buildQuotePayloadForSave()
      const quoteNodeId =
        this.data.quoteNodeId || this._quoteNodeId || (this.data.activeNode && this.data.activeNode.id)
      if (quoteNodeId) {
        await updateMerchantFlowNode(this.albumId, quoteNodeId, {
          document: { status: 'draft', payload: quotePayload },
          startQuoteAssist: true,
          forceRefresh: force,
        })
      }
      this.setData({ adviceOpen: true }, () => this.syncAdviceChrome())
      this.resumeQuoteAssistPoll()
    } catch (e) {
      this.abortAdviceStart(e, '未能出意见')
    } finally {
      this.setData({ confirming: false })
    }
  },

  onApplyShopGap(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    const row = ((this.data.inspectionAdvice && this.data.inspectionAdvice.shop) || []).find(
      (item) => item && item.id === id && item.canApply,
    )
    if (!row) return
    const sectionIndex = this.findingSectionIndex()
    if (sectionIndex < 0) return
    this.addBlankFinding(sectionIndex, { partName: row.title })
    const shop = (this.data.inspectionAdvice.shop || []).map((item) =>
      item && item.id === id ? { ...item, canApply: false } : item,
    )
    const lines = (this.data.inspectionAdvice.lines || []).map((item) =>
      item && item.id === id ? { ...item, canApply: false, applied: true } : item,
    )
    this.setData({
      inspectionAdvice: { ...this.data.inspectionAdvice, shop, lines },
      autoSaveLabel: '保存中…',
    }, () => this.commitAppliedPhotoDraft())
  },

  pickAdviceFinding(findings, item) {
    const list = Array.isArray(findings) ? findings : []
    const id = String((item && item.findingId) || '')
    if (id) {
      const hits = list.filter((row) => row && String(row.id || '') === id)
      if (hits.length === 1) return hits[0]
    }
    const name = String((item && item.partName) || '').trim()
    if (name && name !== '这项') {
      const hits = list.filter((row) => row && String(row.partName || '').trim() === name)
      if (hits.length === 1) return hits[0]
    }
    const index = Number(item && item.findingIndex)
    if (Number.isInteger(index) && index >= 0 && list[index]) return list[index]
    return null
  },

  onApplyWorkExplain(e) {
    const lineId = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    const group = ((this.data.workAdvice && this.data.workAdvice.groups) || []).find(
      (row) => row && row.id === lineId && row.canApply,
    )
    if (group) {
      this.applyWorkPhotoGroup(group)
      return
    }
    const item = ((this.data.workAdvice && this.data.workAdvice.items) || []).find(
      (row) => row && row.id === lineId && row.canApply && row.body,
    )
    if (!item) return
    let changed = false
    const sections = (this.data.sections || []).map((section) => {
      if (!section || !section.findingMode || section.findingKind !== 'work') return section
      const findings = section.findings || []
      const target = this.pickAdviceFinding(findings, item)
      if (!target) return section
      changed = true
      return {
        ...section,
        findings: findings.map((row) => (row === target ? { ...row, caption: item.body } : row)),
      }
    })
    if (!changed) {
      wx.showToast({ title: '没对上施工项，请刷新后再应用', icon: 'none' })
      return
    }
    this.setSectionsWithFindings(sections, { autoSaveLabel: '保存中…' }, undefined, () => {
      this.setData({
        workAdvice: this.decorateWorkAdvice(this.data.workAdvice, this.data.sections),
      })
      this.commitAppliedPhotoDraft()
    })
  },

  /** 施工拆分建议：把一张施工项按图拆成多张。 */
  onApplyWorkSplit(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    const split = ((this.data.workAdvice && this.data.workAdvice.splitGroups) || []).find(
      (row) => row && row.id === id && row.canApply,
    )
    if (!split || !split.hasGroups || this.data.readOnly) return
    const findingId = String(split.findingId || '')
    if (!findingId) return
    const groups = split.groups || []
    if (groups.length < 2) return
    let targetSection = -1
    let targetIndex = -1
    const sections = this.data.sections || []
    sections.forEach((section, si) => {
      if (!section || section.findingKind !== 'work') return
      const idx = (section.findings || []).findIndex((row) => String((row && row.id) || '') === findingId)
      if (idx >= 0) {
        targetSection = si
        targetIndex = idx
      }
    })
    if (targetSection < 0 || targetIndex < 0) {
      wx.showToast({ title: '对不上施工项，请刷新后再试', icon: 'none' })
      return
    }
    const target = sections[targetSection].findings[targetIndex]
    const targetImages = (target && target.images) || []
    // url -> group index
    const urlToGroup = new Map()
    groups.forEach((g, gi) => {
      ;(g.images || []).forEach((img) => {
        const key = mediaKey(img && img.url)
        if (key && !urlToGroup.has(key)) urlToGroup.set(key, gi)
      })
    })
    const buckets = groups.map(() => [])
    const leftover = []
    targetImages.forEach((img) => {
      const key = mediaKey(img && img.url)
      const gi = urlToGroup.get(key)
      if (gi != null) buckets[gi].push(img)
      else leftover.push(img)
    })
    const newFindings = []
    groups.forEach((g, gi) => {
      if (!buckets[gi].length) return
      const partName = String(g.partName || '').trim()
      newFindings.push(
        normalizeWorkFinding({
          id: `fid_split_${Date.now()}_${gi}`,
          partName,
          caption: String(g.advice || '').trim(),
          images: buckets[gi],
          outsideQuote: workOutsideQuoteOf(partName, this.confirmedQuoteNames()),
        }),
      )
    })
    if (leftover.length) {
      newFindings.push(
        normalizeWorkFinding({
          id: target.id,
          partName: String(target.partName || '').trim(),
          caption: String(target.caption || '').trim(),
          images: leftover,
          outsideQuote: Boolean(target.outsideQuote),
        }),
      )
    }
    if (!newFindings.length) {
      wx.showToast({ title: '没有可拆分的图', icon: 'none' })
      return
    }
    const nextSections = sections.map((section, si) => {
      if (si !== targetSection) return section
      const findings = (section.findings || []).slice()
      findings.splice(targetIndex, 1, ...newFindings)
      return {
        ...section,
        findings,
        images: this.flattenWorkSectionImages(findings),
      }
    })
    this.setSectionsWithFindings(nextSections, { autoSaveLabel: '保存中…' }, undefined, () => {
      this.setData({
        workAdvice: this.decorateWorkAdvice(this.data.workAdvice, this.data.sections),
      })
      this.persistPhotos().then(() => this.commitAppliedPhotoDraft())
    })
  },

  /** 施工新增项：新建施工项并挂图，可选走补充报价。 */
  async onApplyWorkNewItem(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    const item = ((this.data.workAdvice && this.data.workAdvice.newItems) || []).find(
      (row) => row && row.id === id && row.canApply,
    )
    if (!item || this.data.readOnly) return
    const images = (item.images || []).map((img) => ({ url: img.url }))
    const partName = String(item.name || '').trim()
    const caption = String(item.description || '').trim()
    const sectionIndex = (this.data.sections || []).findIndex((s) => s && s.findingKind === 'work')
    if (sectionIndex < 0) {
      wx.showToast({ title: '找不到施工项区域', icon: 'none' })
      return
    }
    const blank = normalizeWorkFinding({
      id: `fid_new_${Date.now()}`,
      partName,
      caption,
      images,
      outsideQuote: workOutsideQuoteOf(partName, this.confirmedQuoteNames()),
    })
    this.appendFindingToSection(sectionIndex, blank)
    this.setData({
      workAdvice: this.decorateWorkAdvice(this.data.workAdvice, this.data.sections),
    })
    await this.persistPhotos()
    await this.commitAppliedPhotoDraft()
    // 不强制补充报价，由店员决定
    wx.showModal({
      title: '已新建施工项',
      content: '这项不在原报价内，是否通知车主补充报价？（部分店选择免费处理）',
      confirmText: '补充报价',
      cancelText: '暂不',
      success: (res) => {
        if (res.confirm) this.onAddAddonPlan()
      },
    })
  },

  applyWorkPhotoGroup(group) {
    const urlKey = mediaKey(group && group.url)
    const targetName = String((group && group.partName) || '').trim()
    if (!urlKey || !targetName || this.data.readOnly) return
    let moved = false
    let full = false
    const sections = (this.data.sections || []).map((section) => {
      if (!section || section.findingKind !== 'work' || moved || full) return section
      const findings = (section.findings || []).map((row) => normalizeWorkFinding(row))
      const hosts = findings.filter((row) => String(row.partName || '').trim() === targetName)
      if (hosts.length !== 1) return section
      const host = hosts[0]
      if (host.images.some((img) => mediaKey(img.url) === urlKey)) {
        moved = true
        return section
      }
      let shot = null
      const stripped = findings.map((row) => {
        if (row === host) return row
        const images = (row.images || []).filter((img) => {
          if (mediaKey(img.url) === urlKey) {
            shot = img
            return false
          }
          return true
        })
        return images.length === row.images.length ? row : { ...row, images }
      })
      if (!shot) return section
      if (host.images.length >= WORK_IMAGES_MAX) {
        full = true
        return section
      }
      const next = stripped.map((row) =>
        row === host ? { ...row, images: host.images.concat([shot]) } : row,
      )
      moved = true
      return { ...section, findings: next, images: this.flattenWorkSectionImages(next) }
    })
    if (full) {
      wx.showToast({ title: `每项最多 ${WORK_IMAGES_MAX} 张`, icon: 'none' })
      return
    }
    if (!moved) {
      wx.showToast({ title: '对不上项目', icon: 'none' })
      return
    }
    this.setSectionsWithFindings(sections, { autoSaveLabel: '保存中…' }, undefined, () => {
      this.setData({
        workAdvice: this.decorateWorkAdvice(this.data.workAdvice, this.data.sections),
      })
      this.persistPhotos()
        .then(() => this.commitAppliedPhotoDraft())
        .catch((err) => this.setAutoSaveLabel((err && err.message) || '自动保存失败，请检查网络'))
    })
  },

  onApplyOwnerExplain(e) {
    const lineId = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    const line = ((this.data.inspectionAdvice && this.data.inspectionAdvice.lines) || []).find(
      (row) => row && row.id === lineId && row.canApply,
    )
    if (!line) return
    if (line.applyKind === 'shop') {
      this.onApplyShopGap(e)
      return
    }
    // 一项一条：拆图+文案同次应用
    if (line.applyKind === 'item' || line.applyKind === 'text' || line.applyKind === 'split' || line.applyKind === 'fill') {
      this.applyInspectionItemEdit(line)
    }
  },

  /** 拆分建议里的图是否已经挂在同名检测项上。 */
  inspectSplitPhotosLanded(groups, findings) {
    const list = Array.isArray(findings) ? findings : []
    let expected = 0
    let landed = 0
    ;(Array.isArray(groups) ? groups : []).forEach((group) => {
      const keys = (Array.isArray(group && group.images) ? group.images : [])
        .map((img) => mediaKey(typeof img === 'string' ? img : img && (img.url || img.rawUrl)))
        .filter(Boolean)
      if (!keys.length) return
      expected += 1
      const name = String((group && group.partName) || '').trim()
      const host = list.find((row) => String((row && row.partName) || '').trim() === name)
      if (!host) return
      const have = new Set(
        (host.images || []).map((img) => mediaKey(img && img.url)).filter(Boolean),
      )
      if (keys.every((key) => have.has(key))) landed += 1
    })
    return expected > 0 && landed === expected
  },

  /** 本单修改应用：有 groups 则拆成多项并写入各组文案；否则只填该项空着的部位名/检查发现。仅此处允许改检测项列表。 */
  applyInspectionItemEdit(line) {
    const findingId = String((line && line.findingId) || '')
    const groups = Array.isArray(line && line.groups) ? line.groups : []
    const wantSplit = groups.length >= 2
    const nextName = String((line && line.partName) || '').trim()
    const nextAdvice = String((line && line.advice) || '').trim()
    const editId = String((line && line.id) || (findingId ? `edit_item_${findingId}` : ''))
    if (!editId) return
    let expandKey = ''
    let changed = false
    const sections = (this.data.sections || []).map((section, si) => {
      if (!section || !section.findingMode) return section
      const list = section.findings || []
      let idx = findingId ? list.findIndex((row) => row && String(row.id || '') === findingId) : -1
      if (idx < 0 && wantSplit) {
        const piles = list
          .map((row, i) => ({ i, n: ((row && row.images) || []).length }))
          .filter((row) => row.n >= 2)
        if (piles.length === 1) idx = piles[0].i
      }
      if (wantSplit && this.inspectSplitPhotosLanded(groups, list)) {
        let stamped = false
        const findings = list.map((row) => {
          const name = String((row && row.partName) || '').trim()
          const group = groups.find((item) => String((item && item.partName) || '').trim() === name)
          const opinion = String((group && group.result) || '').trim()
          if (!opinion || String((row && row.result) || '').trim()) return row
          stamped = true
          return { ...row, result: opinion }
        })
        if (!stamped) return section
        changed = true
        expandKey = `${si}:${idx >= 0 ? idx : 0}`
        return {
          ...section,
          findings,
          images: this.findingImagesFromRows(findings, this.data.odometerUrl),
        }
      }
      if (idx < 0) return section
      if (wantSplit) {
        const names = new Set(
          groups.map((g) => String((g && g.partName) || '').trim()).filter(Boolean),
        )
        const pruned = list.filter((row) => {
          if (!row || String(row.id || '') === findingId) return true
          const name = String(row.partName || '').trim()
          const count = ((row.images) || []).length
          return !(names.has(name) && count === 0)
        })
        let splitAt = findingId
          ? pruned.findIndex((row) => row && String(row.id || '') === findingId)
          : -1
        if (splitAt < 0) {
          const piles = pruned
            .map((row, i) => ({ i, n: ((row && row.images) || []).length }))
            .filter((row) => row.n >= 2)
          if (piles.length === 1) splitAt = piles[0].i
        }
        if (splitAt < 0) return section
        const applyId = editId
        const target = pruned[splitAt]
        const withApply = pruned.map((row, i) =>
          i === splitAt
            ? {
                ...row,
                aiApply: {
                  id: applyId,
                  kind: 'split',
                  groups,
                },
              }
            : row,
        )
        const findings = applyInspectionSuggestion(withApply, applyId)
        if (
          findings.length === pruned.length &&
          findings[splitAt] &&
          target &&
          findings[splitAt].id === target.id
        ) {
          return section
        }
        changed = true
        expandKey = `${si}:${splitAt}`
        return {
          ...section,
          findings,
          images: this.findingImagesFromRows(findings, this.data.odometerUrl),
        }
      }
      const nextResult = String((line && line.result) || '').trim()
      const findings = list.map((row, fi) => {
        if (fi !== idx) return row
        const partName = String(row.partName || '').trim() || nextName
        const advice = String(row.advice || '').trim() || nextAdvice
        const result = String(row.result || '').trim() || nextResult
        if (
          partName === String(row.partName || '').trim() &&
          advice === String(row.advice || '').trim() &&
          result === String(row.result || '').trim()
        ) {
          return row
        }
        changed = true
        expandKey = `${si}:${fi}`
        return {
          ...row,
          partName,
          advice,
          result,
          aiApply: null,
        }
      })
      return {
        ...section,
        findings,
        images: this.findingImagesFromRows(findings, this.data.odometerUrl),
      }
    })
    if (!changed) {
      wx.showToast({ title: '没对上检测项，请刷新后再应用', icon: 'none' })
      return
    }
    if (!this._appliedInspectEditIds) this._appliedInspectEditIds = new Set()
    this._appliedInspectEditIds.add(editId)
    this.setSectionsWithFindings(
      sections,
      { autoSaveLabel: '保存中…' },
      expandKey || this.data.expandedFindingKey,
      () => {
        this.writeLocalFlowDraft()
        this.setData({
          inspectionAdvice: this.decorateInspectionAdvice(this.data.inspectionAdvice, this.data.sections),
        })
        this.commitAppliedPhotoDraft()
      },
    )
  },

  async onStartInspectionAdvice(options = {}) {
    const force = Boolean(options && options.force)
    const node =
      (this._flowNodes || []).find((row) => row && row.kind === 'inspection') || this.data.activeNode
    if (!node || !node.id || this.data.readOnly) return
    if (force) this._appliedInspectEditIds = new Set()
    if (this.data.inspectionAdvice && this.data.inspectionAdvice.isWaiting) {
      this.setData({ adviceOpen: true }, () => this.syncAdviceChrome())
      return
    }
    const findings = this.collectFindingsFromSections()
    const hasItem = findings.some(
      (row) =>
        String((row && row.partName) || '').trim() ||
        String((row && row.advice) || '').trim() ||
        (row.images && row.images.length),
    )
    if (!hasItem && !this.intakeComplaintText()) {
      this.setData({ adviceOpen: true }, () => this.syncAdviceChrome())
      wx.showToast({ title: '先写车主诉求', icon: 'none' })
      return
    }
    this.showAdviceWaiting()
    try {
      await this.persistPhotoDraft()
      await updateMerchantFlowNode(this.albumId, node.id, {
        startInspectionAdvice: true,
        forceRefresh: force,
      })
      this.setData({ adviceOpen: true }, () => this.syncAdviceChrome())
      this.resumeQuoteAssistPoll()
    } catch (e) {
      this.abortAdviceStart(e, '未能出意见')
    }
  },

  async onStartWorkAdvice(options = {}) {
    await this.startStepAdvice('startWorkAdvice', '先有报价或施工项', options)
  },

  async onStartDeliveryStepAdvice(options = {}) {
    await this.startStepAdvice('startDeliveryAdvice', '未能出意见', options)
  },

  async startStepAdvice(flag, emptyTitle, options = {}) {
    const force = Boolean(options && options.force)
    if (this.data.readOnly || this.data.confirming) return
    const node = this.data.activeNode
    if (!node || !node.id) return
    this.setData({ confirming: true })
    this.showAdviceWaiting()
    try {
      await this.persistPhotoDraft()
      const res = await updateMerchantFlowNode(this.albumId, node.id, {
        [flag]: true,
        forceRefresh: force,
      })
      this.setData({ adviceOpen: true }, () => this.syncAdviceChrome())
      this.resumeQuoteAssistPoll()
      if (res && !res.queued && !res.reuse && force) {
        wx.showToast({ title: '暂不可用', icon: 'none' })
      }
    } catch (e) {
      this.abortAdviceStart(e, emptyTitle)
    } finally {
      this.setData({ confirming: false })
    }
  },

  async onStartDeliveryAdvice() {
    if (this.data.readOnly || this.data.confirming || this.data.aiReviewBusy) return
    if (this.data.aiReview && this.data.aiReview.isWaiting) return
    if (!this._nodeAiReviewEntitled) return
    const node = this.data.activeNode
    if (!node) return
    this.setData({ confirming: true, aiReviewBusy: true, adviceOpen: true })
    try {
      const res = await updateMerchantFlowNode(this.albumId, node.id, {
        startAiReview: true,
      })
      if (res && res.nextAction === 'ai_review') {
        this.applyInlineAiReview(
          res.review,
          node.kind === 'delivery_photos' ? 'complete' : 'notify',
        )
        return
      }
    } catch (e) {
      this.abortAdviceStart(e, '未能出意见')
    } finally {
      this.setData({ confirming: false, aiReviewBusy: false })
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
      this.presentInspectionGaps(reportGaps)
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
        title: seeded || (added && added.addonSeeded) ? '补上金额' : '写下新发现和金额',
        icon: 'none',
      })
      await this.loadFlow({ silent: true })
      const addon = (this._flowNodes || []).find(
        (node) =>
          node &&
          node.kind === 'quote_confirm' &&
          node.insertedReason === 'addon' &&
          !['confirmed', 'cancelled'].includes(String((node.document && node.document.status) || '')),
      )
      this.openStage(addon ? this.bucketKeyOf(addon.id) : 'quote')
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

  onAddonDiscoveryBlur() {
    this.persistAddonDocument().catch(() => {})
  },

  onAddAddonDiscoveryImage() {
    if (this.data.readOnly || this.data.confirmAwaitingOwner) return
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
          const uploadedList = await this.uploadPickedFiles(files)
          const urls = current.concat(uploadedList.map((row) => row.url).filter(Boolean)).slice(0, 6)
          if (urls.length <= current.length) throw new Error('上传失败')
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
    if (this.data.readOnly || this.data.confirmAwaitingOwner) return
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
      wx.showToast({ title: '请上传照片', icon: 'none' })
      return
    }
    if (!note) {
      wx.showToast({ title: '请写备注', icon: 'none' })
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
        title: '返回施工',
        content: '还没发给车主，退回后接着施工。',
        confirmText: '返回施工',
        cancelText: '留下',
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
      wx.showToast({ title: '已回到施工', icon: 'none' })
      await this.loadFlow({ silent: true })
      this.openStage('work')
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '取消失败', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  async onSendForOwnerConfirm() {
    if (this.data.readOnly || this.data.confirming) return
    const sendKind = this.data.activeNode && this.data.activeNode.kind
    if (sendKind === 'quote_confirm' && !this.intakeDocumentSent()) {
      const goOn = await new Promise((resolve) => {
        wx.showModal({
          title: '入店照片还没发给车主',
          content: '仍要发送报价单吗？',
          confirmText: '继续发送',
          cancelText: '先不发',
          success: (res) => resolve(Boolean(res.confirm)),
          fail: () => resolve(false),
        })
      })
      if (!goOn) return
    }
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
    if (this.data.confirming) return
    const awaiting = Boolean(this.data.confirmAwaitingOwner)
    if (this.data.readOnly && !awaiting) return
    if (!awaiting) {
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
    if (this.data.confirming) return
    if (this.data.readOnly && !this.data.confirmAwaitingOwner) return
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
      const wasAddon =
        kind === 'addon_quote_confirm' ||
        (kind === 'quote_confirm' &&
          String((this.data.activeNode && this.data.activeNode.insertedReason) || '') === 'addon')
      await this.loadFlow({ silent: true })
      if (wasAddon || kind === 'quote_confirm') {
        const work = (this._flowNodes || []).find((node) => node && node.kind === 'work')
        this.openStage(work ? this.bucketKeyOf(work.id) : 'work')
      }
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

  async onGoHostAlbum() {
    if (!this.albumId) return
    let publicGate = this.data.publicGate
    if (!publicGate) {
      try {
        const profile = await fetchMerchantProfile()
        publicGate = profile && profile.publicGate
      } catch (_) {
        publicGate = null
      }
    }
    promptMerchantHostEntry({
      albumId: this.albumId,
      publicGate,
      hosted: this.data.hosted,
      hostVisibility: this.data.hostVisibility,
      onPublicWeb: this.data.onPublicWeb,
    })
  },

  async onCopySocialCard() {
    if (!this.albumId || this._socialOpening) return
    this._socialOpening = true
    this.setData({
      socialVisible: true,
      socialLoading: true,
      socialPlatforms: [],
      socialImages: [],
      socialText: '',
      socialSaveDisabled: true,
    })
    try {
      const payload = await fetchMerchantSocialCards(this.albumId)
      applySocialPayload(this, payload, '打码完成后可保存')
    } catch (e) {
      this.setData({ socialVisible: false, socialLoading: false })
      wx.showToast({ title: (e && e.message) || '暂时准备不好', icon: 'none' })
    } finally {
      this._socialOpening = false
    }
  },

  async onRefreshSocial() {
    if (!this.albumId || this._socialOpening) return
    this._socialOpening = true
    this.setData({ socialRefreshing: true })
    try {
      const payload = await fetchMerchantSocialCards(this.albumId, { refresh: true })
      applySocialPayload(this, payload, '打码完成后可保存')
    } catch (e) {
      this.setData({ socialRefreshing: false })
      wx.showToast({ title: (e && e.message) || '暂时准备不好', icon: 'none' })
    } finally {
      this._socialOpening = false
    }
  },

  onCloseSocial() {
    this.setData({ socialVisible: false })
  },

  onSocialPlatform(e) {
    switchSocialPlatform(this, e.detail && e.detail.id)
  },

  onSocialToggle(e) {
    toggleSocialImage(this, e.detail && e.detail.id)
  },

  onSocialText(e) {
    rememberSocialText(this, e.detail && e.detail.value)
  },

  onSocialCaption(e) {
    rememberSocialCaption(this, e.detail && e.detail.value)
  },

  onCopySocial() {
    copyCurrentSocialText(this)
  },

  onSaveSocial() {
    saveCurrentSocialImages(this)
  },
})
