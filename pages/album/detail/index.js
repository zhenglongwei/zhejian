const {
  fetchServiceAlbum,
  prepareServiceAuthorizePreview,
  submitServiceAlbumAuthorization,
  recordAlbumShare,
  withdrawAuthorization,
} = require('../../../services/service-album')
const {
  enrichServiceAlbumListItem,
  isRepairCompleted,
} = require('../../../utils/service-album-display')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')
const { promptAuthorizeAuditSubscribe, promptAlbumProgressSubscribe } = require('../../../utils/subscribe-message-prompt')
const {
  buildShareableCaseFromAlbum,
  buildPublicCaseSharePayload,
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
const {
  resolvePageShareContext,
  markShareStoreContext,
  withStoreContextPath,
  TOOL_HOME_PATH,
} = require('../../../utils/share-store-context')
const { markAlbumSeen } = require('../../../utils/album-unread-hint')
const { fetchAlbumPartVerifyContext } = require('../../../services/album-part-verify')
const { buildAlbumFlipPages } = require('../../../utils/album-flip-pages')
const { SERVICE_ALBUM_STAGES } = require('../../../constants/service-album-stages')

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
  user_rejected: '当前为私密相册，你可随时申请公开公示。',
  pending_review: '公开申请审核中，通过后将展示在案例页与公开网页。',
  public_approved: '当前为公开相册，已在案例页与公开网页展示。',
}

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
  const status = (detail && detail.publicCaseStatus) || 'private'
  if (status === 'pending_review' || status === 'public_approved') {
    return {
      endPageShowAuth: false,
      endPageAuthLabel: '授权公示',
      endPageAuthDisabled: false,
      endPageAuthHint: '',
      endPageShowWithdraw: true,
      endPageWithdrawLabel: '撤回公示',
      endPageStatusHint:
        status === 'pending_review'
          ? PUBLIC_CASE_HINT.pending_review
          : PUBLIC_CASE_HINT.public_approved,
    }
  }
  if (showAuthSection) {
    return {
      endPageShowAuth: true,
      endPageAuthLabel: '授权公示',
      endPageAuthDisabled: false,
      endPageAuthHint: '',
      endPageShowWithdraw: false,
      endPageWithdrawLabel: '撤回公示',
      endPageStatusHint: '',
    }
  }
  return {
    endPageShowAuth: false,
    endPageAuthLabel: '授权公示',
    endPageAuthDisabled: false,
    endPageAuthHint: '',
    endPageShowWithdraw: false,
    endPageWithdrawLabel: '撤回公示',
    endPageStatusHint:
      status === 'user_rejected' ? PUBLIC_CASE_HINT.user_rejected : '',
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
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    flipPages: [],
    flipChapters: [],
    pageIndex: 0,
    activeNodeId: '',
    storePhone: '',
    endPageShowAuth: false,
    endPageAuthLabel: '授权公示',
    endPageAuthDisabled: false,
    endPageAuthHint: '',
    endPageShowWithdraw: false,
    endPageWithdrawLabel: '撤回公示',
    endPageStatusHint: '',
    withdrawSheetVisible: false,
    withdrawSheetLoading: false,
    shareSheetIntent: 'owner',
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
    showInspectEntry: false,
    showPartsEntry: false,
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
      const showShareButton = showShareEntry || showPublicCaseShare
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

      let showPartsEntry = (enriched.parts || []).length > 0
      if (checkAuth().ok) {
        try {
          const partCtx = await fetchAlbumPartVerifyContext(this.albumId)
          showPartsEntry = Boolean(partCtx.hasParts)
        } catch (err) {
          // ignore
        }
      }

      this.setData({
        detail: enriched,
        flipPages: flip.pages,
        flipChapters: flip.chapters,
        nodeNoteMap: buildNodeNoteMap(enriched.nodes || []),
        storePhone,
        showPartsEntry,
        pageIndex: 0,
        activeNodeId: (flip.chapters[0] && flip.chapters[0].nodeId) || '',
        showAuthSection,
        showShareEntry,
        showShareButton,
        showPublicCaseShare,
        defaultShareIntent,
        shareSheetIntent,
        shareActionsDisabled,
        authChecked: false,
        authSheetVisible: false,
        status: pageStatus,
        shareReady: false,
        shareToken: '',
        shareSheetVisible: false,
        chromeVisible: pageStatus === 'normal',
        showInspectEntry: pageStatus === 'normal',
        ...endPageAuth,
      }, () => {
        const total = flip.pages.length + (flip.pages.length > 0 ? 1 : 0)
        const activeId = (flip.chapters[0] && flip.chapters[0].nodeId) || ''
        this.syncPageDisplay(0, total)
        this.syncStageProgress(flip.chapters, activeId, 0, enriched)
        this.scheduleViewerLayout()
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
    if (!isRepairCompleted(detail.status)) return false
    if ((detail.imageCount || 0) < 1) return false
    const status = detail.publicCaseStatus
    return (
      status === 'private' ||
      status === 'authorization_pending' ||
      status === 'user_rejected'
    )
  },

  async refreshShareToken(options = {}) {
    const { detail, shareUseOriginal } = this.data
    const defaultShareIntent =
      options.defaultShareIntent || this.data.defaultShareIntent || 'owner'
    const channel = options.channel || SHARE_CHANNEL.WECHAT

    if (!detail || !canOwnerShareAlbum(detail)) {
      this.updateShareMenu(defaultShareIntent === 'publicCase')
      return null
    }

    const mode = shareUseOriginal ? SHARE_MODE.ORIGINAL : SHARE_MODE.DESENSITIZED
    if (!options.silent) {
      this.setData({ sharePreparing: true, shareReady: false, shareActionsDisabled: true })
    }

    try {
      const result = await recordAlbumShare(detail.albumId, { mode, channel })
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
    this.setData({ shareSheetVisible: true })
    if (this.data.showShareEntry && !this.data.shareReady && !this.data.sharePreparing) {
      await this.refreshShareToken({ silent: true })
    }
  },

  onCloseShareSheet() {
    this.setData({ shareSheetVisible: false })
  },

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

  onEndPageAuth() {
    if (this.data.endPageAuthDisabled) return
    this.setData({ authSheetVisible: true, authChecked: false, authTier: 'named' })
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
      wx.showToast({ title: '已撤回授权', icon: 'success' })
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

  onShareOriginalToggle() {
    const { shareUseOriginal, sharePreparing } = this.data
    if (sharePreparing) return

    if (!shareUseOriginal) {
      wx.showModal({
        title: '原图分享风险提示',
        content: ORIGINAL_SHARE_RISK,
        confirmText: '仍用原图',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm) return
          this.setData({ shareUseOriginal: true }, () => {
            this.refreshShareToken()
          })
        },
      })
      return
    }

    this.setData({ shareUseOriginal: false }, () => {
      this.refreshShareToken()
    })
  },

  async onCopyOwnerShareLink() {
    if (this.data.sharePreparing) return
    let token = this.data.shareToken
    if (!token) {
      const result = await this.refreshShareToken({
        channel: SHARE_CHANNEL.OWNER_H5_LINK,
      })
      token = (result && result.shareToken) || this.data.shareToken
    } else {
      await recordAlbumShare(this.data.detail.albumId, {
        mode: this.data.shareMode,
        channel: SHARE_CHANNEL.OWNER_H5_LINK,
      })
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
    const shareCase = buildShareableCaseFromAlbum(this.data.detail)
    if (!shareCase || !shareCase.id) {
      wx.showToast({ title: '公示案例尚未就绪', icon: 'none' })
      return
    }
    try {
      if (canOwnerShareAlbum(this.data.detail)) {
        await recordAlbumShare(this.data.detail.albumId, {
          mode: SHARE_MODE.DESENSITIZED,
          channel: SHARE_CHANNEL.PUBLIC_H5_LINK,
        })
      }
      await copyPublicCaseWebLink(shareCase.id, shareCase)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
    }
  },

  onAuthCheckToggle() {
    this.setData({ authChecked: !this.data.authChecked })
  },

  onAuthTierChange(e) {
    const tier = e.detail && e.detail.tier
    if (tier !== 'named' && tier !== 'anonymous') return
    this.setData({ authTier: tier })
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
        url: `/pages/desensitize/preview/index?taskId=${preview.taskId}&albumId=${preview.albumId}&fromPreMask=${preview.fromPreMask ? 1 : 0}&source=service&tier=${this.data.authTier}`,
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({
        title: (e && e.message) || '预览加载失败',
        icon: 'none',
      })
    } finally {
      this.setData({ authSubmitting: false })
    }
  },

  onRejectAuth() {
    const { detail, authSubmitting } = this.data
    if (!detail || authSubmitting) return
    wx.showModal({
      title: '拒绝公示',
      content:
        '拒绝后，本次服务相册仍仅作为你的私密记录保存，不会生成公开案例。',
      confirmText: '确认拒绝',
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
        title: agreed ? '已授权公示' : '已记录你的选择',
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

  resolveShareIntent(options = {}) {
    const fromButton = options.target && options.target.dataset
    const intent = (fromButton && fromButton.shareIntent) || this.data.defaultShareIntent
    return intent === 'publicCase' ? 'publicCase' : 'owner'
  },

  onShareAppMessage(options) {
    const intent = this.resolveShareIntent(options)
    if (intent === 'publicCase') {
      const shareCase = buildShareableCaseFromAlbum(this.data.detail)
      const payload = buildPublicCaseSharePayload(shareCase)
      if (payload) return payload
    }
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

  onShareTimeline(options) {
    const intent = this.resolveShareIntent(options)
    if (intent === 'publicCase') {
      const shareCase = buildShareableCaseFromAlbum(this.data.detail)
      if (shareCase && shareCase.id) {
        return {
          title: buildPublicCaseSharePayload(shareCase)?.title || '辙见 · 公开案例',
          query: `redirectCaseId=${encodeURIComponent(shareCase.id)}`,
        }
      }
    }
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
    const { detail, shareToken, defaultShareIntent } = this.data
    if (defaultShareIntent === 'publicCase') {
      const shareCase = buildShareableCaseFromAlbum(detail)
      if (shareCase && shareCase.id) {
        return { query: `redirectCaseId=${encodeURIComponent(shareCase.id)}` }
      }
    }
    if (shareToken) {
      return { query: `token=${encodeURIComponent(shareToken)}` }
    }
    if (this.albumId) {
      return { query: `albumId=${encodeURIComponent(this.albumId)}` }
    }
    return { query: '' }
  },
})
