import request from '@/utils/request'

export function fetchStoreExpiryFollowUps(params) {
  return request.get('/admin/store-expiry-followups', { params })
}
