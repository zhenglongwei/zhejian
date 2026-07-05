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

const CRITICAL_IMPORTANCE_LABEL = '必留'

function collectCriticalMissingFromPanels(panels = []) {
  const items = []
  ;(panels || []).forEach((panel) => {
    ;(panel.rows || []).forEach((row) => {
      if (row.present || row.importanceLabel !== CRITICAL_IMPORTANCE_LABEL) return
      items.push({
        id: row.id,
        label: row.label,
        panelTitle: panel.title || '',
      })
    })
  })
  return items
}

function formatCriticalMissingSummary(items = [], maxItems = 6) {
  const list = items || []
  if (!list.length) return ''
  const head = list.slice(0, maxItems).map((item) => item.label).join('、')
  if (list.length <= maxItems) return head
  return `${head} 等 ${list.length} 项`
}

module.exports = {
  buildMerchantEditInspectionView,
  collectCriticalMissingFromPanels,
  formatCriticalMissingSummary,
  CRITICAL_IMPORTANCE_LABEL,
}
