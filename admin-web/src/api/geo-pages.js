import request from './request'

export function fetchGeoPageList(params) {
  return request.get('/admin/geo-pages', { params })
}

export function fetchGeoPageDetail(pageId) {
  return request.get(`/admin/geo-pages/${pageId}`)
}

export function createGeoPage(body) {
  return request.post('/admin/geo-pages', body)
}

export function updateGeoPage(pageId, body) {
  return request.put(`/admin/geo-pages/${pageId}`, body)
}

export function publishGeoPage(pageId) {
  return request.post(`/admin/geo-pages/${pageId}/publish`)
}

export function unpublishGeoPage(pageId) {
  return request.post(`/admin/geo-pages/${pageId}/unpublish`)
}
