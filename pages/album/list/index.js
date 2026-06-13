const {
  fetchUserServiceAlbums,
  fetchServiceAlbum,
  prepareServiceAuthorizePreview,
  submitServiceAlbumAuthorization,
  recordAlbumShare,
} = require('../../../services/service-album')
const { SERVICE_ALBUM_LIST_TABS } = require('../../../constants/service-album-status')
const {
  enrichServiceAlbumListItem,
} = require('../../../utils/service-album-display')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')
const { markAlbumsSeen } = require('../../../utils/album-unread-hint')
const { openH5ContentSite } = require('../../../constants/h5-links')
const {
  shouldRunInitialShow,
  finishInitialShow,
  markListNeedRefresh,
  consumeListRefresh,
  shouldShowListLoading,
} = require('../../../utils/list-page-show')
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
  withStoreContextPath,
  TOOL_HOME_PATH,
} = require('../../../utils/share-store-context')

function initShareState(detail) {
  const showShareEntry = canOwnerShareAlbum(detail)
  const shareCase = buildShareableCaseFromAlbum(detail)
  const showPublicCaseShare =
    detail.publicCaseStatus === 'public_approved' && Boolean(shareCase && shareCase.id)
  const defaultShareIntent = showShareEntry ? 'owner' : 'publicCase'
  return {
    showShareEntry,
    showPublicCaseShare,
    showShareButton: showShareEntry || showPublicCaseShare,
    defaultShareIntent,
    shareSheetIntent: defaultShareIntent,
    shareActionsDisabled: showShareEntry,
    shareReady: false,
    shareToken: '',
    shareUseOriginal: false,
    sharePreparing: false,
    shareMode: SHARE_MODE.DESENSITIZED,
  }
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    needLogin: false,
    needPhone: false,
    tabs: SERVICE_ALBUM_LIST_TABS,
    activeTab: 'private',
    list: [],
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    authSheetVisible: false,
    authChecked: false,
    authTier: 'named',
    authSubmitting: false,
    shareSheetVisible: false,
    showShareEntry: false,
    shareSheetIntent: 'owner',
    shareUseOriginal: false,
    sharePreparing: false,
    shareActionsDisabled: false,
    defaultShareIntent: 'owner',
    shareMode: SHARE_MODE.DESENSITIZED,
    shareToken: '',
    shareReady: false,
    actionDetail: null,
  },

  onShow() {
    if (shouldRunInitialShow(this)) {
      this.loadList()
        .catch(() => {})
        .finally(() => {
          finishInitialShow(this)
          this.markAllTabsSeen()
        })
      return
    }
    if (consumeListRefresh(this)) {
      this.loadList({ silent: true }).finally(() => this.markAllTabsSeen())
      return
    }
    this.markAllTabsSeen()
  },

  async markAllTabsSeen() {
    if (!isLoggedIn()) return
    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) return
    try {
      const [privateList, publicList] = await Promise.all([
        fetchUserServiceAlbums({ tab: 'private' }),
        fetchUserServiceAlbums({ tab: 'public' }),
      ])
      markAlbumsSeen([...(privateList || []), ...(publicList || [])])
    } catch (e) {
      // ignore
    }
  },

  onPullDownRefresh() {
    this.loadList({ forceLoading: true }).finally(() => wx.stopPullDownRefresh())
  },

  async loadList(options = {}) {
    const { silent = false, forceLoading = false } = options

    if (!isLoggedIn()) {
      this.setData({
        status: 'unauthenticated',
        needLogin: true,
        needPhone: false,
        list: [],
        errorMessage: '',
      })
      return
    }

    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        status: 'unauthenticated',
        needLogin: auth.reason !== 'bindPhone',
        needPhone: auth.reason === 'bindPhone',
        list: [],
        errorMessage: '',
      })
      return
    }

    if (this._listLoading) return
    this._listLoading = true

    const showLoading = forceLoading || shouldShowListLoading(this, silent)
    if (showLoading) {
      this.setData({ status: 'loading', errorMessage: '', needLogin: false, needPhone: false })
    }

    try {
      const raw = await fetchUserServiceAlbums({ tab: this.data.activeTab })
      const listTab = this.data.activeTab
      const list = (raw || []).map((item) =>
        enrichServiceAlbumListItem(item, { listTab })
      )
      if (raw && raw.length) {
        markAlbumsSeen(raw)
      }
      this.setData({
        list,
        status: list.length ? 'normal' : 'empty',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
        list: [],
      })
    } finally {
      this._listLoading = false
    }
  },

  onTabChange(e) {
    const { key } = e.detail
    if (key === this.data.activeTab) return
    this.setData({ activeTab: key })
    this.loadList({ forceLoading: true })
  },

  onRetry() {
    this.loadList({ forceLoading: true })
  },

  onLoginTap() {
    this.setData({
      loginSheetVisible: true,
      loginSheetMode: this.data.needPhone ? 'bindPhone' : 'login',
    })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    this.loadList({ forceLoading: true })
  },

  onCardTap(e) {
    const { id } = e.detail
    if (!id) return
    const item = (this.data.list || []).find((row) => row.albumId === id)
    const cover = item && item.coverUrl ? encodeURIComponent(item.coverUrl) : ''
    markListNeedRefresh(this)
    const coverQuery = cover ? `&cover=${cover}` : ''
    wx.navigateTo({ url: `/pages/album/detail/index?albumId=${id}${coverQuery}` })
  },

  async loadActionDetail(albumId) {
    const detail = await fetchServiceAlbum(albumId)
    this.actionAlbumId = albumId
    this.setData({ actionDetail: detail })
    return detail
  },

  async onCardShare(e) {
    const { id } = e.detail || {}
    if (!id) return
    try {
      wx.showLoading({ title: '加载中', mask: true })
      const detail = await this.loadActionDetail(id)
      wx.hideLoading()
      const shareState = initShareState(detail)
      this.setData({
        ...shareState,
        shareSheetVisible: true,
      })
      if (shareState.showShareEntry) {
        await this.refreshShareToken({ silent: true })
      } else {
        this.updateShareMenu(shareState.defaultShareIntent === 'publicCase')
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    }
  },

  async onCardAuthorize(e) {
    const { id, disabled, hint } = e.detail || {}
    if (!id) return
    if (disabled) {
      wx.showModal({
        title: '公示状态',
        content: hint || '当前暂不可操作',
        showCancel: false,
      })
      return
    }
    try {
      wx.showLoading({ title: '加载中', mask: true })
      await this.loadActionDetail(id)
      wx.hideLoading()
      this.setData({
        authSheetVisible: true,
        authChecked: false,
        authTier: 'named',
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    }
  },

  onCloseAuthSheet() {
    this.setData({ authSheetVisible: false })
  },

  onCloseShareSheet() {
    this.setData({ shareSheetVisible: false })
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
    const { actionDetail, authChecked, authSubmitting } = this.data
    if (!actionDetail || authSubmitting) return
    if (!authChecked) {
      wx.showToast({ title: '请先勾选确认项', icon: 'none' })
      return
    }
    this.setData({ authSheetVisible: false })
    this.openAuthorizePreview()
  },

  async openAuthorizePreview() {
    const albumId = this.actionAlbumId
    if (!albumId) return
    this.setData({ authSubmitting: true })
    try {
      wx.showLoading({ title: '加载预览', mask: true })
      const preview = await prepareServiceAuthorizePreview(albumId)
      wx.hideLoading()
      markListNeedRefresh(this)
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
    const { actionDetail, authSubmitting } = this.data
    if (!actionDetail || authSubmitting) return
    wx.showModal({
      title: '拒绝公示',
      content: '拒绝后，本次服务相册仍仅作为你的私密记录保存，不会生成公开案例。',
      confirmText: '确认拒绝',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return
        this.submitAuthDecision(false)
      },
    })
  },

  async submitAuthDecision(agreed) {
    const albumId = this.actionAlbumId
    if (!albumId) return
    this.setData({ authSubmitting: true })
    try {
      wx.showLoading({ title: '提交中', mask: true })
      await submitServiceAlbumAuthorization(albumId, { agreed })
      wx.hideLoading()
      wx.showToast({
        title: agreed ? '已授权公示' : '已记录你的选择',
        icon: 'success',
      })
      if (agreed) {
        requestUserNotificationSubscribe('authorize')
      }
      markListNeedRefresh(this)
      this.loadList({ silent: true })
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

  onOpenBenefitPolicy() {
    wx.navigateTo({ url: '/pages/benefit-sharing/index' })
  },

  async refreshShareToken(options = {}) {
    const { actionDetail, shareUseOriginal } = this.data
    const defaultShareIntent = options.defaultShareIntent || this.data.defaultShareIntent || 'owner'
    const channel = options.channel || SHARE_CHANNEL.WECHAT

    if (!actionDetail || !canOwnerShareAlbum(actionDetail)) {
      this.updateShareMenu(defaultShareIntent === 'publicCase')
      return null
    }

    const mode = shareUseOriginal ? SHARE_MODE.ORIGINAL : SHARE_MODE.DESENSITIZED
    if (!options.silent) {
      this.setData({ sharePreparing: true, shareReady: false, shareActionsDisabled: true })
    }

    try {
      const result = await recordAlbumShare(actionDetail.albumId, { mode, channel })
      const ready = Boolean(result.shareToken)
      this.setData({
        shareToken: result.shareToken || '',
        shareMode: result.mode || mode,
        shareReady: ready,
        sharePreparing: false,
        shareActionsDisabled: !ready,
      })
      this.updateShareMenu(Boolean(result.shareToken) || defaultShareIntent === 'publicCase')
      return result
    } catch (e) {
      this.setData({
        sharePreparing: false,
        shareReady: false,
        shareToken: '',
        shareActionsDisabled: true,
      })
      if (!options.silent) {
        wx.showToast({
          title: (e && e.message) || '分享准备失败',
          icon: 'none',
        })
      }
      return null
    }
  },

  onShareOriginalToggle() {
    const { shareUseOriginal, sharePreparing } = this.data
    if (sharePreparing) return

    if (!shareUseOriginal) {
      wx.showModal({
        title: '分享原图',
        content: ORIGINAL_SHARE_RISK,
        confirmText: '仍要分享原图',
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
    } else if (this.data.actionDetail) {
      await recordAlbumShare(this.data.actionDetail.albumId, {
        mode: this.data.shareMode,
        channel: SHARE_CHANNEL.OWNER_H5_LINK,
      })
    }
    if (!token) {
      wx.showToast({ title: '分享尚未就绪，请稍后再试', icon: 'none' })
      return
    }
    try {
      await copyOwnerShareH5Link(token, this.data.actionDetail, {
        mode: this.data.shareMode,
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
    }
  },

  async onCopyPublicWebLink() {
    const shareCase = buildShareableCaseFromAlbum(this.data.actionDetail)
    if (!shareCase || !shareCase.id) {
      wx.showToast({ title: '公示案例尚未就绪', icon: 'none' })
      return
    }
    try {
      if (canOwnerShareAlbum(this.data.actionDetail)) {
        await recordAlbumShare(this.data.actionDetail.albumId, {
          mode: SHARE_MODE.DESENSITIZED,
          channel: SHARE_CHANNEL.PUBLIC_H5_LINK,
        })
      }
      await copyPublicCaseWebLink(shareCase.id, shareCase)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
    }
  },

  onShareTimelineGuide() {
    const intent = this.data.shareSheetIntent || 'owner'
    this.setData({
      shareSheetVisible: false,
      defaultShareIntent: intent === 'publicCase' ? 'publicCase' : 'owner',
      shareSheetIntent: intent === 'publicCase' ? 'publicCase' : 'owner',
    })
    wx.showModal({
      title: '分享到朋友圈',
      content: '请点击右上角「…」，选择「分享到朋友圈」。',
      showCancel: false,
    })
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
    const intent = this.data.shareSheetIntent || this.data.defaultShareIntent || 'owner'
    if (intent === 'publicCase') {
      const shareCase = buildShareableCaseFromAlbum(this.data.actionDetail)
      const payload = buildPublicCaseSharePayload(shareCase)
      if (payload) return payload
    }
    const { actionDetail, shareToken, shareMode } = this.data
    const payload = buildOwnerSharePayload(actionDetail, {
      shareToken,
      mode: shareMode,
    })
    if (payload) return payload
    return {
      title: '辙见 · 我的服务相册',
      path: this.actionAlbumId
        ? withStoreContextPath(`/pages/album/detail/index?albumId=${this.actionAlbumId}`, {
            isolated: true,
          })
        : TOOL_HOME_PATH,
    }
  },

  onOpenH5Cases() {
    openH5ContentSite()
  },
})
