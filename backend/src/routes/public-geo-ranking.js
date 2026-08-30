const express = require('express')
const { ok, fail } = require('../lib/response')
const { buildRanking, rankingInsights } = require('../services/geo-ranking.service')

const router = express.Router()

function readFilters(req) {
  const q = req.query || {}
  const limit = Number(q.limit)
  const minConfidence = Number(q.minConfidence)
  const allowedSource = new Set(['SELF', 'BATCH'])
  const allowedChannel = new Set(['API', 'BROWSER'])
  return {
    city: String(q.city || '').trim().slice(0, 40),
    industry: String(q.industry || '').trim().slice(0, 40),
    source: allowedSource.has(String(q.source || '').trim().toUpperCase())
      ? String(q.source).trim().toUpperCase()
      : '',
    channel: allowedChannel.has(String(q.channel || '').trim().toUpperCase())
      ? String(q.channel).trim().toUpperCase()
      : '',
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 0,
    minConfidence: Number.isFinite(minConfidence) ? Math.min(Math.max(minConfidence, 0), 100) : undefined,
    includeInsufficient: String(q.includeInsufficient || '') !== 'false',
  }
}

/** 榜单主接口 */
router.get('/geo-ranking', async (req, res) => {
  try {
    const data = await buildRanking(readFilters(req))
    return ok(res, data)
  } catch (error) {
    console.error('[geo-ranking]', error)
    return fail(res, 50001, '榜单暂时不可用，请稍后重试', 500)
  }
})

/** 榜单概况：用于页面顶部讲行业现状 */
router.get('/geo-ranking/insights', async (req, res) => {
  try {
    const data = await rankingInsights(readFilters(req))
    return ok(res, data)
  } catch (error) {
    console.error('[geo-ranking-insights]', error)
    return fail(res, 50001, '榜单统计暂时不可用，请稍后重试', 500)
  }
})

module.exports = router
