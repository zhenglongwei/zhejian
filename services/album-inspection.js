/**
 * 车主相册 · 智能检查建议（B-INSP-01）
 */
const { ENV } = require('./config')
const { post } = require('./request')
const { fetchServiceAlbum } = require('./service-album')
const { buildRuleBasedAdvice } = require('../utils/album-inspection-advice')

async function fetchAlbumInspectionAdvice(albumId) {
  if (ENV.mode === 'mock') {
    const detail = await fetchServiceAlbum(albumId)
    return buildRuleBasedAdvice(detail)
  }
  return post(`/user/service-albums/${albumId}/inspection-advice`)
}

module.exports = {
  fetchAlbumInspectionAdvice,
}
