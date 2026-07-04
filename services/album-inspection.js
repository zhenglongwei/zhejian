const { ENV } = require('./config')

/**
 * 车主相册 · 智能检查建议（Phase B 接 LLM；当前返回规则摘要占位）
 */
async function fetchAlbumInspectionAdvice(albumId) {
  if (ENV.mode === 'mock') {
    return {
      focusAreas: ['建议先完成「单据检查」逐张查看定损单与报价单。'],
      suspectedIssues: [],
      suggestedPhotos: [],
      nextSteps: ['如有疑问，可使用「配件验真」或相册内反馈联系门店。'],
      source: 'mock',
    }
  }
  const token = wx.getStorageSync('token') || ''
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${ENV.baseUrl}/api/${ENV.apiVersion}/user/service-albums/${albumId}/inspection-advice`,
      method: 'POST',
      header: {
        Authorization: token ? `Bearer ${token}` : '',
        'X-Client-Type': ENV.clientType,
        'X-App-Version': ENV.appVersion,
      },
      success(res) {
        const body = res.data || {}
        if (res.statusCode === 404 || res.statusCode === 501) {
          reject({ code: 'NOT_READY', message: '智能检查建议即将上线，请先按页面顺序自助查看。' })
          return
        }
        if (res.statusCode >= 400 || (body.code !== 0 && body.code !== undefined)) {
          reject({ message: body.message || '生成失败，请稍后重试' })
          return
        }
        resolve(body.data || body)
      },
      fail() {
        reject({ code: 'NETWORK_ERROR', message: '网络异常，请稍后重试' })
      },
    })
  })
}

module.exports = {
  fetchAlbumInspectionAdvice,
}
