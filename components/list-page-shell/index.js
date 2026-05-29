Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    tabs: {
      type: Array,
      value: [],
    },
    activeKey: {
      type: String,
      value: '',
    },
    status: {
      type: String,
      value: 'loading',
    },
    errorMessage: {
      type: String,
      value: '',
    },
    emptyTitle: {
      type: String,
      value: '暂无数据',
    },
    emptyDescription: {
      type: String,
      value: '',
    },
    emptyActionText: {
      type: String,
      value: '',
    },
    errorActionText: {
      type: String,
      value: '重试',
    },
    unauthTitle: {
      type: String,
      value: '登录后查看',
    },
    unauthDescription: {
      type: String,
      value: '',
    },
    unauthActionText: {
      type: String,
      value: '微信一键登录',
    },
    tabsCard: {
      type: Boolean,
      value: false,
    },
    scrollableTabs: {
      type: Boolean,
      value: true,
    },
    skeletonCount: {
      type: Number,
      value: 3,
    },
    skeletonRows: {
      type: Number,
      value: 4,
    },
    bodyClearance: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    skeletonItems: [0, 1, 2],
  },

  lifetimes: {
    attached() {
      this.syncSkeletonItems()
    },
  },

  observers: {
    skeletonCount() {
      this.syncSkeletonItems()
    },
  },

  methods: {
    syncSkeletonItems() {
      const n = this.properties.skeletonCount || 3
      this.setData({
        skeletonItems: Array.from({ length: n }, (_, i) => i),
      })
    },

    onTabChange(e) {
      this.triggerEvent('tabchange', e.detail)
    },

    onRetry() {
      this.triggerEvent('retry')
    },

    onEmptyAction() {
      this.triggerEvent('emptyaction')
    },

    onUnauthAction() {
      this.triggerEvent('unauthaction')
    },
  },
})
