const {
  fetchServiceAlbum,
  prepareServiceAuthorizePreview,
  submitServiceAlbumAuthorization,
  recordAlbumShare,
} = require('../../../services/service-album')
const {
  enrichServiceAlbumListItem,
  isRepairCompleted,
} = require('../../../utils/service-album-display')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')
const { requestUserNotificationSubscribe } = require('../../../utils/subscribe-message')
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
const { buildAlbumFlipPages } = require('../../../utils/album-flip-pages')
const { SERVICE_ALBUM_STAGES } = require('../../../constants/service-album-stages')

function getWindowMetrics() {
  try {
    return typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
  } catch (err) {
    return { windowWidth: 375, windowHeight: 667, statusBarHeight: 20 }
  }
}

function rpxToPx(rpx, windowWidth) {
  return (rpx / 750) * windowWidth
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
    const id = node && (node.id || node.nodeId)
    const note = String((node && node.note) || '').trim()
    if (id && note) map[id] = note
  })
  return map
}

function buildEndPageAuthState(detail, showAuthSection) {
  const status = detail && detail.publicCaseStatus
  if (status === 'pending_review') {
    return {
      endPageShowAuth: true,
      endPageAuthLabel: '审核中',
      endPageAuthDisabled: true,
      endPageAuthHint: PUBLIC_CASE_HINT.pending_review,
    }
  }
  if (showAuthSection) {
    return {
      endPageShowAuth: true,
      endPageAuthLabel: '授权公示',
      endPageAuthDisabled: false,
      endPageAuthHint: '',
    }
  }
  return {
    endPageShowAuth: false,
    endPageAuthLabel: '授权公示',
    endPageAuthDisabled: false,
    endPageAuthHint: '',
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
    heroCoverUrl: '',
    heroVisible: false,
    navSafeTopPx: 0,
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
    const heroCover = options.cover ? decodeURIComponent(options.cover) : ''
    this.setData({
      albumId: this.albumId,
      heroCoverUrl: heroCover,
      heroVisible: Boolean(heroCover),
    })
    this.fromMerchantShare = options.from === 'merchant_share'
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
    if (this.albumId && ['normal', 'empty'].includes(this.data.status)) {
      this.loadAlbum()
    }
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
    const win = getWindowMetrics()
    const height = Math.max(Math.floor(win.windowHeight), 200)
    if (height !== this.data.viewerHeightPx) {
      this.setData({ viewerHeightPx: height })
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

  syncStageProgress(chapters, activeNodeId, pageIndex) {
    const index =
      pageIndex !== undefined && pageIndex !== null
        ? Number(pageIndex) || 0
        : Number(this.data.pageIndex) || 0
    const nodeId =
      activeNodeId ||
      (this.data.flipPages[index] && this.data.flipPages[index].nodeId) ||
      ''
    this.setData({
      stageProgress: buildStageProgress(chapters, nodeId),
      activeStageTitle: resolveActiveStageTitle(chapters, nodeId),
      activeStageNote: resolveActiveStageNote(
        this.data.detail,
        nodeId,
        this.data.flipPages,
        index,
      ),
    })
  },

  onToggleChrome() {
    if (this.data.isEndPage) return
    this.setData({ chromeVisible: !this.data.chromeVisible }, () => {
      if (this.data.chromeVisible) {
        this.syncStageProgress(
          this.data.flipChapters,
          this.data.activeNodeId,
          this.data.pageIndex,
        )
      }
    })
  },

  dismissHeroCover() {
    if (!this.data.heroVisible) return
    this.setData({ heroVisible: false })
  },

  onReady() {
    this.fallbackViewerLayout()
    this.scheduleViewerLayout()
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
      const flip = buildAlbumFlipPages(enriched.nodes || [])
      const endPageAuth = buildEndPageAuthState(enriched, showAuthSection)
      const storePhone = (enriched.store && enriched.store.phone) || ''

      this.setData({
        detail: enriched,
        flipPages: flip.pages,
        flipChapters: flip.chapters,
        nodeNoteMap: buildNodeNoteMap(enriched.nodes || []),
        storePhone,
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
        ...endPageAuth,
      }, () => {
        const total = flip.pages.length + (flip.pages.length > 0 ? 1 : 0)
        const activeId = (flip.chapters[0] && flip.chapters[0].nodeId) || ''
        this.syncPageDisplay(0, total)
        this.syncStageProgress(flip.chapters, activeId, 0)
        this.scheduleViewerLayout()
        setTimeout(() => this.dismissHeroCover(), 280)
      })

      const storeId =
        (detail.store && detail.store.id) ||
        detail.storeId ||
        (enriched.store && enriched.store.id) ||
        ''
      if (storeId) {
        markShareStoreContext({
          storeId,
          albumId: this.albumId,
          source: this.fromMerchantShare ? 'merchant_share' : 'album_detail',
        })
        markAlbumSeen(this.albumId, detail.updatedAt || enriched.updatedAt)
      }

      if (showShareEntry) {
        await this.refreshShareToken({ silent: true, defaultShareIntent })
      } else {
        this.updateShareMenu(showPublicCaseShare)
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
    return status === 'private' || status === 'authorization_pending'
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

  onEndPageAuth() {
    if (this.data.endPageAuthDisabled) return
    this.setData({ authSheetVisible: true, authChecked: false })
  },

  onCloseAuthSheet() {
    this.setData({ authSheetVisible: false })
  },

  onEndPageFeedback(e) {
    this.goFeedbackPage()
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
        requestUserNotificationSubscribe('authorize')
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
