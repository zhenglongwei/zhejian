#!/usr/bin/env node
/**
 * 打印 GEO 体检各通道是否已配密钥（不输出密钥本身）
 */
require('../src/config')
const { geoCheckReadySummary } = require('../src/services/geo-check-env')

const summary = geoCheckReadySummary()
console.log(JSON.stringify(summary, null, 2))
if (!summary.canRunPartial) {
  console.error(
    '\n本机没有可用的网页/地图/豆包/混元/读图密钥。请从生产 ECS 的 backend/.env 拷贝 DASHSCOPE_API_KEY、ARK_API_KEY、GEO_PROBE_YUANBAO_API_KEY（或 GEO_PROBE_HUNYUAN_API_KEY）、AMAP_WEB_KEY、QIANFAN_API_KEY。',
  )
  process.exitCode = 1
}
