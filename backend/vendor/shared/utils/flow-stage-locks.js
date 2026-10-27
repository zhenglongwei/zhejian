/**
 * 商家进度大步闸门
 * 真源：docs/04_维修过程相册/29_ §3、26_ 状态闸
 *
 * 1. 上一步完成才能进下一步
 * 2. 发给车主即冻（pending_confirm / delivered / confirmed），该步及更早只读
 * 3. 施工冻点 = 交车报告发出；补充报价确认后回施工
 */
const { isFlowNodeDone, deliveryReportSent } = require('./service-flow-progress')

const STAGE_ORDER = ['intake', 'inspect', 'quote', 'work', 'finish']

function text(value) {
  return String(value || '').trim()
}

function isDocSentToOwner(doc) {
  const status = text(doc && doc.status)
  return status === 'pending_confirm' || status === 'confirmed' || status === 'delivered'
}

function sortedNodes(nodes = []) {
  return (nodes || [])
    .slice()
    .sort((a, b) => Number((a && a.sortOrder) || 0) - Number((b && b.sortOrder) || 0))
}

function familyOfKind(kind, node = null) {
  const k = text(kind)
  if (k === 'intake' || k === 'intake_inspection') return 'intake'
  if (k === 'inspection' || k === 'inspection_report') return 'inspect'
  if (k === 'quote_confirm' || k === 'addon_quote_confirm') {
    if (k === 'addon_quote_confirm' || text(node && node.insertedReason) === 'addon') return 'addon'
    return 'quote'
  }
  if (k === 'work') return 'work'
  if (k === 'delivery_photos' || k === 'repair_report') return 'finish'
  return ''
}

function familyOfStageKey(stageKey) {
  const raw = text(stageKey)
  if (!raw) return ''
  if (raw === 'intake' || raw.indexOf('intake') === 0) return 'intake'
  if (raw === 'inspect' || raw.indexOf('inspect') === 0) return 'inspect'
  if (raw === 'finish' || raw.indexOf('finish') === 0) return 'finish'
  if (raw.indexOf('work') === 0) return 'work'
  if (raw.indexOf('quote') === 0) {
    if (raw === 'quote:0' || raw === 'quote') return 'quote'
    return 'addon'
  }
  return familyOfKind(raw)
}

function mainQuoteNode(nodes = []) {
  return sortedNodes(nodes).find(
    (node) => node && node.kind === 'quote_confirm' && text(node.insertedReason) !== 'addon',
  )
}

function intakeNode(nodes = []) {
  return sortedNodes(nodes).find(
    (node) => node && (node.kind === 'intake' || node.kind === 'intake_inspection'),
  )
}

function inspectionReportNode(nodes = []) {
  return sortedNodes(nodes).find((node) => node && node.kind === 'inspection_report')
}

function workNode(nodes = []) {
  return sortedNodes(nodes).find((node) => node && node.kind === 'work')
}

/** 该大步自己的「发出」是否已发生 */
function stageSeal(nodes = [], family) {
  const list = sortedNodes(nodes)
  if (family === 'intake') {
    const node = intakeNode(list)
    return isDocSentToOwner(node && node.document)
  }
  if (family === 'inspect') {
    const node = inspectionReportNode(list)
    return isDocSentToOwner(node && node.document)
  }
  if (family === 'quote') {
    const node = mainQuoteNode(list)
    return isDocSentToOwner(node && node.document)
  }
  if (family === 'addon') {
    return false
  }
  if (family === 'work' || family === 'finish') {
    return deliveryReportSent(list)
  }
  return false
}

/** 补充报价单：发出即冻该张单 */
function isAddonNodeFrozen(node) {
  if (!node) return false
  const family = familyOfKind(node.kind, node)
  if (family !== 'addon') return false
  const status = text(node.document && node.document.status)
  return (
    status === 'pending_confirm' ||
    status === 'confirmed' ||
    status === 'delivered' ||
    status === 'cancelled'
  )
}

/**
 * 该大步是否只读：本步已发出，或更后的大步已发出（更后发出会冻住更早）
 * 例：报价已发出 → intake/inspect/quote 冻，work 不冻；交车已发出 → 全部冻
 */
function isStageFrozen(nodes = [], family) {
  const key = text(family)
  if (key === 'addon') return false
  const idx = STAGE_ORDER.indexOf(key)
  if (idx < 0) return false
  for (let i = idx; i < STAGE_ORDER.length; i += 1) {
    if (stageSeal(nodes, STAGE_ORDER[i])) return true
  }
  return false
}

function isFamilyDone(nodes = [], family) {
  const list = sortedNodes(nodes)
  if (family === 'intake') {
    const node = intakeNode(list)
    return Boolean(node && (text(node.status) === 'completed' || stageSeal(list, 'intake')))
  }
  if (family === 'inspect') {
    return isFlowNodeDone(inspectionReportNode(list) || {})
  }
  if (family === 'quote') {
    return isFlowNodeDone(mainQuoteNode(list) || {})
  }
  if (family === 'work') {
    const node = workNode(list)
    return Boolean(node && text(node.status) === 'completed')
  }
  if (family === 'finish') {
    return deliveryReportSent(list)
  }
  return false
}

function previousFamily(family) {
  const idx = STAGE_ORDER.indexOf(text(family))
  if (idx <= 0) return null
  return STAGE_ORDER[idx - 1]
}

/** 能否进入该大步作业（上一步已完成） */
function canEnterStage(nodes = [], family) {
  const key = text(family)
  if (key === 'addon') {
    return isFamilyDone(nodes, 'quote') || Boolean(workNode(nodes))
  }
  const prev = previousFamily(key)
  if (!prev) return true
  return isFamilyDone(nodes, prev)
}

/** 当前进度走到哪一步（第一个未完成的大步） */
function currentFamilyIndex(nodes = []) {
  for (let i = 0; i < STAGE_ORDER.length; i += 1) {
    if (!isFamilyDone(nodes, STAGE_ORDER[i])) return i
  }
  return STAGE_ORDER.length - 1
}

/** 能否打开该大步（查看或编辑）：已到达或已完成的步可打开；未到的不可跳 */
function canOpenStage(nodes = [], family) {
  const key = text(family)
  if (key === 'addon') return canEnterStage(nodes, 'addon')
  const idx = STAGE_ORDER.indexOf(key)
  if (idx < 0) return false
  return idx <= currentFamilyIndex(nodes)
}

/** 节点是否禁止商家改写（含 photoDraft / document） */
function isNodeEditFrozen(nodes = [], node) {
  if (!node) return true
  const family = familyOfKind(node.kind, node)
  if (family === 'addon') return isAddonNodeFrozen(node)
  if (!family) return false
  return isStageFrozen(nodes, family)
}

function freezeMessage(family) {
  const key = text(family)
  if (key === 'intake') return '接车已发给车主，不能再改'
  if (key === 'inspect') return '检测报告已发给车主，不能再改'
  if (key === 'quote' || key === 'addon') return '报价已发给车主，不能再改'
  if (key === 'work') return '交车已发给车主，施工不能再改'
  if (key === 'finish') return '交车已发给车主，不能再改'
  return '该步骤已固定，不能再改'
}

module.exports = {
  STAGE_ORDER,
  isDocSentToOwner,
  familyOfKind,
  familyOfStageKey,
  stageSeal,
  isStageFrozen,
  isAddonNodeFrozen,
  isFamilyDone,
  canEnterStage,
  canOpenStage,
  currentFamilyIndex,
  isNodeEditFrozen,
  freezeMessage,
  mainQuoteNode,
  intakeNode,
  inspectionReportNode,
  workNode,
}
