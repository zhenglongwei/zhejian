function resolveDisplayNote(captionLine, activeNodeId, activeTitle, nodeNoteMap) {
  const direct = String(captionLine || '').trim()
  if (direct) return direct

  const map = nodeNoteMap || {}
  const nodeId = String(activeNodeId || '').trim()
  if (nodeId && map[nodeId]) {
    return String(map[nodeId]).trim()
  }

  const title = String(activeTitle || '').trim()
  if (title && map[`title:${title}`]) {
    return String(map[`title:${title}`]).trim()
  }

  return ''
}

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    chapters: {
      type: Array,
      value: [],
    },
    activeNodeId: {
      type: String,
      value: '',
    },
    disabled: {
      type: Boolean,
      value: false,
    },
    overlay: {
      type: Boolean,
      value: false,
    },
    embedded: {
      type: Boolean,
      value: false,
    },
    mode: {
      type: String,
      value: 'chips',
    },
    stages: {
      type: Array,
      value: [],
    },
    activeTitle: {
      type: String,
      value: '',
    },
    captionLine: {
      type: String,
      value: '',
    },
    nodeNoteMap: {
      type: Object,
      value: {},
    },
    toolbarBottomPadPx: {
      type: Number,
      value: 0,
    },
    showArchive: {
      type: Boolean,
      value: false,
    },
    showInspect: {
      type: Boolean,
      value: false,
    },
    /** @deprecated 使用 showInspect */
    showCompare: {
      type: Boolean,
      value: false,
    },
    showParts: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    scrollIntoView: '',
    displayNote: '',
  },

  observers: {
    'activeNodeId, chapters': function (activeNodeId, chapters) {
      const list = chapters || []
      const resolvedId =
        activeNodeId || (list[0] && list[0].nodeId) || ''
      this.setData({
        scrollIntoView: resolvedId ? `album-chapter-${resolvedId}` : '',
      })
    },
    'captionLine, activeNodeId, activeTitle, nodeNoteMap': function syncDisplayNote(
      captionLine,
      activeNodeId,
      activeTitle,
      nodeNoteMap,
    ) {
      this.setData({
        displayNote: resolveDisplayNote(
          captionLine,
          activeNodeId,
          activeTitle,
          nodeNoteMap,
        ),
      })
    },
  },

  lifetimes: {
    attached() {
      const { activeNodeId, chapters, captionLine, activeTitle, nodeNoteMap } =
        this.properties
      const list = chapters || []
      const resolvedId = activeNodeId || (list[0] && list[0].nodeId) || ''
      this.setData({
        scrollIntoView: resolvedId ? `album-chapter-${resolvedId}` : '',
        displayNote: resolveDisplayNote(
          captionLine,
          activeNodeId,
          activeTitle,
          nodeNoteMap,
        ),
      })
    },
  },

  methods: {
    onChapterTap(e) {
      if (this.properties.disabled) return
      const { nodeId, startIndex } = e.currentTarget.dataset
      if (!nodeId) return
      this.triggerEvent('chaptertap', {
        nodeId,
        startIndex: Number(startIndex) || 0,
      })
    },

    onArchiveTap() {
      if (this.properties.disabled) return
      this.triggerEvent('archivetap')
    },

    onInspectTap() {
      if (this.properties.disabled) return
      this.triggerEvent('inspecttap')
    },

    /** @deprecated 使用 onInspectTap */
    onCompareTap() {
      if (this.properties.disabled) return
      this.triggerEvent('inspecttap')
    },

    onPartsTap() {
      if (this.properties.disabled) return
      this.triggerEvent('partstap')
    },

    onSegmentTap(e) {
      if (this.properties.disabled) return
      const { nodeId, startIndex } = e.currentTarget.dataset
      if (!nodeId) return
      this.onChapterTap({
        currentTarget: {
          dataset: { nodeId, startIndex },
        },
      })
    },
  },
})
