/**
 * 遗留路由：V1 订单相册 → V2 服务相册详情（R8 瘦身后仅重定向）
 */
Page({
  onLoad(options) {
    const albumId = options.albumId || ''
    const orderId = options.orderId || options.id || ''
    if (albumId) {
      wx.redirectTo({
        url: `/pages/album/detail/index?albumId=${encodeURIComponent(albumId)}`,
      })
      return
    }
    if (orderId) {
      wx.redirectTo({
        url: `/pages/album/detail/index?albumId=${encodeURIComponent(`alb_${orderId}`)}`,
      })
      return
    }
    wx.showToast({ title: '相册不存在', icon: 'none' })
    setTimeout(() => {
      wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/mine/index' }) })
    }, 1200)
  },
})
