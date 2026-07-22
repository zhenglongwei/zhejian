const {
  fetchUserServiceAlbums,
  fetchServiceAlbum,
  prepareServiceAuthorizePreview,
  submitServiceAlbumAuthorization,
  recordAlbumShare,
  withdrawAuthorization,
  fetchAlbumSocialCopy,
} = require('../../../services/service-album')
const { SERVICE_ALBUM_LIST_TABS, normalizeServiceAlbumListTab } = require('../../../constants/service-album-status')
const {
  enrichServiceAlbumListItem,
} = require('../../../utils/service-album-display')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')
const { openH5Url, buildStoreListH5Url } = require('../../../constants/h5-links')
const {
  MINE_ALBUM_EMPTY_TITLE,
  MINE_ALBUM_EMPTY_ACTION,
} = require('../../../constants/mine-hub')
const {
  shouldRunInitialShow,
  finishInitialShow,
  markListNeedRefresh,
  consumeListRefresh,
  shouldShowListLoading,
} = require('../../../utils/list-page-show')
const { promptAuthorizeAuditSubscribe } = require('../../../utils/subscribe-message-prompt')
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
const { AUTHORIZATION_CONSENT } = require('../../../constants/compliance-copy')
const {
  withStoreContextPath,
  TOOL_HOME_PATH,
} = require('../../../utils/share-store-context')

const { initAlbumShareState } = require('../../../utils/album-share-state')
const { inviteUiFieldsFromDetail } = require('../../../utils/album-auth-share-handlers')
const {
  AUTH_ACTION_LABEL,
  AUTH_CONFIRM_TEXT,
  AUTH_REJECT_TEXT,
  AUTH_SHEET_TITLE,
  CONTROL_LINE,
  CONSENT_CHECKBOX,
} = require('../../../utils/publish-thank-you')
const {
  buildSocialDraft,
  copyTextToClipboard,
} = require('../../../utils/album-social-copy')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    needLogin: false,
    needPhone: false,
    tabs: SERVICE_ALBUM_LIST_TABS,
    activeTab: 'all',
    list: [],
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    authSheetVisible: false,
    authChecked: false,
    authTier: 'named',
    authSubmitting: false,
    authSheetTitle: AUTH_SHEET_TITLE,
    authPitch: '',
    authBenefitLine: '',
    authControlLine: CONTROL_LINE,
    authDisclaimer: '',
    authConsentText: CONSENT_CHECKBOX,
    authConfirmText: AUTH_CONFIRM_TEXT,
    authRejectText: AUTH_REJECT_TEXT,
    withdrawSheetVisible: false,
    withdrawSheetLoading: false,
    pendingWithdrawAlbumId: '',
    withdrawingId: '',
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
    shareHonorHint: '',
    socialPlatform: 'xiaohongshu',
    socialDraftText: '',
    socialDraftLoading: false,
    socialDraftWaitHint: '',
    publishSheetState: 'idle',
    publishSheetDisabled: false,
    publishSheetHint: '',
    showPublicCaseShare: false,
    albumEmptyTitle: MINE_ALBUM_EMPTY_TITLE,
    albumEmptyAction: MINE_ALBUM_EMPTY_ACTION,
  },

  onLoad(options = {}) {
    const tab = normalizeServiceAlbumListTab(options.tab)
    if (tab !== this.data.activeTab) {
      this.setData({ activeTab: tab })
    }
  },

  onShow() {
    if (shouldRunInitialShow(this)) {
      this.loadList()
        .catch(() => {})
        .finally(() => {
          finishInitialShow(this)
        })
      return
    }
    if (consumeListRefresh(this)) {
      this.loadList({ silent: true })
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
      const listTab = normalizeServiceAlbumListTab(this.data.activeTab)
      const raw = await fetchUserServiceAlbums({ tab: listTab })
      const list = (raw || []).map((item) =>
        enrichServiceAlbumListItem(item, { listTab })
      )
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
    const tab = normalizeServiceAlbumListTab(key)
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
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
    markListNeedRefresh(this)
    wx.navigateTo({ url: `/pages/album/detail/index?albumId=${id}` })
  },

  onCardPartVerify(e) {
    const { id, title } = e.detail || {}
    if (!id) return
    if (!checkAuth().ok) {
      this.setData({ loginSheetVisible: true })
      return
    }
    wx.navigateTo({
      url:
        `/pages/album/part-verify/index?albumId=${encodeURIComponent(id)}` +
        `&albumTitle=${encodeURIComponent(title || '')}`,
    })
  },

  async loadActionDetail(albumId) {
    const detail = await fetchServiceAlbum(albumId)
    this.actionAlbumId = albumId
    this.setData({
      actionDetail: detail,
      ...inviteUiFieldsFromDetail(detail),
    })
    return detail
  },

  async onCardShare(e) {
    const { id } = e.detail || {}
    if (!id) return
    try {
      wx.showLoading({ title: '加载中', mask: true })
      const detail = await this.loadActionDetail(id)
      wx.hideLoading()
      const shareState = initAlbumShareState(detail)
      this.setData({
        ...shareState,
        shareSheetVisible: true,
        socialDraftText: '',
        socialDraftWaitHint: '',
      })
      this.loadSocialDraft(shareState.socialPlatform || this.data.socialPlatform || 'xiaohongshu')
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
        title: '发布状态',
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

  async loadSocialDraft(platform) {
    const albumId =
      this.actionAlbumId ||
      (this.data.actionDetail && this.data.actionDetail.albumId)
    if (!albumId) return
    this.setData({ socialDraftLoading: true, socialDraftWaitHint: '' })
    try {
      const data = await fetchAlbumSocialCopy(albumId, platform)
      if (this.data.socialPlatform !== platform) {
        this.setData({ socialDraftLoading: false })
        return
      }
      if (data && data.status === 'generating') {
        this.setData({
          socialDraftLoading: false,
          socialDraftText: '',
          socialDraftWaitHint: (data && data.message) || '文案准备中，请稍后再试',
        })
        return
      }
      const text = (data && (data.text || data.body)) || ''
      this.setData({
        socialDraftText: text,
        socialDraftLoading: false,
        socialDraftWaitHint: '',
      })
    } catch (err) {
      this.setData({
        socialDraftLoading: false,
        socialDraftWaitHint: '',
        socialDraftText: buildSocialDraft(this.data.actionDetail || {}, platform),
      })
    }
  },

  onSocialPlatformChange(e) {
    const platform = (e.detail && e.detail.platform) || 'xiaohongshu'
    this.setData({
      socialPlatform: platform,
      socialDraftText: '',
      socialDraftWaitHint: '',
    })
    this.loadSocialDraft(platform)
  },

  async onCopySocialDraft(e) {
    const platform =
      (e.detail && e.detail.platform) || this.data.socialPlatform || 'xiaohongshu'
    if (this.data.socialDraftWaitHint) {
      wx.showToast({ title: this.data.socialDraftWaitHint, icon: 'none' })
      return
    }
    const text = this.data.socialDraftText
    if (!text) {
      wx.showToast({ title: '文案尚未就绪', icon: 'none' })
      return
    }
    try {
      await copyTextToClipboard(text)
      if (canOwnerShareAlbum(this.data.actionDetail)) {
        await recordAlbumShare(this.data.actionDetail.albumId, {
          mode: SHARE_MODE.DESENSITIZED,
          channel: `social_copy_${platform}`,
        })
      }
    } catch (err) {
      // toast in helper
    }
  },

  onSharePublish() {
    const state = this.data.publishSheetState
    if (state === 'approved' || state === 'pending') return
    if (this.data.publishSheetDisabled) {
      wx.showToast({ title: '暂不可发布', icon: 'none' })
      return
    }
    this.setData({ shareSheetVisible: false })
    if (state === 'need_modify') {
      this.openAuthorizePreview()
      return
    }
    this.setData({
      authSheetVisible: true,
      authChecked: false,
      authTier: 'named',
    })
  },

  onAuthCheckToggle() {
    this.setData({ authChecked: !this.data.authChecked })
  },

  onAuthTierChange() {
    this.setData({ authTier: 'named' })
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
        url: `/pages/desensitize/preview/index?taskId=${preview.taskId}&albumId=${preview.albumId}&fromPreMask=${preview.fromPreMask ? 1 : 0}&source=service`,
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
      title: '暂不发布',
      content: '确认后，本次服务相册仍仅作为你的私密记录保存，不会发布到公开网站。',
      confirmText: '确认',
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
        title: agreed ? '已提交发布' : '已记录你的选择',
        icon: 'success',
      })
      if (agreed) {
        setTimeout(() => {
          promptAuthorizeAuditSubscribe(albumId)
        }, 1200)
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

  onCardWithdraw(e) {
    const { id, disabled } = e.detail || {}
    if (!id || disabled || this.data.withdrawingId || this.data.withdrawSheetVisible) return
    this.setData({
      withdrawSheetVisible: true,
      pendingWithdrawAlbumId: id,
    })
  },

  onWithdrawSheetClose() {
    if (this.data.withdrawSheetLoading) return
    this.setData({
      withdrawSheetVisible: false,
      pendingWithdrawAlbumId: '',
    })
  },

  onWithdrawSheetConfirm() {
    const albumId = this.data.pendingWithdrawAlbumId
    if (!albumId || this.data.withdrawSheetLoading) return
    this.setData({ withdrawSheetVisible: false, withdrawSheetLoading: true })
    this.doWithdraw(albumId)
  },

  async doWithdraw(albumId) {
    this.setData({ withdrawingId: albumId })
    this.syncListWithdrawing(albumId)
    try {
      await withdrawAuthorization(albumId)
      wx.showToast({ title: '已撤回发布', icon: 'success' })
      markListNeedRefresh(this)
      await this.loadList({ silent: true })
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || '撤回失败',
        icon: 'none',
      })
    } finally {
      this.setData({
        withdrawingId: '',
        withdrawSheetLoading: false,
        pendingWithdrawAlbumId: '',
      })
      this.syncListWithdrawing('')
    }
  },

  syncListWithdrawing(withdrawingId) {
    const listTab = normalizeServiceAlbumListTab(this.data.activeTab)
    const list = (this.data.list || []).map((item) =>
      enrichServiceAlbumListItem(
        { ...item, withdrawing: withdrawingId === item.albumId },
        { listTab }
      )
    )
    this.setData({ list })
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
    const { actionDetail } = this.data
    const defaultShareIntent = options.defaultShareIntent || this.data.defaultShareIntent || 'owner'
    const channel = options.channel || SHARE_CHANNEL.WECHAT

    if (!actionDetail || !canOwnerShareAlbum(actionDetail)) {
      this.updateShareMenu(defaultShareIntent === 'publicCase')
      return null
    }

    const mode = SHARE_MODE.DESENSITIZED
    if (!options.silent) {
      this.setData({ sharePreparing: true, shareReady: false, shareActionsDisabled: true })
    }

    try {
      const result = await recordAlbumShare(
        actionDetail.albumId,
        this.buildSharePayload(actionDetail.albumId, channel)
      )
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

  onShareOriginalToggle() {},

  async onCopyOwnerShareLink() {
    if (this.data.sharePreparing) return
    let token = this.data.shareToken
    if (!token) {
      const result = await this.refreshShareToken({
        channel: SHARE_CHANNEL.OWNER_H5_LINK,
      })
      token = (result && result.shareToken) || this.data.shareToken
    } else if (this.data.actionDetail) {
      await recordAlbumShare(
        this.data.actionDetail.albumId,
        this.buildSharePayload(
          this.data.actionDetail.albumId,
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
      wx.showToast({ title: '审核通过后可复制公开链接', icon: 'none' })
      return
    }
    if (this.data.publishSheetState !== 'approved' && !this.data.showPublicCaseShare) {
      wx.showToast({ title: '审核通过后可复制公开链接', icon: 'none' })
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

  onOpenAlbumMerchants() {
    openH5Url(buildStoreListH5Url())
  },
})
