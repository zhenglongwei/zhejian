const { ENV } = require('./config')
const { get, post } = require('./request')

function useApi() {
  return ENV.mode !== 'mock'
}

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchAlbumPartVerifyContext(albumId) {
  if (useApi()) {
    return get(`/user/service-albums/${albumId}/part-verifications`)
  }
  await delay()
  return {
    albumId,
    albumTitle: '我的服务相册',
    hasParts: false,
    parts: [],
    summary: { total: 0, label: '' },
    consentText: '',
  }
}

async function saveAlbumPartVerifications(albumId, payload = {}) {
  if (useApi()) {
    return post(`/user/service-albums/${albumId}/part-verifications`, payload)
  }
  await delay()
  return { albumId, summary: { label: '已保存' } }
}

module.exports = {
  fetchAlbumPartVerifyContext,
  saveAlbumPartVerifications,
}
