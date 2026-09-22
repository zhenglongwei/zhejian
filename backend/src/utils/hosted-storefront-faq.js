/**
 * 托管店页 FAQ：类目题库 + 本单作答合并；公开仅保留有答且有信息增量的条目
 */
const { getHostedStorefrontFaqBank } = require('../constants/hosted-storefront-faq-bank')
const { resolveCategoryIdFromAlbum } = require('../constants/service-checklist-catalog')

const GENERIC_EMPTY_ANSWER = /以门店留档为准|以门店承诺为准|以门店为准/
/** 公开答案最短长度（对齐 05_/07_：禁止「答：后门」）。缺项叮嘱可以短于该长度。 */
const MIN_PUBLISH_ANSWER_LEN = 30
const OWNER_REMINDER_PATTERN = /要向商家|先问|问清|给你看|再决定/
/** 亮点已覆盖预算 / 材料 / 避坑时，不再另补缺项叮嘱 */
const HIGHLIGHT_THEME_PATTERN =
  /质保|规格|包装|品牌|没做|没有做|未做|未施工|总成|连盘|加项|套餐|报价|材料/
const GAP_FAQ = {
  q: '修完后要向商家确认什么？',
  a: '修完后要向商家确定质保期。',
}
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

/** 对车主的短叮嘱（如「修完后要向商家确定质保期」），不是「后门」「机油」 */
function isOwnerReminderAnswer(answer = '') {
  const t = String(answer || '')
    .trim()
    .replace(GENERIC_EMPTY_ANSWER, '')
    .trim()
  if (t.length < 8 || t.length >= MIN_PUBLISH_ANSWER_LEN) return false
  if (/一般来说|很多店|平时常见|专业|诚信/.test(t)) return false
  return OWNER_REMINDER_PATTERN.test(t)
}

function coversHighlightTheme(text = '') {
  return HIGHLIGHT_THEME_PATTERN.test(String(text || ''))
}

/** 档案未写到质保、材料或取舍时，最多补一条缺项叮嘱 */
function appendGapReminder(list, max = 6) {
  const items = (Array.isArray(list) ? list : []).slice(0, max)
  const covered = items.some((row) =>
    coversHighlightTheme(`${(row && (row.q || row.question)) || ''}${(row && (row.a || row.answer)) || ''}`),
  )
  if (covered || items.length >= max) return items
  if (items.some((row) => row && (row.q || row.question) === GAP_FAQ.q)) return items
  items.push({ q: GAP_FAQ.q, a: GAP_FAQ.a })
  return items
}

/** 极简无增量答案（如「后门」「机油」） */
function isLowInfoFaqAnswer(answer = '') {
  const t = String(answer || '')
    .trim()
    .replace(GENERIC_EMPTY_ANSWER, '')
    .trim()
  if (!t) return true
  if (isOwnerReminderAnswer(t)) return false
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
 * 用本单已写出的问答做亮点；类目清单只提供方向，不逐条铺空问。
 * 未覆盖质保、材料或取舍时，最多补一条缺项叮嘱。
 */
function buildHostedStorefrontFaq({
  serviceName = '',
  templateId = '',
  categoryId = '',
  geo = {},
  view = {},
  answeredFaq = [],
} = {}) {
  const { ENCYCLOPEDIA_QUESTION_PATTERN, SLOGAN_PATTERN } = require('./evidence-faq')
  const cat =
    categoryId ||
    resolveCategoryIdFromAlbum({
      templateId: templateId || view.templateId,
      serviceName: serviceName || view.serviceName,
    })
  const bank = getHostedStorefrontFaqBank(cat)
  const hasMaterial = caseHasAnswerMaterial(geo, view)
  const faq = []
  const answered = (answeredFaq || []).map(normalizeFaqRow).filter(Boolean)
  answered.forEach((n) => {
    if (!n.a || isLowInfoFaqAnswer(n.a)) return
    const text = `${n.q}${n.a}`
    if (SLOGAN_PATTERN.test(text) || /一般来说|很多店|平时常见/.test(text)) return
    if (ENCYCLOPEDIA_QUESTION_PATTERN.test(n.q)) return
    if (faq.length >= 6) return
    faq.push({ q: n.q, a: n.a, needsAnswer: false })
  })
  const withGap = appendGapReminder(faq, 6).map((row) => ({
    q: row.q,
    a: row.a,
    needsAnswer: !row.a,
  }))

  return {
    categoryId: bank.categoryId,
    categoryLabel: bank.label,
    hasMaterial,
    directions: bank.directions,
    faqQuestions: withGap.map((row) => row.q),
    faq: withGap,
  }
}

function pickFirstPublishableFaq(...lists) {
  for (let i = 0; i < lists.length; i += 1) {
    const pub = filterPublishableFaq(lists[i])
    if (pub.length) return pub
  }
  return []
}

/** 公开档案 FAQ：店页说明 / 托管层优先，空答与空数组不能盖住已有作答 */
function collectHostedCaseFaq({ contentJson, hostMeta, enrichmentFaq, draftFaq } = {}) {
  const content = contentJson && typeof contentJson === 'object' ? contentJson : {}
  const host = hostMeta && typeof hostMeta === 'object' ? hostMeta : {}
  const geo =
    (host.geoLayer && typeof host.geoLayer === 'object' && host.geoLayer) ||
    (content.hostGeoLayer && typeof content.hostGeoLayer === 'object' && content.hostGeoLayer) ||
    {}
  const draft = host.geoDraft && typeof host.geoDraft === 'object' ? host.geoDraft : {}
  return pickFirstPublishableFaq(
    geo.faq,
    host.faq,
    draft.faq,
    content.faq,
    enrichmentFaq,
    draftFaq,
  )
}

module.exports = {
  MIN_PUBLISH_ANSWER_LEN,
  GAP_FAQ,
  caseHasAnswerMaterial,
  isOwnerReminderAnswer,
  coversHighlightTheme,
  appendGapReminder,
  isLowInfoFaqAnswer,
  normalizeFaqRow,
  filterPublishableFaq,
  pickFirstPublishableFaq,
  collectHostedCaseFaq,
  buildHostedStorefrontFaq,
}
