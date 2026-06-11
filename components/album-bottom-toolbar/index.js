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
  },

  data: {
    scrollIntoView: '',
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
  },

  lifetimes: {
    attached() {
      const { activeNodeId, chapters } = this.properties
      const list = chapters || []
      const resolvedId = activeNodeId || (list[0] && list[0].nodeId) || ''
      this.setData({
        scrollIntoView: resolvedId ? `album-chapter-${resolvedId}` : '',
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
  },
})
