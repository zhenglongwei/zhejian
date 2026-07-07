Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    item: {
      type: Object,
      value: {},
    },
    mode: {
      type: String,
      value: 'pair',
    },
    statusOptions: {
      type: Array,
      value: [],
    },
    uploadHint: {
      type: String,
      value: '',
    },
  },

  methods: {
    onStatusTap(e) {
      const { status } = e.currentTarget.dataset
      const partKey = this.properties.item.partKey
      if (!partKey || !status) return
      this.triggerEvent('statustap', { partKey, status })
    },

    onToggleDetail() {
      const partKey = this.properties.item.partKey
      if (!partKey) return
      this.triggerEvent('detailtoggle', { partKey })
    },

    onNoteInput(e) {
      const partKey = this.properties.item.partKey
      if (!partKey) return
      this.triggerEvent('noteinput', { partKey, value: e.detail.value || '' })
    },

    onImagesChange(e) {
      const partKey = this.properties.item.partKey
      if (!partKey) return
      this.triggerEvent('imageschange', { partKey, images: e.detail.images || [] })
    },
  },
})
