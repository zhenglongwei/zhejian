import request from './request'

export function fetchAuthorizationLogList(params) {
  return request.get('/admin/authorization-logs', { params })
}

export function fetchAuthorizationLogDetail(logId) {
  return request.get(`/admin/authorization-logs/${logId}`)
}
