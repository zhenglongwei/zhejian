const { SOCIAL_PLATFORMS } = require('../../utils/album-social-copy')

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    /** simple=门店/案例三渠道；owner=车主服务相册三列意图 */
    variant: {
      type: String,
      value: 'simple',
    },
    showOwnerShare: {
      type: Boolean,
      value: false,
    },
    shareIntent: {
      type: String,
      value: 'owner',
    },
    shareUseOriginal: {
      type: Boolean,
      value: false,
    },
    ownerSharePreparing: {
      type: Boolean,
      value: false,
    },
    actionsDisabled: {
      type: Boolean,
      value: false,
    },
    honorHint: {
      type: String,
      value: '',
    },
    socialPlatform: {
      type: String,
      value: 'xiaohongshu',
    },
    socialDraftText: {
      type: String,
      value: '',
    },
    socialDraftLoading: {
      type: Boolean,
      value: false,
    },
    socialDraftWaitHint: {
      type: String,
      value: '',
    },
    /** idle | pending | approved | need_modify */
    publishState: {
      type: String,
      value: 'idle',
    },
    publishDisabled: {
      type: Boolean,
      value: false,
    },
    publishHint: {
      type: String,
      value: '',
    },
    showPublicWebLink: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    socialPlatforms: SOCIAL_PLATFORMS,
  },

  methods: {
    onCloseFromSheet() {
      this.triggerEvent('close')
    },

    onCloseTap() {
      this.triggerEvent('close')
    },

    onToggleOriginal() {
      this.triggerEvent('toggleoriginal')
    },

    onTimelineTap() {
      if (this.properties.actionsDisabled) return
      const intent =
        this.properties.variant === 'owner' ? 'owner' : this.properties.shareIntent
      this.triggerEvent('sharetimeline', { intent })
    },

    onSocialTap() {
      if (this.properties.actionsDisabled) return
      if (
        this.properties.shareIntent === 'publicCase' ||
        this.properties.shareIntent === 'publicStore'
      ) {
        this.triggerEvent('copypublicweblink')
        return
      }
      this.triggerEvent('copyownerlink')
    },

    onCopyOwnerTap() {
      if (this.properties.actionsDisabled) return
      this.triggerEvent('copyownerlink')
    },

    onSocialPlatformTap(e) {
      const id = e.currentTarget.dataset.id
      if (!id || id === this.properties.socialPlatform) return
      this.triggerEvent('socialplatformchange', { platform: id })
    },

    onCopySocialTap() {
      this.triggerEvent('copysocial', { platform: this.properties.socialPlatform })
    },

    onPublishTap() {
      if (this.properties.publishDisabled) return
      this.triggerEvent('publish')
    },

    onCopyPublicTap() {
      this.triggerEvent('copypublicweblink')
    },
  },
})
