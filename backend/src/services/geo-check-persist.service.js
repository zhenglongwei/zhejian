/**
 * GEO-OBS-C11 · 接口联网通道的结果落库
 *
 * 官网体检第一步（runGeoCheck）原本只返回给前端，不留痕。
 * 榜单要覆盖「主动体检」的门店，就必须把这一路也存下来。
 *
 * 这一路是接口联网，不是打开 App，更不是网页版实测。
 * 落库时 platformLabel 里写死这句话，避免以后有人拿它当实测证据用。
 */

const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { analyzeRun } = require('./geo-check-analyze.service')

const API_PLATFORM_LABELS = {
  baidu_search: '百度网页检索（接口）',
  amap: '高德地图检索（接口）',
  qwen: '通义联网检索（接口，不是通义 App）',
  hunyuan: '混元联网检索（接口，不是元宝 App）',
  doubao: '豆包联网检索（接口，不是豆包 App）',
  official: '官网结构化抽查',
}

function toCitedUrls(hits) {
  return (hits || [])
    .map((item) => ({
      url: String(item?.url || '').trim(),
      title: String(item?.title || item?.name || '').trim(),
    }))
    .filter((item) => /^https?:\/\//i.test(item.url))
    .slice(0, 10)
}

function hitsToText(hits) {
  return (hits || [])
    .map((item) => `${item?.title || ''} ${item?.snippet || ''}`.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 6000)
}

/** 把 runGeoCheck 的返回拆成若干条「回执」 */
function flattenApiResult(result) {
  const layer1 = result?.layer1 || {}
  const rows = []

  const web = layer1.web || {}
  if (web.status === 'ok') {
    rows.push({
      platform: 'baidu_search',
      status: 'ok',
      answerText: hitsToText(web.hits),
      citedUrls: toCitedUrls(web.hits),
      ecosystems: ['baidu'],
    })
  } else {
    rows.push({
      platform: 'baidu_search',
      status: web.status === 'unconfigured' ? 'skipped' : web.status || 'error',
      errorMessage: web.reason || '未配置或检索失败',
      answerText: '',
      citedUrls: [],
      ecosystems: [],
    })
  }

  const map = layer1.map || {}
  if (map.status === 'ok') {
    rows.push({
      platform: 'amap',
      status: 'ok',
      answerText: [map.name, map.address, map.matchedName ? '名称对得上' : '名称对不上']
        .filter(Boolean)
        .join(' '),
      citedUrls: map.url ? [{ url: map.url, title: map.name || '' }] : [],
      ecosystems: ['alibaba'],
    })
  } else {
    rows.push({
      platform: 'amap',
      status: map.status === 'unconfigured' ? 'skipped' : map.status || 'error',
      errorMessage: map.reason || '未配置或未搜到',
      answerText: '',
      citedUrls: [],
      ecosystems: [],
    })
  }

  for (const key of ['qwen', 'hunyuan', 'doubao']) {
    const view = layer1[key] || {}
    if (view.status === 'ok') {
      rows.push({
        platform: key,
        status: 'ok',
        answerText: String(view.answer || '').slice(0, 6000),
        citedUrls: toCitedUrls(view.sources),
        ecosystems: key === 'qwen' ? ['alibaba'] : key === 'hunyuan' ? ['tencent'] : ['bytedance'],
      })
    } else {
      rows.push({
        platform: key,
        status: view.status === 'unconfigured' ? 'skipped' : view.status || 'error',
        errorMessage: view.reason || view.note || '未配置或检索失败',
        answerText: '',
        citedUrls: [],
        ecosystems: [],
      })
    }
  }

  const official = layer1.official || {}
  if (official.status === 'ok' && official.audit) {
    const audit = official.audit
    rows.push({
      platform: 'official',
      status: 'ok',
      answerText: [audit.url, audit.title, audit.description, audit.h1]
        .filter(Boolean)
        .join(' ')
        .slice(0, 6000),
      citedUrls: audit.url ? [{ url: audit.url, title: audit.title || '' }] : [],
      ecosystems: [],
    })
  }

  return rows
}

async function ensureTarget(target) {
  const name = String(target?.name || '').trim()
  const city = String(target?.city || '').trim()
  if (!name) throw new Error('target.name 不能为空')

  const existing = await prisma.geoCheckTarget.findFirst({ where: { name, city }, select: { id: true } })
  if (existing) return existing.id

  const id = newId('gct')
  await prisma.geoCheckTarget.create({
    data: {
      id,
      name,
      city,
      industry: String(target?.industry || '').trim(),
      source: String(target?.source || 'SELF').toUpperCase() === 'BATCH' ? 'BATCH' : 'SELF',
    },
  })
  return id
}

/**
 * 把轮询体检报告裁成可入库的体积。
 *
 * 完整报告里每条行业题回执都带 answerText（单条最长 6000 字，30 条就是 180K），
 * 原样塞进 configJson 会把行撑爆。答案全文在 geoCheckAnswer 表里本来就有一份，
 * configJson 里留摘要（snippet + 结论 + 分数）就够页面回看用了。
 */
function trimReportForStorage(report) {
  if (!report || typeof report !== 'object') return null
  return {
    ...report,
    engineResults: (report.engineResults || []).map((engine) => ({
      ...engine,
      answers: (engine.answers || []).map((answer) => {
        const { answerText, ...rest } = answer
        return { ...rest, citedUrls: (answer.citedUrls || []).slice(0, 6) }
      }),
    })),
    existence: report.existence
      ? {
          ...report.existence,
          rows: (report.existence.rows || []).map((row) => ({
            ...row,
            sources: (row.sources || []).slice(0, 6),
          })),
        }
      : report.existence,
  }
}

/**
 * 大模型轮询体检的落库（2026-08-30 新体检架构）。
 *
 * 两类回执，平台类型必须在 configJson.platformTypes 里显式声明，
 * 不能靠 platformTypeOf 的 id 推测——「wenxin_name」这种 id 会被默认判成 chat，
 * 企业名核对题就会混进可见性的分母，把「被提到」刷成虚高。
 *
 *   企业名核对  platform = <engine>_name，声明为 search —— 算「存不存在」那一块
 *   行业业务题  platform = <engine>，     声明为 chat   —— 算「会不会被提到」那一块
 *
 * @param {object} target { id?, name, city, industry, source }
 * @param {object} report runLlmPollCheck 的返回
 */
async function persistLlmPollCheck(target, report) {
  const targetId = target?.id || (await ensureTarget(target))
  const rows = []
  const platformTypes = {}

  for (const item of report.existence?.rows || []) {
    const platform = `${item.engine}_name`
    platformTypes[platform] = 'search'
    rows.push({
      platform,
      platformLabel: `${item.label} · 企业名核对（接口联网）`,
      question: `企业名称检索：${target.name}${target.city ? `（${target.city}）` : ''}`,
      status: item.status === 'ok' ? 'ok' : 'error',
      errorMessage: item.status === 'ok' ? '' : item.note || '',
      answerText: String(item.note || ''),
      citedUrls: toCitedUrls(item.sources),
      ecosystems: [item.ecosystem],
    })
  }

  for (const engine of report.engineResults || []) {
    platformTypes[engine.id] = 'chat'
    for (const answer of engine.answers || []) {
      rows.push({
        platform: engine.id,
        platformLabel: `${engine.label} · 行业提问（接口联网）`,
        question: answer.question,
        status: answer.status === 'ok' ? 'ok' : 'error',
        errorMessage: answer.errorMessage || '',
        answerText: answer.answerText || '',
        citedUrls: toCitedUrls(answer.citedUrls),
        ecosystems: [engine.ecosystem],
      })
    }
  }

  const runId = newId('gcr')
  await prisma.geoCheckRun.create({
    data: {
      id: runId,
      targetId,
      channel: 'API',
      status: 'done',
      configJson: {
        platforms: [...new Set(rows.map((item) => item.platform))],
        platformTypes,
        note: '大模型 API 轮询通道（企业名核对 + 行业提问），非网页版实测',
        // 精简版报告入库：下次打开 ?run=xxx 直接回看，不用重跑（老板 4 点优化之「结果保存」）
        report: trimReportForStorage(report),
      },
      questionCount: rows.length,
      answerCount: rows.filter((item) => item.status === 'ok').length,
      errorCount: rows.filter((item) => item.status !== 'ok').length,
      finishedAt: new Date(),
    },
  })

  for (const row of rows) {
    await prisma.geoCheckAnswer.create({
      data: {
        id: newId('gca'),
        runId,
        targetId,
        channel: 'API',
        platform: row.platform,
        platformLabel: row.platformLabel,
        question: row.question,
        status: row.status,
        errorMessage: row.errorMessage,
        answerText: row.answerText,
        citedUrlsJson: row.citedUrls,
        ecosystemsJson: row.ecosystems,
      },
    })
  }

  const score = await analyzeRun(runId)
  return { runId, targetId, channel: 'API', rows: rows.length, score }
}

/**
 * 把官网体检第一步的结果存成一次 API 通道巡检，并立即算分。
 * @param {object} target { id?, name, city, industry, source }
 * @param {object} result  runGeoCheck 的返回
 */
async function persistApiCheck(target, result) {
  const targetId = target?.id || (await ensureTarget(target))
  const rows = flattenApiResult(result)
  const runId = newId('gcr')

  await prisma.geoCheckRun.create({
    data: {
      id: runId,
      targetId,
      channel: 'API',
      status: 'done',
      configJson: {
        platforms: rows.map((item) => item.platform),
        note: '接口联网通道，非网页版实测',
      },
      questionCount: rows.length,
      answerCount: rows.filter((item) => item.status === 'ok').length,
      errorCount: rows.filter((item) => item.status !== 'ok').length,
      finishedAt: new Date(),
    },
  })

  for (const row of rows) {
    await prisma.geoCheckAnswer.create({
      data: {
        id: newId('gca'),
        runId,
        targetId,
        channel: 'API',
        platform: row.platform,
        platformLabel: API_PLATFORM_LABELS[row.platform] || row.platform,
        question: `企业名称检索：${target.name}${target.city ? `（${target.city}）` : ''}`,
        status: row.status,
        errorMessage: row.errorMessage || '',
        answerText: row.answerText || '',
        citedUrlsJson: row.citedUrls || [],
        ecosystemsJson: row.ecosystems || [],
      },
    })
  }

  const score = await analyzeRun(runId)
  return { runId, targetId, channel: 'API', rows: rows.length, score }
}

/**
 * 回看一次轮询体检：报告体 + 榜单分 + 目标信息。
 * 报告是落库时精简过的那份（答案全文在 geoCheckAnswer 表里，回看页用摘要足够）。
 */
async function getStoredPollReport(runId) {
  const run = await prisma.geoCheckRun.findUnique({
    where: { id: String(runId || '') },
    include: { target: { select: { name: true, city: true, industry: true } } },
  })
  if (!run) return null
  const report = run.configJson?.report || null
  if (!report) return null // 老的巡检没有报告体，回看不起来就如实说没有
  const score = await prisma.geoCheckScore.findUnique({ where: { runId: run.id } })
  return {
    runId: run.id,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    channel: run.channel,
    target: run.target,
    report,
    ranking: score
      ? {
          runId: run.id,
          score: score.score,
          confidence: score.confidence,
          dimensions: score.dimensionsJson,
        }
      : null,
  }
}

/**
 * 某家企业（名称+城市）的历史体检记录，新→旧。
 * 给页面做「和上次比」用：只回分数和时间，不回整份报告。
 */
async function listPollHistory(target, limit = 10) {
  const name = String(target?.name || '').trim()
  const city = String(target?.city || '').trim()
  if (!name) return []
  const found = await prisma.geoCheckTarget.findFirst({ where: { name, city }, select: { id: true } })
  if (!found) return []
  // 多取一些再在内存里筛——MySQL 的 JSON path 过滤在 Prisma 里支持不全，
  // 老巡检（没有报告体的那批）在这里被滤掉
  const runs = (
    await prisma.geoCheckRun.findMany({
      where: { targetId: found.id, channel: 'API', status: 'done' },
      orderBy: { createdAt: 'desc' },
      take: 40,
    })
  )
    .filter((run) => run.configJson && run.configJson.report)
    .slice(0, Math.max(1, Math.min(limit, 20)))
  if (!runs.length) return []
  const scores = await prisma.geoCheckScore.findMany({ where: { runId: { in: runs.map((run) => run.id) } } })
  const scoreByRun = new Map(scores.map((item) => [item.runId, item]))
  return runs.map((run) => {
    const report = run.configJson?.report || {}
    const score = scoreByRun.get(run.id)
    return {
      runId: run.id,
      createdAt: run.createdAt,
      existenceScore: report.existence?.score ?? null,
      visibilityScore: report.visibility?.score ?? null,
      rankingScore: score ? score.score : null,
      questionCount: run.questionCount,
    }
  })
}

module.exports = {
  persistApiCheck,
  persistLlmPollCheck,
  flattenApiResult,
  ensureTarget,
  API_PLATFORM_LABELS,
  trimReportForStorage,
  getStoredPollReport,
  listPollHistory,
}
