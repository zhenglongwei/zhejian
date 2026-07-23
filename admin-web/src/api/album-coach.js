import request from './request'

export function fetchAlbumCoachPacks() {
  return request.get('/admin/album-coach/packs')
}

export function fetchAlbumCoachPack(packId) {
  return request.get(`/admin/album-coach/packs/${encodeURIComponent(packId)}`)
}

export function saveAlbumCoachPack(packId, body) {
  return request.put(`/admin/album-coach/packs/${encodeURIComponent(packId)}`, body)
}

export function resetAlbumCoachPack(packId) {
  return request.delete(`/admin/album-coach/packs/${encodeURIComponent(packId)}`)
}

export function createAlbumCoachPack(body) {
  return request.post('/admin/album-coach/packs', body)
}

export function reloadAlbumCoachConfig() {
  return request.post('/admin/album-coach/reload')
}

export function previewAlbumCoach(body) {
  return request.post('/admin/album-coach/preview', body)
}
