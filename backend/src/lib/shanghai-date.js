const SHANGHAI_TZ = 'Asia/Shanghai'

function formatShanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SHANGHAI_TZ }).format(date)
}

function parseDateStr(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) }
}

function addDays(dateStr, delta) {
  const p = parseDateStr(dateStr)
  if (!p) return ''
  const t = Date.UTC(p.y, p.mo - 1, p.d + delta)
  return new Date(t).toISOString().slice(0, 10)
}

function shanghaiDayBounds(dateStr) {
  const p = parseDateStr(dateStr)
  if (!p) {
    const err = new Error('日期格式须为 YYYY-MM-DD')
    err.status = 400
    throw err
  }
  const start = new Date(`${dateStr}T00:00:00+08:00`)
  const end = new Date(`${dateStr}T23:59:59.999+08:00`)
  return { start, end, dateStr }
}

function yesterdayShanghai() {
  return addDays(formatShanghaiDate(new Date()), -1)
}

function resolvePeriodRange(period, from, to) {
  const today = formatShanghaiDate(new Date())
  const yesterday = addDays(today, -1)

  if (period === 'custom') {
    const start = from || yesterday
    const end = to || yesterday
    if (!parseDateStr(start) || !parseDateStr(end)) {
      const err = new Error('自定义区间须提供 from、to（YYYY-MM-DD）')
      err.status = 400
      throw err
    }
    if (start > end) {
      const err = new Error('from 不能晚于 to')
      err.status = 400
      throw err
    }
    return { from: start, to: end }
  }

  if (period === 'today') {
    return { from: yesterday, to: yesterday }
  }
  if (period === 'yesterday') {
    const d = addDays(today, -1)
    return { from: d, to: d }
  }
  if (period === '7d') {
    return { from: addDays(today, -7), to: yesterday }
  }
  if (period === '30d') {
    return { from: addDays(today, -30), to: yesterday }
  }
  if (period === 'month') {
    const p = parseDateStr(today)
    const monthStart = `${p.y}-${String(p.mo).padStart(2, '0')}-01`
    return { from: monthStart, to: yesterday }
  }

  return { from: addDays(today, -7), to: yesterday }
}

function listDateStrings(from, to) {
  const out = []
  let cur = from
  while (cur && cur <= to) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

/** Prisma @db.Date：固定 UTC 午夜，避免 upsert where 与 MySQL DATE 错位导致 P2002 */
function statDateValue(dateStr) {
  const p = parseDateStr(dateStr)
  if (!p) {
    const err = new Error('日期格式须为 YYYY-MM-DD')
    err.status = 400
    throw err
  }
  return new Date(Date.UTC(p.y, p.mo - 1, p.d))
}

module.exports = {
  SHANGHAI_TZ,
  formatShanghaiDate,
  addDays,
  shanghaiDayBounds,
  yesterdayShanghai,
  resolvePeriodRange,
  listDateStrings,
  statDateValue,
}
