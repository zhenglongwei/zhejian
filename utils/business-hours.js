const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const DEFAULT_OPEN = '09:00'
const DEFAULT_CLOSE = '18:00'

const BUSINESS_HOUR_PRESETS = [
  { id: 'everyday', label: '每天 09:00-18:00' },
  { id: 'workday', label: '周一至五营业' },
  { id: 'weekend_off', label: '周末休息' },
]

function normalizeTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return DEFAULT_OPEN
  const hour = Math.min(23, Math.max(0, Number(match[1])))
  const minute = Math.min(59, Math.max(0, Number(match[2])))
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function createDaySchedule(index, overrides = {}) {
  return {
    label: WEEKDAY_LABELS[index],
    open: overrides.open !== false,
    start: normalizeTime(overrides.start || DEFAULT_OPEN),
    end: normalizeTime(overrides.end || DEFAULT_CLOSE),
  }
}

function createDefaultSchedule() {
  return WEEKDAY_LABELS.map((label, index) => createDaySchedule(index, {
    open: index < 6,
  }))
}

function createScheduleFromPreset(presetId) {
  const schedule = createDefaultSchedule()
  if (presetId === 'everyday') {
    return schedule.map((day) => ({ ...day, open: true }))
  }
  if (presetId === 'workday') {
    return schedule.map((day, index) => ({ ...day, open: index < 5 }))
  }
  if (presetId === 'weekend_off') {
    return schedule.map((day, index) => ({ ...day, open: index < 5 }))
  }
  return schedule
}

function extractTimeRange(text) {
  const match = String(text || '').match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/)
  if (!match) return null
  return {
    start: normalizeTime(match[1]),
    end: normalizeTime(match[2]),
  }
}

function parseBusinessHours(raw) {
  const text = String(raw || '').trim()
  if (!text) {
    return { schedule: createDefaultSchedule(), remark: '' }
  }

  const simpleRange = text.match(/^(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})$/)
  if (simpleRange) {
    const range = {
      start: normalizeTime(simpleRange[1]),
      end: normalizeTime(simpleRange[2]),
    }
    return {
      schedule: WEEKDAY_LABELS.map((label, index) => createDaySchedule(index, {
        ...range,
        open: true,
      })),
      remark: '',
    }
  }

  const range = extractTimeRange(text)
  const schedule = createDefaultSchedule()
  const hasDayKeywords = /周/.test(text)

  if (range) {
    schedule.forEach((day) => {
      day.start = range.start
      day.end = range.end
      day.open = true
    })
  }

  if (/周一至周五|周一到周五|周一-周五/.test(text) && range) {
    schedule.forEach((day, index) => {
      day.open = index < 5
    })
  } else if (/周一至周六|周一到周六|周一-周六/.test(text) && range) {
    schedule.forEach((day, index) => {
      day.open = index < 6
    })
  }

  WEEKDAY_LABELS.forEach((label, index) => {
    const dayRangeMatch = text.match(
      new RegExp(`${label}\\s*(\\d{1,2}:\\d{2})\\s*[-~至到]\\s*(\\d{1,2}:\\d{2})`)
    )
    if (dayRangeMatch) {
      schedule[index].open = true
      schedule[index].start = normalizeTime(dayRangeMatch[1])
      schedule[index].end = normalizeTime(dayRangeMatch[2])
      return
    }
    if (new RegExp(`${label}\\s*休息`).test(text)) {
      schedule[index].open = false
    }
  })

  if (/周末休息/.test(text)) {
    schedule[5].open = false
    schedule[6].open = false
  }

  let remark = ''
  const remarkMatch = text.match(/[，,]([^，,]*(?:节假日|法定|通知|预约)[^，,]*)$/)
  if (remarkMatch) {
    remark = remarkMatch[1].trim()
  }

  if (!hasDayKeywords && !range) {
    return { schedule: createDefaultSchedule(), remark: text }
  }

  return { schedule, remark }
}

function groupOpenDays(schedule) {
  const groups = []
  let current = null

  schedule.forEach((day, index) => {
    if (!day.open) {
      current = null
      return
    }
    const key = `${day.start}-${day.end}`
    if (current && current.key === key && current.endIndex === index - 1) {
      current.endIndex = index
      return
    }
    current = {
      key,
      startIndex: index,
      endIndex: index,
      start: day.start,
      end: day.end,
    }
    groups.push(current)
  })

  return groups
}

function formatDayRange(startIndex, endIndex) {
  if (startIndex === endIndex) return WEEKDAY_LABELS[startIndex]
  if (startIndex === 0 && endIndex === 4) return '周一至周五'
  if (startIndex === 0 && endIndex === 5) return '周一至周六'
  if (startIndex === 0 && endIndex === 6) return '周一至周日'
  return `${WEEKDAY_LABELS[startIndex]}至${WEEKDAY_LABELS[endIndex]}`
}

function formatBusinessHours(schedule, remark) {
  const days = (schedule || []).map((day, index) => ({
    ...day,
    label: day.label || WEEKDAY_LABELS[index],
    start: normalizeTime(day.start),
    end: normalizeTime(day.end),
  }))

  const openDays = days.filter((day) => day.open)
  if (!openDays.length) {
    return String(remark || '').trim() || '休息'
  }

  const allOpenSame = openDays.length === 7
    && openDays.every((day) => day.start === openDays[0].start && day.end === openDays[0].end)

  const parts = []
  if (allOpenSame) {
    parts.push(`${openDays[0].start}-${openDays[0].end}`)
  } else {
    groupOpenDays(days).forEach((group) => {
      const rangeLabel = formatDayRange(group.startIndex, group.endIndex)
      parts.push(`${rangeLabel} ${group.start}-${group.end}`)
    })
  }

  const closedLabels = days.filter((day) => !day.open).map((day) => day.label)
  if (closedLabels.length && closedLabels.length < 7) {
    if (closedLabels.length === 1) {
      parts.push(`${closedLabels[0]}休息`)
    } else if (
      closedLabels.length === 2
      && closedLabels[0] === '周六'
      && closedLabels[1] === '周日'
    ) {
      parts.push('周末休息')
    } else {
      parts.push(`${closedLabels.join('、')}休息`)
    }
  }

  const note = String(remark || '').trim()
  if (note) parts.push(note)

  return parts.join('，')
}

function buildBusinessHoursEditorState(raw) {
  const text = String(raw || '').trim()
  const { schedule, remark } = parseBusinessHours(text)
  const preview = formatBusinessHours(schedule, remark)
  return {
    businessHoursSchedule: schedule,
    businessHoursRemark: remark,
    businessHoursPreview: preview,
  }
}

function validateBusinessHoursSchedule(schedule) {
  const days = schedule || []
  const openDays = days.filter((day) => day.open)
  if (!openDays.length) {
    return '请至少设置一天营业时间'
  }
  for (const day of openDays) {
    const start = normalizeTime(day.start)
    const end = normalizeTime(day.end)
    if (start >= end) {
      return `${day.label || '营业日'}的结束时间需晚于开始时间`
    }
  }
  return ''
}

module.exports = {
  WEEKDAY_LABELS,
  BUSINESS_HOUR_PRESETS,
  createDefaultSchedule,
  createScheduleFromPreset,
  parseBusinessHours,
  formatBusinessHours,
  buildBusinessHoursEditorState,
  validateBusinessHoursSchedule,
  normalizeTime,
}
