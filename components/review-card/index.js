const STAR_RANGE = [1, 2, 3, 4, 5]
const { stripTagOnlyReviewContent } = require('../../utils/review-display')

Component({
  properties: {
    reviewId: { type: String, value: '' },
    orderId: { type: String, value: '' },
    displayName: { type: String, value: '' },
    overallScore: { type: Number, value: 0 },
    content: { type: String, value: '' },
    tags: { type: Array, value: [] },
    serviceName: { type: String, value: '' },
    createdAtText: { type: String, value: '' },
    showStatus: { type: Boolean, value: false },
    statusLabel: { type: String, value: '' },
    statusVariant: { type: String, value: 'default' },
    compact: { type: Boolean, value: false },
    plain: { type: Boolean, value: false },
    images: { type: Array, value: [] },
    imagesApproved: { type: Boolean, value: false },
  },

  data: {
    starRange: STAR_RANGE,
    scoreRounded: 0,
    displayContent: '',
  },

  observers: {
    overallScore(score) {
      this.setData({ scoreRounded: Math.round(Number(score) || 0) })
    },
    'content, tags': function (content, tags) {
      this.setData({
        displayContent: stripTagOnlyReviewContent(content, tags),
      })
    },
  },

  lifetimes: {
    attached() {
      this.setData({
        scoreRounded: Math.round(Number(this.properties.overallScore) || 0),
        displayContent: stripTagOnlyReviewContent(
          this.properties.content,
          this.properties.tags,
        ),
      })
    },
  },

  methods: {
    onTap() {
      const { reviewId, orderId } = this.properties
      this.triggerEvent('tap', { reviewId, orderId })
    },
  },
})
