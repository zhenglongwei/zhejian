const { normalizeServiceAlbumListTab } = require('../../constants/service-album-status')

Page({
  onLoad(options = {}) {
    const tab = normalizeServiceAlbumListTab(options.tab || 'done')
    wx.redirectTo({
      url: `/pages/album/list/index?tab=${tab}`,
    })
  },
})
