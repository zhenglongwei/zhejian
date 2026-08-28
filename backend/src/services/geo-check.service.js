const { config } = require('../config')
const { searchBaiduWeb } = require('./geo-check-baidu-search.service')
const { searchAmapPlace, inferMapFromWebHits } = require('./geo-check-map.service')
const { analyzeScreenshots } = require('./geo-check-screenshot.service')
const { probeWithEngine, resolveEngineRuntimeConfig } = require('./geo-probe-engines')
const { textMentionsName, weixinHitsFromSources, classifySearchHit } = require('../utils/geo-check-classify')

function buildQuery(companyName, city) {
  const name = String(companyName || '').trim()
  const place = String(city || '').trim()
  return place ? `${place} ${name}` : name
}

function summarizePresence(web, map, hunyuan) {
  const gaps = []
  if (web.status === 'ok' && !web.hits.length) gaps.push('公开网页几乎搜不到同名结果')
  if (web.status === 'ok' && web.likelyOfficial && web.likelyOfficial.length === 0) {
    gaps.push('网页结果里看不到像官网的条目')
  }
  if (map.status === 'ok' && !map.found) gaps.push('地图上没搜到对应地点')
  if (map.status === 'ok' && map.found && !map.matchedName) gaps.push('地图有点，但名称对不太上')
  if (web.status === 'unconfigured') gaps.push('网页检索未配置密钥（百度或通义），这一项没查')
  if (map.status === 'unconfigured') gaps.push('地图未查到（无高德密钥，网页里也没有地图链接）')
  if (hunyuan && hunyuan.status === 'ok' && !hunyuan.weixinFound) {
    gaps.push('腾讯混元这次联网结果里没有公众号链接，不能当成已查遍微信')
  }
  if (hunyuan && (hunyuan.status === 'unconfigured' || hunyuan.status === 'skipped')) {
    gaps.push('腾讯混元联网未配置，微信园这一项没自动查')
  }
  return gaps
}

const CITY_LOCATION = {
  杭州: { region: 'Zhejiang', city: 'Hangzhou' },
  深圳: { region: 'Guangdong', city: 'Shenzhen' },
  北京: { region: 'Beijing', city: 'Beijing' },
  上海: { region: 'Shanghai', city: 'Shanghai' },
  广州: { region: 'Guangdong', city: 'Guangzhou' },
}

function hunyuanUserLocation(city) {
  return CITY_LOCATION[String(city || '').trim()] || undefined
}

function viewHunyuan(probe, companyName, city) {
  if (!probe || probe.status === 'skipped') {
    return {
      status: probe?.reason === 'missing_api_key' ? 'unconfigured' : probe?.status || 'unconfigured',
      engine: 'hunyuan',
      label: '腾讯混元联网检索（不是元宝 App，也不是微信搜一搜）',
      weixinFound: false,
      weixinHits: [],
      sources: [],
      answer: '',
      reason: probe?.reason || 'missing_api_key',
    }
  }
  const sources = (probe.searchSources || []).map((item) =>
    classifySearchHit({
      url: item.url,
      title: item.title || item.name,
      snippet: item.snippet,
    }),
  )
  const weixinHits = weixinHitsFromSources(probe.searchSources)
  const answerText = String(probe.answer || '')
  const weixinInAnswer = /weixin\.qq\.com|mp\.weixin/i.test(answerText)
  const weixinFound = weixinHits.length > 0 || weixinInAnswer
  let note = '这次没有返回可核对的来源链接。'
  if (weixinFound) {
    note = '来源或回答里出现了微信/公众号链接。这仍不是打开搜一搜或元宝 App 看到的画面。'
  } else if (probe.webSearchEvidence?.confirmed || sources.length) {
    note = '混元已联网，但这次给出的链接里没有公众号。不能据此说能搜到公众号内容。'
  }
  return {
    status: probe.status || 'error',
    engine: 'hunyuan',
    label: '腾讯混元联网检索（不是元宝 App，也不是微信搜一搜）',
    mentioned: probe.status === 'ok' && textMentionsName(`${answerText} ${sources.map((s) => s.url).join(' ')}`, companyName, city),
    weixinFound,
    weixinHits: weixinHits.slice(0, 8),
    sources: sources.slice(0, 8),
    answer: answerText.slice(0, 1200),
    searchConfirmed: Boolean(probe.webSearchEvidence?.confirmed),
    reason: probe.reason || probe.errorMessage || '',
    note,
  }
}

function summarizeMentions(probe, screenshots) {
  const gaps = []
  if (probe.status === 'ok' && !probe.mentioned) {
    gaps.push('字节系模型联网回答里没有点名这家')
  }
  if (probe.status === 'skipped' || probe.status === 'unconfigured') {
    gaps.push('豆包联网探测未跑（缺密钥），不能当成已查过 App')
  }
  const shot = screenshots.items && screenshots.items[0]
  if (shot && shot.mentionedTarget === false) {
    gaps.push('截图里没有提到这家')
  }
  if (shot && Array.isArray(shot.competitors) && shot.competitors.length) {
    gaps.push(`截图里出现了其他名字：${shot.competitors.slice(0, 3).join('、')}`)
  }
  if (screenshots.status === 'skipped') {
    gaps.push('没有上传截图；微信公众号/视频号/搜一搜等封闭入口只能靠截图补')
  }
  return gaps
}

function overallTone(presenceGaps, mentionGaps, web, probe) {
  const autoFailed = [web, probe].every((part) => part.status === 'unconfigured' || part.status === 'skipped')
  if (autoFailed) return 'unknown'
  if (presenceGaps.length >= 2 || mentionGaps.length >= 2) return 'weak'
  if (presenceGaps.length || mentionGaps.length) return 'mixed'
  return 'ok'
}

async function runGeoCheck(input) {
  const companyName = String(input.companyName || '').trim()
  const city = String(input.city || '').trim()
  const query = buildQuery(companyName, city)
  const timeoutMs = config.geoCheck.timeoutMs
  const hunyuanCfg = resolveEngineRuntimeConfig('hunyuan')
  const doubaoCfg = resolveEngineRuntimeConfig('doubao')
  const probePrompt = city
    ? `${city}${companyName}是做什么的？靠谱吗？请说明依据和来源。`
    : `${companyName}是做什么的？网上能查到哪些公开资料？请说明来源。`
  const hunyuanPrompt = city
    ? `${city}${companyName}的微信公众号、视频号有哪些公开资料？请列出能打开的原文链接。`
    : `${companyName}的微信公众号、视频号有哪些公开资料？请列出能打开的原文链接。`

  const [web, mapRaw, probeRaw, hunyuanRaw, screenshots] = await Promise.all([
    searchBaiduWeb(query, timeoutMs, companyName),
    searchAmapPlace(companyName, city, Math.min(timeoutMs, 15000)),
    probeWithEngine('doubao', probePrompt, {
      dryRun: false,
      enabled: Boolean(doubaoCfg?.apiKey),
      timeoutMs,
    }),
    probeWithEngine('hunyuan', hunyuanPrompt, {
      dryRun: false,
      enabled: Boolean(hunyuanCfg?.apiKey),
      timeoutMs,
      userLocation: hunyuanUserLocation(city),
    }),
    analyzeScreenshots({
      companyName,
      city,
      images: input.screenshots,
    }),
  ])

  let map = mapRaw
  if (map.status === 'unconfigured' && web.hits && web.hits.length) {
    map = inferMapFromWebHits(web.hits, companyName, city)
  }

  let probe = probeRaw
  if (!doubaoCfg?.apiKey) {
    probe = { status: 'unconfigured', engine: 'doubao', reason: 'missing_api_key' }
  }
  const hunyuanProbe = hunyuanCfg?.apiKey
    ? hunyuanRaw
    : { status: 'unconfigured', engine: 'hunyuan', reason: 'missing_api_key' }
  const hunyuanView = viewHunyuan(hunyuanProbe, companyName, city)

  const probeText = `${probe.answer || ''} ${(probe.searchSources || []).map((item) => item.url || '').join(' ')}`
  const probeMentioned = probe.status === 'ok' && textMentionsName(probeText, companyName, city)
  const probeView = {
    status: probe.status || 'error',
    engine: 'doubao',
    label: '字节系模型联网探测（不是豆包 App）',
    mentioned: probeMentioned,
    answer: String(probe.answer || '').slice(0, 1200),
    sources: (probe.searchSources || []).slice(0, 8),
    reason: probe.reason || probe.errorMessage || '',
  }

  const presenceGaps = summarizePresence(web, map, hunyuanView)
  const mentionGaps = summarizeMentions(probeView, screenshots)
  const wechatNote = hunyuanView.weixinFound
    ? '混元联网来源里出现了微信/公众号链接。这不是搜一搜或元宝 App 实测。'
    : hunyuanView.status === 'ok'
      ? '混元已联网，这次没有公众号链接。微信布局仍不能当成查完。'
      : '公众号、视频号没有开放检索接口。混元未查到时只能看截图。腾讯云「元宝」不含公众号。'

  return {
    companyName,
    city,
    queriedAt: new Date().toISOString(),
    overall: overallTone(presenceGaps, mentionGaps, web, probeView),
    layer1: {
      title: '信息在不在',
      web,
      map,
      hunyuan: hunyuanView,
      wechat: { status: hunyuanView.weixinFound ? 'ok' : 'manual', note: wechatNote },
      douyinToutiao: {
        status: 'manual',
        note: '有没有抖音号/头条号请勾选或上传截图；自动探测不替代「有没有号」。',
      },
      gaps: presenceGaps,
    },
    layer2: {
      title: '大模型有没有引用',
      doubao: probeView,
      screenshots,
      gaps: mentionGaps,
    },
    disclaimer:
      '这是公开检索和抽样，不是全网公证，也不保证某家 App 里一定出现。接口结果不等于用户打开 App 看到的画面。',
  }
}

module.exports = { runGeoCheck, buildQuery }
