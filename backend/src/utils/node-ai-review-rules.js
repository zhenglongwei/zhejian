/**
 * 节点确认前检查 · 规则提纲兜底（不调模型也能出补图/改句）
 */
const { isVagueWarrantyPeriod, parseMileageKm } = require('../../vendor/shared/utils/service-flow-docs')

const VAGUE_COMPLAINT =
  /^(定时)?保养$|^常规保养$|^例行保养$|^到店保养$|^年审$|^检查$|^维修$|^保养一下$|^大保养$|^小保养$/
const JOB_LABEL_IN_NAME = /需处理|需关注|待处理/
const QR_HINT = /二维码|微信码|加微信|名片/

function text(value) {
  return String(value || '').trim()
}

function isVagueChiefComplaint(value) {
  const s = text(value)
  if (!s) return true
  if (s.length <= 2) return true
  return VAGUE_COMPLAINT.test(s)
}

function flattenFindings(list) {
  return (Array.isArray(list) ? list : []).filter(Boolean)
}

function corpusOf(ctx) {
  const chunks = []
  flattenFindings(ctx.findings).forEach((row) => {
    chunks.push(row.itemKey, row.partName, row.caption, row.advice, row.note)
    ;(Array.isArray(row.images) ? row.images : []).forEach((img) => {
      if (img && typeof img === 'object') chunks.push(img.caption)
    })
  })
  chunks.push(ctx.chiefComplaint, ctx.warrantyPeriod, ctx.warrantyNotes, ctx.conclusion)
  ;(Array.isArray(ctx.quoteLines) ? ctx.quoteLines : []).forEach((line) => {
    chunks.push(line && line.name, line && line.note)
  })
  return chunks.map(text).filter(Boolean).join(' ').toLowerCase()
}

function matchesPhoto(photo, corpus, findings) {
  const keys = [photo.itemKey, photo.part]
    .concat(Array.isArray(photo.keywords) ? photo.keywords : [])
    .map((item) => text(item).toLowerCase())
    .filter(Boolean)
  if (keys.some((key) => corpus.includes(key))) return true
  return flattenFindings(findings).some((row) => {
    const itemKey = text(row.itemKey).toLowerCase()
    return itemKey && itemKey === text(photo.itemKey).toLowerCase()
  })
}

function fillExample(example, ctx) {
  const mileage = parseMileageKm(ctx.mileageKm) || text(ctx.mileageKm)
  const raw = text(example)
  if (!raw) return ''
  if (mileage) return raw.replace('{mileage}', `${mileage}`)
  return raw.replace('，里程 {mileage}', '').replace('{mileage}', '').replace(/，$/, '')
}

function pushSuggestion(list, item) {
  if (!item || !item.id) return
  if (list.some((row) => row.id === item.id)) return
  list.push(item)
}

function buildRuleSuggestions(ctx = {}) {
  const rubric = ctx.rubric || { photos: [], texts: [], step: '', category: 'generic' }
  const findings = flattenFindings(ctx.findings)
  const corpus = corpusOf({ ...ctx, findings })
  const suggestions = []
  const step = rubric.step

  if (step !== 'quote_check') {
    ;(rubric.photos || []).forEach((photo) => {
      if (matchesPhoto(photo, corpus, findings)) return
      pushSuggestion(suggestions, {
        id: `photo:${photo.itemKey}`,
        type: 'photo',
        itemKey: photo.itemKey,
        title: `补拍${photo.part}`,
        how: photo.how,
        field: '',
        suggestedText: '',
      })
    })
  }

  if (step === 'intake' || step === 'quote_check') {
    if (isVagueChiefComplaint(ctx.chiefComplaint)) {
      const suggested = fillExample(rubric.complaintExample, ctx) || '写清车主为什么来，例如电瓶亏电打不着'
      pushSuggestion(suggestions, {
        id: 'text:chiefComplaint',
        type: 'text',
        itemKey: 'complaint',
        title: '改主诉',
        how: '',
        field: 'chiefComplaint',
        suggestedText: suggested,
      })
    }
  }

  findings.forEach((row, index) => {
    const blob = `${row.partName || ''} ${row.caption || ''} ${row.advice || ''}`
    if (QR_HINT.test(blob)) {
      pushSuggestion(suggestions, {
        id: `photo:qr:${index}`,
        type: 'photo',
        itemKey: '',
        title: '换掉含码的图',
        how: '拍部位本体，不要微信码、名片',
        field: '',
        suggestedText: '',
        findingIndex: index,
      })
    }
  })

  if (step === 'intake') {
    const actionRows = findings.filter(
      (row) => row.result === 'action' || row.result === 'watch' || row.result === '需处理' || row.result === '需关注',
    )
    const thin = actionRows.find((row) => !text(row.advice) || text(row.advice).length < 4)
    if (thin) {
      const idx = findings.indexOf(thin)
      const part = text(thin.partName) || '该部位'
      pushSuggestion(suggestions, {
        id: `text:findingAdvice:${idx}`,
        type: 'text',
        itemKey: '',
        title: '补检查发现',
        how: '',
        field: 'findingAdvice',
        findingIndex: idx,
        suggestedText: `${part}：写清看见什么，例如读数、磨损或损伤程度`,
      })
    }
  }

  if (step === 'work') {
    const thin = findings.find((row) => text(row.partName) && !text(row.caption) && !(row.images || []).length)
    if (thin) {
      const idx = findings.indexOf(thin)
      pushSuggestion(suggestions, {
        id: `text:caption:${idx}`,
        type: 'text',
        itemKey: '',
        title: '补施工说明',
        how: '',
        field: 'findingCaption',
        findingIndex: idx,
        suggestedText: `${text(thin.partName)}已按规范安装`,
      })
    }
  }

  if (step === 'delivery' && isVagueWarrantyPeriod(ctx.warrantyPeriod)) {
    pushSuggestion(suggestions, {
      id: 'text:warrantyPeriod',
      type: 'text',
      itemKey: 'warranty_note',
      title: '写实质质保',
      how: '',
      field: 'warrantyPeriod',
      suggestedText: '5000 公里或 6 个月（以本单已确认项目为准）',
    })
  }

  if (step === 'quote_check') {
    const lines = Array.isArray(ctx.quoteLines) ? ctx.quoteLines : []
    lines.forEach((line, index) => {
      const name = text(line && line.name)
      if (!name) return
      if (JOB_LABEL_IN_NAME.test(name)) {
        const cleaned = name.replace(/[·•]\s*(需处理|需关注|待处理).*$/, '').trim() || name
        pushSuggestion(suggestions, {
          id: `text:quoteLineName:${index}`,
          type: 'text',
          itemKey: '',
          title: '改方案行名',
          how: '',
          field: 'quoteLineName',
          lineIndex: index,
          suggestedText: cleaned,
        })
      }
    })
    const complaint = text(ctx.chiefComplaint)
    const firstName = text(lines[0] && lines[0].name)
    if (complaint && firstName) {
      const batt = /电瓶|亏电|打不着/.test(complaint)
      const oil = /机油|保养/.test(firstName)
      if (batt && oil) {
        pushSuggestion(suggestions, {
          id: 'text:chiefComplaint-align',
          type: 'text',
          itemKey: 'complaint',
          title: '主诉与方案对不上',
          how: '',
          field: 'chiefComplaint',
          suggestedText: complaint,
        })
      }
    }
  }

  return suggestions.filter((row) => {
    if (row.field && /amount|price|fee|金额/.test(String(row.field))) return false
    if (/¥|金额|报价/.test(String(row.suggestedText || ''))) return false
    return true
  }).slice(0, 7)
}

function inferSuggestionField(item = {}) {
  const field = text(item.field)
  if (field) return field
  const blob = `${item.title || ''} ${item.itemKey || ''} ${item.how || ''}`
  if (/主诉/.test(blob) || item.itemKey === 'complaint') return 'chiefComplaint'
  if (/图注|施工说明/.test(blob)) return 'findingCaption'
  if (/方案/.test(blob)) return 'quoteLineName'
  if (/质保/.test(blob)) return 'warrantyPeriod'
  if (/建议|处理/.test(blob)) return 'findingAdvice'
  return ''
}

function parseModelSuggestions(raw, fallback = []) {
  let parsed = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) return fallback
    try {
      parsed = JSON.parse(trimmed.slice(start, end + 1))
    } catch (_) {
      return fallback
    }
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && Array.isArray(parsed.suggestions)
      ? parsed.suggestions
      : []
  const normalized = []
  list.forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const type = item.type === 'photo' ? 'photo' : item.type === 'text' ? 'text' : ''
    if (!type) return
    const suggestedText = type === 'text' ? text(item.suggestedText || item.text) : ''
    if (type === 'text' && /¥|金额|报价/.test(suggestedText)) return
    const field = inferSuggestionField({ ...item, type })
    if (/amount|price|fee|金额/.test(field)) return
    const title = type === 'photo'
      ? (text(item.title) || `补拍${text(item.part) || '相关部位'}`)
      : field === 'chiefComplaint'
        ? '改主诉'
        : field === 'findingAdvice'
          ? '改检查发现'
          : field === 'findingCaption'
            ? '改图注'
            : field === 'warrantyPeriod'
              ? '改质保'
              : field === 'quoteLineName'
                ? '改方案行名'
                : (text(item.title) || '改文案')
    normalized.push({
      id: text(item.id) || `${type}:${index}`,
      type,
      itemKey: text(item.itemKey),
      title,
      how: text(item.how),
      field,
      suggestedText,
      findingIndex: Number.isFinite(Number(item.findingIndex)) ? Number(item.findingIndex) : undefined,
      lineIndex: Number.isFinite(Number(item.lineIndex)) ? Number(item.lineIndex) : undefined,
    })
  })
  return normalized.length ? normalized.slice(0, 7) : fallback
}

module.exports = {
  isVagueChiefComplaint,
  inferSuggestionField,
  buildRuleSuggestions,
  parseModelSuggestions,
}
