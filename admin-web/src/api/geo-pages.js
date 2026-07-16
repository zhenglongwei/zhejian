import request from './request'

export function fetchGeoFaqTemplate(params) {
  return request.get('/admin/geo-pages/faq-template', { params })
}

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

export function deleteGeoPage(pageId) {
  return request.delete(`/admin/geo-pages/${pageId}`)
}

export function batchUnpublishGeoPages(ids) {
  return request.post('/admin/geo-pages/batch-unpublish', { ids })
}

export function batchDeleteGeoPages(ids) {
  return request.post('/admin/geo-pages/batch-delete', { ids })
}
