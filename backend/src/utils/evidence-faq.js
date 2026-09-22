/**
 * 公开 FAQ 证据口径：只保留能指回这例 / 这 N 例档案的问答。
 * 规范：docs/09_SEO_GEO_AI内容基础设施/05_FAQ生成规范.md §1.1
 */

const SLOGAN_PATTERN =
  /专业团队|诚信经营|用心服务|注重透明化|微信群|匠心|品质之选|为您保驾护航/

const ENCYCLOPEDIA_QUESTION_PATTERN =
  /多久需要更换|一般包含哪些|一般需要多久|原厂件|品牌件有什么区别|常见原因有哪些|价格为什么差别|维修前需要准备什么|这个问题一定要马上修/

const CASE_POINTER_PATTERN =
  /这例|这\s*\d+\s*例|\d+\s*例脱敏|本单|这次查|这次做|公开档案|上述\s*\d+\s*例/

function faqText(item) {
  if (!item || typeof item !== 'object') return ''
  return `${item.q || item.question || ''}${item.a || item.answer || ''}`
}

function looksLikeEncyclopediaFaq(item) {
  const text = faqText(item)
  if (!text.trim()) return true
  if (SLOGAN_PATTERN.test(text)) return true
  if (/一般来说/.test(text)) return true
  if (CASE_POINTER_PATTERN.test(text)) return false
  return ENCYCLOPEDIA_QUESTION_PATTERN.test(text)
}

function keepEvidenceFaq(item) {
  const q = String((item && (item.q || item.question)) || '').trim()
  const a = String((item && (item.a || item.answer)) || '').trim()
  if (!q || !a) return false
  const text = faqText(item)
  // 单案缺项叮嘱不上专题页，避免写成跨店结论
  if (!CASE_POINTER_PATTERN.test(text) && /要向商家确定|先问盘厚|问清是套餐|规格和包装给你看/.test(text)) {
    return false
  }
  return !looksLikeEncyclopediaFaq(item)
}

function filterEvidenceFaq(list) {
  return (Array.isArray(list) ? list : []).filter(keepEvidenceFaq)
}

function nArchiveLabel(n) {
  const count = Number(n) || 0
  if (count <= 1) return '这例公开档案里'
  return `这 ${count} 例公开档案里`
}

module.exports = {
  SLOGAN_PATTERN,
  ENCYCLOPEDIA_QUESTION_PATTERN,
  CASE_POINTER_PATTERN,
  looksLikeEncyclopediaFaq,
  keepEvidenceFaq,
  filterEvidenceFaq,
  nArchiveLabel,
}
