/**
 * GEO-OBS-C12 · 榜单服务
 *
 * 榜单三件事要突出：排名、得分、AI 收录覆盖。
 *
 * 三条诚实性约束
 *   1. 置信度低于阈值的标注「样本不足」，照样上榜但排在后面并打标。
 *      藏起来会让榜单看起来很满，但那是假的。
 *   2. 抓失败的回执不进分母。算覆盖率时用的是「有效回执」，
 *      一次没查成的巡检会让置信度下降，而不是让分数下降。
 *   3. 来源标签（主动体检 / 公开抽样）和通道标签（接口联网 / 网页版实测）
 *      必须跟着每一行走，不做任何模糊化处理。
 */

const { prisma } = require('../lib/prisma')

const MAJOR_ECOSYSTEMS = [
  { id: 'baidu', label: '百度' },
  { id: 'alibaba', label: '阿里' },
  { id: 'tencent', label: '腾讯' },
  { id: 'bytedance', label: '字节' },
]

const DEFAULT_MIN_CONFIDENCE = 50

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return [value]
}

function medianOf(numbers) {
  if (!numbers.length) return 0
  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * 三条分数，各测各的，榜单上一行都不藏
 *
 *   接口联网分      API 通道，大模型自己的联网搜索。另一条路，不冒充网页实测
 *   网页实测地基分  BROWSER 通道的搜索引擎，用带店名的查询，看真机搜出来什么
 *   AI 可见性分     BROWSER 通道的大模型，用不带店名的业务题，看 AI 会不会主动想到你
 *
 * 主排序分数跟着 measuredScope 走：两块都测到就用综合分，只测到一块就用那一块，
 * 并在 scoreLabel 里写明用的是哪一个——绝不让读者把接口分当成网页实测分。
 *
 * 排序只按分数降序，不按「测没测过」排。测过不等于测得好，
 * 0 分是真实结果，但没有资格压在 78 分上面。
 *
 * 行业真相就藏在这三个数的落差里：
 * 接口说你被收录了，真机搜你的名字却排在第七条、前面全是企查查，
 * 而 AI 压根不知道有你这家店——「活在工商档案里，死在车主提问里」。
 */
/**
 * 同一通道可能有多批次，挑一个最能代表现状的。
 *
 * 不能简单取最新：一次巡检可能撞上验证码、登录过期、平台改版，
 * 整轮 0 条有效回执，分数是 0。若按最新取，这种失败批次会把门店
 * 之前的好成绩一笔勾销——门店辛苦做出来的分，会因为一次网络抖动归零，
 * 这在榜单上是不可接受的。
 *
 * 排序依据：有效平台数 → 置信度 → 时间。
 * 数据越全的批次越可信；同样全的情况下才看新鲜度。
 */
function betterScore(candidate, existing) {
  if (!existing) return candidate
  const a = Number(candidate.validPlatforms || 0)
  const b = Number(existing.validPlatforms || 0)
  if (a !== b) return a > b ? candidate : existing

  const ca = Number(candidate.confidence || 0)
  const cb = Number(existing.confidence || 0)
  if (ca !== cb) return ca > cb ? candidate : existing

  return new Date(candidate.computedAt) > new Date(existing.computedAt) ? candidate : existing
}

/**
 * 把历史批次拆成三个「测量槽」，各取各的最优批次。
 *
 * 这里踩过一个很隐蔽的坑：最早按「通道各取一条」来挑，结果门店名下
 * 一次可见性批次（2 个平台、置信度 100%）和一次地基批次（同样是 2 个平台、
 * 但因为必应抽风只到 67%）撞在一起时，旧的可见性批次靠置信度胜出，
 * 门店刚跑出来的 79 分地基分当场被雪藏，榜单上还挂着那个 0。
 *
 * 可见性和地基本来就是两件事，存在不同的批次里，凭什么互相挤掉？
 * 所以这里按「测到了什么」分别取，互不干扰：
 *   槽一 网页端 AI 可见性   任何 BROWSER 批次里 visibilityScore 非空的最优者
 *   槽二 网页实测地基       任何 BROWSER 批次里 foundationScore 非空的最优者
 *   槽三 接口联网           API 通道的最优批次
 */
function pickMeasurementSlots(scores) {
  const browser = []
  const api = []
  for (const score of scores) {
    if (String(score.channel || 'API').toUpperCase() === 'BROWSER') browser.push(score)
    else api.push(score)
  }
  return {
    visibility: browser.filter((s) => s.visibilityScore != null).reduce(reduceBetter, null),
    foundation: browser.filter((s) => s.foundationScore != null).reduce(reduceBetter, null),
    api: api.reduce(reduceBetter, null),
    browserLatest: latestUsableBrowser(browser),
  }
}

/**
 * 最近一次「真正测出东西」的浏览器批次。
 *
 * 不能按时间取最后一条：整轮撞上验证码、登录过期、平台改版时，
 * 批次里 0 条有效回执，coverageRate 是 0。按时间取就会让这种空批次
 * 盖掉门店之前的好成绩，榜单上那句「一次都没被提到」就是这么来的——
 * 我们根本没测到，却说得像测过一样。库里 13 家门店有 7 家踩在这个坑上。
 *
 * 只有一条都没有可用批次时，才退回最后一条，好让前端能显示
 * 「本轮未测得有效数据」——那也比编个数强。
 */
function latestUsableBrowser(browser) {
  const byTimeDesc = [...browser].sort((a, b) => new Date(b.computedAt) - new Date(a.computedAt))
  if (!byTimeDesc.length) return null
  const usable = byTimeDesc.filter((s) => Number(s.validPlatforms || 0) > 0)
  return usable.length ? usable[0] : byTimeDesc[0]
}

function reduceBetter(acc, cur) {
  return acc ? betterScore(cur, acc) : cur
}

/**
 * 接口联网通道对外只有一个名字，不再往下分「地基 / 可见性」。
 *
 * 曾经按 measuredScope 再分一次，结果如果一个接口批次里只配了搜索类通道，
 * 它就会被标成「接口联网地基分」——可地基分是浏览器真机搜店名测出来的，
 * 接口调一次搜索 API 根本不是一回事。名字一混，前面定下的三条口径就全废了。
 * 这一路对外就是「接口联网分」，没有第二种叫法。
 */
function apiNetworkLabel(api) {
  return api ? '接口联网分' : null
}

function compactScore(score) {
  if (!score) return null
  return {
    runId: score.runId,
    score: score.score,
    visibilityScore: score.visibilityScore == null ? null : score.visibilityScore,
    foundationScore: score.foundationScore == null ? null : score.foundationScore,
    measuredScope: score.measuredScope || 'none',
    coverageRate: score.coverageRate,
    confidence: score.confidence,
    channel: score.channel,
    validPlatforms: score.validPlatforms,
    plannedPlatforms: score.plannedPlatforms,
    ecosystems: asArray(score.ecosystemsJson),
    dimensions: score.dimensionsJson || {},
    updatedAt: score.computedAt,
  }
}

const SCOPE_LABEL = {
  both: '综合分（可见性 60% + 地基 40%）',
  visibility: 'AI 可见性分',
  foundation: '网页实测地基分',
  none: '未测得有效数据',
}

/**
 * 挑一个主排序分数，并说清楚它是哪一个。
 *
 * 关键纪律：标签必须跟着实际测到了什么走。只测到可见性就写「AI 可见性分」，
 * 绝不能因为「有分数」就顺手标成综合分——门店会拿这个数字去 AI 那里求证，
 * 名不副实的标签一旦被拆穿，榜单和公司信誉一起完蛋。
 *
 * 优先级：同一轮两块都测到 > 网页实测地基 > AI 可见性 > 接口联网。
 * 地基排在可见性前面，不是因为它更重要，而是因为它是当下唯一稳定测得出来的；
 * 可见性要等大模型登录态，测不到的时候让 0 分去压 78 分没有道理。
 * 两块都有的情况，另一个分数照常在它自己的列里显示，读者看得到落差。
 */
function pickPrimary(slots) {
  const { visibility, foundation, api } = slots

  // 同一轮里两块都测到了，用那轮自己算出来的综合分，不跨批次拼
  if (visibility && foundation && visibility.runId === foundation.runId) {
    return {
      score: combinedScoreOf(visibility),
      scoreType: 'overall',
      scoreLabel: SCOPE_LABEL.both,
      ref: visibility,
    }
  }
  if (foundation) {
    return {
      score: foundation.foundationScore,
      scoreType: 'browser_foundation',
      scoreLabel: SCOPE_LABEL.foundation,
      ref: foundation,
    }
  }
  if (visibility) {
    return {
      score: visibility.visibilityScore,
      scoreType: 'visibility',
      scoreLabel: SCOPE_LABEL.visibility,
      ref: visibility,
    }
  }
  if (api) {
    // 接口联网是另一条路：大模型自己的联网搜索，不等于网页端真机实测。
    // 标签走 apiNetworkLabel，不要在这里另写一份判断——
    // 曾经这里按 measuredScope 再分一次，分出个「接口联网地基分」，
    // 可地基分是浏览器真机搜店名测出来的，接口调一次搜索 API 根本不是一回事。
    return { score: api.score, scoreType: 'api_network', scoreLabel: apiNetworkLabel(api), ref: api }
  }
  return null
}

/**
 * 综合分优先用那一轮自己算出来的（0.6 可见性 + 0.4 地基）。
 * 老数据可能只有 visibilityScore 没有 score，退到单块，但标签已经写明了是综合分口径。
 */
function combinedScoreOf(run) {
  return run.score != null ? run.score : run.visibilityScore
}

/** 命中来源里工商黄页占绝对多数，说明这家店只有工商档案，没有自己的经营资产 */
/**
 * 「一次都没被提到」的判定，全项目只有这一处。
 *
 * 必须用可见性这一槽自己的结果来说话，不能用 browserLatest 的覆盖率：
 * 覆盖率是把整批所有有效平台混在一起算的，百度搜到了也算「提到」——
 * 那正是 8-29 那次事故的原话：拿搜索回执充当 AI 提及率。
 *
 * 可见性分的三项（提及 / 位次 / 准确度）在一次都没提到时会同时为 0，
 * 所以 visibilityScore === 0 就是「测了，但没有任何大模型主动说起这家店」。
 * 没测到的时候 visibilityScore 是 null，不会落进这里。
 */
function isZeroMention(row) {
  if (!row || !row.visibilityMeasured) return false
  // null / undefined 必须在转数字之前挡掉：Number(null) 就是 0，
  // 先转再判会把「测过但没落上分」说成「一次都没被提到」。
  const raw = row.visibilityScore
  if (raw === null || raw === undefined || raw === '') return false
  const value = Number(raw)
  return Number.isFinite(value) && value === 0
}

function directoryOnlyRatio(dimensions) {
  const types = dimensions?.sourceTypes
  if (!types || typeof types !== 'object') return false
  const total = Object.values(types).reduce((a, b) => a + Number(b || 0), 0)
  if (!total) return false
  return Number(types.directory || 0) / total >= 0.6
}

function ecosystemCoverage(ecosystems) {
  const owned = new Set(asArray(ecosystems).map((item) => String(item)))
  return MAJOR_ECOSYSTEMS.map((item) => ({ ...item, hit: owned.has(item.id) }))
}

/**
 * @param {object} options
 * @param {string} [options.city]
 * @param {string} [options.industry]
 * @param {string} [options.source]  SELF | BATCH | 空=全部
 * @param {string} [options.channel] API | BROWSER | 空=全部
 * @param {number} [options.limit]
 * @param {number} [options.minConfidence]
 * @param {boolean} [options.includeInsufficient] 默认 true：样本不足的也上榜，但打标并沉底
 */
async function buildRanking(options = {}) {
  const minConfidence = Number.isFinite(options.minConfidence)
    ? options.minConfidence
    : DEFAULT_MIN_CONFIDENCE
  const includeInsufficient = options.includeInsufficient !== false

  const targetWhere = { visible: true }
  if (options.city) targetWhere.city = String(options.city)
  if (options.industry) targetWhere.industry = String(options.industry)
  if (options.source) targetWhere.source = String(options.source)

  const targets = await prisma.geoCheckTarget.findMany({
    where: targetWhere,
    orderBy: { createdAt: 'asc' },
  })
  if (!targets.length) {
    return {
      rows: [],
      summary: {
        total: 0,
        avg: 0,
        median: 0,
        max: 0,
        min: 0,
        insufficient: 0,
        selfCount: 0,
        batchCount: 0,
        visibilityMeasured: 0,
        apiMeasured: 0,
        foundationMeasured: 0,
        bothMeasured: 0,
        zeroMention: 0,
        avgFoundation: 0,
        avgVisibility: 0,
        updatedAt: '',
      },
      filters: { ...options, minConfidence },
      ecosystems: MAJOR_ECOSYSTEMS,
    }
  }

  const targetIds = targets.map((item) => item.id)
  const scoreWhere = { targetId: { in: targetIds } }
  if (options.channel) scoreWhere.channel = String(options.channel)

  const scores = await prisma.geoCheckScore.findMany({
    where: scoreWhere,
    orderBy: { computedAt: 'desc' },
  })

  const byTarget = new Map()
  for (const score of scores) {
    if (!byTarget.has(score.targetId)) byTarget.set(score.targetId, [])
    byTarget.get(score.targetId).push(score)
  }

  // 每个 target 名下有哪些通道跑过，用于前端标注
  const channelByTarget = new Map()
  for (const score of scores) {
    if (!channelByTarget.has(score.targetId)) channelByTarget.set(score.targetId, new Set())
    channelByTarget.get(score.targetId).add(score.channel)
  }

  const rows = []
  for (const target of targets) {
    const list = byTarget.get(target.id) || []
    if (!list.length) continue

    const slots = pickMeasurementSlots(list)
    const primary = pickPrimary(slots)
    if (!primary) continue

    const insufficient = primary.ref.confidence < minConfidence
    if (insufficient && !includeInsufficient) continue

    const dimensions = primary.ref.dimensionsJson && typeof primary.ref.dimensionsJson === 'object'
      ? primary.ref.dimensionsJson
      : {}
    const ecosystems = ecosystemCoverage(primary.ref.ecosystemsJson)

    rows.push({
      targetId: target.id,
      name: target.name,
      city: target.city,
      industry: target.industry,
      source: target.source,
      authorized: target.authorized,
      // 主排序分数，配合 scoreType 一起看，别只看数字
      score: primary.score,
      scoreType: primary.scoreType,
      scoreLabel: primary.scoreLabel,
      coverageRate: primary.ref.coverageRate,
      confidence: primary.ref.confidence,
      insufficient,
      channel: primary.ref.channel,
      channels: [...(channelByTarget.get(target.id) || [])],
      // 三个分数都摊开给读者看落差：网页端两块 + 接口联网一块
      // 可见性和地基各自取自己那条最优批次，互不挤掉
      visibilityScore: slots.visibility?.visibilityScore ?? null,
      browserFoundationScore: slots.foundation?.foundationScore ?? null,
      apiNetworkScore: slots.api?.score ?? null,
      apiNetworkLabel: apiNetworkLabel(slots.api),
      browser: compactScore(slots.browserLatest),
      api: compactScore(slots.api),
      // 大模型通道没跑通时（多半是登录态过期），可见性就是没测，不能拿地基分充数
      visibilityMeasured: slots.visibility != null,
      // 命中来源几乎全是工商黄页的，单独打标——这是最值得门店看的一行
      directoryOnly: directoryOnlyRatio(slots.foundation?.dimensionsJson),
      validPlatforms: primary.ref.validPlatforms,
      plannedPlatforms: primary.ref.plannedPlatforms,
      ecosystems,
      ecosystemHitCount: ecosystems.filter((item) => item.hit).length,
      dimensions,
      runId: primary.ref.runId,
      updatedAt: primary.ref.computedAt,
    })
  }

  // 排序：样本不足的沉底 → 分数降序 → 同分时测得越全的靠前 → 覆盖率 → 置信度
  //
  // 这里踩过一个坑：最早把「测过可见性」当第一排序键，结果 9 条 0 分的旧数据
  // 全部浮到榜首，78 分的新数据沉到第 10 名。测过不等于测得好，
  // 0 分也是一个真实结果，但它没有资格压在 78 分上面。
  const scopeTier = (row) => (row.scoreType === 'overall' ? 2 : row.scoreType === 'api_network' ? 1 : 1)
  rows.sort((a, b) => {
    if (a.insufficient !== b.insufficient) return a.insufficient ? 1 : -1
    if (b.score !== a.score) return b.score - a.score
    if (scopeTier(b) !== scopeTier(a)) return scopeTier(b) - scopeTier(a)
    if (b.coverageRate !== a.coverageRate) return b.coverageRate - a.coverageRate
    return b.confidence - a.confidence
  })

  const ranked = rows.map((row, index) => ({ ...row, rank: index + 1 }))
  const limited = Number(options.limit) > 0 ? ranked.slice(0, Number(options.limit)) : ranked

  const scoredRows = ranked.filter((row) => !row.insufficient)
  const scoresOnly = scoredRows.map((row) => row.score)
  const num = (list) => list.filter((item) => Number.isFinite(item))
  // 三个分数各算各的平均，落差就是要讲的故事
  const apiNetworkScores = num(ranked.map((row) => row.apiNetworkScore))
  const browserFoundationScores = num(ranked.map((row) => row.browserFoundationScore))
  const visibilityScores = num(ranked.map((row) => row.visibilityScore))
  const avgOf = (list) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0)

  const summary = {
    total: ranked.length,
    avg: scoresOnly.length
      ? Math.round(scoresOnly.reduce((sum, item) => sum + item, 0) / scoresOnly.length)
      : 0,
    median: medianOf(scoresOnly),
    max: scoresOnly.length ? Math.max(...scoresOnly) : 0,
    min: scoresOnly.length ? Math.min(...scoresOnly) : 0,
    insufficient: ranked.filter((row) => row.insufficient).length,
    selfCount: ranked.filter((row) => row.source === 'SELF').length,
    batchCount: ranked.filter((row) => row.source === 'BATCH').length,
    visibilityMeasured: ranked.filter((row) => row.visibilityMeasured).length,
    // 三个分数的样本量必须各自报数。
    // 只报平均值的话，前端会说出「接口联网查这 13 家平均 78 分」这种话——
    // 而实际上全库只有 1 家（还是我们自己）跑过接口通道。门店一查就露馅。
    apiMeasured: apiNetworkScores.length,
    foundationMeasured: browserFoundationScores.length,
    // 同一批门店两条路都走过，落差才有意义；否则只是两个不相干的平均值
    bothMeasured: ranked.filter(
      (row) => row.apiNetworkScore != null && row.browserFoundationScore != null,
    ).length,
    zeroMention: ranked.filter(isZeroMention).length,
    avgFoundation: avgOf(browserFoundationScores),
    avgVisibility: avgOf(visibilityScores),
    // 接口说你被收录了，真机搜出来却是另一回事——这个落差就是全篇的题眼
    avgApiNetwork: avgOf(apiNetworkScores),
    avgBrowserFoundation: avgOf(browserFoundationScores),
    // 命中的来源里六成以上是工商黄页的门店数：只有档案，没有资产
    directoryOnly: ranked.filter((row) => row.directoryOnly).length,
    updatedAt: ranked.length
      ? new Date(Math.max(...ranked.map((row) => new Date(row.updatedAt).getTime()))).toISOString()
      : '',
  }

  return {
    rows: limited,
    summary,
    filters: {
      city: options.city || '',
      industry: options.industry || '',
      source: options.source || '',
      channel: options.channel || '',
      minConfidence,
    },
    ecosystems: MAJOR_ECOSYSTEMS,
    legend: {
      score:
        '主排序分数跟着这一轮实际测到了什么走：可见性和地基都测到时用综合分（可见性 60% + 地基 40%），' +
        '只测到一块就用那一块。每行都标了用的是哪一个，没测的显示「未测」',
      visibility:
        'AI 可见性分 0-100：大模型平台问不带店名的业务题，看 AI 会不会主动想到这家店（提及率50/位次30/准确度20）。未测时显示「未测」，绝不用地基分顶替',
      foundation:
        '网页实测地基分 0-100：搜索引擎用带店名的查询，看搜出来的是不是这家店（命中率30/首条位次30/来源质量25/来源广度15）',
      coverage: 'AI 收录覆盖率：大模型有效回执里被提到的比例。抓失败的回执不计入分母',
      confidence: '置信度：有效回执平台数 / 计划平台数。低于 ' + minConfidence + '% 标注为样本不足',
    },
  }
}

/** 榜单页顶部分布统计，用来讲「整个行业有多糟」 */
async function rankingInsights(options = {}) {
  const ranking = await buildRanking({ ...options, includeInsufficient: false })
  const rows = ranking.rows
  if (!rows.length) return { ...ranking.summary, zeroMention: 0, zeroMentionRate: 0, ecosystemHit: {} }

  const zeroMention = rows.filter((row) => row.coverageRate === 0).length
  const ecosystemHit = {}
  for (const item of MAJOR_ECOSYSTEMS) {
    ecosystemHit[item.id] = rows.filter((row) =>
      (row.ecosystems || []).some((eco) => eco.id === item.id && eco.hit),
    ).length
  }

  return {
    ...ranking.summary,
    zeroMention,
    zeroMentionRate: Math.round((zeroMention / rows.length) * 100),
    ecosystemHit,
  }
}

module.exports = {
  buildRanking,
  rankingInsights,
  MAJOR_ECOSYSTEMS,
  pickMeasurementSlots,
  compactScore,
  pickPrimary,
  isZeroMention,
}
