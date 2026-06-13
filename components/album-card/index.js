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
      value: true,
    },
  },

  methods: {
    onTap() {
      const { item } = this.properties
      if (!item || !item.albumId) return
      this.triggerEvent('tap', { id: item.albumId })
    },

    onActionAreaTap() {},

    onShareTap() {
      const { item } = this.properties
      if (!item || !item.albumId) return
      this.triggerEvent('share', { id: item.albumId })
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
  },
})
