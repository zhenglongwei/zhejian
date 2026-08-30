/**
 * GEO-OBS-C10 · 结构化解析与可量化评分
 *
 * 评分口径公开可复算，全部落 dimensionsJson，谁都能拿原始回执重算一遍。
 *
 * 两个 100 分的块，分开算，不混在一起：
 *
 *   可见性分（chat 型平台：豆包/通义/元宝，问不带店名的业务题）
 *     提及率 50 —— 有效回执里被主动提到的比例，最硬的一项
 *     推荐位次 30 —— 提了，但是第几句提的。答了 800 字最后一行才提，等于没提
 *     准确度   20 —— 提到的时候，名字/城市/来源对不对得上
 *
 *   地基承接分（search 型平台：百度/360/必应，问带店名的查询）
 *     命中率   30 —— 几个带名查询能搜到自家
 *     首条位次 30 —— 第一条命中排在第几位，第 10 名开外等于没有
 *     来源质量 25 —— 命中来源的分量：地图/垂直平台 > 社区内容 > 工商黄页
 *     来源广度 15 —— 命中的来源是不是只有一家
 *
 *   总分 = 两块都测了 0.6×可见性 + 0.4×地基；只测了一块就直接取那一块，
 *   并在 measuredScope 里写明测了哪块。绝不拿「搜得到」冒充「被 AI 推荐」。
 *
 * 置信度
 *   confidence = 有效回执平台数 / 计划平台数 × 100
 *   低于 60 时榜单必须标注「样本不足」。宁可少算，不能拿残缺数据当结论。
 *
 * 绝对禁止
 *   把抓失败的回执（timeout / captcha / login_required / selector_broken）
 *   当成「没被提到」计入分母。抓不到是抓不到，不是没提到。
 */

const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')

/** 可见性块权重，和为 100 */
const WEIGHTS = {
  mention: 50,
  position: 30,
  accuracy: 20,
}

/** 地基承接块权重，和为 100 */
const FOUNDATION_WEIGHTS = {
  hitRate: 30,
  firstRank: 30,
  sourceQuality: 25,
  sourceBreadth: 15,
}

/**
 * 命中来源的分量。
 *
 * 权重不是拍脑袋定的，是按「车主会不会真去看」排的：
 * 车主找修车的店，会开地图、会翻点评，但不会去企查查查工商档案。
 * 一家店搜出来全是企查查和黄页，说明它活在工商档案里，没有自己的经营资产
 * ——这正是我们要卖给门店的那个缺口。
 */
const SOURCE_QUALITY = [
  { type: 'maps', label: '地图', weight: 1, re: /amap|map\.|ditu|地图|高德/ },
  { type: 'vertical', label: '本地生活/汽车垂直', weight: 1, re: /dianping|meituan|autohome|che168|qcw\.com|douyin|懂车帝/ },
  { type: 'ugc', label: '社区内容', weight: 0.8, re: /zhihu|baijiahao|toutiao|sohu|163\.com|bilibili|xiaohongshu|weixin|mp\.weixin/ },
  { type: 'directory', label: '工商黄页', weight: 0.4, re: /qcc|qichacha|aiqicha|tianyancha|11467|likuso|cnpp|顺企网|企查查|天眼查|爱企查|58\.com|ganji|boss|zhaopin|liepin/ },
  { type: 'other', label: '其他', weight: 0.6, re: null },
]

function classifySourceType(host) {
  const text = String(host || '').toLowerCase()
  if (!text) return SOURCE_QUALITY[SOURCE_QUALITY.length - 1]
  return SOURCE_QUALITY.find((item) => item.re && item.re.test(text)) || SOURCE_QUALITY[SOURCE_QUALITY.length - 1]
}

const POSITIVE_WORDS = [
  '专业', '靠谱', '推荐', '好评', '透明', '细致', '负责', '口碑好',
  '技术好', '价格合理', '老店', '放心', '实在', '不错',
]
const NEGATIVE_WORDS = [
  '坑', '差评', '投诉', '忽悠', '不推荐', '乱收费', '黑店', '贵得离谱',
  '敷衍', '返工', '宰客', '避雷',
]

const NOISE_WORDS = ['有限公司', '股份', '公司', '门店', '店', '汽车', '汽修', '维修', '服务']

/** 从全称里拆出可用于匹配的核心名，并生成若干变体 */
function nameVariants(name, city) {
  const raw = String(name || '').trim()
  if (!raw) return []
  const set = new Set()
  set.add(raw)

  let core = raw
  if (city && core.startsWith(city)) core = core.slice(city.length)
  if (core) set.add(core)

  // 去掉常见后缀噪音，只留主体
  let stripped = core
  for (const word of NOISE_WORDS) {
    if (stripped.length > word.length + 2 && stripped.endsWith(word)) {
      stripped = stripped.slice(0, -word.length)
    }
  }
  if (stripped && stripped.length >= 2) set.add(stripped)

  return [...set].filter((item) => item && item.length >= 2)
}

function matchName(text, variants) {
  const blob = String(text || '')
  if (!blob.trim()) return { hit: false, offset: -1, matched: '' }
  let best = -1
  let matched = ''
  for (const variant of variants) {
    const idx = blob.indexOf(variant)
    if (idx >= 0 && (best < 0 || idx < best)) {
      best = idx
      matched = variant
    }
  }
  return { hit: best >= 0, offset: best, matched }
}

function detectSentiment(text) {
  const blob = String(text || '')
  let score = 0
  for (const word of POSITIVE_WORDS) if (blob.includes(word)) score += 1
  for (const word of NEGATIVE_WORDS) if (blob.includes(word)) score -= 1
  if (score > 0) return 'positive'
  if (score < 0) return 'negative'
  return 'neutral'
}

function ecosystemOfUrl(url) {
  const host = String(url || '').toLowerCase()
  if (!host) return 'other'
  if (/alibaba|aliyun|taobao|amap|qianwen|tongyi|1688|tmall/.test(host)) return 'alibaba'
  if (/tencent|qq\.com|weixin|wechat|yuanbao|myapp|gtimg/.test(host)) return 'tencent'
  if (/bytedance|doubao|toutiao|jinritoutiao|douyin|volces|ark\.cn/.test(host)) return 'bytedance'
  if (/baidu|bdstatic|bcebos|qianfan/.test(host)) return 'baidu'
  return 'other'
}

/** 搜狐、汽车之家、58、点评等是第三方平台，不算任何大厂生态 */
function classifyEcosystem(url) {
  const host = String(url || '').toLowerCase()
  if (/sohu|autohome|58\.com|dianping|meituan|ganji|che168/.test(host)) return 'other'
  return ecosystemOfUrl(url)
}

/**
 * 生态归属。来源可能是域名，也可能是中文站名（百度改版后只给站名，
 * 如「爱企查」「天眼查」），所以中文站名要先按品牌认一遍。
 */
const SOURCE_BRAND_ECOSYSTEM = [
  [/爱企查|百度百科|百度知道|百度地图|百家号|百度爱采购|百度/, 'baidu'],
  [/高德|口碑|饿了么|淘宝|天猫|1688|闲鱼|飞猪|阿里云/, 'alibaba'],
  [/腾讯地图|微信|公众号|企点|QQ/, 'tencent'],
  [/抖音|今日头条|懂车帝|巨量|豆包/, 'bytedance'],
  [/360地图|360搜索|360百科/, 'other'],
]

function ecosystemOfSource(source) {
  const text = String(source || '')
  if (!text) return 'other'
  if (/^[\x00-\x7F.]+$/.test(text)) return classifyEcosystem(text)
  return SOURCE_BRAND_ECOSYSTEM.find((item) => item[0].test(text))?.[1] || 'other'
}

/** 一条搜索结果属于哪个来源站：有域名用域名，没有就用页面上显示的站名 */
function hostOfRow(row) {
  return String(row?.domain || row?.source || '').trim()
}

/**
 * 店名变体分两套。
 *
 * 严版只留 6 个字以上的长变体，用在搜索结果匹配上。
 * 「杭州广明汽车服务有限公司」砍到「广明汽车」之后，
 * 会把「杭州广明汽车销售服务有限公司」当成自己人——那是另一家公司。
 * 门店会拿榜单去搜给自己看，认错了比认不出更致命，宁可漏判也不能错判。
 * 一个 6 字以上的变体都没有时才退回全量（比如「盈简科技」这种短名）。
 */
function strictVariantsOf(variants) {
  const list = (variants || []).filter((item) => String(item || '').length >= 6)
  return list.length ? list : variants || []
}

/**
 * 搜索结果里这家店被命中得怎么样。
 * 位次是这套评分里最有说服力的一个数——「搜你，你在第 7 条，前 6 条没一条是你的」。
 */
function searchHitStats(citedUrls, variants) {
  const rows = Array.isArray(citedUrls) ? citedUrls : []
  let firstRank = 0
  let hitRows = 0
  const hosts = new Set()
  const rowsByType = {}

  for (const row of rows) {
    const blob = `${row?.title || ''} ${row?.snippet || ''} ${row?.source || ''} ${row?.domain || ''}`
    if (!matchName(blob, variants).hit) continue
    hitRows += 1
    const rank = Number(row?.rank) || 0
    if (rank > 0 && (!firstRank || rank < firstRank)) firstRank = rank
    const host = hostOfRow(row)
    if (host) hosts.add(host)
    const bucket = classifySourceType(host)
    rowsByType[bucket.type] = (rowsByType[bucket.type] || 0) + 1
  }

  return { firstRank, hitRows, hitHosts: [...hosts], rowsByType }
}

/**
 * 解析单条回执。只处理 status==='ok' 的，其余一律返回 unknown。
 * @param {object} answer
 * @param {string[]} variants
 * @param {object} options { platformType: 'chat' | 'search', strictVariants: string[] }
 */
function analyzeAnswer(answer, variants, options = {}) {
  const platformType = String(options.platformType || 'chat').toLowerCase()
  const base = {
    id: answer.id,
    platform: answer.platform,
    platformLabel: answer.platformLabel,
    status: answer.status,
    platformType,
    valid: answer.status === 'ok',
    mentioned: null,
    mentionOffset: -1,
    sentiment: 'unknown',
    citedUrls: [],
    ecosystems: [],
    firstRank: 0,
    hitRows: 0,
    hitHosts: [],
    rowsByType: {},
  }

  if (!base.valid) return base

  const citedUrls = Array.isArray(answer.citedUrlsJson) ? answer.citedUrlsJson : []
  const answerText = String(answer.answerText || '')
  const sourceBlob = citedUrls
    .map((item) => `${item?.title || ''} ${item?.url || ''} ${item?.source || ''} ${item?.domain || ''}`)
    .join(' ')

  // 搜索引擎按结果条目匹配，用严版变体；大模型的自由文本用全量变体。
  const searchVariants = options.strictVariants || strictVariants(variants)
  const stats =
    platformType === 'search' ? searchHitStats(citedUrls, searchVariants) : null
  const inAnswer = matchName(answerText, platformType === 'search' ? searchVariants : variants)
  const inSources = matchName(sourceBlob, platformType === 'search' ? searchVariants : variants)
  const mentioned = stats ? stats.hitRows > 0 : inAnswer.hit || inSources.hit
  const offset = inAnswer.hit ? inAnswer.offset : -1

  const ecosystems = [
    ...new Set(
      citedUrls
        .map((item) => ecosystemOfSource(hostOfRow(item) || item?.url))
        .concat(Array.isArray(answer.ecosystemsJson) ? answer.ecosystemsJson : [])
        .filter(Boolean),
    ),
  ]

  return {
    ...base,
    mentioned,
    mentionOffset: offset,
    sentiment: mentioned ? detectSentiment(`${answerText} ${sourceBlob}`) : 'neutral',
    // 这里不能截断。下面 scoreOf 要靠完整列表统计引用量与自家域名命中数，
    // 截断了会把「内容资产」和「信息准确度」两项系统性算低。
    // 对外只暴露 citedCount，不吐 URL，所以保留完整列表不会撑大返回值。
    citedUrls,
    ecosystems,
    ...(stats || {}),
    // 「查了，一个结果都没有」是合法的 0 命中，可以进分母；
    // 这和「抓失败」是两回事，后者不算有效回执。
    emptyResult: citedUrls.length === 0,
  }
}

function clamp100(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function medianOf(numbers) {
  if (!numbers.length) return 0
  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * 可见性块：chat 型平台，问的是不带店名的业务题。
 * 测的是「车主压根没提你，AI 会不会主动想到你」。
 */
function scoreVisibility(chat, variants) {
  const mentioned = chat.filter((item) => item.mentioned === true)
  const mentionRatio = mentioned.length / chat.length
  const mentionScore = mentionRatio * WEIGHTS.mention

  let positionScore = 0
  if (mentioned.length) {
    let sum = 0
    for (const item of mentioned) {
      const offset = item.mentionOffset >= 0 ? item.mentionOffset : 1500
      sum += Math.max(0, 1 - offset / 1500)
    }
    positionScore = (sum / mentioned.length) * (mentioned.length / chat.length) * WEIGHTS.position
  }

  let accuracyScore = 0
  if (mentioned.length) {
    const withSourceHit = mentioned.filter((item) =>
      (item.citedUrls || []).some((c) =>
        matchName(`${c?.title || ''} ${c?.url || ''} ${c?.source || ''}`, variants).hit,
      ),
    ).length
    accuracyScore =
      (mentioned.length / chat.length) * WEIGHTS.accuracy * 0.6 +
      (withSourceHit / mentioned.length) * WEIGHTS.accuracy * 0.4
  }

  const score = clamp100(mentionScore + positionScore + accuracyScore)
  return {
    score,
    dimensions: {
      mention: {
        raw: clamp100(mentionScore),
        max: WEIGHTS.mention,
        note: `大模型平台有效回执 ${chat.length} 条，其中 ${mentioned.length} 条主动提到该店`,
      },
      position: {
        raw: clamp100(positionScore),
        max: WEIGHTS.position,
        note: mentioned.length ? '按首次出现的字符位次算，越靠前越高' : '一次都没被提到，本项为 0',
      },
      accuracy: {
        raw: clamp100(accuracyScore),
        max: WEIGHTS.accuracy,
        note: mentioned.length ? '按名称对得上、引用来源对得上的比例算' : '一次都没被提到，本项为 0',
      },
    },
  }
}

/**
 * 地基承接块：search 型平台，问的是带店名的查询。
 * 测的是「车主已经听说了这家店，去搜它，搜出来的是什么」。
 */
function scoreFoundation(search) {
  const hits = search.filter((item) => item.mentioned === true)
  const hitRatio = hits.length / search.length
  const hitRateScore = hitRatio * FOUNDATION_WEIGHTS.hitRate

  // 位次取中位数而不是最优值：只有一次排第一不能说明问题，
  // 次次排第八才是真的没人看得见。
  const ranks = hits.map((item) => Number(item.firstRank) || 0).filter((rank) => rank > 0)
  const midRank = medianOf(ranks)
  const rankScore = midRank ? Math.max(0, 1 - (midRank - 1) / 9) * FOUNDATION_WEIGHTS.firstRank : 0

  // 来源质量：命中来源按「车主会不会真去看」加权平均
  const typeCount = {}
  for (const item of hits) {
    for (const [type, count] of Object.entries(item.rowsByType || {})) {
      typeCount[type] = (typeCount[type] || 0) + count
    }
  }
  const totalHitRows = Object.values(typeCount).reduce((a, b) => a + b, 0)
  let qualityScore = 0
  if (totalHitRows) {
    let weighted = 0
    for (const [type, count] of Object.entries(typeCount)) {
      const bucket = SOURCE_QUALITY.find((item) => item.type === type) || SOURCE_QUALITY[SOURCE_QUALITY.length - 1]
      weighted += bucket.weight * count
    }
    qualityScore = (weighted / totalHitRows) * FOUNDATION_WEIGHTS.sourceQuality
  }

  const hosts = [...new Set(hits.flatMap((item) => item.hitHosts || []))]
  const breadthScore = Math.min(1, hosts.length / 3) * FOUNDATION_WEIGHTS.sourceBreadth

  const score = clamp100(hitRateScore + rankScore + qualityScore + breadthScore)

  const typeLabel = Object.entries(typeCount)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => {
      const bucket = SOURCE_QUALITY.find((item) => item.type === type)
      return `${bucket ? bucket.label : type} ${count}`
    })
    .join('、')

  return {
    score,
    dimensions: {
      hitRate: {
        raw: clamp100(hitRateScore),
        max: FOUNDATION_WEIGHTS.hitRate,
        note: `带店名查询 ${search.length} 次，${hits.length} 次在结果里找到了这家店`,
      },
      firstRank: {
        raw: clamp100(rankScore),
        max: FOUNDATION_WEIGHTS.firstRank,
        note: ranks.length
          ? `首次命中的位次中位数第 ${midRank} 条，第 10 条及以后记 0 分`
          : '从来没有在结果里出现过，本项为 0',
      },
      sourceQuality: {
        raw: clamp100(qualityScore),
        max: FOUNDATION_WEIGHTS.sourceQuality,
        note: typeLabel ? `命中来源：${typeLabel}` : '没有命中任何结果',
      },
      sourceBreadth: {
        raw: clamp100(breadthScore),
        max: FOUNDATION_WEIGHTS.sourceBreadth,
        note: `命中来源 ${hosts.length} 个${hosts.length ? `（${hosts.slice(0, 5).join('/')}）` : ''}，满分为 3 个及以上`,
      },
    },
    sourceTypes: typeCount,
  }
}

/**
 * 平台 id → 'chat' | 'search'。全项目只有这一处判定，别处不许自己写一遍。
 *
 * 为什么必须有兜底：老批次的 configJson 里没有 platformTypes，
 * 直接 String(map[id] || 'chat') 会把 baidu_web、so_web 这些搜索引擎判成对话型，
 * 于是「真机搜店名」的结果被算成了「AI 可见性」。
 * 榜单上那句「13 家门店一次都没被提到」就是这么来的——我们根本没问过大模型。
 * 判定规则属于平台 id 自身的性质，所以放在这里，谁调都躲不掉。
 *
 * @param {string} platformId
 * @param {Record<string,string>} declared 批次里显式声明的类型，优先
 */
function platformTypeOf(platformId, declared = {}) {
  const declaredType = String((declared && declared[platformId]) || '').toLowerCase()
  if (declaredType === 'search' || declaredType === 'chat') return declaredType
  // 搜索引擎的平台 id 统一带 _web 或以 search 结尾
  return /(^|_)(web|search)$|search/.test(String(platformId)) ? 'search' : 'chat'
}

/**
 * 分口径打分。全部基于「有效回执」，抓失败的既不贡献分子也不贡献分母。
 *
 * @param {object[]} parsed
 * @param {object} options
 * @param {number} options.plannedPlatforms
 * @param {string[]} options.variants
 * @param {Record<string,string>} options.platformTypes 平台 id → 'chat' | 'search'
 */
function scoreOf(parsed, options = {}) {
  const platformTypes = options.platformTypes || {}
  const typeOf = (id) => platformTypeOf(id, platformTypes)
  const variants = options.variants || []

  const valid = parsed.filter((item) => item.valid)
  const chat = valid.filter((item) => typeOf(item.platform) === 'chat')
  const search = valid.filter((item) => typeOf(item.platform) === 'search')
  const mentioned = valid.filter((item) => item.mentioned === true)

  const visibility = chat.length ? scoreVisibility(chat, variants) : null
  const foundation = search.length ? scoreFoundation(search) : null

  // 只测了一块就直接取那一块，但必须在 measuredScope 里写明测的是什么。
  // 拿地基分去填「AI 可见性」的坑，是这套系统最容易犯也最致命的错。
  let score = 0
  let measuredScope = 'none'
  if (visibility && foundation) {
    score = clamp100(visibility.score * 0.6 + foundation.score * 0.4)
    measuredScope = 'both'
  } else if (visibility) {
    score = visibility.score
    measuredScope = 'visibility'
  } else if (foundation) {
    score = foundation.score
    measuredScope = 'foundation'
  }

  const ecosystems = [...new Set(valid.flatMap((item) => item.ecosystems || []))]
  const searchHits = search.length

  const coverageRate = chat.length
    ? Math.round((chat.filter((item) => item.mentioned === true).length / chat.length) * 100)
    : 0
  const plannedPlatforms = Number(options.plannedPlatforms || 0) || new Set(valid.map((i) => i.platform)).size
  const validPlatforms = new Set(valid.map((item) => item.platform)).size
  const confidence = plannedPlatforms ? Math.round((validPlatforms / plannedPlatforms) * 100) : 0

  return {
    score,
    measuredScope,
    visibilityScore: visibility ? visibility.score : null,
    foundationScore: foundation ? foundation.score : null,
    coverageRate,
    ecosystems,
    validPlatforms,
    plannedPlatforms,
    confidence,
    dimensions: {
      visibility: visibility
        ? visibility.dimensions
        : { note: '本轮没有可用的大模型回执（多半是登录态过期），可见性未测' },
      foundation: foundation
        ? foundation.dimensions
        : { note: '本轮没有可用的搜索引擎回执，地基未测' },
    },
    sourceTypes: foundation ? foundation.sourceTypes : {},
    stats: {
      total: parsed.length,
      valid: valid.length,
      invalid: parsed.length - valid.length,
      mentioned: mentioned.length,
      chatValid: chat.length,
      searchValid: searchHits,
      statusBreakdown: parsed.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1
        return acc
      }, {}),
    },
  }
}

/**
 * 新加的三个字段（visibility_score / foundation_score / measured_scope）
 * 靠迁移落地。没跑迁移的环境下直接写会炸，所以先探一次字段在不在，
 * 探过就缓存。分数本身照常算，只是不落这三个字段——老环境不至于整个挂掉。
 */
let splitColumnsCache = null
async function hasScoreSplitColumns() {
  if (splitColumnsCache !== null) return splitColumnsCache
  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT 1 AS hit FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() " +
        "AND TABLE_NAME = 'geo_check_score' AND COLUMN_NAME = 'visibility_score' LIMIT 1",
    )
    splitColumnsCache = Array.isArray(rows) && rows.length > 0
  } catch {
    splitColumnsCache = false
  }
  return splitColumnsCache
}

/**
 * 对某个巡检批次做分析并落库评分。
 * @param {string} runId
 */
async function analyzeRun(runId) {
  const run = await prisma.geoCheckRun.findUnique({ where: { id: runId } })
  if (!run) throw new Error(`巡检批次不存在: ${runId}`)

  const target = await prisma.geoCheckTarget.findUnique({ where: { id: run.targetId } })
  const answers = await prisma.geoCheckAnswer.findMany({ where: { runId } })
  const variants = nameVariants(target?.name, target?.city)
  const strictVariants = strictVariantsOf(variants)

  const declaredTypes = run.configJson?.platformTypes || {}
  const typeOf = (platformId) => platformTypeOf(platformId, declaredTypes)

  const hasNewColumns = await hasScoreSplitColumns()

  const parsed = answers.map((answer) =>
    analyzeAnswer(answer, variants, {
      platformType: typeOf(answer.platform),
      strictVariants,
    }),
  )
  const plannedFromConfig = Array.isArray(run.configJson?.platforms)
    ? run.configJson.platforms.length
    : new Set(answers.map((item) => item.platform)).size

  // 平台类型的兜底规则现在统一收在 platformTypeOf 里，scoreOf 自己也走这把尺子，
  // 所以这里传不传 platformTypes 结果都一样。留着是因为配置里可能显式声明了类型，
  // 显式声明优先于 id 推测，让配置有机会盖过默认判断。
  const resolvedTypes = {}
  for (const answer of answers) {
    resolvedTypes[answer.platform] = typeOf(answer.platform)
  }

  const result = scoreOf(parsed, {
    plannedPlatforms: plannedFromConfig,
    variants,
    platformTypes: resolvedTypes,
  })

  // sourceTypes 也塞进 dimensionsJson 一起落库。
  // 榜单要统计「多少家店的命中来源全是工商黄页」——那是全篇最扎心的一个数，
  // 不落库的话每次都得把回执翻出来重算。
  const dimensionsJson = {
    ...result.dimensions,
    sourceTypes: result.sourceTypes || {},
    measuredScope: result.measuredScope,
  }

  const scorePayload = {
    channel: run.channel,
    score: result.score,
    dimensionsJson,
    coverageRate: result.coverageRate,
    ecosystemsJson: result.ecosystems,
    validPlatforms: result.validPlatforms,
    plannedPlatforms: result.plannedPlatforms,
    confidence: result.confidence,
    ...(hasNewColumns
      ? {
          visibilityScore: result.visibilityScore,
          foundationScore: result.foundationScore,
          measuredScope: result.measuredScope,
        }
      : {}),
  }

  await prisma.geoCheckScore.upsert({
    where: { runId },
    create: { id: newId('gcs'), runId, targetId: run.targetId, ...scorePayload },
    update: scorePayload,
  })

  // 顺便把判定结果写回答案行，便于逐条追溯
  for (const item of parsed) {
    if (!item.valid) continue
    await prisma.geoCheckAnswer.update({
      where: { id: item.id },
      data: {
        mentioned: item.mentioned,
        mentionOffset: item.mentionOffset,
        sentiment: item.sentiment,
      },
    })
  }

  return {
    runId,
    targetId: run.targetId,
    channel: run.channel,
    ...result,
    parsed: parsed.map((item) => ({
      id: item.id,
      platform: item.platform,
      platformLabel: item.platformLabel,
      status: item.status,
      mentioned: item.mentioned,
      sentiment: item.sentiment,
      citedCount: (item.citedUrls || []).length,
      ecosystems: item.ecosystems,
    })),
  }
}

module.exports = {
  analyzeRun,
  scoreOf,
  platformTypeOf,
  scoreVisibility,
  scoreFoundation,
  analyzeAnswer,
  nameVariants,
  strictVariantsOf,
  searchHitStats,
  matchName,
  detectSentiment,
  classifyEcosystem,
  ecosystemOfSource,
  classifySourceType,
  hostOfRow,
  WEIGHTS,
  FOUNDATION_WEIGHTS,
  SOURCE_QUALITY,
}
