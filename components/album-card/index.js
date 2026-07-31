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
    embedded: {
      type: Boolean,
      value: false,
    },
    /** 用户端 Hero：右上角进入车主分享页 */
    showOwnerShare: {
      type: Boolean,
      value: false,
    },
    /** 用户端 Hero：右上角去评价 / 已评价 */
    showOwnerReview: {
      type: Boolean,
      value: false,
    },
    ownerReviewLabel: {
      type: String,
      value: '去评价',
    },
    /** 下载档案：单选模式 */
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

  methods: {
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
