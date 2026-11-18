const { inviteAlbumReview } = require('../services/merchant-album-review')

let inFlight = false

/**
 * 商家端统一的「邀请车主评价」：确认 → 发送 → 按是否真的送达提示。
 * 后端 24 小时内同一相册只落一条提醒，重复点击不再重复打扰车主。
 */
function inviteOwnerReview(albumId) {
  if (!albumId || inFlight) return Promise.resolve({ sent: false })
  return new Promise((resolve) => {
    wx.showModal({
      title: '邀请车主评价',
      content: '完工后提醒车主对本次服务进行评价，评价内容可展示在公开案例中。是否发送邀请？',
      confirmText: '发送邀请',
      success: async (res) => {
        if (!res.confirm) {
          resolve({ sent: false })
          return
        }
        inFlight = true
        wx.showLoading({ title: '发送中', mask: true })
        try {
          const data = await inviteAlbumReview(albumId)
          wx.hideLoading()
          const sent = !data || data.notified !== false
          wx.showToast({
            title: sent ? '已提醒车主评价' : '今天已经提醒过了',
            icon: sent ? 'success' : 'none',
          })
          resolve({ sent })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: (err && err.message) || '发送失败', icon: 'none' })
          resolve({ sent: false, failed: true })
        } finally {
          inFlight = false
        }
      },
      fail: () => resolve({ sent: false }),
    })
  })
}

module.exports = {
  inviteOwnerReview,
}
