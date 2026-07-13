/**
 * GEO-TOPIC-H08 · 运营专题健康度看板 API
 */
const { buildGeoTopicHealthReport } = require('./geo-topic-health.service')

async function buildAdminGeoTopicHealth(query = {}) {
  void query
  return buildGeoTopicHealthReport()
}

module.exports = {
  buildAdminGeoTopicHealth,
}
