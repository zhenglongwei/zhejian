const { stripSocialText } = require('./album-social-card')
const { readSocialText, checkedSocialUrls } = require('./social-card-session')
const { saveSocialImages } = require('./save-social-images')

function copyCurrentSocialText(page) {
  const text = stripSocialText(readSocialText(page))
  if (!text) {
    wx.showToast({ title: '还没有可复制的文字', icon: 'none' })
    return
  }
  wx.setClipboardData({
    data: text,
    fail() {
      wx.showToast({ title: '复制失败', icon: 'none' })
    },
  })
}

function saveCurrentSocialImages(page) {
  return saveSocialImages(checkedSocialUrls(page)).catch((err) => {
    const message = err && err.message
    if (message === 'cancelled' || message === 'denied') return
    wx.showToast({ title: '没能保存', icon: 'none' })
  })
}

module.exports = {
  copyCurrentSocialText,
  saveCurrentSocialImages,
}
