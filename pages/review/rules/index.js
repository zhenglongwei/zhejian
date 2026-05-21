Page({
  data: {
    status: 'loading',
    errorMessage: '',
  },

  onLoad() {
    this.setData({ status: 'normal' })
  },

  onRetry() {
    this.setData({ status: 'loading', errorMessage: '' })
    this.setData({ status: 'normal' })
  },
})
