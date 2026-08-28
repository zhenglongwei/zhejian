const express = require('express')
const { ok, fail } = require('../lib/response')
const { config } = require('../config')
const { runGeoCheck } = require('../services/geo-check.service')
const { clientIp, consumeDailyLimit } = require('../services/geo-check-rate-limit')
const { geoCheckReadySummary } = require('../services/geo-check-env')

const router = express.Router()

router.get('/geo-check/status', (req, res) => {
  const summary = geoCheckReadySummary()
  return ok(res, {
    layer1Web: summary.layer1Web,
    layer1Map: summary.layer1Map,
    layer2: summary.layer2,
    canRunPartial: summary.canRunPartial,
    dailyLimit: summary.channels.dailyLimit,
    channels: {
      webBaidu: summary.channels.webBaidu.configured,
      webQwenFallback: summary.channels.webQwenFallback.configured,
      mapAmap: summary.channels.mapAmap.configured,
      hunyuan: summary.channels.hunyuan.configured,
      doubao: summary.channels.doubao.configured,
      vision: summary.channels.vision.configured,
    },
  })
})

router.post('/geo-check', async (req, res) => {
  const companyName = String(req.body?.companyName || req.body?.name || '').trim()
  const city = String(req.body?.city || '').trim()
  if (companyName.length < 2) {
    return fail(res, 40001, '请填写企业名称', 400)
  }
  if (companyName.length > 80 || city.length > 40) {
    return fail(res, 40002, '名称或城市过长', 400)
  }

  const quota = consumeDailyLimit(clientIp(req), config.geoCheck.dailyLimitPerIp)
  if (!quota.allowed) {
    return fail(res, 42901, '今日查询次数已用完，明天再试或换一个网络', 429, quota)
  }

  const screenshots = Array.isArray(req.body?.screenshots) ? req.body.screenshots : []
  if (screenshots.length > config.geoCheck.maxScreenshots) {
    return fail(res, 40003, `截图最多 ${config.geoCheck.maxScreenshots} 张`, 400)
  }

  try {
    const data = await runGeoCheck({ companyName, city, screenshots })
    data.quota = quota
    return ok(res, data)
  } catch (error) {
    console.error('[geo-check]', error)
    return fail(res, 50001, '体检暂时不可用，请稍后重试', 500)
  }
})

module.exports = router
