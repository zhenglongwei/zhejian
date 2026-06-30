Page({
  onLoad(options) {
    const query = Object.keys(options || {})
      .map((key) => `${key}=${encodeURIComponent(options[key] || '')}`)
      .join('&')
    wx.redirectTo({
      url: `/pages/album/engage/index${query ? `?${query}` : ''}`,
    })
  },
})
