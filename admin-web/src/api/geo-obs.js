import request from './request'

export function fetchCrawlerStats(params) {
  return request.get('/admin/geo/crawler-stats', { params })
}

export function fetchProbeReport(params) {
  return request.get('/admin/geo/probe-report', { params })
}

export function fetchCitationGaps(params) {
  return request.get('/admin/geo/citation-gaps', { params })
}

export function fetchVehicleTopicSeeds(params) {
  return request.get('/admin/geo/vehicle-topic-seeds', { params })
}

export function createVehicleTopicDraft(slug) {
  return request.post(`/admin/geo/vehicle-topic-seeds/${encodeURIComponent(slug)}/draft`)
}

export function runProbeBatch(body) {
  return request.post('/admin/geo/probe-run', body)
}

export function syncProbeSeeds() {
  return request.post('/admin/geo/probe-seed-sync')
}

export function fetchGeoPromptList(params) {
  return request.get('/admin/geo/prompts', { params })
}
