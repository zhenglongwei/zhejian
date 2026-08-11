Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    item: {
      type: Object,
      value: null,
    },
    audience: {
      type: String,
      value: 'user',
    },
    showProgress: {
      type: Boolean,
      value: true,
    },
    framed: {
      type: Boolean,
      value: true,
    },
    showHeaderActions: {
      type: Boolean,
      value: false,
    },
    /** 用户端卡底快捷栏：发布/撤回 · 分享 · 去评价/追评 */
    showQuickActions: {
      type: Boolean,
      value: false,
    },
    embedded: {
      type: Boolean,
      value: false,
    },
    /** 兼容旧 Hero 右上「分享」 */
    showOwnerShare: {
      type: Boolean,
      value: false,
    },
    /** 兼容旧 Hero 右上评价 */
    showOwnerReview: {
      type: Boolean,
      value: false,
    },
    ownerReviewLabel: {
      type: String,
      value: '去评价',
    },
    selectable: {
      type: Boolean,
      value: false,
    },
    selected: {
      type: Boolean,
      value: false,
    },
    selectDisabled: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    quickVisible: false,
    quickPublish: { show: false, label: '发布', disabled: false },
    quickWithdraw: { show: false, label: '撤回', disabled: false },
    quickShare: { show: false },
    quickReview: { show: false, label: '去评价' },
  },

  observers: {
    'item, showQuickActions, audience': function () {
      this.syncQuickActions()
    },
  },

  methods: {
    syncQuickActions() {
      const { isRepairCompleted } = require('../../utils/service-album-display')
      const { item, showQuickActions, audience } = this.properties
      if (!showQuickActions || audience !== 'user' || !item) {
        this.setData({ quickVisible: false })
        return
      }

      const withdraw = item.withdrawAction || {}
      const auth = item.authAction || {}
      const quickWithdraw = {
        show: Boolean(withdraw.show),
        label: '撤回',
        disabled: Boolean(withdraw.disabled),
      }
      const quickPublish = {
        show: !quickWithdraw.show && Boolean(auth.show),
        label: '发布',
        disabled: Boolean(auth.disabled),
      }
      const quickShare = {
        show: Boolean(item.showShareButton || item.showOwnerShare),
      }
      // 已完工：始终给出评价入口（未评「去评价」、已评「追评」）
      // 兼容 API 仅认 completed、而公示后 status 为 published 的情况
      const reviewEligible =
        Boolean(item.reviewEligible) ||
        Boolean(item.pendingOwnerReview) ||
        isRepairCompleted(item.status)
      let quickReview = { show: false, label: '去评价' }
      if (reviewEligible || item.hasReview) {
        quickReview = {
          show: true,
          label: item.hasReview ? '追评' : '去评价',
        }
      }

      const quickVisible =
        quickPublish.show || quickWithdraw.show || quickShare.show || quickReview.show
      this.setData({
        quickVisible,
        quickPublish,
        quickWithdraw,
        quickShare,
        quickReview,
      })
    },

    onTap() {
      const { item, selectable, selectDisabled } = this.properties
      if (!item || !item.albumId) return
      if (selectable) {
        if (selectDisabled) {
          this.triggerEvent('selectdisabled', { id: item.albumId })
          return
        }
        this.triggerEvent('select', { id: item.albumId })
        return
      }
      this.triggerEvent('tap', { id: item.albumId })
    },

    onActionAreaTap() {},

    onShareTap() {
      const { item } = this.properties
      if (!item || !item.albumId) return
      this.triggerEvent('share', { id: item.albumId })
    },

    onOwnerShareTap() {
      const { item } = this.properties
      if (!item || !item.albumId) return
      this.triggerEvent('ownershare', { id: item.albumId })
    },

    onOwnerReviewTap() {
      const { item } = this.properties
      if (!item || !item.albumId) return
      this.triggerEvent('ownerreview', {
        id: item.albumId,
        title: item.serviceName || '',
      })
    },

    onPartVerifyTap() {
      const { item } = this.properties
      if (!item || !item.albumId) return
      this.triggerEvent('partverify', { id: item.albumId, title: item.serviceName || '' })
    },

    onAuthTap() {
      const { item } = this.properties
      if (!item || !item.albumId) return
      this.triggerEvent('authorize', {
        id: item.albumId,
        publicCaseStatus: item.publicCaseStatus || 'private',
        disabled: Boolean(item.authAction && item.authAction.disabled),
        hint: (item.authAction && item.authAction.hint) || '',
      })
    },

    onWithdrawTap() {
      const { item } = this.properties
      if (!item || !item.albumId) return
      this.triggerEvent('withdraw', {
        id: item.albumId,
        disabled: Boolean(item.withdrawAction && item.withdrawAction.disabled),
      })
    },
  },
})
