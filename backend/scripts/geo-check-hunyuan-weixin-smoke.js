#!/usr/bin/env node
/**
 * 实测腾讯混元 TokenHub 联网：返回来源里有没有 mp.weixin.qq.com
 * 不把接口结果当成元宝/搜一搜 App 实测。
 *
 * 用法：
 *   node scripts/geo-check-hunyuan-weixin-smoke.js
 *   node scripts/geo-check-hunyuan-weixin-smoke.js --query "人民日报 微信公众号"
 */
require('../src/config')
const { probeWithEngine, resolveEngineRuntimeConfig } = require('../src/services/geo-probe-engines')
const { weixinHitsFromSources } = require('../src/utils/geo-check-classify')

function argValue(name, fallback) {
  const idx = process.argv.indexOf(name)
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]
  return fallback
}

async function runOne(label, prompt) {
  const result = await probeWithEngine('hunyuan', prompt, {
    dryRun: false,
    enabled: true,
    timeoutMs: Number(process.env.GEO_CHECK_TIMEOUT_MS || 90000),
    userLocation: { region: 'Zhejiang', city: 'Hangzhou' },
  })
  const weixinHits = weixinHitsFromSources(result.searchSources || [])
  const weixinInAnswer = /weixin\.qq\.com|mp\.weixin/i.test(String(result.answer || ''))
  const sources = (result.searchSources || []).map((item) => ({
    url: item.url,
    title: item.title,
  }))
  return {
    label,
    prompt,
    status: result.status,
    reason: result.reason || result.errorMessage || '',
    searchConfirmed: Boolean(result.webSearchEvidence?.confirmed),
    webSearchCalls: result.raw?.usage?.tool_usage?.web_search_call || 0,
    weixinFound: weixinHits.length > 0 || weixinInAnswer,
    weixinHits,
    sourceCount: sources.length,
    sources: sources.slice(0, 10),
    answerPreview: String(result.answer || '').slice(0, 400),
  }
}

async function main() {
  const cfg = resolveEngineRuntimeConfig('hunyuan')
  if (!cfg?.apiKey) {
    console.error(
      '没有混元/TokenHub 密钥。请在 backend/.env 写入 GEO_PROBE_YUANBAO_API_KEY 或 GEO_PROBE_HUNYUAN_API_KEY（生产已有的那把即可）。',
    )
    process.exit(1)
  }
  console.error(`[hunyuan] model=${cfg.model} url=${cfg.apiUrl}`)

  const custom = argValue('--query', '')
  const cases = custom
    ? [{ label: 'custom', prompt: custom }]
    : [
        {
          label: 'known_account',
          prompt: '人民日报微信公众号有哪些能打开的原文链接？请列出网址。',
        },
        {
          label: 'company',
          prompt: '杭州盈简科技的微信公众号、视频号有哪些公开资料？请列出能打开的原文链接。',
        },
      ]

  const reports = []
  for (const item of cases) {
    reports.push(await runOne(item.label, item.prompt))
  }

  const anyWeixin = reports.some((item) => item.weixinFound)
  const summary = {
    conclusion: anyWeixin
      ? '混元这次返回了微信/公众号链接，说明联网能摸到部分公众号网页；仍不是搜一搜或元宝 App。'
      : '混元这次没有返回微信/公众号链接，不能据此说能查询公众号内容。',
    anyWeixin,
    reports,
  }
  console.log(JSON.stringify(summary, null, 2))
  process.exit(anyWeixin ? 0 : 2)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
