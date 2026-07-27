/**
 * 授权预览失败提示：脱敏未就绪等长文案用弹窗，避免 toast 截断
 */
function showAuthorizePreviewError(error) {
  const message = (error && error.message) || '预览加载失败'
  const code = error && error.code
  const isPreMaskWait =
    code === 100007 ||
    code === 409 ||
    /稍后再试|脱敏处理中|脱敏未完成|暂无法发布/.test(message)
  if (isPreMaskWait) {
    wx.showModal({
      title: '暂时无法预览',
      content: message,
      showCancel: false,
      confirmText: '知道了',
    })
    return
  }
  wx.showToast({
    title: message,
    icon: 'none',
  })
}

module.exports = {
  showAuthorizePreviewError,
}
