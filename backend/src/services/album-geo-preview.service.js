/**
 * GEO-CITE-A04/A12 · 相册节点聚合预览（模板摘要，不持久化 LLM）
 */
const { extractGeoFromAlbumNodes } = require('../utils/album-geo-extract')
const { assessGeoEvidence } = require('../utils/case-geo-quality')
const { CASE_ARTICLE_GENERATION_SOURCE } = require('../constants/case-article-status')
const {
  GENERATION_VERSION,
  buildAiSummary,
  buildGeoSections,
  buildKeyInfo,
  countNodeImages,
} = require('../utils/case-article-templates')

/**
 * @param {object} albumView buildAlbumView 产物（含 nodes / store / vehicle 等）
 * @param {{ coldStart?: boolean, nodes?: object[] }} [options]
 */
function buildAlbumGeoPreview(albumView, options = {}) {
  const coldStart = Boolean(options.coldStart)
  const nodes = options.nodes || albumView.nodes || []
  const city = albumView.store?.city || ''
  const serviceName = albumView.serviceName || '维修服务'
  const storeName = albumView.store?.name || ''
  const vehicle = albumView.vehicle || {}
  const storeNote = String(albumView.storeNote || '').trim()
  const planAmount = albumView.planAmount ?? albumView.planMinAmount ?? null
  const imageCount = countNodeImages(nodes)

  const geoExtracted = extractGeoFromAlbumNodes(nodes, {
    coldStart,
    serviceName,
    planAmount,
    storeNote,
  })

  const { faultDesc, inspectResult, repairPlan, resultConfirm } = geoExtracted

  const sections = buildGeoSections({
    city,
    vehicle,
    serviceName,
    storeName,
    storeNote,
    faultDesc,
    inspectResult,
    repairPlan,
    resultConfirm,
    coldStart,
    hasImages: imageCount > 0,
  })

  const geoQuality = assessGeoEvidence({
    nodes,
    coldStart,
    serviceName,
    planAmount,
    storeNote,
    imageCount: albumView.imageCount ?? imageCount,
  })

  const aiSummaryPreview = buildAiSummary({
    city,
    vehicle,
    serviceName,
    faultDesc,
    inspectResult,
    repairPlan,
    resultConfirm,
    coldStart,
    hasImages: imageCount > 0,
  })

  return {
    geo: {
      keyInfo: buildKeyInfo({ city, vehicle, serviceName, storeName }),
      faultDesc,
      inspectResult,
      repairPlan,
      resultConfirm,
      sections,
      generationSource: CASE_ARTICLE_GENERATION_SOURCE.TEMPLATE,
      generationVersion: GENERATION_VERSION,
      fromNodes: geoExtracted.fromNodes,
    },
    geoQuality: {
      level: geoQuality.level,
      score: geoQuality.score,
      missingFields: geoQuality.missingFields,
      warnings: geoQuality.warnings,
      summaryText: geoQuality.summaryText,
    },
    geoPreview: {
      faultDesc,
      inspectResult,
      repairPlan,
      resultConfirm,
      storeNote: geoExtracted.storeNote,
      stageSnapshot: geoExtracted.stageSnapshot,
      fromNodes: geoExtracted.fromNodes,
    },
    aiSummaryPreview,
  }
}

module.exports = {
  buildAlbumGeoPreview,
}
