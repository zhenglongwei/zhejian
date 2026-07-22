const {
  ABOUT_ZHEJIAN_IDENTITY,
  ABOUT_ZHEJIAN_ALBUM_TIP,
  ABOUT_ZHEJIAN_NOTES,
} = require('../../../../constants/about-zhejian')
const { openH5Url, buildStoreListH5Url } = require('../../../../constants/h5-links')
const { userHasBoundAlbum } = require('../../../../utils/album-store-access')

Page({
  data: {
    identity: ABOUT_ZHEJIAN_IDENTITY,
    albumTip: ABOUT_ZHEJIAN_ALBUM_TIP,
    notes: ABOUT_ZHEJIAN_NOTES,
    showPublicMerchantsLink: true,
  },

  async onShow() {
    const bound = await userHasBoundAlbum()
    this.setData({ showPublicMerchantsLink: !bound })
  },

  onOpenHelp() {
    wx.navigateTo({ url: '/pages/mine/help/index' })
  },

  onOpenMerchants() {
    if (!this.data.showPublicMerchantsLink) {
      wx.showToast({ title: '请从服务相册进入本店', icon: 'none' })
      return
    }
    openH5Url(buildStoreListH5Url())
  },
})
