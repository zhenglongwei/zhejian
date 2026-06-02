import request from './request'

export function fetchServicePlanList(params) {
  return request.get('/admin/services', { params })
}

export function fetchServicePlanDetail(planId) {
  return request.get(`/admin/services/${planId}`)
}

export function spotCheckServicePlan(planId, body) {
  return request.post(`/admin/services/${planId}/spot-check`, body)
}

export function suspendServicePlan(planId, body) {
  return request.post(`/admin/services/${planId}/suspend`, body)
}

export function forceUnpublishServicePlan(planId, body) {
  return request.post(`/admin/services/${planId}/force-unpublish`, body)
}

export function limitAppointmentServicePlan(planId, body) {
  return request.post(`/admin/services/${planId}/limit-appointment`, body)
}

export function restoreServicePlan(planId, body) {
  return request.post(`/admin/services/${planId}/restore`, body)
}
