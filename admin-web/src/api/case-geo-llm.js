import request from './request'

export function fetchCaseGeoLlmDiff(caseId) {
  return request.get(`/admin/cases/${caseId}/geo-llm-diff`)
}

export function runCaseGeoLlm(caseId) {
  return request.post(`/admin/cases/${caseId}/geo-llm-run`)
}

export function adoptCaseGeoLlm(caseId) {
  return request.post(`/admin/cases/${caseId}/geo-llm-adopt`)
}

export function rejectCaseGeoLlm(caseId, body) {
  return request.post(`/admin/cases/${caseId}/geo-llm-reject`, body)
}
