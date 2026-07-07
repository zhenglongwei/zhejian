/**
 * 车主相册 · AI 检查（B-INSP-01）
 */
const { ENV } = require('./config')
const { get, post } = require('./request')

async function fetchAlbumInspectionReports(albumId, options = {}) {
  if (ENV.mode === 'mock') {
    return { items: [] }
  }
  return get(`/user/service-albums/${albumId}/inspection-reports`, {
    limit: options.limit,
  })
}

async function fetchAlbumInspectionAdvice(albumId, options = {}) {
  const payload = {}
  if (options.focusStageId) payload.focusStageId = options.focusStageId
  if (options.triggerContext) payload.triggerContext = options.triggerContext

  if (ENV.mode === 'mock') {
    return {
      status: 'failed',
      source: 'failed',
      errorTitle: '调用失败',
      errorMessage: '当前为 mock 模式，未接入真实大模型',
      reportId: `mock_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      focusStageId: payload.focusStageId || '',
    }
  }
  return post(`/user/service-albums/${albumId}/inspection-advice`, payload, {
    showLoading: false,
  })
}

module.exports = {
  fetchAlbumInspectionReports,
  fetchAlbumInspectionAdvice,
}
