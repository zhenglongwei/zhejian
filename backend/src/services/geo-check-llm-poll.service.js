/**
 * 官网体检 · 大模型 API 轮询通道（2026-08-30 老板拍板的体检新架构）
 *
 * 取代旧的「百度搜索 + 三系联网 + 地图 + 官网抽查」组合，也取代网页端浏览器巡检。
 * 做法：拿到企业名和行业后，逐一询问各家大模型的联网接口——
 *
 *   第一题  企业名核对：「网上是否存在『XX公司』？」
 *           目的是确认这家企业在各家生态的联网视野里存不存在。
 *   后几题  行业业务题（不带店名）：看 AI 会不会主动提到这家。
 *
 * 两条纪律（都是线上事故换来的）：
 *   1. 名称匹配只做全名匹配。只带「盈」或「简」字的公司不是「盈简科技」，
 *      宁可漏判也不能把别人的公司挂到报告里。
 *   2. 没配 key 的引擎整条不出现在报告里。页面上写「未配置，没查」
 *      只会显得我们没准备好——没测就是没测，连行都不该有。
 */

const { config } = require('../config')
const { probeWithEngine, resolveEngineRuntimeConfig } = require('./geo-probe-engines')
const { generateBusinessQuestions } = require('./geo-check-prompts.service')
const { nameVariants, scoreVisibility, matchName } = require('./geo-check-analyze.service')
const { classifySearchHit, hitMentionsCompany, textMentionsName } = require('../utils/geo-check-classify')

/** 轮询的引擎顺序与展示信息。百度排第一——老板的千帆 key 就是为这家配的。 */
const POLL_ENGINES = [
  { id: 'wenxin', label: '文心一言（千帆）', ecosystem: 'baidu', ecoLabel: '百度系' },
  { id: 'qwen', label: '通义千问', ecosystem: 'alibaba', ecoLabel: '阿里系' },
  { id: 'doubao', label: '豆包', ecosystem: 'bytedance', ecoLabel: '字节系' },
  { id: 'hunyuan', label: '腾讯混元', ecosystem: 'tencent', ecoLabel: '腾讯系' },
  { id: 'deepseek', label: 'DeepSeek', ecosystem: 'deepseek', ecoLabel: 'DeepSeek' },
  { id: 'kimi', label: 'Kimi', ecosystem: 'kimi', ecoLabel: '月之暗面' },
]

const DEFAULT_QUESTION_COUNT = 4

/** 已配置（有 apiKey）的引擎清单。没配的直接不进报告。 */
function listConfiguredEngines() {
  return POLL_ENGINES.map((item) => {
    const cfg = resolveEngineRuntimeConfig(item.id)
    return { ...item, configured: Boolean(cfg && cfg.apiKey && !cfg.removed) }
  }).filter((item) => item.configured)
}

/**
 * 企业名核对题。
 * 把「名字相近不算数」写进提示词——大模型最喜欢把同名不同家的公司混在一起说，
 * 那正是老板在线上看到的「一大堆带盈带简的公司」的来源之一。
 */
function existencePrompt(companyName, city) {
  const name = String(companyName || '').trim()
  const place = String(city || '').trim()
  return [
    `请联网检索后回答：网上是否存在名为「${name}」${place ? `（位于${place}）` : ''}的企业或门店？`,
    '要求：',
    '1. 只根据检索到的真实网页回答，不要凭印象。',
    `2. 名字与「${name}」只是相近或部分相同的其他公司不算数——请特别注意区分，不要把它们的信息安到「${name}」头上。`,
    '3. 先给结论，只回答「查到」或「未查到」，再给依据：在哪些网页看到了这家企业的信息（网页标题和链接）。',
    '4. 如果检索结果里全是名字相近的其他公司，如实说明，不要硬凑。',
  ].join('\n')
}

const NEGATIVE_LEAD = /未查到|未找到|没有找到|查不到|无法找到|不存在|未检索到|暂无(公开)?信息/

/**
 * 企业名核对结论。
 * 三条判定，按可信度排：
 *   - 有全名对得上的来源链接 → 查到（最硬，模型嘴上否认也没用）
 *   - 答案开头就否认且没有来源 → 未查到（防「未查到名为『盈简科技』」这种句子里带全名造成误判）
 *   - 其余按答案文本里是否出现全名算
 */
function judgeExistence(probe, companyName, city) {
  const answer = String(probe?.answer || '')
  const allSources = (probe?.searchSources || [])
    .map((item) => classifySearchHit({ url: item.url, title: item.title || item.name, snippet: item.snippet }))
    .filter((hit) => hit.url)
  const sources = allSources.filter((hit) => hitMentionsCompany(hit, companyName))
  const droppedUnrelated = allSources.length - sources.length

  let found
  if (sources.length > 0) {
    found = true
  } else if (NEGATIVE_LEAD.test(answer.slice(0, 160))) {
    found = false
  } else {
    found = textMentionsName(answer, companyName, city)
  }

  let note
  if (found && sources.length) {
    note = '回答和来源链接里都能对上这家企业的全名。'
  } else if (found) {
    note = '回答里提到了这家企业的全名，但接口这次没给出可核对的来源链接。'
  } else if (droppedUnrelated > 0) {
    note = `联网检索返回了 ${allSources.length} 条结果，但没有一条能和企业全名对上——返回的多是名字相近的其他公司。`
  } else {
    note = '这家大模型联网后表示查不到这家企业的信息。'
  }

  return { found, sources, droppedUnrelated, note }
}

/** 单引擎：先问企业名，再依次问行业题（同引擎内串行，避免触发限流） */
async function pollOneEngine(engine, input, variants, industryQuestions, onProgress) {
  const timeoutMs = config.geoCheck.timeoutMs
  const result = {
    id: engine.id,
    label: engine.label,
    ecosystem: engine.ecosystem,
    ecoLabel: engine.ecoLabel,
    existence: null,
    answers: [],
  }

  // 第一题：企业名核对
  const existenceProbe = await probeWithEngine(engine.id, existencePrompt(input.companyName, input.city), {
    dryRun: false,
    enabled: true,
    timeoutMs,
  })
  if (onProgress) onProgress({ engine: engine.id, kind: 'existence', status: existenceProbe.status })
  if (existenceProbe.status === 'ok') {
    result.existence = { status: 'ok', ...judgeExistence(existenceProbe, input.companyName, input.city) }
  } else {
    result.existence = {
      status: 'error',
      found: null,
      sources: [],
      droppedUnrelated: 0,
      note: `这一路接口调用失败（${existenceProbe.errorMessage || existenceProbe.reason || '未知原因'}），不计入结论。`,
    }
  }

  // 后几题：行业业务题（不带店名）
  for (const question of industryQuestions) {
    const probe = await probeWithEngine(engine.id, question, {
      dryRun: false,
      enabled: true,
      timeoutMs,
    })
    if (onProgress) onProgress({ engine: engine.id, kind: 'industry', status: probe.status, question })
    if (probe.status !== 'ok') {
      result.answers.push({
        question,
        status: 'error',
        mentioned: null,
        errorMessage: probe.errorMessage || probe.reason || '',
        answerSnippet: '',
      })
      continue
    }
    const answerText = String(probe.answer || '')
    const match = matchName(answerText, variants)
    result.answers.push({
      question,
      status: 'ok',
      mentioned: match.hit,
      mentionOffset: match.offset,
      citedUrls: (probe.searchSources || [])
        .map((item) => ({ url: String(item?.url || ''), title: String(item?.title || item?.name || '') }))
        .filter((item) => item.url.startsWith('http'))
        .slice(0, 10),
      answerText: answerText.slice(0, 6000),
      answerSnippet: answerText.slice(0, 160),
    })
  }
  return result
}

/** 部分引擎的联网开关支持 search_source 指定（千帆 AI 搜索）。默认不传。 */

function clamp100(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

/**
 * 跑一轮完整的大模型轮询体检。
 *
 * @param {object} input { companyName, city, industry }
 * @param {object} [options]
 * @param {number} [options.questionCount] 每个引擎问几道行业题，默认 4
 * @param {function} [options.onProgress] 每完成一问回调一次，用于任务进度
 */
async function runLlmPollCheck(input, options = {}) {
  const companyName = String(input.companyName || '').trim()
  const city = String(input.city || '').trim()
  const industry = String(input.industry || '').trim()

  const engines = listConfiguredEngines()
  if (!engines.length) {
    const error = new Error('服务端还没有配置任何一家大模型的接口密钥，体检跑不起来。')
    error.code = 'NO_ENGINE_CONFIGURED'
    throw error
  }

  const questionCount = Math.max(1, Math.min(Number(options.questionCount) || DEFAULT_QUESTION_COUNT, 6))
  const prompts = await generateBusinessQuestions({ companyName, city, industry })
  const industryQuestions = (prompts.questions || []).slice(0, questionCount)

  const variants = nameVariants(companyName, city)
  const done = { count: 0 }
  const total = engines.length * (1 + industryQuestions.length)

  const engineResults = await Promise.all(
    engines.map((engine) =>
      pollOneEngine(engine, { companyName, city }, variants, industryQuestions, () => {
        done.count += 1
        if (options.onProgress) options.onProgress({ done: done.count, total, current: engine.label })
      }),
    ),
  )

  // —— 生态存在：各家联网后查不查得到这家企业 ——
  const existenceRows = engineResults.map((item) => ({
    engine: item.id,
    label: item.label,
    ecoLabel: item.ecoLabel,
    ecosystem: item.ecosystem,
    ...item.existence,
  }))
  const validExistence = existenceRows.filter((item) => item.status === 'ok')
  const foundRows = validExistence.filter((item) => item.found === true)
  const existenceScore = validExistence.length ? clamp100((foundRows.length / validExistence.length) * 100) : null

  // —— AI 可见性：行业问题下有没有被主动提到 ——
  const industryReceipts = engineResults.flatMap((item) =>
    item.answers.map((answer) => ({
      platform: item.id,
      platformLabel: item.label,
      status: answer.status,
      valid: answer.status === 'ok',
      mentioned: answer.mentioned,
      mentionOffset: answer.mentionOffset == null ? -1 : answer.mentionOffset,
      citedUrls: answer.citedUrls || [],
    })),
  )
  const validReceipts = industryReceipts.filter((item) => item.valid)
  const visibility = validReceipts.length ? scoreVisibility(validReceipts, variants) : null
  const mentionedCount = validReceipts.filter((item) => item.mentioned === true).length

  // —— 缺口：只写有依据的话 ——
  const gaps = []
  const notFoundLabels = validExistence.filter((item) => item.found === false).map((item) => item.label)
  if (notFoundLabels.length) {
    gaps.push(`联网后查不到这家企业信息的大模型：${notFoundLabels.join('、')}（共 ${validExistence.length} 家里 ${notFoundLabels.length} 家）`)
  }
  if (validReceipts.length && mentionedCount === 0) {
    gaps.push(`问了 ${validReceipts.length} 次不带店名的行业问题，没有一家大模型主动提到这家企业`)
  } else if (validReceipts.length && mentionedCount < validReceipts.length / 2) {
    gaps.push(`行业问题下被主动提到的比例只有 ${Math.round((mentionedCount / validReceipts.length) * 100)}%，多数回答里根本没有这家`)
  }
  const droppedTotal = validExistence.reduce((sum, item) => sum + (item.droppedUnrelated || 0), 0)
  if (droppedTotal > 0) {
    gaps.push(`检索结果里混着名字相近的其他公司（已剔除 ${droppedTotal} 条对不上全名的来源）——企业名在网上缺少独一份的锚点`)
  }

  return {
    companyName,
    city,
    industry,
    queriedAt: new Date().toISOString(),
    channel: 'API_LLM_POLL',
    enginesConfigured: engines.map((item) => ({ id: item.id, label: item.label })),
    existence: {
      score: existenceScore,
      validEngines: validExistence.length,
      foundEngines: foundRows.length,
      rows: existenceRows,
    },
    visibility: visibility
      ? {
          score: visibility.score,
          dimensions: visibility.dimensions,
          validReceipts: validReceipts.length,
          mentionedReceipts: mentionedCount,
          mentionRate: Math.round((mentionedCount / validReceipts.length) * 100),
        }
      : { score: null, dimensions: null, validReceipts: 0, mentionedReceipts: 0, mentionRate: 0, note: '行业提问这一路全部失败，可见性未测。' },
    industryQuestions,
    engineResults,
    gaps,
    disclaimer:
      '本报告是各家大模型联网接口的回答汇总，是一次近似评估：它不等于打开各家 App 看到的画面，也不代表全网公证。' +
      '抓失败的问题不计入结论；没测到的项目一律标注，不做估算。',
  }
}

module.exports = {
  runLlmPollCheck,
  listConfiguredEngines,
  existencePrompt,
  judgeExistence,
  POLL_ENGINES,
}
