import request from './request'

export function fetchReportList(params) {
  return request.get('/admin/reports', { params })
}

export function fetchReportDetail(reportId) {
  return request.get(`/admin/reports/${reportId}`)
}

export function acceptReport(reportId, body) {
  return request.post(`/admin/reports/${reportId}/accept`, body)
}

export function rejectReport(reportId, body) {
  return request.post(`/admin/reports/${reportId}/reject`, body)
}

export function resolveReport(reportId, body) {
  return request.post(`/admin/reports/${reportId}/resolve`, body)
}
