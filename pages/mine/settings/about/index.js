const {
  ABOUT_ZHEJIAN_IDENTITY,
  ABOUT_ZHEJIAN_ALBUM_TIP,
  ABOUT_ZHEJIAN_NOTES,
  ABOUT_ZHEJIAN_ICP,
} = require('../../../../constants/about-zhejian')
const { openH5Url, buildStoreListH5Url } = require('../../../../constants/h5-links')
const { userHasBoundAlbum } = require('../../../../utils/album-store-access')

Page({
  data: {
    identity: ABOUT_ZHEJIAN_IDENTITY,
    albumTip: ABOUT_ZHEJIAN_ALBUM_TIP,
    notes: ABOUT_ZHEJIAN_NOTES,
    icp: ABOUT_ZHEJIAN_ICP,
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

  onOpenIcp() {
    const url = (this.data.icp && this.data.icp.queryUrl) || ''
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: '备案查询链接已复制', icon: 'none' })
      },
    })
  },
})
