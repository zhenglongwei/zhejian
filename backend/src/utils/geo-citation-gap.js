/**
 * GEO-OBS-C01 · Citation gap 评分（同城同服务：供给 vs 探测命中）
 */

const GAP_ACTION = {
  TOPIC: 'T+',
  CASE: 'C+',
  REWRITE: 'R',
  SKIP: '—',
}

/**
 * @param {string} city
 * @param {string} service
 */
function buildIntentKey(city, service) {
  return `${String(city || '').trim()}|${String(service || '').trim()}`
}

/**
 * @param {object} input
 * @param {number} input.publicCaseCount
 * @param {boolean} input.hasTopic
 * @param {number} input.activePromptCount
 * @param {number} input.probeMentionCount
 * @param {number} input.probeCitationCount
 * @param {number} input.usedOnlyCount
 * @param {number} [input.cityMedianCases]
 */
function scoreCitationGap(input) {
  const count = Math.max(0, Number(input.publicCaseCount) || 0)
  const median = Math.max(0, Number(input.cityMedianCases) || 0)
  const prompts = Math.max(0, Number(input.activePromptCount) || 0)
  const mentions = Math.max(0, Number(input.probeMentionCount) || 0)
  const citations = Math.max(0, Number(input.probeCitationCount) || 0)
  const usedOnly = Math.max(0, Number(input.usedOnlyCount) || 0)
  const hasTopic = Boolean(input.hasTopic)

  let score = 0
  if (!hasTopic) score += 35
  if (count === 0) score += 30
  else if (median > 0 && count < median) score += Math.min(25, (median - count) * 4)
  if (prompts > 0 && !hasTopic) score += 10
  if (mentions > 0 && citations === 0) score += 12
  if (usedOnly > 0) score += 8
  if (mentions === 0 && prompts > 0 && count < 2) score += 6

  let recommendedAction = GAP_ACTION.SKIP
  if (!hasTopic && prompts > 0) recommendedAction = GAP_ACTION.TOPIC
  else if (count < Math.max(2, median)) recommendedAction = GAP_ACTION.CASE
  else if (usedOnly > citations && hasTopic) recommendedAction = GAP_ACTION.REWRITE

  return {
    citationGapScore: Math.round(score),
    recommendedAction,
    supplyLevel: count === 0 ? 'none' : count < median ? 'low' : 'ok',
  }
}

/**
 * @param {Array<object>} gaps
 * @param {number} [limit]
 */
function sortCitationGaps(gaps, limit = 10) {
  return [...gaps]
    .sort((a, b) => {
      if (b.citationGapScore !== a.citationGapScore) {
        return b.citationGapScore - a.citationGapScore
      }
      return (a.publicCaseCount || 0) - (b.publicCaseCount || 0)
    })
    .slice(0, Math.max(1, limit))
}

function median(values) {
  const nums = (values || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (!nums.length) return 0
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
}

module.exports = {
  GAP_ACTION,
  buildIntentKey,
  scoreCitationGap,
  sortCitationGaps,
  median,
}
