const { buildAlbumInspectionView } = require('./album-inspection-view')
const {
  applyComparePairRowsToNodes,
  normalizeComparePairRows,
} = require('./album-compare-stage-images')

const COMPARE_STAGE_TEMPLATE_IDS = new Set(['body_paint', 'accident'])

function buildMerchantEditInspectionView(state = {}) {
  let nodes = state.nodes || []
  const templateId = state.templateId || ''
  if (COMPARE_STAGE_TEMPLATE_IDS.has(templateId)) {
    const rows = normalizeComparePairRows(state.comparePairRows)
    if (rows.length) {
      nodes = applyComparePairRowsToNodes(nodes, rows)
    }
  }

  const detail = {
    templateId,
    templateName: state.templateName || '',
    serviceName: (state.detail && state.detail.serviceName) || '',
    nodes,
    evidenceItems: state.evidenceItems || [],
    parts: state.parts || [],
    planParts: state.planParts || [],
    planPartsLockedAt: state.detail && state.detail.planPartsLockedAt,
  }

  return buildAlbumInspectionView(detail, {
    audience: 'merchant',
    completenessOnly: true,
  })
}

module.exports = {
  buildMerchantEditInspectionView,
}
