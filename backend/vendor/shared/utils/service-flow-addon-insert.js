/**
 * 补充报价：与接车/检测/报价/施工平级的独立节点。
 *
 * - 施工未完结（施工中发现问题）：只插补充报价，不新增施工节点，新项目继续在原施工节点上做。
 * - 施工已完结（交车过程中发现新故障）：补充报价之后追加一张「补充施工」节点，
 *   补充报价确认前保持锁定，确认后解锁；撤销补充报价时一并撤掉。
 * 补充报价不挂在施工下面，也不把已完成的施工改回「进行中」。
 */
const {
  emptyDocument,
  emptyPhotoDraft,
  QUOTE_CONFIRM_COPY,
  NODE_CATEGORY,
} = require('../constants/service-flow-nodes')
const {
  buildAddonDraftFromWorkFindings,
  contentOfFlowNode,
} = require('./service-flow-docs')

function text(value) {
  return String(value || '').trim()
}

function sortNodes(nodes = []) {
  return (nodes || [])
    .slice()
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
}

function isAddonQuote(node) {
  if (!node) return false
  return (
    (node.kind === 'quote_confirm' && text(node.insertedReason) === 'addon') ||
    node.kind === 'addon_quote_confirm'
  )
}

function isAddonWork(node) {
  return Boolean(node && node.kind === 'work' && text(node.insertedReason) === 'addon')
}

function addonDocStatus(node) {
  return text(node && node.document && node.document.status) || 'draft'
}

/** 施工是否已完结：有施工节点且全部完工 */
function workStageFinished(nodes = []) {
  const works = (nodes || []).filter((node) => node && node.kind === 'work')
  if (!works.length) return false
  return works.every((node) => text(node.status) === 'completed')
}

/** 补充报价的初始图文来源：当前正在做的那张施工节点 */
function findWorkForSeed(nodes = []) {
  const works = sortNodes(nodes).filter((node) => node && node.kind === 'work')
  return (
    works.find((node) => text(node.status) === 'in_progress') ||
    works.find((node) => text(node.status) !== 'locked') ||
    works[works.length - 1] ||
    null
  )
}

function blankAddonDraft() {
  return {
    seeded: false,
    lines: [{ name: '', brand: '', amount: '', note: '', evidenceUrl: '', evidenceUrls: [], workFindingId: '' }],
    discovery: { images: [], note: '', ready: false },
  }
}

function mergeDiscovery(base = {}, patch = {}) {
  const next = { ...(base && typeof base === 'object' ? base : {}) }
  if (!patch || typeof patch !== 'object') return next
  const note = text(patch.note)
  if (note) next.note = note
  const images = (Array.isArray(patch.images) ? patch.images : [])
    .map((row) =>
      typeof row === 'string'
        ? row
        : row && (row.url || row.rawUrl || row.maskedUrl || row.src),
    )
    .map((url) => text(url))
    .filter(Boolean)
  if (images.length) next.images = images
  next.ready = Boolean(
    (Array.isArray(next.images) ? next.images.length : 0) && text(next.note),
  )
  return next
}

function applyAddonInsert(nodes = [], options = {}) {
  const list = sortNodes(nodes)
  const work = findWorkForSeed(list)
  if (!work) {
    return { error: '未找到施工步骤', nodes: list, seeded: false }
  }
  const finished = workStageFinished(list)
  // 施工已完结：新故障来自交车现场填写的新发现，不把旧施工里的「报价没有这项」再报一遍
  const draft = finished
    ? blankAddonDraft()
    : buildAddonDraftFromWorkFindings(contentOfFlowNode(work).findings || [])
  const discovery = mergeDiscovery(draft.discovery, options.discovery)

  const deliveryIdx = list.findIndex((node) => node && node.kind === 'delivery_photos')
  const insertAt = deliveryIdx >= 0 ? deliveryIdx : list.length
  const ts = options.now || Date.now()
  const quoteNode = {
    id: `fn_addon_q_${ts}`,
    kind: 'quote_confirm',
    nodeCategory: NODE_CATEGORY.DOCUMENT,
    sortOrder: insertAt,
    title: '补充报价',
    status: 'in_progress',
    photos: [],
    note: '',
    document: {
      ...emptyDocument('quote_confirm'),
      status: 'draft',
      payload: {
        lines: draft.lines,
        discovery,
        confirmCopy: QUOTE_CONFIRM_COPY,
      },
    },
    insertedReason: 'addon',
    parentNodeId: '',
    segmentLabel: '增项',
  }
  const inserted = [quoteNode]

  // 施工已完结才新增补充施工节点，位置紧跟补充报价；车主确认补充报价后才解锁
  if (finished) {
    inserted.push({
      id: `fn_addon_w_${ts}`,
      kind: 'work',
      nodeCategory: NODE_CATEGORY.PHOTO,
      sortOrder: insertAt + 1,
      title: '补充施工',
      status: 'locked',
      photos: [],
      note: '',
      content: emptyPhotoDraft(),
      document: null,
      insertedReason: 'addon',
      parentNodeId: quoteNode.id,
      segmentLabel: '增项',
    })
  }

  list.splice(insertAt, 0, ...inserted)
  list.forEach((node, index) => {
    node.sortOrder = index
  })
  return {
    nodes: list,
    seeded: Boolean(draft.seeded),
    workStageFinished: finished,
    quoteNodeId: quoteNode.id,
    workNodeId: finished ? inserted[1].id : '',
    error: '',
  }
}

/**
 * 补齐补充施工节点的锁状态：
 * 补充报价确认/送达 → 解锁；尚未确认则保持锁定。
 */
function healAddonWorkLocks(nodes = []) {
  const list = sortNodes(nodes)
  let changed = false
  list.forEach((node) => {
    if (!isAddonWork(node)) return
    const parent = node.parentNodeId
      ? list.find((item) => item && item.id === node.parentNodeId)
      : null
    if (!parent || !isAddonQuote(parent)) return
    const status = addonDocStatus(parent)
    const unlocked = status === 'confirmed' || status === 'delivered'
    if (unlocked && text(node.status) === 'locked') {
      node.status = 'in_progress'
      changed = true
    }
  })
  return { nodes: list, changed }
}

module.exports = {
  applyAddonInsert,
  findWorkForSeed,
  workStageFinished,
  healAddonWorkLocks,
  isAddonQuote,
  isAddonWork,
}
