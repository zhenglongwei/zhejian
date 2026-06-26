/**
 * GEO-CITE-A01 · 六阶段节点 note → GEO 字段聚合
 * 真源：album_nodes（stage_1～6）；storeNote 仅作补充说明
 */
const {
  defaultInspectResult,
  defaultRepairPlan,
} = require('./case-article-templates')

const STAGE_FAULT = 'stage_1'
const STAGE_INSPECT = 'stage_2'
const STAGE_PLAN = 'stage_3'
const STAGE_RESULT = 'stage_6'

function nodeKey(node) {
  if (!node) return ''
  return String(node.id || node.nodeId || '').trim()
}

function findStageNode(nodes, stageId) {
  return (nodes || []).find((n) => nodeKey(n) === stageId) || null
}

function getNodeNote(node) {
  return String(node?.note || '').trim()
}

function stageSnapshot(node) {
  if (!node) {
    return { hasNote: false, hasImages: false }
  }
  return {
    hasNote: Boolean(getNodeNote(node)),
    hasImages: Array.isArray(node.images) && node.images.length > 0,
  }
}

/**
 * @param {object[]} nodes
 * @param {{ coldStart?: boolean, serviceName?: string, planAmount?: number|null, storeNote?: string }} [options]
 */
function extractGeoFromAlbumNodes(nodes, options = {}) {
  const coldStart = Boolean(options.coldStart)
  const serviceName = options.serviceName || '维修服务'
  const storeNote = String(options.storeNote || '').trim()
  const planAmountRaw = options.planAmount
  const planAmount =
    planAmountRaw != null && planAmountRaw !== '' && Number.isFinite(Number(planAmountRaw))
      ? Number(planAmountRaw)
      : null

  const stage1 = findStageNode(nodes, STAGE_FAULT)
  const stage2 = findStageNode(nodes, STAGE_INSPECT)
  const stage3 = findStageNode(nodes, STAGE_PLAN)
  const stage6 = findStageNode(nodes, STAGE_RESULT)

  const faultNote = getNodeNote(stage1)
  const inspectNote = getNodeNote(stage2)
  const planNote = getNodeNote(stage3)
  const resultNote = getNodeNote(stage6)

  const faultDesc = faultNote || (coldStart ? '到店进行相关检查' : '')
  const inspectResult = inspectNote || (coldStart ? defaultInspectResult() : '')

  let repairPlan = planNote || (coldStart ? defaultRepairPlan(serviceName) : '')
  if (planAmount != null) {
    const amountText = `本次方案参考费用约 ${planAmount} 元`
    repairPlan = planNote ? `${planNote}（${amountText}）` : amountText
  }

  const resultConfirm = resultNote

  return {
    faultDesc: faultDesc.slice(0, 200),
    inspectResult: inspectResult.slice(0, 300),
    repairPlan: repairPlan.slice(0, 400),
    resultConfirm: resultConfirm.slice(0, 200),
    storeNote: storeNote.slice(0, 500),
    stageSnapshot: {
      [STAGE_FAULT]: stageSnapshot(stage1),
      [STAGE_INSPECT]: stageSnapshot(stage2),
      [STAGE_PLAN]: stageSnapshot(stage3),
      [STAGE_RESULT]: stageSnapshot(stage6),
    },
    fromNodes: {
      faultDesc: Boolean(faultNote),
      inspectResult: Boolean(inspectNote),
      repairPlan: Boolean(planNote),
      resultConfirm: Boolean(resultNote),
    },
  }
}

module.exports = {
  STAGE_FAULT,
  STAGE_INSPECT,
  STAGE_PLAN,
  STAGE_RESULT,
  extractGeoFromAlbumNodes,
  findStageNode,
}
