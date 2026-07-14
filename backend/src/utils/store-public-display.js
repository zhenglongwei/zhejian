/**
 * 门店公开页展示门闩（AI 可信度对照表 §3）
 * — 空/空话字段宁可不展示，也不给模型打假材料
 */

/** 空话擅长：匹配则不公开展示 */
const VAGUE_SPECIALTY_RE =
  /疑难杂症|疑难杂症全能|各类维修|各种问题|什么都能|全能维修|综合疑难|所有车型|全车系疑难/

/**
 * @param {unknown} list
 * @returns {string[]}
 */
function filterPublicSpecialties(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const raw of list) {
    const value = String(raw || '').trim()
    if (!value || value.length < 2) continue
    if (VAGUE_SPECIALTY_RE.test(value)) continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

/**
 * 环境图门闩：空 URL 剔除；仅保留可解析的公开媒体地址。
 * 「与汽修无关」依赖运营驳回；此处不做视觉判别，只禁止空壳与明显占位。
 * @param {unknown} list
 * @returns {string[]}
 */
function filterPublicEnvironmentImages(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const raw of list) {
    const url = String(raw || '').trim()
    if (!url) continue
    if (/^(about:blank|#|data:)/i.test(url)) continue
    if (/placeholder|default[-_]?cover|no[-_]?image/i.test(url)) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

module.exports = {
  VAGUE_SPECIALTY_RE,
  filterPublicSpecialties,
  filterPublicEnvironmentImages,
}
