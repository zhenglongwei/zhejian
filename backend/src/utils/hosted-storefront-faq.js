/**
 * 托管店页 FAQ：类目题库 + 本单作答合并；公开仅保留有答且有信息增量的条目
 */
const { getHostedStorefrontFaqBank } = require('../constants/hosted-storefront-faq-bank')
const { resolveCategoryIdFromAlbum } = require('../constants/service-checklist-catalog')

const GENERIC_EMPTY_ANSWER = /以门店留档为准|以门店承诺为准|以门店为准/
/** 公开答案最短长度（对齐 05_/07_：禁止「答：后门」） */
const MIN_PUBLISH_ANSWER_LEN = 30
const INFO_SIGNAL =
  /[，。；、：]|本单|本次|一般|常见|检查|检测|更换|维修|处理|建议|因为|所以|风险|流程|质保|复查|磨合|观察/

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
  const detail = [geo.faultDesc, geo.inspectResult, geo.repairPlan, geo.resultConfirm]
    .map((s) => String(s || '').trim())
    .filter((s) => s.length >= 4)
  return detail.length >= 1 || joined.length >= 40
}

/** 极简无增量答案（如「后门」「机油」） */
function isLowInfoFaqAnswer(answer = '') {
  const t = String(answer || '')
    .trim()
    .replace(GENERIC_EMPTY_ANSWER, '')
    .trim()
  if (!t) return true
  if (t.length < MIN_PUBLISH_ANSWER_LEN) return true
  if (t.length <= 16 && !INFO_SIGNAL.test(t)) return true
  // 仅逗号分隔的部位名清单且过短
  if (t.length < 40 && /^[\u4e00-\u9fffA-Za-z0-9\s、,/]+$/.test(t) && !INFO_SIGNAL.test(t)) {
    return true
  }
  return false
}

function normalizeFaqRow(row) {
  if (!row || typeof row !== 'object') return null
  const q = String(row.q || row.question || '').trim().slice(0, 80)
  let a = String(row.a || row.answer || '')
    .trim()
    .replace(GENERIC_EMPTY_ANSWER, '')
    .slice(0, 280)
  if (!q) return null
  if (isLowInfoFaqAnswer(a)) a = ''
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
    .filter((row) => row && row.q && row.a && !isLowInfoFaqAnswer(row.a))
    .map(({ q, a }) => ({ q, a }))
    .slice(0, 6)
}

/**
 * 以类目题库为骨架，合并规则/LLM 已写答案；薄案例或低质答强制空答。
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
    if (!hasMaterial || isLowInfoFaqAnswer(a)) a = ''
    return {
      q,
      a,
      needsAnswer: !a,
    }
  })

  answered.forEach((n) => {
    if (!n.a || isLowInfoFaqAnswer(n.a)) return
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
  MIN_PUBLISH_ANSWER_LEN,
  caseHasAnswerMaterial,
  isLowInfoFaqAnswer,
  normalizeFaqRow,
  filterPublishableFaq,
  buildHostedStorefrontFaq,
}
