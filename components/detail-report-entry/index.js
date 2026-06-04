Component({
  properties: {
    targetType: {
      type: String,
      value: '',
    },
    targetId: {
      type: String,
      value: '',
    },
    targetTitle: {
      type: String,
      value: '',
    },
    attached: {
      type: Boolean,
      value: true,
    },
  },
  methods: {
    onTap() {
      const { targetType, targetId, targetTitle } = this.properties
      if (!targetType || !targetId) return
      const title = encodeURIComponent(targetTitle || '')
      wx.navigateTo({
        url: `/pages/report/submit/index?targetType=${targetType}&targetId=${targetId}&targetTitle=${title}`,
      })
    },
  },
})
