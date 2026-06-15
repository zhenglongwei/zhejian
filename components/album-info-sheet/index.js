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
    summaryRows: {
      type: Array,
      value: [],
    },
    parts: {
      type: Array,
      value: [],
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
      value: false,
    },
    showCompliance: {
      type: Boolean,
      value: false,
    },
    pageProgress: {
      type: String,
      value: '',
    },
    aiSummary: {
      type: String,
      value: '',
    },
    storeId: {
      type: String,
      value: '',
    },
    storeName: {
      type: String,
      value: '',
    },
    storeSubtitle: {
      type: String,
      value: '',
    },
    showStoreLink: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    hasNotes: false,
    hasStorePhone: false,
    hasParts: false,
    hasSummaryRows: false,
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
    parts(list) {
      this.setData({ hasParts: Array.isArray(list) && list.length > 0 })
    },
    summaryRows(rows) {
      this.setData({ hasSummaryRows: Array.isArray(rows) && rows.length > 0 })
    },
  },

  lifetimes: {
    attached() {
      const { storeNote, nodeNotes, storePhone, parts, summaryRows } = this.properties
      const hasStore = Boolean(storeNote && String(storeNote).trim())
      const hasNodes = Array.isArray(nodeNotes) && nodeNotes.length > 0
      this.setData({
        hasNotes: hasStore || hasNodes,
        hasStorePhone: Boolean(String(storePhone || '').trim()),
        hasParts: Array.isArray(parts) && parts.length > 0,
        hasSummaryRows: Array.isArray(summaryRows) && summaryRows.length > 0,
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

    onPartTap(e) {
      const index = e.detail && e.detail.index != null
        ? Number(e.detail.index)
        : Number(e.currentTarget.dataset.index)
      this.triggerEvent('parttap', { index: index >= 0 ? index : 0 })
    },

    onStoreTap() {
      this.triggerEvent('storetap')
    },
  },
})
