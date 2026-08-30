const { config } = require('../config')
const { searchBaiduWeb } = require('./geo-check-baidu-search.service')
const { searchAmapPlace, inferMapFromWebHits } = require('./geo-check-map.service')
const { inspectOfficialFromHits } = require('./geo-check-official.service')
const { generateBusinessQuestions } = require('./geo-check-prompts.service')
const { probeWithEngine, resolveEngineRuntimeConfig } = require('./geo-probe-engines')
const {
  classifySearchHit,
  hitMentionsCompany,
  hitInEcosystem,
} = require('../utils/geo-check-classify')

function buildQuery(companyName, city) {
  const name = String(companyName || '').trim()
  const quoted = `"${name}"`
  const place = String(city || '').trim()
  return place ? `${place} ${quoted}` : quoted
}

function nameSearchPrompt(companyName) {
  const name = String(companyName || '').trim()
  return `请联网搜索企业「${name}」。只根据检索到的网页列出标题和能打开的链接。标题或摘要必须完整出现「${name}」，不要返回只是个别字相同的其他公司。不要评价靠不靠谱，不要编造链接。`
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

function sourcesFromProbe(probe, companyName) {
  return (probe.searchSources || [])
    .map((item) =>
      classifySearchHit({
        url: item.url,
        title: item.title || item.name,
        snippet: item.snippet,
      }),
    )
    .filter((hit) => hit.url && hitMentionsCompany(hit, companyName))
}

function viewEcosystemSearch(options) {
  const { engine, label, ecosystemId, ecosystemLabel, probe, companyName } = options
  if (!probe || probe.status === 'skipped') {
    return {
      status: probe?.reason === 'missing_api_key' ? 'unconfigured' : probe?.status || 'unconfigured',
      engine,
      label,
      ecosystem: ecosystemId,
      ecosystemFound: false,
      ecosystemHits: [],
      sources: [],
      answer: '',
      reason: probe?.reason || 'missing_api_key',
      note: '这一路没查。',
    }
  }
  if (probe.status !== 'ok') {
    return {
      status: probe.status || 'error',
      engine,
      label,
      ecosystem: ecosystemId,
      ecosystemFound: false,
      ecosystemHits: [],
      sources: [],
      answer: '',
      reason: probe.reason || probe.errorMessage || '',
      note: '这一路出错，不能当成已搜过该生态。',
    }
  }
  const sources = sourcesFromProbe(probe, companyName)
  const ecosystemHits = sources.filter((hit) => hitInEcosystem(hit, ecosystemId)).slice(0, 8)
  const ecosystemFound = ecosystemHits.length > 0
  let note = `这次没摸到${ecosystemLabel}链接。不能据此说账号不存在，只能说明这条检索通道没拿到。这是接口联网，不是打开 App。`
  if (ecosystemFound) {
    note = `来源里出现了与该企业名称对得上的${ecosystemLabel}链接。这仍不是打开 App 看到的画面。`
  } else if (sources.length) {
    note = `已联网且有名称对得上的网页，但没有${ecosystemLabel}链接。不能写成该生态没有号。`
  }
  return {
    status: 'ok',
    engine,
    label,
    ecosystem: ecosystemId,
    ecosystemFound,
    ecosystemHits,
    sources: sources.slice(0, 8),
    answer: String(probe.answer || '').slice(0, 800),
    searchConfirmed: Boolean(probe.webSearchEvidence?.confirmed),
    reason: '',
    note,
  }
}

function collectHitsForOfficial(web, qwen, hunyuan, doubao) {
  const list = []
  const seen = new Set()
  for (const hit of [].concat(web.hits || [], qwen.sources || [], hunyuan.sources || [], doubao.sources || [])) {
    if (!hit?.url || seen.has(hit.url)) continue
    seen.add(hit.url)
    list.push(hit)
  }
  return list
}

function summarizeSearch(web, map, qwen, hunyuan, doubao, official) {
  const gaps = []
  if (web.status === 'ok' && !web.hits.length) gaps.push('百度几乎搜不到同名结果')
  if (web.status === 'unconfigured') gaps.push('百度网页检索未配置，这一项没查')
  if (web.status === 'error') gaps.push('百度网页检索出错，这一项没查成')
  if (map.status === 'ok' && !map.found) gaps.push('地图上没搜到对应地点')
  if (map.status === 'ok' && map.found && !map.matchedName) gaps.push('地图有点，但名称对不太上')
  if (qwen.status === 'ok' && !qwen.ecosystemFound) gaps.push('通义这次没摸到阿里系站点链接')
  if (hunyuan.status === 'ok' && !hunyuan.ecosystemFound) gaps.push('混元这次没摸到腾讯系站点链接')
  if (doubao.status === 'ok' && !doubao.ecosystemFound) gaps.push('豆包这次没摸到字节系站点链接')
  if (official.status === 'skipped' && official.reason === 'not_found') gaps.push('没有认定出官网，未做结构化抽查')
  if (official.status === 'ok' && official.audit && official.audit.gaps && official.audit.gaps.length) {
    gaps.push(`官网抽查缺口：${official.audit.gaps.slice(0, 3).join('、')}`)
  }
  return gaps
}

function overallTone(gaps, web) {
  const nothing = web.status === 'unconfigured' || web.status === 'error'
  if (nothing && gaps.length >= 4) return 'unknown'
  if (gaps.length >= 3) return 'weak'
  if (gaps.length) return 'mixed'
  return 'ok'
}

async function runGeoCheck(input) {
  const companyName = String(input.companyName || '').trim()
  const city = String(input.city || '').trim()
  const industry = String(input.industry || '').trim()
  const query = buildQuery(companyName, city)
  const timeoutMs = config.geoCheck.timeoutMs
  const qwenCfg = resolveEngineRuntimeConfig('qwen')
  const hunyuanCfg = resolveEngineRuntimeConfig('hunyuan')
  const doubaoCfg = resolveEngineRuntimeConfig('doubao')
  const prompt = nameSearchPrompt(companyName)

  const [web, mapRaw, qwenRaw, hunyuanRaw, doubaoRaw, prompts] = await Promise.all([
    searchBaiduWeb(query, timeoutMs, companyName),
    searchAmapPlace(companyName, city, Math.min(timeoutMs, 15000)),
    probeWithEngine('qwen', prompt, {
      dryRun: false,
      enabled: Boolean(qwenCfg?.apiKey),
      timeoutMs,
    }),
    probeWithEngine('hunyuan', prompt, {
      dryRun: false,
      enabled: Boolean(hunyuanCfg?.apiKey),
      timeoutMs,
      userLocation: hunyuanUserLocation(city),
    }),
    probeWithEngine('doubao', prompt, {
      dryRun: false,
      enabled: Boolean(doubaoCfg?.apiKey),
      timeoutMs,
    }),
    generateBusinessQuestions({ companyName, city, industry }),
  ])

  let map = mapRaw
  if (map.status === 'unconfigured' && web.hits && web.hits.length) {
    map = inferMapFromWebHits(web.hits, companyName, city)
  }

  const qwen = viewEcosystemSearch({
    engine: 'qwen',
    label: '通义联网检索（不是通义 App）',
    ecosystemId: 'alibaba',
    ecosystemLabel: '阿里系',
    probe: qwenCfg?.apiKey ? qwenRaw : { status: 'skipped', reason: 'missing_api_key' },
    companyName,
  })
  const hunyuan = viewEcosystemSearch({
    engine: 'hunyuan',
    label: '腾讯混元联网检索（不是元宝 App，也不是微信搜一搜）',
    ecosystemId: 'tencent',
    ecosystemLabel: '腾讯系',
    probe: hunyuanCfg?.apiKey ? hunyuanRaw : { status: 'skipped', reason: 'missing_api_key' },
    companyName,
  })
  const doubao = viewEcosystemSearch({
    engine: 'doubao',
    label: '豆包联网检索（不是豆包 App）',
    ecosystemId: 'bytedance',
    ecosystemLabel: '字节系',
    probe: doubaoCfg?.apiKey ? doubaoRaw : { status: 'skipped', reason: 'missing_api_key' },
    companyName,
  })

  const officialHits = collectHitsForOfficial(web, qwen, hunyuan, doubao)
  const official = await inspectOfficialFromHits(officialHits, companyName)
  const gaps = summarizeSearch(web, map, qwen, hunyuan, doubao, official)

  return {
    companyName,
    city,
    industry,
    queriedAt: new Date().toISOString(),
    overall: overallTone(gaps, web),
    step: 1,
    layer1: {
      title: '接口通道 · 大模型联网后怎么说这家',
      web,
      map,
      qwen,
      hunyuan,
      doubao,
      official,
      gaps,
    },
    step2: {
      title: '浏览器自动巡检 · 真机跑一遍，看车主实际看得到什么',
      prompts,
      note: '程序自己开浏览器，分两路查：搜索引擎用带店名的查询，出网页实测地基分；大模型网页版用不带店名的业务问题，出 AI 可见性分。全程自动抓取，不需要截图。',
    },
    disclaimer:
      '接口通道是公开检索抽样，看名字找不找得到、各生态检索摸不摸得到自家站点；浏览器通道是真机实测，看搜名字时第一页出现什么、以及车主不问店名时 AI 想不想得到你。三个分各算各的，在榜单上分开标注，谁也不顶替谁。',
  }
}

module.exports = {
  runGeoCheck,
  buildQuery,
  nameSearchPrompt,
}
