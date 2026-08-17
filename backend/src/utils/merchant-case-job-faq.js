/**
 * CASE-SRC-A02 · 从本单正文抽出用户会问、相册里已有答案的问答。
 * 无依据则空数组；禁止通用模板凑条。
 */
const { scrubPiiText } = require('./scrub-pii-text')
const { AMOUNT_PATTERN } = require('../constants/merchant-case-draft')

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
  const out = []
  const seen = new Set()
  for (const item of list) {
    const q = stripAmountText((item && (item.q || item.question)) || '').slice(0, 80)
    const a = stripAmountText((item && (item.a || item.answer)) || '').slice(0, 200)
    if (!q || !a || GENERIC_ANSWER.test(a)) continue
    const key = q.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ q, a })
    if (out.length >= FAQ_MAX) break
  }
  return out
}

function extractJobFaqs({ sections = [] } = {}) {
  const symptom = sectionBody(sections, 'symptom')
  const diagnosis = sectionBody(sections, 'diagnosis')
  const plan = sectionBody(sections, 'plan')
  const process = sectionBody(sections, 'process')
  const handover = sectionBody(sections, 'handover')
  const haystack = [symptom, diagnosis, plan, process, handover].filter(Boolean).join('。')

  const raw = []
  const push = (q, a) => {
    if (!q || !a) return
    raw.push({ q, a })
  }

  if (plan && !GENERIC_ANSWER.test(plan)) {
    push('这次做了什么？', plan.slice(0, 180))
  } else if (diagnosis) {
    push(
      '这次查出了什么、怎么处理？',
      [diagnosis, plan].filter(Boolean).join('。').slice(0, 180),
    )
  }

  if (/不换总成|未换总成|无需换总成|不用换总成|不更换总成/.test(haystack)) {
    push(
      '这次为什么没换总成？',
      firstSentenceMatching(haystack, /总成/) || plan || diagnosis,
    )
  }
  if (/不连盘|只换.{0,8}片|未换.{0,8}盘|无需换盘/.test(haystack)) {
    push(
      '这次为什么没连盘一起换？',
      firstSentenceMatching(haystack, /盘|片/) || plan,
    )
  }
  if (/当天开走|当天交车|留车|留\s*\d+\s*天|大约.{0,12}天|工期/.test(haystack)) {
    push(
      '大概要留几天？能不能开走？',
      firstSentenceMatching(haystack, /天|开走|工期|当天/) || handover,
    )
  }
  if (/旧件/.test(haystack)) {
    push('旧件怎么处理？', firstSentenceMatching(haystack, /旧件/) || handover)
  }
  if (/故障灯|灯亮|报警灯/.test(haystack)) {
    push('这次灯亮查到了什么？', firstSentenceMatching(haystack, /灯/) || diagnosis)
  }

  return normalizeFaqItems(raw)
}

module.exports = {
  FAQ_MAX,
  extractJobFaqs,
  normalizeFaqItems,
}
