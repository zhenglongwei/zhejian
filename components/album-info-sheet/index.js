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
  },

  data: {
    hasNotes: false,
  },

  observers: {
    'storeNote, nodeNotes': function (storeNote, nodeNotes) {
      const hasStore = Boolean(storeNote && String(storeNote).trim())
      const hasNodes = Array.isArray(nodeNotes) && nodeNotes.length > 0
      this.setData({ hasNotes: hasStore || hasNodes })
    },
  },

  lifetimes: {
    attached() {
      const { storeNote, nodeNotes } = this.properties
      const hasStore = Boolean(storeNote && String(storeNote).trim())
      const hasNodes = Array.isArray(nodeNotes) && nodeNotes.length > 0
      this.setData({ hasNotes: hasStore || hasNodes })
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
  },
})
