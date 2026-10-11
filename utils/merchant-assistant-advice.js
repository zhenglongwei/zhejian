/**
 * AI 助手只展示进行中相册里已经生成的意见。
 * 一项的身份是相册 + 节点 + 来源键，不是列表第几条。
 */
const QUOTE_KINDS = new Set(['quote_confirm', 'addon_quote_confirm'])
const LOCKED = new Set(['pending_confirm', 'confirmed', 'cancelled', 'delivered'])

function text(value) {
  return String(value || '').trim()
}

function plateOf(album = {}) {
  const vehicle = album.vehicle || {}
  const full = text(vehicle.plate)
  const source = full && !full.includes('*') ? full : text(vehicle.plateDisplay || full)
  const raw = source.replace(/[·.\s]/g, '')
  if (!raw || raw.includes('*') || raw.length < 3) return source || '未登记车牌'
  return `${raw.slice(0, 2)}·${raw.slice(2)}`
}

function whenText(iso, now = new Date()) {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ''
  const min = Math.round((now.getTime() - at) / 60000)
  if (min < 0) return ''
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.round(min / 60)
  if (hour < 24) return `${hour} 小时前`
  return ''
}

function docStatus(node) {
  return text(node && node.document && node.document.status)
}

function quoteNodes(nodes) {
  return (nodes || []).filter((node) => node && QUOTE_KINDS.has(node.kind))
}

function editableQuote(nodes) {
  const open = quoteNodes(nodes).filter((node) => !LOCKED.has(docStatus(node)))
  return open.length ? open[open.length - 1] : null
}

function linesOf(node) {
  const lines = node && node.document && node.document.payload && node.document.payload.lines
  return Array.isArray(lines) ? lines : []
}

function alreadyOnQuote(nodes, title, body) {
  const name = text(title)
  const note = text(body)
  return quoteNodes(nodes).some((node) =>
    linesOf(node).some((line) => {
      const lineName = text(line && line.name)
      const lineNote = text(line && line.note)
      if (name && (lineName === name || lineNote === name)) return true
      if (note && note.length > 6 && (lineNote === note || lineName === note)) return true
      return false
    }),
  )
}

function leadOf(raw) {
  const value = text(raw)
  if (!value) return { title: '', body: '' }
  const split = value.match(/^(.{4,18})[，。：:]\s*(.+)$/)
  if (split && split[2].length >= 6) return { title: split[1], body: split[2] }
  return { title: value, body: '' }
}

function pushCard(list, card) {
  if (!card || !text(card.title)) return
  if (list.some((row) => row.id === card.id)) return
  list.push(card)
}

function buildCard(album, node, sourceKey, fields, quote, now) {
  const title = text(fields.title)
  const body = text(fields.body)
  if (!title) return null
  if (alreadyOnQuote(album.flowNodes, title, body)) return null
  const canQuote = Boolean(quote) && fields.canQuote !== false
  return {
    id: `${album.albumId}:${node.id}:${sourceKey}`,
    albumId: album.albumId,
    nodeId: node.id,
    quoteNodeId: canQuote ? quote.id : '',
    plate: plateOf(album),
    kindLabel: fields.kindLabel,
    title,
    body,
    when: whenText(fields.updatedAt, now),
    action: canQuote ? 'quote' : 'open',
    actionLabel: canQuote ? '添加到报价单' : '查看并采纳',
    lineName: title,
    lineNote: body && body !== title ? body : '',
  }
}

function suggestionCards(album, node, quote, now, list) {
  const review = node.aiReview
  if (!review || review.status === 'failed') return
  const suggestions = Array.isArray(review.suggestions) ? review.suggestions : []
  suggestions.forEach((item, index) => {
    if (!item || item.applied) return
    const photo = item.type === 'photo'
    const suggested = text(item.suggestedText)
    const how = text(item.how)
    const title = text(item.title || item.part) || (photo ? how : suggested)
    if (!title) return
    const body = photo ? (how && how !== title ? how : '') : suggested && suggested !== title ? suggested : ''
    const field = text(item.field)
    const quoteField = field === 'quoteLineName' || field === 'quoteLineNote' || field === 'quoteLine'
    pushCard(
      list,
      buildCard(
        album,
        node,
        text(item.id) || `suggestion:${index}`,
        {
          kindLabel: photo ? '补拍' : quoteField ? '报价建议' : '检查建议',
          title,
          body: body || (photo ? '' : suggested && suggested !== title ? '' : ''),
          updatedAt: review.updatedAt,
          canQuote: !photo,
        },
        quote,
        now,
      ),
    )
  })
  const brief = review.merchantBrief || {}
  ;[
    ['issues', '需要留意'],
    ['omissions', '可能漏了'],
    ['objections', '车主可能会问'],
  ].forEach(([key, kindLabel]) => {
    const rows = Array.isArray(brief[key]) ? brief[key] : []
    rows.forEach((row, index) => {
      const title = text(row && row.title)
      const body = text(row && row.body)
      if (!title && !body) return
      const lead = title ? { title, body } : leadOf(body)
      pushCard(
        list,
        buildCard(
          album,
          node,
          `brief:${key}:${index}:${lead.title}`,
          {
            kindLabel,
            title: lead.title,
            body: lead.body,
            updatedAt: review.updatedAt,
            canQuote: key !== 'objections',
          },
          quote,
          now,
        ),
      )
    })
  })
}

function collectAssistantAdvice(album, now = new Date()) {
  const nodes = Array.isArray(album && album.flowNodes) ? album.flowNodes : []
  const quote = editableQuote(nodes)
  const packed = { ...album, flowNodes: nodes }
  const list = []
  nodes.forEach((node) => {
    if (!node || !node.id) return
    if (node.kind === 'intake' || node.kind === 'intake_inspection') {
      const advice = node.intakeAdvice || {}
      if (advice.status === 'failed') return
      const diagnosis = text(advice.diagnosis)
      if (diagnosis) {
        const lead = leadOf(diagnosis)
        pushCard(
          list,
          buildCard(
            packed,
            node,
            'intake',
            {
              kindLabel: '接车意见',
              title: lead.title,
              body: lead.body,
              updatedAt: advice.updatedAt,
              canQuote: true,
            },
            quote,
            now,
          ),
        )
      }
    }
    suggestionCards(packed, node, quote, now, list)
  })
  return list
}

module.exports = {
  collectAssistantAdvice,
  editableQuote,
  plateOf,
}
