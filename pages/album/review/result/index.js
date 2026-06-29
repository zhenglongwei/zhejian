const { ALBUM_REVIEW_SUCCESS_MESSAGE } = require('../../../../utils/album-review-form')

Page({
  data: {
    reviewId: '',
    successMessage: ALBUM_REVIEW_SUCCESS_MESSAGE,
  },

  onLoad(options) {
    this.setData({
      reviewId: options.reviewId || '',
    })
  },

  onBackAlbum() {
    wx.navigateBack({ delta: 2 })
  },
})
