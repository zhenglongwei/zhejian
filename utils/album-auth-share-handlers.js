const {
  fetchServiceAlbum,
  prepareServiceAuthorizePreview,
  submitServiceAlbumAuthorization,
  recordAlbumShare,
  withdrawAuthorization,
} = require('../services/service-album')
const { promptAuthorizeAuditSubscribe } = require('./subscribe-message-prompt')
const {
  buildShareableCaseFromAlbum,
  buildPublicCaseSharePayload,
  copyPublicCaseWebLink,
} = require('./case-share')
const {
  canOwnerShareAlbum,
  buildOwnerSharePayload,
  copyOwnerShareH5Link,
  SHARE_MODE,
  SHARE_CHANNEL,
} = require('./album-owner-share')
const { withStoreContextPath, TOOL_HOME_PATH } = require('./share-store-context')
const { initAlbumShareState } = require('./album-share-state')
const { resolveAlbumAuthAction } = require('./service-album-display')

function albumAuthShareData() {
  return {
    authSheetVisible: false,
    authChecked: false,
    authTier: 'named',
    authSubmitting: false,
    shareSheetVisible: false,
    showShareEntry: false,
    showPublicCaseShare: false,
    showShareButton: false,
    shareSheetIntent: 'owner',
    shareUseOriginal: false,
    sharePreparing: false,
    shareActionsDisabled: false,
    defaultShareIntent: 'owner',
    shareMode: SHARE_MODE.DESENSITIZED,
    shareToken: '',
    shareReady: false,
    actionDetail: null,
    showAuthAction: false,
    authDisabled: false,
    authLabel: '授权公示',
    authHint: '',
    showStoreBrowse: false,
    linkedStoreId: '',
    withdrawSheetVisible: false,
    withdrawSheetLoading: false,
    pendingWithdrawAlbumId: '',
    withdrawingId: '',
  }
}

function buildAlbumActionState(detail = {}) {
  const authAction = resolveAlbumAuthAction(detail)
  const shareState = initAlbumShareState(detail)
  const linkedStoreId = (detail.store && detail.store.id) || ''
  return {
    showAuthAction: authAction.show,
    authDisabled: authAction.disabled,
    authLabel: authAction.label || '授权公示',
    authHint: authAction.hint || '',
    showStoreBrowse: Boolean(linkedStoreId),
    linkedStoreId,
    ...shareState,
  }
}

function createAlbumAuthShareHandlers(options = {}) {
  const { onAuthChanged, onShareMenuUpdate, syncWithdrawingState } = options

  return {
    async loadActionDetail(albumId) {
      const detail = await fetchServiceAlbum(albumId)
      this.actionAlbumId = albumId
      this.setData({
        actionDetail: detail,
        ...buildAlbumActionState(detail),
      })
      return detail
    },

    async onOpenAuthorize() {
      const { authDisabled, authHint, albumId } = this.data
      const id = this.actionAlbumId || albumId
      if (!id) return
      if (authDisabled) {
        wx.showModal({
          title: '公示状态',
          content: authHint || '当前暂不可操作',
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

    async onOpenShareSheet() {
      const id = this.actionAlbumId || this.data.albumId
      if (!id) return
      try {
        wx.showLoading({ title: '加载中', mask: true })
        const detail = await this.loadActionDetail(id)
        wx.hideLoading()
        const shareState = initAlbumShareState(detail)
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

    onCloseAuthSheet() {
      this.setData({ authSheetVisible: false })
    },

    onCloseShareSheet() {
      this.setData({ shareSheetVisible: false })
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
      const albumId = this.actionAlbumId || this.data.albumId
      if (!albumId) return
      this.setData({ authSubmitting: true })
      try {
        wx.showLoading({ title: '加载预览', mask: true })
        const preview = await prepareServiceAuthorizePreview(albumId)
        wx.hideLoading()
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
      const albumId = this.actionAlbumId || this.data.albumId
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
        await this.loadActionDetail(albumId)
        if (onAuthChanged) {
          await onAuthChanged.call(this, { agreed, albumId })
        }
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

    async refreshShareToken(opts = {}) {
      const { actionDetail } = this.data
      const defaultShareIntent = opts.defaultShareIntent || this.data.defaultShareIntent || 'owner'
      const channel = opts.channel || SHARE_CHANNEL.WECHAT

      if (!actionDetail || !canOwnerShareAlbum(actionDetail)) {
        this.updateShareMenu(defaultShareIntent === 'publicCase')
        return null
      }

      const mode = SHARE_MODE.DESENSITIZED
      if (!opts.silent) {
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
        if (!opts.silent) {
          wx.showToast({
            title: (e && e.message) || '分享准备失败',
            icon: 'none',
          })
        }
        return null
      }
    },

    onShareOriginalToggle() {
      // PV-REFORM：私人分享仅脱敏，原图开关已移除
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
      if (onShareMenuUpdate) {
        onShareMenuUpdate.call(this, ready)
        return
      }
      if (ready) {
        wx.showShareMenu({
          withShareTicket: false,
          menus: ['shareAppMessage', 'shareTimeline'],
        })
      } else {
        wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
      }
    },

    buildShareAppMessagePayload() {
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
      const albumId = this.actionAlbumId || this.data.albumId
      return {
        title: '辙见 · 我的服务相册',
        path: albumId
          ? withStoreContextPath(`/pages/album/detail/index?albumId=${albumId}`, {
              isolated: true,
            })
          : TOOL_HOME_PATH,
      }
    },

    onOpenLinkedStore() {
      const storeId = this.data.linkedStoreId
      if (!storeId) return
      wx.navigateTo({ url: `/pages/store/detail/index?storeId=${storeId}` })
    },

    async onCardAuthorize(e) {
      const { id, disabled, hint } = e.detail || {}
      if (!id) return
      this.actionAlbumId = id
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

    async onCardShare(e) {
      const { id } = e.detail || {}
      if (!id) return
      this.actionAlbumId = id
      try {
        wx.showLoading({ title: '加载中', mask: true })
        const detail = await this.loadActionDetail(id)
        wx.hideLoading()
        const shareState = initAlbumShareState(detail)
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
      if (syncWithdrawingState) {
        syncWithdrawingState.call(this, albumId)
      }
      try {
        await withdrawAuthorization(albumId)
        wx.showToast({ title: '已撤回授权', icon: 'success' })
        if (onAuthChanged) {
          await onAuthChanged.call(this, { albumId, action: 'withdraw' })
        }
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
        if (syncWithdrawingState) {
          syncWithdrawingState.call(this, '')
        }
      }
    },
  }
}

module.exports = {
  albumAuthShareData,
  buildAlbumActionState,
  createAlbumAuthShareHandlers,
}
