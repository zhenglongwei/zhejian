/**
 * 施工中新发现：打断当前工单，在交车前插入一张增项报价和一张新工单。
 * 新工单不抄上一张工单的项目，避免交车时同一项算两遍。
 */
const { emptyDocument, QUOTE_CONFIRM_COPY } = require('../constants/service-flow-nodes')
const { buildAddonDraftFromWorkFindings, normalizePhotoDraft } = require('./service-flow-docs')

function sortNodes(nodes = []) {
  return (nodes || [])
    .slice()
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
}

function findWorkToInterrupt(nodes = []) {
  return (
    nodes.find((n) => n && n.kind === 'work' && n.status === 'in_progress') ||
    nodes.find((n) => n && n.kind === 'work' && n.status !== 'locked') ||
    nodes.find((n) => n && n.kind === 'work') ||
    null
  )
}

function applyAddonInsert(nodes = [], options = {}) {
  const list = sortNodes(nodes)
  const work = findWorkToInterrupt(list)
  if (!work) {
    return { error: '未找到施工步骤', nodes: list, seeded: false }
  }
  const workIdx = list.findIndex((n) => n && n.id === work.id)
  const findings =
    work.photoDraft && Array.isArray(work.photoDraft.findings) ? work.photoDraft.findings : []
  const addonDraft = buildAddonDraftFromWorkFindings(findings)
  if (work.status === 'in_progress' || work.status === 'pending') {
    list[workIdx] = {
      ...work,
      status: 'completed',
      photoDraft: normalizePhotoDraft(work.photoDraft || {}),
    }
  }
  const deliveryIdx = list.findIndex((n) => n && n.kind === 'delivery_photos')
  const insertAt = deliveryIdx >= 0 ? deliveryIdx : list.length
  const ts = options.now || Date.now()
  const quoteNode = {
    id: `fn_addon_q_${ts}`,
    kind: 'quote_confirm',
    nodeCategory: 'document',
    sortOrder: insertAt,
    title: '施工中新发现',
    status: 'in_progress',
    photos: [],
    note: '',
    document: {
      ...emptyDocument('quote_confirm'),
      status: 'draft',
      payload: {
        lines: addonDraft.lines,
        discovery: addonDraft.discovery,
        confirmCopy: QUOTE_CONFIRM_COPY,
      },
    },
    legacyStageId: '',
    legacyStageIds: [],
    insertedReason: 'addon',
    parentNodeId: list[workIdx].id,
    segmentLabel: '增项',
  }
  const extraWork = {
    id: `fn_addon_work_${ts}`,
    kind: 'work',
    nodeCategory: 'photo',
    sortOrder: insertAt + 1,
    title: '工单',
    status: 'locked',
    photos: [],
    note: '',
    document: null,
    legacyStageId: 'stage_5',
    legacyStageIds: ['stage_5'],
    insertedReason: 'addon',
    parentNodeId: quoteNode.id,
    segmentLabel: '增项',
    photoDraft: normalizePhotoDraft({}),
  }
  list.splice(insertAt, 0, quoteNode, extraWork)
  list.forEach((n, i) => {
    n.sortOrder = i
  })
  return { nodes: list, seeded: Boolean(addonDraft.seeded), error: '' }
}

module.exports = {
  applyAddonInsert,
  findWorkToInterrupt,
}
