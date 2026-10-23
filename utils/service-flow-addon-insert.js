/**
 * 施工中新发现：在原施工之后插入一张补充报价。
 * 不把原施工标完成，不另开空工单。照片和说明留在原施工，可以继续补。
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
  list[workIdx] = {
    ...work,
    status: work.status === 'locked' ? 'in_progress' : work.status || 'in_progress',
    photoDraft: normalizePhotoDraft(work.photoDraft || {}),
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
  list.splice(insertAt, 0, quoteNode)
  list.forEach((n, i) => {
    n.sortOrder = i
  })
  return { nodes: list, seeded: Boolean(addonDraft.seeded), error: '' }
}

function addonDocStatus(node) {
  return String((node && node.document && node.document.status) || 'draft')
}

function isOpenAddonQuote(node) {
  if (!node || node.kind !== 'quote_confirm' || String(node.insertedReason || '') !== 'addon') return false
  const status = addonDocStatus(node)
  return status === 'draft' || status === 'pending_confirm'
}

function workHasMaterial(node) {
  if (!node) return false
  const findings = node.photoDraft && Array.isArray(node.photoDraft.findings) ? node.photoDraft.findings : []
  if (
    findings.some(
      (row) =>
        row &&
        (String(row.partName || row.caption || '').trim() ||
          row.url ||
          (Array.isArray(row.images) && row.images.length)),
    )
  ) {
    return true
  }
  return Array.isArray(node.photos) && node.photos.length > 0
}

/** 补充报价还没确认时，不再把已经完成的施工改回去。只去掉还没内容的空施工格。 */
function reopenWorkBesideOpenAddon(nodes = []) {
  const list = sortNodes(nodes)
  const remove = new Set()
  list.forEach((node) => {
    if (!isOpenAddonQuote(node)) return
    list.forEach((child) => {
      if (!child || child.kind !== 'work' || String(child.insertedReason || '') !== 'addon') return
      if (String(child.parentNodeId || '') !== node.id) return
      if (child.status === 'locked' && !workHasMaterial(child)) {
        remove.add(child.id)
      }
    })
  })
  if (!remove.size) return { nodes: list, changed: false }
  const next = list.filter((node) => node && !remove.has(node.id))
  next.forEach((node, index) => {
    node.sortOrder = index
  })
  return { nodes: next, changed: true }
}

module.exports = {
  applyAddonInsert,
  findWorkToInterrupt,
  reopenWorkBesideOpenAddon,
  isOpenAddonQuote,
}
