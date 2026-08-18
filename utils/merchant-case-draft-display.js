/**
 * 小程序端只读展示商家案例草稿（与 backend merchant-case-draft 对齐的轻量版）
 */

const SECTION_TITLE_BY_KEY = {
  symptom: '症状与诉求',
  diagnosis: '检查留证',
  plan: '方案与避坑',
  process: '施工留证',
  handover: '交车与质保',
}

const SECTION_ORDER = ['symptom', 'diagnosis', 'plan', 'process', 'handover']

function draftToPlainText(draft = {}) {
  if (!draft || typeof draft !== 'object') return ''
  const parts = [String(draft.title || '').trim()]
  const summary = String(draft.caseSummary || '').trim()
  if (summary) parts.push(summary)
  ;(draft.sections || []).forEach((sec) => {
    const body = String((sec && sec.body) || '').trim()
    if (!body) return
    parts.push(`【${(sec && sec.title) || ''}】${body}`)
  })
  return parts.filter(Boolean).join('\n\n').slice(0, 2000)
}

function draftToAiSummary(draft = {}) {
  const summary = String((draft && draft.caseSummary) || '').trim()
  if (summary) return summary.slice(0, 250)
  return draftToPlainText(draft).slice(0, 250)
}

function sectionTitleOf(key = '') {
  return SECTION_TITLE_BY_KEY[String(key || '').trim()] || '其他配图'
}

/** 配图按章节分组：每组一个中文标题，图列在下方（不逐张重复节点描述） */
function groupMediaBySection(media = [], sections = []) {
  const titleByKey = {}
  ;(sections || []).forEach((sec) => {
    if (sec && sec.key) titleByKey[sec.key] = sec.title || sectionTitleOf(sec.key)
  })
  const buckets = {}
  ;(media || []).forEach((item) => {
    const key = String((item && item.sectionKey) || 'process')
    if (!buckets[key]) buckets[key] = []
    buckets[key].push(item)
  })
  const orderedKeys = SECTION_ORDER.filter((key) => buckets[key] && buckets[key].length)
  Object.keys(buckets).forEach((key) => {
    if (!orderedKeys.includes(key) && buckets[key].length) orderedKeys.push(key)
  })
  return orderedKeys.map((key) => ({
    key,
    title: titleByKey[key] || sectionTitleOf(key),
    items: buckets[key],
  }))
}

module.exports = {
  draftToPlainText,
  draftToAiSummary,
  sectionTitleOf,
  groupMediaBySection,
  SECTION_TITLE_BY_KEY,
}
