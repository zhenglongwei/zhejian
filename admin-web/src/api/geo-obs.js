import request from './request'

export function fetchCrawlerStats(params) {
  return request.get('/admin/geo/crawler-stats', { params })
}

export function fetchProbeReport(params) {
  return request.get('/admin/geo/probe-report', { params })
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
