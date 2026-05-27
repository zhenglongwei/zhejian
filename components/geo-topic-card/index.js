Component({
  properties: {
    topicId: {
      type: String,
      value: '',
    },
    title: {
      type: String,
      value: '',
    },
    summary: {
      type: String,
      value: '',
    },
    coverImage: {
      type: String,
      value: '',
    },
    tagText: {
      type: String,
      value: '本地专题',
    },
    updatedAt: {
      type: String,
      value: '',
    },
    /** true：底部 tag + 更新时间（搜索列表）；false：顶部 tag（首页横滑） */
    showMeta: {
      type: Boolean,
      value: false,
    },
    bordered: {
      type: Boolean,
      value: true,
    },
    shadow: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    onTap() {
      if (!this.properties.topicId) return
      this.triggerEvent('tap', { topicId: this.properties.topicId })
    },
  },
})
