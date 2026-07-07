/**
 * 车主相册 · 智能检查建议（B-INSP-01）
 */
const { ENV } = require('./config')
const { post } = require('./request')
const { fetchServiceAlbum } = require('./service-album')
const { buildRuleBasedAdvice } = require('../utils/album-inspection-advice')

async function fetchAlbumInspectionAdvice(albumId, options = {}) {
  const payload = {}
  if (options.focusStageId) payload.focusStageId = options.focusStageId
  if (options.triggerContext) payload.triggerContext = options.triggerContext

  if (ENV.mode === 'mock') {
    const detail = await fetchServiceAlbum(albumId)
    return buildRuleBasedAdvice(detail, payload)
  }
  return post(`/user/service-albums/${albumId}/inspection-advice`, payload)
}

module.exports = {
  fetchAlbumInspectionAdvice,
}
