import request from './request'

export function fetchAlbumComplianceList(params) {
  return request.get('/admin/album-compliance', { params })
}

export function fetchAlbumComplianceDetail(albumId) {
  return request.get(`/admin/album-compliance/${albumId}`)
}

export function approveAlbumCompliance(albumId) {
  return request.post(`/admin/album-compliance/${albumId}/approve`)
}

export function rejectAlbumCompliance(albumId, body) {
  return request.post(`/admin/album-compliance/${albumId}/reject`, body)
}
