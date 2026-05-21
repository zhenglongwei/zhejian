Component({
  properties: {
    tabs: {
      type: Array,
      value: [],
    },
    activeKey: {
      type: String,
      value: '',
    },
    /** true：单行横排 + 横向滚动（标签多时使用）；false：自动换行 */
    scrollable: {
      type: Boolean,
      value: false,
    },
  },
  methods: {
    onTap(e) {
      const { key } = e.currentTarget.dataset
      if (key === undefined || key === this.properties.activeKey) return
      this.triggerEvent('change', { key })
    },
  },
})
