const { PART_TYPE } = require('../../../constants/part-type')

const PART_TYPE_VALUES = Object.values(PART_TYPE)

function parseMoney(value) {
  const n = Number(String(value || '').replace(/[,，]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function detectPartType(line) {
  const hit = PART_TYPE_VALUES.find((type) => line.includes(type))
  return hit || ''
}

function parsePlanQuoteText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const rows = []

  lines.forEach((line, index) => {
    if (/^(合计|总计|小计|报价|金额|费用)/.test(line)) return
    if (line.length < 2) return

    const partType = detectPartType(line)
    const qtyMatch =
      line.match(/[×xX*]\s*(\d+)/) ||
      line.match(/(?:数量|qty)[:：]?\s*(\d+)/i) ||
      line.match(/(\d+)\s*(个|件|套|只|支)/)
    const priceMatch =
      line.match(/(?:单价|金额|价格)[:：]?\s*(\d+(?:\.\d+)?)/) ||
      line.match(/(\d+(?:\.\d+)?)\s*元/)

    let name = line
    if (partType) name = name.replace(partType, ' ')
    if (qtyMatch) name = name.replace(qtyMatch[0], ' ')
    if (priceMatch) name = name.replace(priceMatch[0], ' ')
    name = name
      .replace(/[\d.,]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (name.length < 2) return

    rows.push({
      planPartId: `plan_${index + 1}`,
      name: name.slice(0, 48),
      partType: partType || PART_TYPE.BRAND,
      partBrand: '',
      partCode: '',
      qty: qtyMatch ? parseInt(qtyMatch[1], 10) || 1 : 1,
      unitPrice: priceMatch ? parseMoney(priceMatch[1]) : null,
      lineTotal: priceMatch ? parseMoney(priceMatch[1]) : null,
      status: 'draft',
    })
  })

  return rows.slice(0, 40)
}

function sumPlanPartTotals(planParts = []) {
  return planParts.reduce((sum, row) => {
    const lineTotal = parseMoney(row.lineTotal)
    if (lineTotal != null) return sum + lineTotal
    const unitPrice = parseMoney(row.unitPrice)
    const qty = Number(row.qty) > 0 ? Number(row.qty) : 1
    if (unitPrice != null) return sum + unitPrice * qty
    return sum
  }, 0)
}

function buildPlanAmountMismatchHint(planAmount, planParts = []) {
  const amount = parseMoney(planAmount)
  if (amount == null) return { mismatch: false, hint: '' }
  const total = sumPlanPartTotals(planParts)
  if (!total) return { mismatch: false, hint: '' }
  if (Math.abs(total - amount) <= 1) return { mismatch: false, hint: '' }
  return {
    mismatch: true,
    hint: `报价表行合计约 ¥${total}，与方案总额 ¥${amount} 不一致，请核对报价表与方案总额。`,
  }
}

function sanitizePlanPartRow(row = {}, index = 0) {
  const name = String(row.name || row.partName || '').trim()
  if (!name) return null
  return {
    planPartId: String(row.planPartId || row.id || `plan_${index + 1}`),
    name: name.slice(0, 48),
    partType: String(row.partType || row.type || PART_TYPE.BRAND).trim(),
    partBrand: String(row.partBrand || row.brand || '').trim().slice(0, 32),
    partCode: String(row.partCode || row.code || '').trim().slice(0, 48),
    qty: Number(row.qty || row.quantity) > 0 ? Number(row.qty || row.quantity) : 1,
    unitPrice: parseMoney(row.unitPrice),
    lineTotal: parseMoney(row.lineTotal),
    status: row.status === 'confirmed' ? 'confirmed' : 'draft',
  }
}

function sanitizePlanPartsDraft(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  return list
    .map((row, index) => sanitizePlanPartRow(row, index))
    .filter(Boolean)
}

module.exports = {
  parsePlanQuoteText,
  sumPlanPartTotals,
  buildPlanAmountMismatchHint,
  sanitizePlanPartRow,
  sanitizePlanPartsDraft,
}
