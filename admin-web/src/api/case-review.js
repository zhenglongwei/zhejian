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

export function retryCaseAssetDesensitize(caseId, assetId) {
  return request.post(`/admin/cases/${caseId}/assets/${assetId}/retry-desensitize`)
}

export function retryAllCaseDesensitize(caseId) {
  return request.post(`/admin/cases/${caseId}/retry-desensitize-all`)
}

export function fetchCaseArticleExport(caseId) {
  return request.get(`/admin/cases/${caseId}/article-export`)
}

export function markCaseArticlePublishedWechat(caseId) {
  return request.post(`/admin/cases/${caseId}/article-status`, {
    targetStatus: 'published_wechat',
  })
}

export function updateCaseFaqLinks(caseId, body) {
  return request.put(`/admin/cases/${caseId}/faq`, body)
}

export function updateCaseGeoContent(caseId, body) {
  return request.put(`/admin/cases/${caseId}/geo-content`, body)
}

export function updateCaseEnrichment(caseId, body) {
  return request.put(`/admin/cases/${caseId}/enrichment`, body)
}

export function regenerateCaseArticle(caseId) {
  return request.post(`/admin/cases/${caseId}/regenerate-article`)
}

export function passCaseSpotCheck(caseId, body) {
  return request.post(`/admin/cases/${caseId}/spot-check/pass`, body)
}

export function failCaseSpotCheck(caseId, body) {
  return request.post(`/admin/cases/${caseId}/spot-check/fail`, body)
}
