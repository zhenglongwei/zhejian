const { ALBUM_FEEDBACK_SUCCESS_MESSAGE } = require('../../../utils/album-feedback-form')

Page({
  data: {
    feedbackId: '',
    successMessage: ALBUM_FEEDBACK_SUCCESS_MESSAGE,
  },

  onLoad(options) {
    if (options.success !== '1') {
      wx.redirectTo({ url: '/pages/album/list/index' })
      return
    }
    this.setData({
      feedbackId: options.feedbackId || '',
    })
  },

  onBackAlbum() {
    wx.navigateBack({ delta: 2 })
  },

  onBackList() {
    wx.redirectTo({ url: '/pages/album/list/index' })
  },
})
