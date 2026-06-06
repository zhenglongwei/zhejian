Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
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
      this.triggerEvent('sharetimeline', { intent: this.properties.shareIntent })
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
  },
})
