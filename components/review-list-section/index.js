Component({
  properties: {
    sectionTitle: { type: String, value: '用户评价' },
    hint: { type: String, value: '' },
    topTagsLabel: { type: String, value: '用户常提到' },
    topTags: { type: Array, value: [] },
    reviews: { type: Array, value: [] },
    status: { type: String, value: 'normal' },
    emptyTitle: { type: String, value: '暂无公开评价' },
    emptyDescription: {
      type: String,
      value: '完成服务后可提交真实评价，帮助其他用户了解门店。',
    },
    errorTitle: { type: String, value: '评价加载失败' },
    errorDescription: {
      type: String,
      value: '请稍后重试加载评价。',
    },
    compact: { type: Boolean, value: true },
    titleSize: { type: String, value: 'h2' },
  },

  methods: {
    onRetry() {
      this.triggerEvent('retry')
    },

    onReviewTap(e) {
      const { reviewId } = e.detail || {}
      const review = (this.properties.reviews || []).find(
        (item) => item.reviewId === reviewId
      )
      this.triggerEvent('reviewtap', {
        reviewId,
        orderId: review && review.orderId,
      })
    },
  },
})
