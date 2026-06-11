Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    scene: {
      type: String,
      value: 'album',
    },
    storeNote: {
      type: String,
      value: '',
    },
    nodeNotes: {
      type: Array,
      value: [],
    },
    storePhone: {
      type: String,
      value: '',
    },
    showContact: {
      type: Boolean,
      value: true,
    },
    showCompliance: {
      type: Boolean,
      value: true,
    },
    pageProgress: {
      type: String,
      value: '',
    },
  },

  data: {
    hasNotes: false,
    hasStorePhone: false,
  },

  observers: {
    'storeNote, nodeNotes': function (storeNote, nodeNotes) {
      const hasStore = Boolean(storeNote && String(storeNote).trim())
      const hasNodes = Array.isArray(nodeNotes) && nodeNotes.length > 0
      this.setData({ hasNotes: hasStore || hasNodes })
    },
    storePhone(phone) {
      this.setData({ hasStorePhone: Boolean(String(phone || '').trim()) })
    },
  },

  lifetimes: {
    attached() {
      const { storeNote, nodeNotes, storePhone } = this.properties
      const hasStore = Boolean(storeNote && String(storeNote).trim())
      const hasNodes = Array.isArray(nodeNotes) && nodeNotes.length > 0
      this.setData({
        hasNotes: hasStore || hasNodes,
        hasStorePhone: Boolean(String(storePhone || '').trim()),
      })
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

    onContactTap() {
      this.triggerEvent('contact')
    },
  },
})
