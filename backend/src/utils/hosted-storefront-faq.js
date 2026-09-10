/**
 * 托管店页 FAQ：类目题库 + 本单作答合并；公开仅保留有答条目
 */
const { getHostedStorefrontFaqBank } = require('../constants/hosted-storefront-faq-bank')
const { resolveCategoryIdFromAlbum } = require('../constants/service-checklist-catalog')

const GENERIC_EMPTY_ANSWER = /以门店留档为准|以门店承诺为准|以门店为准/

function caseHasAnswerMaterial(geo = {}, view = {}) {
  const blobs = [
    geo.faultDesc,
    geo.inspectResult,
    geo.repairPlan,
    geo.resultConfirm,
    view.aiSummaryPreview,
    view.serviceName,
  ]
  const joined = blobs.map((s) => String(s || '').trim()).filter(Boolean).join('')
  // 仅有服务名不够；需至少一段现象/检测/方案/结果类正文
  const detail = [geo.faultDesc, geo.inspectResult, geo.repairPlan, geo.resultConfirm]
    .map((s) => String(s || '').trim())
    .filter((s) => s.length >= 4)
  return detail.length >= 1 || joined.length >= 40
}

function normalizeFaqRow(row) {
  if (!row || typeof row !== 'object') return null
  const q = String(row.q || row.question || '').trim().slice(0, 80)
  const a = String(row.a || row.answer || '')
    .trim()
    .replace(GENERIC_EMPTY_ANSWER, '')
    .slice(0, 280)
  if (!q) return null
  return {
    q,
    a,
    needsAnswer: !a,
  }
}

function filterPublishableFaq(list) {
  if (!Array.isArray(list)) return []
  return list
    .map(normalizeFaqRow)
    .filter((row) => row && row.q && row.a)
    .map(({ q, a }) => ({ q, a }))
    .slice(0, 6)
}

/**
 * 以类目题库为骨架，合并规则/LLM 已写答案；薄案例强制空答。
 */
function buildHostedStorefrontFaq({
  serviceName = '',
  templateId = '',
  categoryId = '',
  geo = {},
  view = {},
  answeredFaq = [],
} = {}) {
  const cat =
    categoryId ||
    resolveCategoryIdFromAlbum({
      templateId: templateId || view.templateId,
      serviceName: serviceName || view.serviceName,
    })
  const bank = getHostedStorefrontFaqBank(cat)
  const hasMaterial = caseHasAnswerMaterial(geo, view)
  const byQ = new Map()
  const answered = (answeredFaq || []).map(normalizeFaqRow).filter(Boolean)
  answered.forEach((n) => {
    byQ.set(n.q, n)
  })

  const faq = bank.questions.map((q, i) => {
    const exact = byQ.get(q)
    const byIndex = answered[i]
    let a = (exact && exact.a) || (byIndex && byIndex.a) || ''
    if (!hasMaterial) a = ''
    return {
      q,
      a,
      needsAnswer: !a,
    }
  })

  // 允许额外本单问答（不在题库内），有答才保留
  answered.forEach((n) => {
    if (!n.a) return
    if (bank.questions.includes(n.q)) return
    if (faq.length >= 6) return
    faq.push({ q: n.q, a: n.a, needsAnswer: false })
  })

  return {
    categoryId: bank.categoryId,
    categoryLabel: bank.label,
    hasMaterial,
    faqQuestions: bank.questions,
    faq,
  }
}

module.exports = {
  caseHasAnswerMaterial,
  normalizeFaqRow,
  filterPublishableFaq,
  buildHostedStorefrontFaq,
}
