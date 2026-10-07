const {
  buildFindingGroups,
  buildQuoteLinesView,
  stripTotalPrefix,
} = require('../../utils/service-doc-sheet-view')

Component({
  properties: {
    /** 单据展示对象（与 ownerFlow doc / completedStep 对齐） */
    doc: {
      type: Object,
      value: {},
    },
    /** owner | merchant */
    mode: {
      type: String,
      value: 'owner',
    },
    confirming: {
      type: Boolean,
      value: false,
    },
    /** 是否展示单头（时间线内嵌时可保留） */
    showHeader: {
      type: Boolean,
      value: true,
    },
    storePhone: {
      type: String,
      value: '',
    },
    /** preview | edit — edit 时点图抛出 imageedit，由父页打开打码 */
    imageTapMode: {
      type: String,
      value: 'preview',
    },
    /** 车主检测报告用来判断「需要处理」分段 */
    quoteLines: {
      type: Array,
      value: [],
    },
  },

  data: {
    findingGroups: [],
    quoteLineRows: [],
    totalAmountText: '',
    expandedAdvice: {},
    expandedNotes: {},
  },

  observers: {
    'doc, mode, quoteLines': function syncSheet(doc, mode, quoteLines) {
      const nextId = doc && doc.id
      const keepExpand = nextId && nextId === this._sheetDocId
      this._sheetDocId = nextId || ''
      this.setData({
        findingGroups: buildFindingGroups((doc && doc.findings) || [], {
          groupForOwner: mode === 'owner',
          quoteLines: quoteLines || [],
        }),
        quoteLineRows: buildQuoteLinesView((doc && doc.lines) || []),
        totalAmountText: stripTotalPrefix((doc && doc.totalAmountLabel) || ''),
        expandedAdvice: keepExpand ? this.data.expandedAdvice : {},
        expandedNotes: keepExpand ? this.data.expandedNotes : {},
      })
    },
  },

  methods: {
    onToggleAdvice(e) {
      const key = e.currentTarget.dataset.key
      if (!key) return
      this.setData({
        [`expandedAdvice.${key}`]: !this.data.expandedAdvice[key],
      })
    },

    onToggleNote(e) {
      const key = e.currentTarget.dataset.key
      if (!key) return
      this.setData({
        [`expandedNotes.${key}`]: !this.data.expandedNotes[key],
      })
    },

    onConfirmTap() {
      const doc = this.data.doc || {}
      if (!doc.needsConfirm || !doc.id) return
      this.triggerEvent('confirm', { nodeId: doc.id })
    },

    onRejectTap() {
      const doc = this.data.doc || {}
      if (!doc.needsConfirm || !doc.id) return
      this.triggerEvent('reject', { nodeId: doc.id, isAddon: Boolean(doc.isAddon) })
    },

    onContactStore() {
      const phone = String(this.data.storePhone || '').trim()
      if (!phone) return
      wx.makePhoneCall({ phoneNumber: phone })
    },

    onPreviewImage(e) {
      const url = e.currentTarget.dataset.url
      const list = e.currentTarget.dataset.urls
      let urls = []
      if (Array.isArray(list)) {
        urls = list
          .map((row) =>
            typeof row === 'string' ? row : row && (row.url || row.evidenceUrl || row),
          )
          .filter(Boolean)
      }
      if (!url) return
      if (this.data.imageTapMode === 'edit') {
        this.triggerEvent('imageedit', { url, urls: urls.length ? urls : [url] })
        return
      }
      wx.previewImage({
        current: url,
        urls: urls.length ? urls : [url],
      })
    },
  },
})
