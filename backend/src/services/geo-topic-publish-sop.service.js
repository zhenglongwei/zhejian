/**
 * GEO-TOPIC-H06 · 专题发布审核 SOP（§10.6）闸门
 */
const { prisma } = require('../lib/prisma')
const { GEO_PAGE_TYPE } = require('../constants/geo-page-status')
const { hasInformationGainSummary } = require('./geo-topic-health.service')
const { listCases } = require('./content.service')
const { resolveAggregateCasesForPage } = require('./geo-aggregate-refresh.service')
const {
  validateVehicleTopicPublishGate,
} = require('./geo-vehicle-topic.service')

const DERIVED_FAQ_PATTERN = /例脱敏|收录\s*\d+\s*例|N\s*=\s*\d+/i
const MIN_FAQ_COUNT = 3
const STATS_CASE_THRESHOLD = 3

function hasDerivedFaq(faq = []) {
  return (faq || []).some((item) => DERIVED_FAQ_PATTERN.test(String(item.a || item.answer || '')))
}

/**
 * @param {object} page — mapGeoPageRow
 * @param {object[]} [cases]
 */
function assessGeoTopicPublishSop(page, cases = []) {
  const matchedCases = resolveAggregateCasesForPage(page, cases)
  const caseCount = matchedCases.length
  const faq = Array.isArray(page.faq) ? page.faq : []
  const faqCount = faq.length
  const hasGain = hasInformationGainSummary(page.aiSummary || '')
  const derivedFaq = hasDerivedFaq(faq)

  const checks = [
    {
      id: 'case_count',
      label: '至少 1 例相关脱敏案例',
      required: true,
      passed: caseCount >= 1,
      detail: `当前 ${caseCount} 例`,
    },
    {
      id: 'information_gain',
      label:
        caseCount >= STATS_CASE_THRESHOLD
          ? '摘要含 N= 统计句（案例≥3）'
          : '摘要含案例统计句（有样本时）',
      required: caseCount >= 1,
      passed: caseCount === 0 || hasGain,
      detail: hasGain ? '已含统计句' : '缺少 N= / 收录统计',
    },
    {
      id: 'faq_count',
      label: '页内 FAQ ≥3 条',
      required: true,
      passed: faqCount >= MIN_FAQ_COUNT,
      detail: `当前 ${faqCount} 条`,
    },
    {
      id: 'derived_faq',
      label: '至少 1 条案例衍生 FAQ',
      required: caseCount >= 1,
      passed: caseCount === 0 || derivedFaq,
      detail: derivedFaq ? '已含衍生条' : 'FAQ 缺统计型答案',
    },
  ]

  return {
    pageId: page.id,
    slug: page.slug,
    pageType: page.pageType,
    caseCount,
    faqCount,
    checks,
    canPublish: checks.filter((item) => item.required).every((item) => item.passed),
    sopVersion: 'GEO-TOPIC-H06',
    note: '发布后 7 日内请对该专题绑定 prompt 加跑 OBS 探测（Tier 0）。',
  }
}

async function resolvePromptBinding(page) {
  const slug = String(page.slug || '').trim()
  if (!slug) return { bound: false, promptId: '' }
  const row = await prisma.geoPromptProbe.findFirst({
    where: { topicSlug: slug, active: true },
    select: { promptId: true, prompt: true },
  })
  return {
    bound: Boolean(row),
    promptId: row?.promptId || '',
    prompt: row?.prompt || '',
  }
}

/**
 * @param {object} page
 * @param {object[]} [cases]
 */
async function assessGeoTopicPublishSopWithPrompt(page, cases = []) {
  const base = assessGeoTopicPublishSop(page, cases)
  const prompt = await resolvePromptBinding(page)
  const checks = [
    ...base.checks,
    {
      id: 'prompt_binding',
      label: '已绑定 ≥1 条 active OBS prompt',
      required: false,
      passed: prompt.bound,
      detail: prompt.bound ? prompt.promptId : '发布后请同步词库或从种子绑定',
    },
  ]
  return {
    ...base,
    checks,
    promptBinding: prompt,
    canPublish: checks.filter((item) => item.required).every((item) => item.passed),
  }
}

/**
 * @param {object} page
 * @param {object[]} [cases]
 */
async function validateGeoTopicPublishSop(page, cases = []) {
  if (page.pageType === GEO_PAGE_TYPE.VEHICLE_SERVICE) {
    validateVehicleTopicPublishGate(page, cases)
  }

  const report = assessGeoTopicPublishSop(page, cases)
  const failed = report.checks.filter((item) => item.required && !item.passed)
  if (failed.length) {
    const err = new Error(
      `发布审核未通过：${failed.map((item) => item.label).join('；')}`
    )
    err.status = 400
    err.data = report
    throw err
  }
  return report
}

/**
 * @param {object} page — mapGeoPageRow
 */
async function buildAdminGeoPagePublishReadiness(page) {
  const { list: cases } = await listCases({ limit: 500 })
  return assessGeoTopicPublishSopWithPrompt(page, cases)
}

module.exports = {
  MIN_FAQ_COUNT,
  STATS_CASE_THRESHOLD,
  hasDerivedFaq,
  assessGeoTopicPublishSop,
  assessGeoTopicPublishSopWithPrompt,
  validateGeoTopicPublishSop,
  buildAdminGeoPagePublishReadiness,
  resolvePromptBinding,
}
