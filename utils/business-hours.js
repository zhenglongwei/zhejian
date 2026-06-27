const DEFAULT_OPEN = '09:00'
const DEFAULT_CLOSE = '18:00'

function normalizeTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return DEFAULT_OPEN
  const hour = Math.min(23, Math.max(0, Number(match[1])))
  const minute = Math.min(59, Math.max(0, Number(match[2])))
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function getTodayIso(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function createDefaultDailyHours() {
  return {
    start: DEFAULT_OPEN,
    end: DEFAULT_CLOSE,
  }
}

function createEmptyClosureDraft() {
  const today = getTodayIso()
  return {
    startDate: today,
    endDate: today,
    note: '',
  }
}

function parseIsoDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null
  }
  return { year, month, day, iso: `${match[1]}-${match[2]}-${match[3]}` }
}

function formatChineseDate(iso, options = {}) {
  const parsed = parseIsoDate(iso)
  if (!parsed) return iso
  const { withYear = false } = options
  if (withYear) return `${parsed.year}年${parsed.month}月${parsed.day}日`
  return `${parsed.month}月${parsed.day}日`
}

function compareIso(a, b) {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function inferIsoFromChineseDate(text, refYear) {
  const match = String(text || '').trim().match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/)
  if (!match) return ''
  const year = Number(match[1] || refYear)
  const month = String(Number(match[2])).padStart(2, '0')
  const day = String(Number(match[3])).padStart(2, '0')
  const parsed = parseIsoDate(`${year}-${month}-${day}`)
  return parsed ? parsed.iso : ''
}

function extractDailyRange(text) {
  const match = String(text || '').match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/)
  if (!match) return createDefaultDailyHours()
  return {
    start: normalizeTime(match[1]),
    end: normalizeTime(match[2]),
  }
}

function parseTemporaryClosures(text) {
  const closures = []
  const re = /(\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}月\d{1,2}日)(?:\s*[-~至到]\s*(\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}月\d{1,2}日))?([^，,]*?)休息/g
  let match
  const refYear = new Date().getFullYear()
  while ((match = re.exec(text))) {
    const startIso = inferIsoFromChineseDate(match[1], refYear)
    const endIso = inferIsoFromChineseDate(match[2] || match[1], refYear)
    if (!startIso || !endIso) continue
    closures.push({
      id: `${startIso}_${endIso}_${closures.length}`,
      startDate: startIso,
      endDate: endIso,
      note: String(match[3] || '').trim(),
    })
  }
  return closures
}

function parseBusinessHours(raw) {
  const text = String(raw || '').trim()
  if (!text) {
    return {
      daily: createDefaultDailyHours(),
      temporaryClosures: [],
    }
  }

  return {
    daily: extractDailyRange(text),
    temporaryClosures: parseTemporaryClosures(text),
  }
}

function formatClosureText(closure) {
  const startParsed = parseIsoDate(closure.startDate)
  const endParsed = parseIsoDate(closure.endDate)
  if (!startParsed || !endParsed) return ''

  const crossYear = startParsed.year !== endParsed.year
  const startLabel = formatChineseDate(closure.startDate, { withYear: crossYear })
  const endLabel = closure.startDate === closure.endDate
    ? ''
    : formatChineseDate(closure.endDate, { withYear: crossYear })
  const note = String(closure.note || '').trim()
  const rangeLabel = endLabel ? `${startLabel}-${endLabel}` : startLabel
  return `${rangeLabel}${note}休息`
}

function filterActiveClosures(closures, today = getTodayIso()) {
  return (closures || []).filter((item) => compareIso(item.endDate, today) >= 0)
}

function formatBusinessHours({ daily, temporaryClosures }) {
  const dailyStart = normalizeTime(daily && daily.start)
  const dailyEnd = normalizeTime(daily && daily.end)
  const parts = [`${dailyStart}-${dailyEnd}`]

  filterActiveClosures(temporaryClosures).forEach((closure) => {
    const text = formatClosureText(closure)
    if (text) parts.push(text)
  })

  return parts.join('，')
}

function enrichClosuresForDisplay(closures) {
  return (closures || []).map((item) => ({
    ...item,
    displayText: formatClosureText(item),
  }))
}

function buildBusinessHoursEditorState(raw) {
  const parsed = parseBusinessHours(raw)
  const preview = formatBusinessHours(parsed)
  return {
    businessHoursDaily: parsed.daily,
    businessHoursClosures: enrichClosuresForDisplay(parsed.temporaryClosures),
    businessHoursPreview: preview,
    showClosureForm: false,
    closureDraft: createEmptyClosureDraft(),
  }
}

function validateBusinessHours(daily, temporaryClosures) {
  const start = normalizeTime(daily && daily.start)
  const end = normalizeTime(daily && daily.end)
  if (start >= end) {
    return '结束时间需晚于开始时间'
  }

  for (const closure of temporaryClosures || []) {
    if (!closure.startDate || !closure.endDate) {
      return '请完善临时休息日期'
    }
    if (compareIso(closure.startDate, closure.endDate) > 0) {
      return '临时休息的结束日期不能早于开始日期'
    }
  }

  return ''
}

function validateClosureDraft(draft) {
  if (!draft.startDate || !draft.endDate) {
    return '请选择休息日期'
  }
  if (compareIso(draft.startDate, draft.endDate) > 0) {
    return '结束日期不能早于开始日期'
  }
  return ''
}

function sortClosures(closures) {
  return (closures || []).slice().sort((a, b) => compareIso(a.startDate, b.startDate))
}

module.exports = {
  DEFAULT_OPEN,
  DEFAULT_CLOSE,
  createDefaultDailyHours,
  createEmptyClosureDraft,
  getTodayIso,
  parseBusinessHours,
  formatBusinessHours,
  buildBusinessHoursEditorState,
  validateBusinessHours,
  validateClosureDraft,
  sortClosures,
  enrichClosuresForDisplay,
  normalizeTime,
}
