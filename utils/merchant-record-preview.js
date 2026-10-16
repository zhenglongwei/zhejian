/**
 * 节点页底部按钮，以及发给车主前的记录预览。
 * 只整理已经记下的内容。
 */

const RECORD_TITLE = {
  intake: '接车确认单',
  inspect: '检测记录',
  quote: '报价记录',
  work: '施工记录',
  finish: '交车记录',
}

const NODE_KINDS = {
  intake: ['intake', 'intake_inspection'],
  inspect: ['inspection_report', 'inspection'],
  quote: ['quote_confirm'],
  work: ['work'],
  finish: ['repair_report', 'delivery_photos'],
}

function gateNode(nodes, stageKey) {
  const kinds = NODE_KINDS[stageKey] || []
  const list = (nodes || []).filter((node) => node && kinds.indexOf(node.kind) >= 0)
  return list.find((node) => node.document) || list[0] || null
}

function packOf(node) {
  if (node && node.document && node.document.payload) return node.document.payload
  return (node && node.photoDraft) || {}
}

function isSentStatus(status) {
  return status === 'pending_confirm' || status === 'confirmed'
}

function readStageGate(flowNodes, stageKey) {
  const node = gateNode(flowNodes, stageKey)
  const pack = packOf(node)
  const versions = Array.isArray(pack.recordVersions) ? pack.recordVersions : []
  const status = String((node && node.document && node.document.status) || '')
  const sent = isSentStatus(status) || Boolean(String(pack.ownerSentAt || '').trim())
  return {
    nodeId: (node && node.id) || '',
    usesDocument: Boolean(node && node.document),
    status,
    confirmed: versions.length > 0,
    generated: status === 'delivered' || status === 'confirmed' || Boolean(String(pack.reportGeneratedAt || '').trim()) || sent,
    sent,
    versions,
  }
}

function stageGateFor(flowNodes, stageKey, activeNode) {
  const gate = readStageGate(flowNodes, stageKey)
  if (
    stageKey === 'quote' &&
    activeNode &&
    (activeNode.kind === 'quote_confirm' || activeNode.kind === 'addon_quote_confirm')
  ) {
    return {
      ...gate,
      status: String((activeNode.document && activeNode.document.status) || ''),
    }
  }
  return gate
}

function stageChrome(stageKey, gate) {
  const status = String((gate && gate.status) || '')
  if (stageKey === 'intake') {
    if (status === 'pending_confirm' || status === 'confirmed' || status === 'delivered') {
      return { preview: true, label: '', action: '', locked: true }
    }
    return { preview: true, label: '保存并发送给车主', action: 'advance', locked: false }
  }
  if (stageKey === 'inspect') {
    if (status === 'delivered' || status === 'confirmed') {
      return { preview: true, label: '', action: '', locked: true }
    }
    return { preview: true, label: '生成检测报告', action: 'generateReport', locked: false }
  }
  if (stageKey === 'quote') {
    if (status === 'pending_confirm') {
      return { preview: true, label: '代车主确认', action: 'proxyConfirm', locked: true }
    }
    if (status === 'confirmed' || status === 'delivered') {
      return { preview: true, label: '', action: '', locked: true }
    }
    return { preview: true, label: '发送报价单给车主', action: 'sendQuote', locked: false }
  }
  if (stageKey === 'work') {
    return { preview: true, label: '添加施工记录', action: 'addWork', locked: false }
  }
  if (stageKey === 'finish') {
    return { preview: true, label: '提醒车主确认报告', action: 'remindDelivery', locked: false }
  }
  return { preview: false, label: '', action: '', locked: false }
}

function intakeFacts(block) {
  return (block && block.cells) || []
}

function inspectFacts(block) {
  const facts = []
  if (block && block.sub) facts.push({ label: '检查', value: block.sub })
  if (block && block.headline) facts.push({ label: '异常项目', value: block.headline })
  return facts
}

function quoteFacts(block) {
  const lines = (block && block.lines) || []
  const facts = lines.map((line) => ({
    label: line.name,
    value: line.amount || '',
  }))
  if (block && block.totalText) facts.push({ label: '报价总额', value: block.totalText })
  return facts
}

function workFacts(block) {
  const tasks = (block && block.tasks) || []
  return tasks.map((task) => ({
    label: task.name,
    value: task.status || '',
  }))
}

function finishFacts(block) {
  const facts = []
  if (block && block.warranty) facts.push({ label: '质保', value: block.warranty })
  if (block && block.headline) facts.push({ label: '交车', value: block.headline })
  return facts
}

function previewPhotos(board, key) {
  if (key === 'intake') return ((board.intake && board.intake.photos) || []).filter((item) => item && item.url)
  if (key === 'inspect') {
    const shots = []
    ;((board.inspect && board.inspect.items) || []).forEach((item) => {
      ;(item.shots || []).forEach((url) => {
        if (url && shots.length < 6) shots.push({ url, caption: item.name || '' })
      })
    })
    return shots
  }
  if (key === 'finish') {
    const finish = board.finish || {}
    return [finish.before, finish.after].filter((item) => item && item.url)
  }
  return []
}

function buildRecordPreview(album = {}, board = {}) {
  const key = String(board.selectedKey || 'intake')
  const block = board[key] || {}
  const facts =
    key === 'intake'
      ? intakeFacts(block)
      : key === 'inspect'
        ? inspectFacts(block)
        : key === 'quote'
          ? quoteFacts(block)
          : key === 'work'
            ? workFacts(block)
            : finishFacts(block)
  const photos = previewPhotos(board, key)
  const summary = String(block.complaint || block.sub || block.headline || '').trim()
  const advice = String(block.advice || '').trim()
  const storeName = String(album.storeName || '').trim()
  const vehicle = board.vehicle || {}
  return {
    storeName: storeName || '本店',
    mark: (storeName || '门店').slice(0, 2),
    title: RECORD_TITLE[key] || '节点记录',
    status: String(vehicle.pill || '').trim(),
    plate: String(vehicle.plate || '').trim(),
    model: String(vehicle.line || '').trim(),
    summary,
    facts,
    photos,
    advice,
    hasBody: Boolean(summary || facts.length || photos.length || advice),
  }
}

module.exports = {
  readStageGate,
  stageGateFor,
  stageChrome,
  buildRecordPreview,
}
