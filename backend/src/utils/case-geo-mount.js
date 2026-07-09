/**
 * CASE-ENR-03 · 案例 → GEO 专题挂载读侧字段（enrichment + snapshot，不写 live album）
 */
const { resolveCaseEnrichment } = require('../schemas/case-enrichment.schema')
const { extractSnapshotFromContentJson } = require('../schemas/case-snapshot.schema')
const { resolveServiceItemId } = require('./case-internal-links')

function resolveMountVehicleText(content = {}, snapshot = null) {
  if (content.vehicleText) return String(content.vehicleText).trim()
  if (snapshot?.vehicle && typeof snapshot.vehicle === 'object') {
    const v = snapshot.vehicle
    const title = [v.brand, v.series, v.model].filter(Boolean).join('')
    return title ? `${title}（已脱敏）` : ''
  }
  return ''
}

/**
 * @param {object} row public_cases 行
 * @param {object|null} [album]
 */
function buildCaseMountItemFromRow(row, album = null) {
  const content = row?.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  const snapshot = extractSnapshotFromContentJson(content)
  const enrichment = resolveCaseEnrichment(row)
  const geo = enrichment?.geo || content.geo || {}

  return {
    id: row.id,
    city: snapshot?.city || row.city || '',
    serviceName: snapshot?.serviceName || row.serviceName || '',
    serviceItemId: resolveServiceItemId(
      {
        serviceName: snapshot?.serviceName || row.serviceName,
        serviceItemId: snapshot?.serviceItemId || content.serviceItemId,
      },
      album
    ),
    title: snapshot?.title || row.title || '',
    summary: enrichment?.aiSummary || row.summary || snapshot?.summary || '',
    faultDesc: geo.faultDesc || content.faultDesc || snapshot?.geo?.faultDesc || '',
    vehicleText: resolveMountVehicleText(content, snapshot),
    tags: Array.isArray(content.tags) ? content.tags : [],
  }
}

function mergeTopicMountIds(existing = [], targetIds = []) {
  return [...new Set([...(existing || []), ...(targetIds || [])])]
}

module.exports = {
  buildCaseMountItemFromRow,
  mergeTopicMountIds,
  resolveMountVehicleText,
}
