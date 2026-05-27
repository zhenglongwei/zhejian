/** MOCK: 可预约时段，联调后由咨询表单 API 返回 */
const DEFAULT_TIME_SLOTS = [
  '09:00-10:00',
  '10:00-11:00',
  '11:00-12:00',
  '14:00-15:00',
  '15:00-16:00',
  '16:00-17:00',
]

function pad(n) {
  return n < 10 ? `0${n}` : String(n)
}

function formatDateLabel(date) {
  const m = date.getMonth() + 1
  const d = date.getDate()
  const week = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
  return `${m}月${d}日 周${week}`
}

function formatDateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 生成未来若干天的 mock 预约日期 */
function buildBookingDates(days = 7) {
  const list = []
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  for (let i = 1; i <= days; i += 1) {
    const date = new Date(base)
    date.setDate(base.getDate() + i)
    list.push({
      value: formatDateValue(date),
      label: formatDateLabel(date),
      slots: [...DEFAULT_TIME_SLOTS],
    })
  }
  return list
}

module.exports = {
  DEFAULT_TIME_SLOTS,
  buildBookingDates,
}
