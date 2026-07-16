import request from './request'

export function fetchStoreCapabilityList(params) {
  return request.get('/admin/store-capability-reviews', { params })
}

export function fetchStoreCapabilityDetail(storeId) {
  return request.get(`/admin/store-capability-reviews/${storeId}`)
}

export function approveStoreCapability(storeId, body = {}) {
  return request.post(`/admin/store-capability-reviews/${storeId}/approve`, body)
}

export function rejectStoreCapability(storeId, body = {}) {
  return request.post(`/admin/store-capability-reviews/${storeId}/reject`, body)
}
