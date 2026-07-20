const {
  ABOUT_ZHEJIAN_IDENTITY,
  ABOUT_ZHEJIAN_ALBUM_TIP,
  ABOUT_ZHEJIAN_NOTES,
} = require('../../../../constants/about-zhejian')
const { openH5Url, buildStoreListH5Url } = require('../../../../constants/h5-links')

Page({
  data: {
    identity: ABOUT_ZHEJIAN_IDENTITY,
    albumTip: ABOUT_ZHEJIAN_ALBUM_TIP,
    notes: ABOUT_ZHEJIAN_NOTES,
  },

  onOpenHelp() {
    wx.navigateTo({ url: '/pages/mine/help/index' })
  },

  onOpenMerchants() {
    openH5Url(buildStoreListH5Url())
  },
})
