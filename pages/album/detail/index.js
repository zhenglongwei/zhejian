const {
  fetchServiceAlbum,
  prepareServiceAuthorizePreview,
  submitServiceAlbumAuthorization,
  recordAlbumShare,
  withdrawAuthorization,
  blockPublicCase,
  takedownPublicCase,
} = require('../../../services/service-album')
const {
  enrichServiceAlbumListItem,
  isRepairCompleted,
  buildAlbumGateBanner,
  buildGateActionButtons,
} = require('../../../utils/service-album-display')
const { runGateUserAction } = require('../../../utils/album-gate-actions')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')
const { promptAuthorizeAuditSubscribe, promptAlbumProgressSubscribe } = require('../../../utils/subscribe-message-prompt')
const {
  buildShareableCaseFromAlbum,
  copyPublicCaseWebLink,
} = require('../../../utils/case-share')
const {
  canOwnerShareAlbum,
  buildOwnerSharePayload,
  copyOwnerShareH5Link,
  SHARE_MODE,
  SHARE_CHANNEL,
} = require('../../../utils/album-owner-share')
const { ORIGINAL_SHARE_RISK } = require('../../../constants/album-share')
const { inviteUiFieldsFromDetail } = require('../../../utils/album-auth-share-handlers')
const { AUTH_ACTION_LABEL, AUTH_CONFIRM_TEXT, AUTH_REJECT_TEXT, AUTH_SHEET_TITLE, CONTROL_LINE, CONSENT_CHECKBOX } = require('../../../utils/publish-thank-you')
const { AUTHORIZATION_CONSENT } = require('../../../constants/compliance-copy')
const {
  resolvePublishSheetState,
  publishHintForState,
} = require('../../../utils/album-share-state')
const {
  resolvePageShareContext,
  markShareStoreContext,
  withStoreContextPath,
  TOOL_HOME_PATH,
} = require('../../../utils/share-store-context')
const { markAlbumSeen } = require('../../../utils/album-unread-hint')
const { fetchAlbumPartVerifyContext } = require('../../../services/album-part-verify')
const { fetchAlbumReviewContext } = require('../../../services/album-review')
const { buildAlbumFlipPages } = require('../../../utils/album-flip-pages')
const {
  findWarrantyEvidenceItem,
  formatWarrantyCommitmentText,
  normalizeImageEntries,
  hasWarrantyCommitment,
} = require('../../../utils/album-evidence-items')
const { SERVICE_ALBUM_STAGES } = require('../../../constants/service-album-stages')
const {
  shouldShowAlbumReviewNudge,
  recordAlbumReviewVisit,
  dismissAlbumReviewNudge,
  clearAlbumReviewNudge,
} = require('../../../utils/album-review-nudge')
const {
  REVIEW_DOCK_LABEL,
  REVIEW_NUDGE_TEXT,
} = require('../../../utils/publish-thank-you')

function getWindowMetrics() {
  try {
    return typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
  } catch (err) {
    return { windowWidth: 375, windowHeight: 667, statusBarHeight: 20, screenHeight: 667, safeArea: null }
  }
}

function resolveToolbarBottomPadPx() {
  try {
    const win = getWindowMetrics()
    const screenHeight = win.screenHeight || win.windowHeight || 667
    const safeBottom = (win.safeArea && win.safeArea.bottom) || screenHeight
    const inset = Math.max(screenHeight - safeBottom, 0)
    return Math.max(inset, 34) + 12
  } catch (err) {
    return 46
  }
}

function measureImmersiveLayout() {
  const win = getWindowMetrics()
  const windowHeight = Math.floor(win.windowHeight || win.screenHeight || 667)
  const toolbarBottomPadPx = resolveToolbarBottomPadPx()
  return {
    viewerHeightPx: windowHeight,
    toolbarBottomPadPx,
  }
}

const PUBLIC_CASE_HINT = {
  user_rejected: '已按你的意思，这条不会放到店页。',
  pending_review: '门店案例审核中，通过后会出现在店页。',
  public_approved: '打码说明已在店页。没有车牌和人脸。不合适随时能撤。',
  need_modify: '请按提示处理后重新发布。',
}

const HONOR_HINT = '可发给微信好友或朋友圈；发给微信不会自动进店页。'

function buildStageProgress(chapters, activeNodeId) {
  const chapterByNode = {}
  ;(chapters || []).forEach((c) => {
    if (c && c.nodeId) chapterByNode[c.nodeId] = c
  })
  return SERVICE_ALBUM_STAGES.map((stage) => {
    const chapter = chapterByNode[stage.id]
    return {
      id: stage.id,
      title: stage.title,
      filled: Boolean(chapter),
      active: activeNodeId === stage.id,
      startIndex: chapter ? chapter.startIndex : 0,
    }
  })
}

function resolveActiveStageTitle(chapters, activeNodeId) {
  const chapter = (chapters || []).find((c) => c.nodeId === activeNodeId)
  if (chapter && chapter.title) return chapter.title
  const stage = SERVICE_ALBUM_STAGES.find((s) => s.id === activeNodeId)
  return (stage && stage.title) || ''
}

function resolveActiveStageNote(detail, activeNodeId, flipPages, pageIndex) {
  const index = Number(pageIndex) || 0
  const page = (flipPages || [])[index]
  if (page) {
    const fromPage = String(page.note || page.caption || '').trim()
    if (fromPage) return fromPage
  }

  const nodeId =
    activeNodeId || (page && (page.nodeId || page.id)) || ''
  const nodes = (detail && detail.nodes) || []
  if (nodeId) {
    const node = nodes.find(
      (item) => item && (item.id === nodeId || item.nodeId === nodeId),
    )
    if (node) {
      const fromNode = String(node.note || '').trim()
      if (fromNode) return fromNode
    }
  }

  if (page && page.nodeTitle) {
    const title = String(page.nodeTitle).trim()
    const node = nodes.find(
      (item) => item && String(item.title || '').trim() === title,
    )
    if (node) {
      const fromNode = String(node.note || '').trim()
      if (fromNode) return fromNode
    }
  }

  const storeNote = detail && String(detail.storeNote || '').trim()
  if (storeNote) return storeNote

  return ''
}

/** 无软清单时：按节点过程图做简易阅读卡（非全屏翻页） */
function buildLegacyProcessCards(nodes = []) {
  return (nodes || [])
    .map((node) => {
      const stageId = String((node && (node.id || node.nodeId)) || '').trim()
      const title = String((node && node.title) || '').trim() || stageId || '过程'
      const images = ((node && node.images) || [])
        .map((img) => {
          if (typeof img === 'string') {
            const url = img.trim()
            return url ? { url, caption: '' } : null
          }
          const url = String((img && (img.url || img.rawUrl || img.src)) || '').trim()
          if (!url) return null
          return {
            url,
            caption: String((img && img.caption) || '').trim(),
          }
        })
        .filter(Boolean)
      const note = String((node && node.note) || '').trim()
      if (!images.length && !note) return null
      return {
        cardKey: stageId || title,
        title,
        deferredByOwner: false,
        sections: [
          {
            itemKey: stageId || title,
            label: title,
            outcome: '',
            outcomeLabel: '',
            note,
            deferNote: '',
            deferredByOwner: false,
            followUpLabel: '',
            stageGroups: images.length
              ? [
                  {
                    stageId: stageId || 'process',
                    stageTitle: title,
                    images,
                  },
                ]
              : [],
          },
        ],
      }
    })
    .filter(Boolean)
}

function buildNodeNoteMap(nodes) {
  const map = {}
  ;(nodes || []).forEach((node) => {
    const note = String((node && node.note) || '').trim()
    if (!note) return
    const id = node && (node.id || node.nodeId)
    const title = String((node && node.title) || '').trim()
    if (id) map[id] = note
    if (title) map[`title:${title}`] = note
  })
  return map
}

function buildEndPageActionState(detail, showAuthSection) {
  const {
    PREVIEW_LABEL,
    CONTROL_LINE,
    canShowPublishInvite,
    buildPublishInviteCopy,
  } = require('../../../utils/publish-thank-you')
  const status = (detail && detail.publicCaseStatus) || 'private'
  const gateBanner = buildAlbumGateBanner(detail || {})
  const gateActions = buildGateActionButtons(detail || {})
  const invite = buildPublishInviteCopy({
    albumId: detail && (detail.albumId || detail.id),
    vehicleLabel: detail && detail.vehicleDisplay,
    serviceName: detail && detail.serviceName,
  })
  const showInvite = canShowPublishInvite(detail || {}) && showAuthSection

  const inviteFields = showInvite || status === 'need_modify'
    ? {
        endPageInvitePitch: invite.pitch,
        endPageInviteEyebrow: invite.officerTitle
          ? `诚邀 · ${invite.officerTitle}`
          : '诚邀分享这份维修记录',
        endPageControlLine: CONTROL_LINE,
      }
    : {
        endPageInvitePitch: '',
        endPageInviteEyebrow: '',
        endPageControlLine: '',
      }

  const canWithdraw =
    detail &&
    (detail.canWithdraw === true ||
      ((detail.isAuthorized === true || detail.authorizationStatus === 'authorized') &&
        (status === 'public_approved' || status === 'need_modify')))

  if (status === 'pending_review') {
    // 平台案例审中：相册可看；不展示发布/撤回
    return {
      endPageInvitePitch: '',
      endPageInviteEyebrow: '',
      endPageControlLine: '',
      endPageShowPreview: false,
      endPagePreviewLabel: PREVIEW_LABEL,
      endPagePreviewDisabled: false,
      endPagePreviewHint: '',
      endPageShowWithdraw: false,
      endPageWithdrawLabel: '从店页撤下',
      endPageStatusHint: gateBanner || PUBLIC_CASE_HINT.pending_review,
      endPageGateActions: gateActions,
    }
  }
  if (status === 'public_approved') {
    return {
      endPageInvitePitch: '',
      endPageInviteEyebrow: '',
      endPageControlLine: '',
      endPageShowPreview: false,
      endPagePreviewLabel: PREVIEW_LABEL,
      endPagePreviewDisabled: false,
      endPagePreviewHint: '',
      endPageShowWithdraw: Boolean(canWithdraw),
      endPageWithdrawLabel: '从店页撤下',
      endPageStatusHint: gateBanner || PUBLIC_CASE_HINT.public_approved,
      endPageGateActions: gateActions,
    }
  }
  if (status === 'need_modify') {
    return {
      ...inviteFields,
      endPageShowPreview: true,
      endPagePreviewLabel: PREVIEW_LABEL,
      endPagePreviewDisabled: false,
      endPagePreviewHint: '',
      endPageShowWithdraw: Boolean(canWithdraw),
      endPageWithdrawLabel: '从店页撤下',
      endPageStatusHint: gateBanner || PUBLIC_CASE_HINT.need_modify,
      endPageGateActions: gateActions,
    }
  }
  // 尾页保持简洁（本册已阅 + 状态提示 + 评价），不叠「体验官」邀请大卡；
  // 发布入口在分享面板 / 列表，见 canAuthorizePublicCase。
  if (showInvite) {
    return {
      endPageInvitePitch: '',
      endPageInviteEyebrow: '',
      endPageControlLine: '',
      endPageShowPreview: false,
      endPagePreviewLabel: PREVIEW_LABEL,
      endPagePreviewDisabled: false,
      endPagePreviewHint: '',
      endPageShowWithdraw: false,
      endPageWithdrawLabel: '从店页撤下',
      endPageStatusHint:
        gateBanner ||
        (detail && detail.userConfirmHint) ||
        '',
      endPageGateActions: gateActions,
    }
  }
  return {
    endPageInvitePitch: '',
    endPageInviteEyebrow: '',
    endPageControlLine: '',
    endPageShowPreview: false,
    endPagePreviewLabel: PREVIEW_LABEL,
    endPagePreviewDisabled: false,
    endPagePreviewHint: '',
    endPageShowWithdraw: false,
    endPageWithdrawLabel: '从店页撤下',
    endPageStatusHint:
      gateBanner ||
      (status === 'user_rejected' ? PUBLIC_CASE_HINT.user_rejected : ''),
    endPageGateActions: gateActions,
  }
}

Page({
  data: {
    albumId: '',
    status: 'loading',
    errorMessage: '',
    detail: null,
    showAuthSection: false,
    showShareEntry: false,
    showShareButton: false,
    showPublicCaseShare: false,
    shareSheetVisible: false,
    shareReady: false,
    shareUseOriginal: false,
    sharePreparing: false,
    shareToken: '',
    shareMode: SHARE_MODE.DESENSITIZED,
    defaultShareIntent: 'owner',
    authChecked: false,
    authTier: 'named',
    authSubmitting: false,
    authSheetVisible: false,
    authSheetTitle: AUTH_SHEET_TITLE,
    authPitch: '',
    authBenefitLine: '',
    authControlLine: CONTROL_LINE,
    authDisclaimer: '',
    authConsentText: CONSENT_CHECKBOX,
    authConfirmText: AUTH_CONFIRM_TEXT,
    authRejectText: AUTH_REJECT_TEXT,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    flipPages: [],
    flipChapters: [],
    pageIndex: 0,
    activeNodeId: '',
    storePhone: '',
    endPageInvitePitch: '',
    endPageInviteEyebrow: '',
    endPageControlLine: CONTROL_LINE,
    endPageShowPreview: false,
    endPagePreviewLabel: '预览脱敏案例',
    endPagePreviewDisabled: false,
    endPagePreviewHint: '',
    endPageShowWithdraw: false,
    endPageWithdrawLabel: '从店页撤下',
    endPageStatusHint: '',
    endPageGateActions: [],
    withdrawSheetLoading: false,
    shareSheetIntent: 'owner',
    shareHonorHint: HONOR_HINT,
    publishSheetState: 'idle',
    publishSheetDisabled: false,
    showPublishSection: false,
    publishSheetHint: '',
    compliancePendingHint: '',
    showCompliancePending: false,
    shareActionsDisabled: false,
    viewerHeightPx: 0,
    progressPercent: 0,
    navTone: 'light',
    chromeVisible: false,
    isEndPage: false,
    stageProgress: [],
    activeStageTitle: '',
    activeStageNote: '',
    nodeNoteMap: {},
    navSafeTopPx: 0,
    toolbarBottomPadPx: 0,
    showEvaluateEntry: false,
    pendingOwnerReview: false,
    hasOwnerReview: false,
    showReviewNudge: false,
    reviewDockLabel: REVIEW_DOCK_LABEL,
    viewMode: 'checklist',
    hasWorkChecklist: false,
    workChecklistCategoryLabel: '',
    workChecklistItems: [],
    workChecklistCards: [],
    warrantyText: '',
    warrantyImages: [],
    reviewNudgeText: REVIEW_NUDGE_TEXT,
  },

  onLoad(options) {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    if (options.token) {
      wx.redirectTo({
        url: `/pages/album/share/index?token=${encodeURIComponent(options.token)}`,
      })
      return
    }
    this.albumId = options.albumId || options.id || ''
    this.fromMerchantShare = options.from === 'merchant_share'
    this.rightsToken = options.rightsToken || ''
    this.setData({ albumId: this.albumId })
    resolvePageShareContext(options, {
      albumId: this.albumId,
      source: this.fromMerchantShare ? 'merchant_share' : 'album_detail',
      autoIsolate: Boolean(this.albumId),
    })
    if (options.redirectCaseId) {
      wx.redirectTo({
        url: withStoreContextPath(
          `/pages/case/detail/index?id=${encodeURIComponent(options.redirectCaseId)}`,
          { storeId: options.storeId, isolated: this.fromMerchantShare }
        ),
      })
      return
    }
    if (!this.albumId) {
      this.setData({
        status: 'error',
        errorMessage: '相册不存在或已被删除。',
      })
      return
    }
    this.loadAlbum()
  },

  onShow() {
    this.scheduleViewerLayout()
  },

  scheduleViewerLayout() {
    wx.nextTick(() => {
      setTimeout(() => {
        this.measureViewerLayout()
      }, 48)
    })
  },

  measureViewerLayout() {
    const layout = measureImmersiveLayout()
    const patch = {
      viewerHeightPx: layout.viewerHeightPx,
      toolbarBottomPadPx: layout.toolbarBottomPadPx,
    }
    if (
      patch.viewerHeightPx !== this.data.viewerHeightPx ||
      patch.toolbarBottomPadPx !== this.data.toolbarBottomPadPx
    ) {
      this.setData(patch)
    }
  },

  fallbackViewerLayout() {
    this.measureViewerLayout()
  },

  syncPageDisplay(pageIndex, total) {
    const index = Number(pageIndex) || 0
    const count = Number(total) || 0
    const navTone = count > 0 && index >= count - 1 ? 'dark' : 'light'
    const progressPercent = count > 1 ? Math.round(((index + 1) / count) * 100) : 0
    this.setData({
      progressPercent,
      navTone,
    })
  },

  syncStageProgress(chapters, activeNodeId, pageIndex, detailOverride) {
    const index =
      pageIndex !== undefined && pageIndex !== null
        ? Number(pageIndex) || 0
        : Number(this.data.pageIndex) || 0
    const flipPages = this.data.flipPages || []
    const nodeId =
      activeNodeId ||
      (flipPages[index] && flipPages[index].nodeId) ||
      ''
    const detail = detailOverride || this.data.detail
    const nodeNoteMap = detailOverride
      ? buildNodeNoteMap((detailOverride.nodes) || [])
      : this.data.nodeNoteMap || {}
    const activeTitle = resolveActiveStageTitle(chapters, nodeId)
    const activeStageNote =
      resolveActiveStageNote(detail, nodeId, flipPages, index) ||
      nodeNoteMap[nodeId] ||
      nodeNoteMap[`title:${activeTitle}`] ||
      ''
    this.setData({
      stageProgress: buildStageProgress(chapters, nodeId),
      activeStageTitle: activeTitle,
      activeStageNote,
    })
  },

  onToggleChrome() {
    if (this.data.isEndPage) return
    const nextVisible = !this.data.chromeVisible
    this.setData({ chromeVisible: nextVisible }, () => {
      if (nextVisible) {
        this.syncStageProgress(
          this.data.flipChapters,
          this.data.activeNodeId,
          this.data.pageIndex,
        )
      }
    })
  },

  onReady() {
    this.fallbackViewerLayout()
    this.scheduleViewerLayout()
    this.setData({ toolbarBottomPadPx: resolveToolbarBottomPadPx() })
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      this.setData({ navSafeTopPx: menu.top + menu.height + 6 })
    } catch (err) {
      const win = getWindowMetrics()
      this.setData({ navSafeTopPx: (win.statusBarHeight || 20) + 44 })
    }
  },

  guardAccess() {
    const shareHint = this.fromMerchantShare ? '门店分享的服务相册' : '服务相册'
    if (!isLoggedIn()) {
      this.setData({
        status: 'error',
        errorMessage: `请先登录后查看${shareHint}。`,
        loginSheetVisible: true,
        loginSheetMode: 'login',
      })
      return false
    }
    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        status: 'error',
        errorMessage: `请先绑定手机号后查看${shareHint}。`,
        loginSheetVisible: true,
        loginSheetMode: 'bindPhone',
      })
      return false
    }
    return true
  },

  async loadAlbum() {
    if (!this.guardAccess()) return

    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchServiceAlbum(this.albumId)
      const imageCount = detail.imageCount || 0
      const pageStatus = imageCount > 0 ? 'normal' : 'empty'
      const showAuthSection = this.shouldShowAuth(detail)
      const showShareEntry = canOwnerShareAlbum(detail)
      const shareCase = buildShareableCaseFromAlbum(detail)
      const showPublicCaseShare =
        detail.publicCaseStatus === 'public_approved' && Boolean(shareCase && shareCase.id)
      const publishSheetState = resolvePublishSheetState(detail)
      const showShareButton =
        isRepairCompleted(detail.status) &&
        (showShareEntry ||
          showPublicCaseShare ||
          showAuthSection ||
          publishSheetState === 'pending' ||
          publishSheetState === 'need_modify' ||
          publishSheetState === 'approved')
      const defaultShareIntent = showShareEntry ? 'owner' : 'publicCase'
      const shareSheetIntent = defaultShareIntent
      const shareActionsDisabled = showShareEntry
      const enriched = enrichServiceAlbumListItem({
        ...detail,
        id: detail.albumId,
      })
      const flip = buildAlbumFlipPages({
        nodes: enriched.nodes || [],
        evidenceItems: enriched.evidenceItems || [],
        parts: enriched.parts || [],
        templateId: enriched.templateId || '',
      })
      const endPageAuth = buildEndPageActionState(enriched, showAuthSection)
      const publishSheetHint = publishHintForState(publishSheetState)
      const publishSheetDisabled = true
      const showPublishSection =
        publishSheetState === 'approved' || publishSheetState === 'blocked'
      const compliancePendingHint = String(enriched.compliancePendingHint || '').trim()
      const showCompliancePending =
        Boolean(compliancePendingHint) &&
        isRepairCompleted(enriched.status) &&
        enriched.complianceStatus !== 'passed' &&
        enriched.complianceStatus !== 'rejected'
      const storePhone = (enriched.store && enriched.store.phone) || ''
      const linkedStoreId =
        (detail.store && detail.store.id) ||
        detail.storeId ||
        (enriched.store && enriched.store.id) ||
        ''
      const linkedStoreName =
        (detail.store && detail.store.name) ||
        detail.storeName ||
        (enriched.store && enriched.store.name) ||
        ''
      const linkedStoreSubtitle = detail.serviceName || enriched.serviceName || ''
      const showStoreBrowse = Boolean(linkedStoreId)

      let pendingOwnerReview = false
      let hasOwnerReview = false
      if (checkAuth().ok) {
        try {
          const reviewCtx = await fetchAlbumReviewContext(this.albumId)
          hasOwnerReview = Boolean(reviewCtx.review && reviewCtx.review.id)
          pendingOwnerReview = Boolean(reviewCtx.eligible) && !hasOwnerReview
          if (hasOwnerReview) {
            clearAlbumReviewNudge(this.albumId)
          }
        } catch (err) {
          // ignore
        }
      }
      // 评价仅页底 album-end-page 入口
      const showEvaluateEntry = false
      const showReviewNudge = false

      const workRaw = (detail && detail.workChecklist) || (enriched && enriched.workChecklist) || null
      const workItems = ((workRaw && workRaw.items) || []).map((it) => ({
        ...it,
        images: (it.images || [])
          .map((img) => ({
            ...img,
            url: String((img && (img.url || img.rawUrl || img.src)) || '').trim(),
          }))
          .filter((img) => img.url),
      }))
      const workCards = ((workRaw && workRaw.cards) || []).map((card) => {
        const mapStageGroups = (groups) =>
          ((groups || []) || []).map((stage) => ({
            ...stage,
            images: ((stage && stage.images) || [])
              .map((img) => ({
                ...img,
                url: String((img && (img.url || img.rawUrl || img.src)) || '').trim(),
              }))
              .filter((img) => img.url),
          }))
        if (Array.isArray(card.stageGroups) && card.stageGroups.length) {
          return {
            ...card,
            stageGroups: mapStageGroups(card.stageGroups),
            sections: ((card && card.sections) || []).map((section) => ({
              ...section,
              stageGroups: mapStageGroups(section.stageGroups),
            })),
          }
        }
        return {
          ...card,
          sections: ((card && card.sections) || []).map((section) => ({
            ...section,
            stageGroups: mapStageGroups(section.stageGroups),
          })),
        }
      })
      const warrantyItem = findWarrantyEvidenceItem(
        (enriched && enriched.evidenceItems) || (detail && detail.evidenceItems) || [],
      )
      const warrantyText = formatWarrantyCommitmentText(warrantyItem || {})
      const warrantyImages = normalizeImageEntries((warrantyItem && warrantyItem.images) || [])
      const hasWarranty = hasWarrantyCommitment(warrantyItem || {})
      const legacyCards =
        workCards.length > 0 ? [] : buildLegacyProcessCards((enriched && enriched.nodes) || [])
      const displayCards = workCards.length > 0 ? workCards : legacyCards
      const hasWorkChecklist =
        displayCards.length > 0 || workItems.length > 0 || hasWarranty
      const viewMode = 'checklist'

      this.setData({
        detail: enriched,
        flipPages: flip.pages,
        flipChapters: flip.chapters,
        nodeNoteMap: buildNodeNoteMap(enriched.nodes || []),
        storePhone,
        showEvaluateEntry,
        pendingOwnerReview,
        hasOwnerReview,
        showReviewNudge,
        pageIndex: 0,
        activeNodeId: (flip.chapters[0] && flip.chapters[0].nodeId) || '',
        showAuthSection,
        showShareEntry,
        showShareButton,
        showPublicCaseShare,
        defaultShareIntent,
        shareSheetIntent,
        shareActionsDisabled,
        publishSheetState,
        publishSheetHint,
        publishSheetDisabled,
        showPublishSection,
        compliancePendingHint,
        showCompliancePending,
        shareHonorHint: HONOR_HINT,
        authChecked: false,
        authSheetVisible: false,
        status: pageStatus,
        shareReady: false,
        shareToken: '',
        shareSheetVisible: false,
        chromeVisible: false,
        viewMode,
        hasWorkChecklist,
        workChecklistCategoryLabel: (workRaw && workRaw.categoryLabel) || '',
        workChecklistItems: workItems,
        workChecklistCards: displayCards,
        warrantyText,
        warrantyImages,
        ...endPageAuth,
        ...inviteUiFieldsFromDetail(enriched),
      }, () => {
        this.setData({ toolbarBottomPadPx: resolveToolbarBottomPadPx() })
      })

      if (linkedStoreId) {
        markShareStoreContext({
          storeId: linkedStoreId,
          albumId: this.albumId,
          source: this.fromMerchantShare ? 'merchant_share' : 'album_detail',
        })
      }
      markAlbumSeen(this.albumId, detail.updatedAt || enriched.updatedAt)

      if (showShareEntry) {
        await this.refreshShareToken({ silent: true, defaultShareIntent })
      } else {
        this.updateShareMenu(showPublicCaseShare)
      }

      if (pageStatus === 'normal' && !isRepairCompleted(enriched.status)) {
        setTimeout(() => {
          promptAlbumProgressSubscribe(this.albumId)
        }, 480)
      }
    } catch (e) {
      const code = e && e.code
      let message = (e && e.message) || '加载失败'
      if (code === 403) {
        message =
          (e && e.message) ||
          '仅关联车主可查看，请确认登录手机号与门店登记一致'
      }
      if (code === 401) message = '请先登录后查看服务相册。'
      this.setData({
        status: 'error',
        errorMessage: message,
        detail: null,
      })
    }
  },

  shouldShowAuth(detail) {
    if (!detail) return false
    // 发布入口仍须案例审通过；相册详情本身已全程可进
    if (detail.complianceStatus && detail.complianceStatus !== 'passed') return false
    if (
      detail.canAuthorizePublicCase === false ||
      detail.publicCaseScorePass === false ||
      detail.publicCaseQualityReady === false
    ) {
      return false
    }
    if (!isRepairCompleted(detail.status)) return false
    const status = detail.publicCaseStatus
    return (
      status === 'private' ||
      status === 'review_passed' ||
      status === 'authorization_pending' ||
      status === 'user_rejected'
    )
  },

  buildShareRawConsent(albumId) {
    return [
      {
        authType: AUTHORIZATION_CONSENT.share_raw.authType,
        authTextVersion: AUTHORIZATION_CONSENT.share_raw.version,
        authTextSnapshot: AUTHORIZATION_CONSENT.share_raw.text,
        businessId: albumId,
      },
    ]
  },

  buildSharePayload(albumId, channel) {
    return { mode: SHARE_MODE.DESENSITIZED, channel }
  },

  async refreshShareToken(options = {}) {
    const { detail } = this.data
    const defaultShareIntent =
      options.defaultShareIntent || this.data.defaultShareIntent || 'owner'
    const channel = options.channel || SHARE_CHANNEL.WECHAT

    if (!detail || !canOwnerShareAlbum(detail)) {
      this.updateShareMenu(defaultShareIntent === 'publicCase')
      return null
    }

    const mode = SHARE_MODE.DESENSITIZED
    if (!options.silent) {
      this.setData({ sharePreparing: true, shareReady: false, shareActionsDisabled: true })
    }

    try {
      const result = await recordAlbumShare(
        detail.albumId,
        this.buildSharePayload(detail.albumId, channel)
      )
      const ready = Boolean(result.shareToken)
      this.setData({
        shareToken: result.shareToken || '',
        shareMode: result.mode || mode,
        shareReady: ready,
        sharePreparing: false,
        shareActionsDisabled: !ready,
      })
      this.updateShareMenu(
        Boolean(result.shareToken) || defaultShareIntent === 'publicCase'
      )
      return result
    } catch (e) {
      this.setData({
        sharePreparing: false,
        shareReady: false,
        shareToken: '',
        shareActionsDisabled: true,
      })
      this.updateShareMenu(defaultShareIntent === 'publicCase')
      if (!options.silent) {
        wx.showToast({
          title: (e && e.message) || '分享准备失败',
          icon: 'none',
        })
      }
      return null
    }
  },

  async onOpenShareSheet() {
    if (!this.data.showShareButton) return
    const detail = this.data.detail || {}
    const publishSheetState = resolvePublishSheetState(detail)
    this.setData({
      shareSheetVisible: true,
      publishSheetState,
      publishSheetDisabled: true,
      showPublishSection:
        publishSheetState === 'approved' || publishSheetState === 'blocked',
      publishSheetHint: publishHintForState(publishSheetState),
    })
    if (this.data.showShareEntry && !this.data.shareReady && !this.data.sharePreparing) {
      await this.refreshShareToken({ silent: true })
    }
  },

  onCloseShareSheet() {
    this.setData({ shareSheetVisible: false })
  },

  onSharePublish() {
    return
  },

  onBlockPublic() {
    this.setData({ shareSheetVisible: false })
    wx.showModal({
      title: '先不要公开',
      content: '相册还在，只有你和门店能看。不会放到店页。',
      confirmText: '先不公开',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await blockPublicCase(this.albumId, this.rightsToken || '')
          wx.showToast({ title: '好的，不会公开', icon: 'success' })
          this.loadAlbum()
        } catch (e) {
          wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
        }
      },
    })
  },

  onTakedownPublic() {
    this.setData({ shareSheetVisible: false })
    wx.showModal({
      title: '从店页撤下',
      content: '撤下后店页不再展示。相册还在，门店不能改图再发一版。',
      confirmText: '撤下来',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await takedownPublicCase(this.albumId, this.rightsToken || '')
          wx.showToast({ title: '已从店页撤下', icon: 'success' })
          this.loadAlbum()
        } catch (e) {
          wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
        }
      },
    })
  },

  enterFlipMode() {
    // 全屏翻页已下线；保留空实现以免旧调用报错
  },

  onEnterFlipFromChecklist() {},

  onBackToWorkChecklist() {},

  onWorkChecklistOpenFlip() {},

  onPageChange(e) {
    const { index, page, total } = e.detail || {}
    const isEnd = page && page.type === 'end'
    const patch = {
      pageIndex: index,
      isEndPage: isEnd,
    }
    if (page && page.type === 'photo' && page.nodeId) {
      patch.activeNodeId = page.nodeId
    }
    if (isEnd) {
      patch.chromeVisible = true
    } else if (this.data.isEndPage) {
      patch.chromeVisible = false
    }
    this.setData(patch, () => {
      this.syncPageDisplay(index, total || this.data.flipPages.length + 1)
      this.syncStageProgress(
        this.data.flipChapters,
        patch.activeNodeId || this.data.activeNodeId,
        index,
      )
    })
  },

  onChapterTap(e) {
    const { startIndex, nodeId } = e.detail || {}
    const total = this.data.flipPages.length + (this.data.flipPages.length > 0 ? 1 : 0)
    const nextIndex = Number(startIndex) || 0
    this.setData(
      {
        pageIndex: nextIndex,
        activeNodeId: nodeId || '',
        isEndPage: false,
        chromeVisible: false,
      },
      () => {
        this.syncPageDisplay(nextIndex, total)
        this.syncStageProgress(this.data.flipChapters, nodeId || '', nextIndex)
      },
    )
  },

  onProgressSegmentTap(e) {
    const { nodeId, startIndex } = e.currentTarget.dataset
    if (!nodeId) return
    this.onChapterTap({
      detail: {
        nodeId,
        startIndex: Number(startIndex) || 0,
      },
    })
  },

  jumpToAlbumPart(part) {
    if (!part) return
    const chapters = this.data.flipChapters || []
    let targetChapter = chapters.find((c) => c && c.nodeId === 'stage_4')
    if (!targetChapter && part.thumbUrl) {
      const flipPages = this.data.flipPages || []
      const pageIdx = flipPages.findIndex(
        (page) => page && page.imageUrl === part.thumbUrl,
      )
      if (pageIdx >= 0) {
        this.onChapterTap({
          detail: { startIndex: pageIdx, nodeId: flipPages[pageIdx].nodeId },
        })
        return
      }
    }
    if (targetChapter) {
      this.onChapterTap({
        detail: {
          startIndex: targetChapter.startIndex,
          nodeId: targetChapter.nodeId,
        },
      })
    }
  },

  onOpenInspect() {
    if (!this.albumId) return
    const focusStageId = this.data.activeNodeId || ''
    const query = [
      `albumId=${this.albumId}`,
      focusStageId ? `focusStageId=${focusStageId}` : '',
      'triggerContext=album_detail',
    ]
      .filter(Boolean)
      .join('&')
    wx.navigateTo({
      url: `/pages/album/inspect/index?${query}`,
      events: {
        jumptopart: ({ index } = {}) => {
          const parts = (this.data.detail && this.data.detail.parts) || []
          this.jumpToAlbumPart(parts[Number(index) || 0])
        },
      },
    })
  },

  onUnload() {
  },

  onEndPagePreview() {
    if (this.data.endPagePreviewDisabled) return
    this.openAuthorizePreview()
  },

  onEndPageWithdraw() {
    if (this.data.withdrawSheetLoading) return
    this.setData({ withdrawSheetVisible: true })
  },

  onWithdrawSheetClose() {
    if (this.data.withdrawSheetLoading) return
    this.setData({ withdrawSheetVisible: false })
  },

  onWithdrawSheetConfirm() {
    if (this.data.withdrawSheetLoading) return
    this.setData({ withdrawSheetVisible: false, withdrawSheetLoading: true })
    this.doWithdrawAuthorization()
  },

  async doWithdrawAuthorization() {
    const albumId = this.albumId
    if (!albumId) return
    try {
      await withdrawAuthorization(albumId)
      wx.showToast({ title: '已撤回发布', icon: 'success' })
      await this.loadAlbum()
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || '撤回失败',
        icon: 'none',
      })
    } finally {
      this.setData({ withdrawSheetLoading: false })
    }
  },

  onCloseAuthSheet() {
    this.setData({ authSheetVisible: false })
  },

  onEndPageFeedback(e) {
    this.goEngagePage()
  },

  onOpenEngage() {
    this.goEngagePage()
  },

  onDismissReviewNudge() {
    dismissAlbumReviewNudge(this.albumId)
    this.setData({ showReviewNudge: false })
  },

  onEndPageGateAction(e) {
    const key = e.detail && e.detail.key
    if (!key) return
    runGateUserAction(this, key, this.data.detail || {})
  },

  onRetry() {
    this.loadAlbum()
  },

  onShareTimelineGuide(e) {
    const intent = (e.detail && e.detail.intent) || 'owner'
    this.setData({
      shareSheetVisible: false,
      defaultShareIntent: intent === 'publicCase' ? 'publicCase' : 'owner',
      shareSheetIntent: intent === 'publicCase' ? 'publicCase' : 'owner',
    })
    wx.showModal({
      title: '分享到朋友圈',
      content: '内容已准备好。请点击右上角 ···，选择「分享到朋友圈」。',
      showCancel: false,
      confirmText: '知道了',
    })
  },

  onShareOriginalToggle() {},

  async onCopyOwnerShareLink() {
    if (this.data.sharePreparing) return
    let token = this.data.shareToken
    if (!token) {
      const result = await this.refreshShareToken({
        channel: SHARE_CHANNEL.OWNER_H5_LINK,
      })
      token = (result && result.shareToken) || this.data.shareToken
    } else {
      await recordAlbumShare(
        this.data.detail.albumId,
        this.buildSharePayload(
          this.data.detail.albumId,
          this.data.shareMode,
          SHARE_CHANNEL.OWNER_H5_LINK
        )
      )
    }
    if (!token) {
      wx.showToast({ title: '分享尚未就绪，请稍后再试', icon: 'none' })
      return
    }
    try {
      await copyOwnerShareH5Link(token, this.data.detail, { mode: this.data.shareMode })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
    }
  },

  async onCopyPublicWebLink() {
    if (this.data.publishSheetState !== 'approved' && !this.data.showPublicCaseShare) {
      wx.showToast({ title: '发布通过后可复制公开链接', icon: 'none' })
      return
    }
    const shareCase = buildShareableCaseFromAlbum(this.data.detail)
    if (!shareCase || !shareCase.id) {
      wx.showToast({ title: '公开案例尚未就绪', icon: 'none' })
      return
    }
    try {
      if (canOwnerShareAlbum(this.data.detail)) {
        await recordAlbumShare(this.data.detail.albumId, {
          mode: SHARE_MODE.DESENSITIZED,
          channel: SHARE_CHANNEL.PUBLIC_H5_LINK,
        })
      }
      await copyPublicCaseWebLink(shareCase.id, shareCase, { linkOnly: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
    }
  },

  onAuthCheckToggle() {
    this.setData({ authChecked: !this.data.authChecked })
  },

  onAuthTierChange() {
    this.setData({ authTier: 'named' })
  },

  onSubmitAuth() {
    const { detail, authChecked, authSubmitting } = this.data
    if (!detail || authSubmitting) return
    if (!authChecked) {
      wx.showToast({ title: '请先勾选确认项', icon: 'none' })
      return
    }
    this.setData({ authSheetVisible: false })
    this.openAuthorizePreview()
  },

  async openAuthorizePreview() {
    this.setData({ authSubmitting: true })
    try {
      wx.showLoading({ title: '加载预览', mask: true })
      const preview = await prepareServiceAuthorizePreview(this.albumId)
      wx.hideLoading()
      wx.navigateTo({
        url: `/pages/desensitize/preview/index?taskId=${preview.taskId}&albumId=${preview.albumId}&fromPreMask=${preview.fromPreMask ? 1 : 0}&source=service`,
      })
    } catch (e) {
      wx.hideLoading()
      const { showAuthorizePreviewError } = require('../../../utils/authorize-preview-error')
      showAuthorizePreviewError(e)
    } finally {
      this.setData({ authSubmitting: false })
    }
  },

  onRejectAuth() {
    const { detail, authSubmitting } = this.data
    if (!detail || authSubmitting) return
    wx.showModal({
      title: '暂时先不分享',
      content:
        '确认后，本次服务相册仍仅作为你的私密记录保存，不会展示给同城车友。',
      confirmText: '确认',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return
        this.submitAuthDecision(false)
      },
    })
  },

  async submitAuthDecision(agreed) {
    const { detail } = this.data
    if (!detail) return
    this.setData({ authSubmitting: true })
    try {
      wx.showLoading({ title: '提交中', mask: true })
      await submitServiceAlbumAuthorization(detail.albumId, { agreed })
      wx.hideLoading()
      wx.showToast({
        title: agreed ? '已提交发布' : '已记录你的选择',
        icon: 'success',
      })
      if (agreed) {
        setTimeout(() => {
          promptAuthorizeAuditSubscribe(detail.albumId)
        }, 1200)
      }
      this.loadAlbum()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({
        title: (e && e.message) || '提交失败',
        icon: 'none',
      })
    } finally {
      this.setData({ authSubmitting: false })
    }
  },

  onContactStore() {
    const phone =
      String(this.data.storePhone || '').trim() ||
      (this.data.detail && this.data.detail.store && this.data.detail.store.phone) ||
      ''
    if (!phone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  goEngagePage({ nodeId = '', nodeTitle = '' } = {}) {
    const detail = this.data.detail
    if (!detail || !this.albumId) return
    const albumTitle = detail.serviceName || '我的服务相册'
    if (nodeId) {
      this.goFeedbackPage({ nodeId, nodeTitle })
      return
    }
    let url =
      `/pages/album/engage/index?albumId=${encodeURIComponent(this.albumId)}` +
      `&albumTitle=${encodeURIComponent(albumTitle)}`
    wx.navigateTo({ url })
  },

  goFeedbackPage({ nodeId = '', nodeTitle = '' } = {}) {
    const detail = this.data.detail
    if (!detail || !this.albumId) return
    const albumTitle = detail.serviceName || '我的服务相册'
    let url =
      `/pages/album/feedback/index?albumId=${encodeURIComponent(this.albumId)}` +
      `&albumTitle=${encodeURIComponent(albumTitle)}`
    if (nodeId) {
      url += `&nodeId=${encodeURIComponent(nodeId)}`
    }
    if (nodeTitle) {
      url += `&nodeTitle=${encodeURIComponent(nodeTitle)}`
    }
    wx.navigateTo({ url })
  },

  goPartVerifyPage() {
    const detail = this.data.detail
    if (!detail || !this.albumId) return
    if (!checkAuth().ok) {
      this.setData({ loginSheetVisible: true })
      return
    }
    const albumTitle = detail.serviceName || '我的服务相册'
    wx.navigateTo({
      url:
        `/pages/album/part-verify/index?albumId=${encodeURIComponent(this.albumId)}` +
        `&albumTitle=${encodeURIComponent(albumTitle)}`,
    })
  },

  onOpenPartVerify() {
    this.goPartVerifyPage()
  },

  onOpenBenefitPolicy() {
    wx.navigateTo({ url: '/pages/benefit-sharing/index' })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    this.loadAlbum()
  },

  updateShareMenu(ready) {
    if (ready) {
      wx.showShareMenu({
        withShareTicket: false,
        menus: ['shareAppMessage', 'shareTimeline'],
      })
    } else {
      wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    }
  },

  onShareAppMessage() {
    const { detail, shareToken, shareMode } = this.data
    const payload = buildOwnerSharePayload(detail, {
      shareToken,
      mode: shareMode,
    })
    if (payload) return payload
    return {
      title: '辙见 · 我的服务相册',
      path: this.albumId
        ? withStoreContextPath(`/pages/album/detail/index?albumId=${this.albumId}`, {
            isolated: true,
          })
        : TOOL_HOME_PATH,
    }
  },

  onShareTimeline() {
    const { detail, shareToken, shareMode } = this.data
    const payload = buildOwnerSharePayload(detail, { shareToken, mode: shareMode })
    const query = shareToken
      ? `token=${encodeURIComponent(shareToken)}`
      : this.albumId
        ? `albumId=${encodeURIComponent(this.albumId)}`
        : ''
    return {
      title: payload?.title || '辙见 · 我的服务相册',
      query,
    }
  },

  onCopyUrl() {
    const { shareToken } = this.data
    if (shareToken) {
      return { query: `token=${encodeURIComponent(shareToken)}` }
    }
    if (this.albumId) {
      return { query: `albumId=${encodeURIComponent(this.albumId)}` }
    }
    return { query: '' }
  },
})
