const { config } = require('../config')
const { resolveEngineRuntimeConfig } = require('./geo-probe-engines')

function channel(ok, via) {
  return { configured: Boolean(ok), via: ok ? via : '' }
}

function getGeoCheckChannels() {
  const baiduKey =
    config.geoCheck.baiduApiKey ||
    process.env.GEO_PROBE_WENXIN_API_KEY ||
    process.env.QIANFAN_ACCESS_KEY ||
    ''
  const qwen = resolveEngineRuntimeConfig('qwen')
  const doubao = resolveEngineRuntimeConfig('doubao')
  const vision =
    config.geoCheck.visionApiKey ||
    process.env.GEO_LLM_API_KEY ||
    process.env.GEO_PROBE_API_KEY ||
    process.env.INSP_LLM_API_KEY ||
    ''
  const hunyuan = resolveEngineRuntimeConfig('hunyuan')
  const amap = config.geoCheck.amapKey

  return {
    webBaidu: channel(baiduKey, baiduKey === config.geoCheck.baiduApiKey ? 'QIANFAN/GEO_CHECK_BAIDU' : 'GEO_PROBE_WENXIN'),
    webQwenFallback: channel(qwen?.apiKey, 'DASHSCOPE/GEO_PROBE_QWEN'),
    mapAmap: channel(amap, 'AMAP_WEB_KEY/GEO_CHECK_AMAP'),
    hunyuan: channel(hunyuan?.apiKey, 'GEO_PROBE_HUNYUAN/GEO_PROBE_YUANBAO/TOKENHUB'),
    doubao: channel(doubao?.apiKey, 'ARK_API_KEY/GEO_PROBE_DOUBAO'),
    vision: channel(vision, 'DASHSCOPE/GEO_VISION/GEO_LLM'),
    dailyLimit: config.geoCheck.dailyLimitPerIp,
  }
}

function geoCheckReadySummary() {
  const ch = getGeoCheckChannels()
  const web = ch.webBaidu.configured
  const map = ch.mapAmap.configured || web
  const layer2 = ch.vision.configured
  return {
    channels: ch,
    layer1Web: web,
    layer1Map: map,
    layer2,
    canRunPartial:
      web ||
      ch.mapAmap.configured ||
      ch.webQwenFallback.configured ||
      ch.hunyuan.configured ||
      ch.doubao.configured ||
      layer2,
  }
}

/**
 * 大模型轮询通道的环境状态（2026-08-30 新体检架构）。
 * 只报「配没配」，不报 key 本身；没配的引擎前端整条不显示。
 */
function llmPollStatus() {
  const { listConfiguredEngines, POLL_ENGINES } = require('./geo-check-llm-poll.service')
  const configured = listConfiguredEngines()
  return {
    ready: configured.length > 0,
    engines: configured.map((item) => ({ id: item.id, label: item.label, ecoLabel: item.ecoLabel })),
    planned: POLL_ENGINES.length,
    dailyLimit: config.geoCheck.dailyLimitPerIp,
  }
}

module.exports = { getGeoCheckChannels, geoCheckReadySummary, llmPollStatus }
