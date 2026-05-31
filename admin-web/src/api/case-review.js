import request from './request'

export function fetchCaseList(params) {
  return request.get('/admin/cases', { params })
}

export function fetchCaseDetail(caseId) {
  return request.get(`/admin/cases/${caseId}`)
}

export function approveCase(caseId, body) {
  return request.post(`/admin/cases/${caseId}/approve`, body)
}

export function rejectCase(caseId, body) {
  return request.post(`/admin/cases/${caseId}/reject`, body)
}

export function requestModifyCase(caseId, body) {
  return request.post(`/admin/cases/${caseId}/request-modify`, body)
}
