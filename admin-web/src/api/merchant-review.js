import request from './request'

export function fetchMerchantList(params) {
  return request.get('/admin/merchants', { params })
}

export function fetchMerchantDetail(merchantId) {
  return request.get(`/admin/merchants/${merchantId}`)
}

export function approveMerchant(merchantId, body) {
  return request.post(`/admin/merchants/${merchantId}/approve`, body)
}

export function rejectMerchant(merchantId, body) {
  return request.post(`/admin/merchants/${merchantId}/reject`, body)
}

export function requestModifyMerchant(merchantId, body) {
  return request.post(`/admin/merchants/${merchantId}/request-modify`, body)
}
