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
    showPublicCaseShare: {
      type: Boolean,
      value: false,
    },
    shareUseOriginal: {
      type: Boolean,
      value: false,
    },
    ownerShareReady: {
      type: Boolean,
      value: false,
    },
    ownerSharePreparing: {
      type: Boolean,
      value: false,
    },
    ownerPrivacyScene: {
      type: String,
      value: 'ownerShare',
    },
  },

  methods: {
    noop() {},

    onMaskTap() {
      this.triggerEvent('close')
    },

    onCloseTap() {
      this.triggerEvent('close')
    },

    onToggleOriginal() {
      this.triggerEvent('toggleoriginal')
    },

    onCopyOwnerLink() {
      this.triggerEvent('copyownerlink')
    },

    onCopyPublicWebLink() {
      this.triggerEvent('copypublicweblink')
    },
  },
})
