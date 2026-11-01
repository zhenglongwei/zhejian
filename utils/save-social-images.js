/**
 * 把已经打开的打码图存进手机相册。不打包、不另下一份大文件。
 */

function ensureAlbumPermission() {
  return new Promise((resolve, reject) => {
    wx.getSetting({
      success(res) {
        const auth = (res && res.authSetting) || {}
        if (auth['scope.writePhotosAlbum']) {
          resolve()
          return
        }
        wx.authorize({
          scope: 'scope.writePhotosAlbum',
          success: () => resolve(),
          fail: () => {
            wx.showModal({
              title: '保存到相册',
              content: '允许后，这些图会存进相册。',
              confirmText: '去设置',
              success(answer) {
                if (!answer.confirm) {
                  reject(new Error('cancelled'))
                  return
                }
                wx.openSetting({
                  success(setting) {
                    if (setting.authSetting && setting.authSetting['scope.writePhotosAlbum']) resolve()
                    else reject(new Error('denied'))
                  },
                  fail: () => reject(new Error('denied')),
                })
              },
            })
          },
        })
      },
      fail: () => reject(new Error('denied')),
    })
  })
}

function saveOne(url) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: url,
      success(info) {
        wx.saveImageToPhotosAlbum({
          filePath: info.path,
          success: () => resolve(),
          fail: reject,
        })
      },
      fail: reject,
    })
  })
}

async function saveSocialImages(urls = []) {
  const list = (urls || []).filter(Boolean)
  if (!list.length) {
    wx.showToast({ title: '先勾选要保存的照片', icon: 'none' })
    return { saved: 0, failed: 0 }
  }
  await ensureAlbumPermission()
  wx.showLoading({ title: '保存中', mask: true })
  let saved = 0
  let failed = 0
  try {
    for (let i = 0; i < list.length; i += 1) {
      try {
        await saveOne(list[i])
        saved += 1
      } catch (e) {
        failed += 1
      }
    }
  } finally {
    wx.hideLoading()
  }
  if (saved && !failed) {
    wx.showToast({ title: '已保存到相册', icon: 'success' })
  } else if (saved) {
    wx.showToast({ title: `${saved}张已保存`, icon: 'none' })
  } else {
    wx.showToast({ title: '没能保存', icon: 'none' })
  }
  return { saved, failed }
}

function writeAlbumFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => {
        wx.showLoading({ title: '正在保存', mask: true })
        resolve()
      },
      fail: reject,
    })
  })
}

function savePosterFile(filePath) {
  return ensureAlbumPermission().then(() => writeAlbumFile(filePath))
}

module.exports = {
  saveSocialImages,
  savePosterFile,
  ensureAlbumPermission,
  writeAlbumFile,
}
