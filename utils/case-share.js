/**
 * 案例分享 / H5 链接（V1.0 骨架 URL，Phase D 静态页对齐）
 */
const H5_CASE_BASE = 'https://zhejian.example.com/case'

function buildCaseH5Url(caseId) {
  if (!caseId) return ''
  return `${H5_CASE_BASE}/${caseId}.html`
}

function copyCaseShareLink(caseId) {
  const url = buildCaseH5Url(caseId)
  if (!url) {
    wx.showToast({ title: '案例信息缺失', icon: 'none' })
    return Promise.reject(new Error('missing caseId'))
  }
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: '已复制脱敏案例链接',
          icon: 'success',
        })
        resolve(url)
      },
      fail: reject,
    })
  })
}

module.exports = {
  H5_CASE_BASE,
  buildCaseH5Url,
  copyCaseShareLink,
}
