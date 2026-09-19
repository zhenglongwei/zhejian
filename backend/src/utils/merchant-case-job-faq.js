/**
 * CASE-SRC-A02 · 从本单正文抽出用户会问、相册里已有答案的问答。
 * 无依据则空数组；禁止通用模板凑条。
 */
const { scrubPiiText } = require('./scrub-pii-text')
const { AMOUNT_PATTERN } = require('../constants/merchant-case-draft')
const { SLOGAN_PATTERN } = require('./evidence-faq')

const FAQ_MAX = 6
const GENERIC_ANSWER = /以门店留档为准|以门店承诺为准/

function stripAmountText(text = '') {
  return scrubPiiText(String(text || '').replace(AMOUNT_PATTERN, ''))
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function sectionBody(sections, key) {
  const hit = (sections || []).find((sec) => sec && sec.key === key)
  return String((hit && hit.body) || '').trim()
}

function firstSentenceMatching(text, pattern) {
  const parts = String(text || '').split(/[。！？；;\n]/)
  for (const part of parts) {
    const line = part.trim()
    if (line && pattern.test(line)) return line.slice(0, 180)
  }
  return ''
}

function normalizeFaqItems(list) {
  if (!Array.isArray(list)) return []
  const { isLowInfoFaqAnswer } = require('./hosted-storefront-faq')
  const out = []
  const seen = new Set()
  for (const item of list) {
    const q = stripAmountText((item && (item.q || item.question)) || '').slice(0, 80)
    const a = stripDonePrefix((item && (item.a || item.answer)) || '')
      .replace(/本单已处理[:：]\s*/gu, '')
      .slice(0, 200)
    if (!q || !a || GENERIC_ANSWER.test(a)) continue
    if (SLOGAN_PATTERN.test(`${q}${a}`)) continue
    if (/一般来说/.test(`${q}${a}`)) continue
    const hasCaseFact =
      /这例/.test(`${q}${a}`) &&
      /检查|施工|总成|更换|未做|没做|质保|旧件|开走|交车|压套|择日|未施工|节点/.test(`${q}${a}`)
    if (!hasCaseFact && isLowInfoFaqAnswer(a)) continue
    if (/建议项/.test(a) && !/、/.test(a) && a.length < 40) continue
    const key = q.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ q, a })
    if (out.length >= FAQ_MAX) break
  }
  return out
}

function stripDonePrefix(text = '') {
  return stripAmountText(
    String(text || '')
      .replace(/^本单已处理[:：]\s*/u, '')
      .replace(/^本次施工[:：]\s*/u, ''),
  )
}

function followUpWorthAsking(line = '') {
  const text = stripAmountText(line)
  if (!text || GENERIC_ANSWER.test(text)) return false
  if (/建议项/.test(text) && !/、/.test(text) && text.length < 40) return false
  return true
}
function inferJobKind({ serviceName = '', templateId = '', categoryId = '' } = {}) {
  try {
    const { resolveCategoryIdFromAlbum } = require('../constants/service-checklist-catalog')
    const cat = categoryId || resolveCategoryIdFromAlbum({ templateId, serviceName })
    if (cat === 'major_maintenance' || cat === 'maintenance') return 'maintenance'
    if (cat === 'body_paint') return 'body_paint'
    return 'repair'
  } catch (_) {
    const name = String(serviceName || '')
    if (/大保养|小保养|保养|机油/.test(name)) return 'maintenance'
    if (/钣金|喷漆|钣喷/.test(name)) return 'body_paint'
    return 'repair'
  }
}

function extractJobFaqs({
  sections = [],
  serviceName = '',
  templateId = '',
  inspectLine = '',
  doneLine = '',
  followUpSummary = '',
  differenceLine = '',
} = {}) {
  const symptom = sectionBody(sections, 'symptom')
  const diagnosis = sectionBody(sections, 'diagnosis')
  const plan = sectionBody(sections, 'plan')
  const process = sectionBody(sections, 'process')
  const handover = sectionBody(sections, 'handover')
  const haystack = [symptom, diagnosis, plan, process, handover].filter(Boolean).join('。')
  const doneFromProcess =
    process.match(/本次施工[:：][^。；;\n]+/) || process.match(/本单已处理[:：][^。；;\n]+/)
  const doneItems =
    stripDonePrefix(doneLine) ||
    (doneFromProcess ? stripDonePrefix(doneFromProcess[0]).replace(/^本次施工[:：]\s*/u, '') : '')
  const inspectItems = stripAmountText(inspectLine)
  const difference = stripAmountText(differenceLine)
  const jobKind = inferJobKind({ serviceName, templateId })
  const looksMaint = jobKind === 'maintenance' || /机油|机滤|滤芯|雨刮|保养/.test(doneItems)

  const raw = []
  const withThisCase = (text) => {
    const body = String(text || '').trim()
    if (!body) return ''
    if (/^这例/.test(body)) return body.slice(0, 200)
    return `这例公开档案里，${body}`.slice(0, 200)
  }
  const push = (q, a) => {
    if (!q || !a) return
    raw.push({ q, a: withThisCase(a) })
  }

  if (inspectItems) {
    push('这例到店后先做了哪些检查，再决定方案？', inspectItems.slice(0, 160))
  }

  if (doneItems) {
    push('这例做了哪些项目？', doneItems.slice(0, 160))
  } else if (!looksMaint && plan && !GENERIC_ANSWER.test(plan)) {
    push('这例做了什么？', plan.slice(0, 160))
  } else if (!looksMaint && diagnosis) {
    push(
      '这例查出了什么、怎么处理？',
      [diagnosis, plan].filter(Boolean).join('。').slice(0, 160),
    )
  }

  if (difference && /未施工|未更换|择日|正常/.test(difference)) {
    push('这例明确没有做哪些项目？', difference.slice(0, 160))
  } else {
    const followLine =
      stripAmountText(followUpSummary) ||
      firstSentenceMatching(
        [process, handover].filter(Boolean).join('。'),
        /择期|择日|改期|其余建议|未做|未处理/,
      )
    if (followUpWorthAsking(followLine)) {
      push('这例哪些项目这次没做、以后再做？', followLine)
    }
  }

  const stages = []
  if (inspectItems || diagnosis) stages.push('检查')
  if (doneItems || (process && !GENERIC_ANSWER.test(process))) stages.push('施工')
  if (handover && !GENERIC_ANSWER.test(handover)) stages.push('交车')
  if (stages.length >= 2) {
    push('这例公开了哪些节点？', `有${stages.join('、')}记录。`)
  }

  const handoverConfirm = firstSentenceMatching(handover, /路试|试车|灯光|外观|功能确认|交车确认/)
  if (handoverConfirm) {
    push('这例交车前做了哪些确认？', handoverConfirm)
  }

  const warrantyLine = firstSentenceMatching(
    handover,
    /质保|配件.{0,12}\d+\s*年|漆面.{0,12}\d+\s*年/,
  )
  if (warrantyLine && !GENERIC_ANSWER.test(warrantyLine)) {
    push('这例质保怎么写进档案的？', warrantyLine)
  }

  if (/不换总成|未换总成|无需换总成|不用换总成|不更换总成/.test(haystack)) {
    push(
      '这例为什么没换总成？',
      firstSentenceMatching(haystack, /总成/) || plan || diagnosis,
    )
  }
  if (/不连盘|只换.{0,8}片|未换.{0,8}盘|无需换盘/.test(haystack)) {
    push(
      '这例为什么没连盘一起换？',
      firstSentenceMatching(haystack, /盘|片/) || plan,
    )
  }
  if (/当天开走|当天交车|留车|留\s*\d+\s*天|大约.{0,12}天|工期/.test(haystack)) {
    push(
      '这例大概要留几天？能不能开走？',
      firstSentenceMatching(haystack, /天|开走|工期|当天/) || handover,
    )
  }
  if (/旧件/.test(haystack)) {
    push('这例旧件怎么处理？', firstSentenceMatching(haystack, /旧件/) || handover)
  }
  if (/故障灯|灯亮|报警灯/.test(haystack)) {
    push('这例灯亮查到了什么？', firstSentenceMatching(haystack, /灯/) || diagnosis)
  }

  return normalizeFaqItems(raw)
}

module.exports = {
  FAQ_MAX,
  inferJobKind,
  extractJobFaqs,
  normalizeFaqItems,
}
