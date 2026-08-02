/**
 * 营业执照成立日期 → 经营年限白话（入驻 / 公开页 / Schema）
 */

function pad2(n) {
  return String(n).padStart(2, '0')
}

/**
 * @param {unknown} value
 * @returns {string} YYYY-MM-DD 或空串
 */
function normalizeLicenseEstablishedOn(value) {
  if (value == null) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`
  }
  // 阿里云 OCR 常见：RegistrationDate/validFromDate/EstablishDate 为数字 20170104
  if (typeof value === 'number' && Number.isFinite(value)) {
    const digits = String(Math.trunc(value))
    if (/^\d{8}$/.test(digits)) {
      return normalizeLicenseEstablishedOn(digits)
    }
  }

  const raw = String(value).trim()
  if (!raw) return ''

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const y = Number(iso[1])
    const m = Number(iso[2])
    const d = Number(iso[3])
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`
    }
  }

  // 阿里云格式化日期：20170104 / "20170104"
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) {
    const y = Number(compact[1])
    const m = Number(compact[2])
    const d = Number(compact[3])
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`
    }
  }

  const cn = raw.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  if (cn) {
    const y = Number(cn[1])
    const m = Number(cn[2])
    const d = Number(cn[3])
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`
    }
  }

  const slash = raw.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})/)
  if (slash) {
    const y = Number(slash[1])
    const m = Number(slash[2])
    const d = Number(slash[3])
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`
    }
  }

  // 有效期起止：「2016年03月01日至长期」
  const range = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*至/)
  if (range) {
    const y = Number(range[1])
    const m = Number(range[2])
    const d = Number(range[3])
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`
    }
  }

  return ''
}

/**
 * @param {string} establishedOn YYYY-MM-DD
 * @param {Date} [asOf]
 * @returns {{ years: number, label: string, foundingDate: string }|null}
 */
function buildOperatingYearsMeta(establishedOn, asOf = new Date()) {
  const date = normalizeLicenseEstablishedOn(establishedOn)
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d))
  if (Number.isNaN(start.getTime())) return null

  const end = asOf instanceof Date && !Number.isNaN(asOf.getTime()) ? asOf : new Date()
  let years = end.getUTCFullYear() - y
  const monthNow = end.getUTCMonth() + 1
  const dayNow = end.getUTCDate()
  if (monthNow < m || (monthNow === m && dayNow < d)) {
    years -= 1
  }
  if (years < 0) years = 0

  const label =
    years < 1
      ? `成立于 ${y} 年 · 经营未满 1 年`
      : `成立于 ${y} 年 · 经营约 ${years} 年`

  return {
    years,
    label,
    foundingDate: date,
  }
}

module.exports = {
  normalizeLicenseEstablishedOn,
  buildOperatingYearsMeta,
}
