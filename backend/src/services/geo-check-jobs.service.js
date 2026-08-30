/**
 * GEO-OBS-C13 · 巡检任务管理
 *
 * 浏览器巡检是分钟级的，不能挂在 HTTP 请求上同步等。
 * 做法是：提交即返回 runId，任务在后台跑，前端轮询进度。
 *
 * 任务状态存在内存里，进程重启会丢。所以查询时先查内存，
 * 查不到就回落到数据库按 runId 恢复——巡检结果本来就是落库的，
 * 内存只是用来传进度和错误的。
 */

const { prisma } = require('../lib/prisma')

const jobs = new Map()
const MAX_JOBS = 200

function createJob(runId, payload) {
  const job = {
    runId,
    targetId: payload.targetId || '',
    status: 'running',
    progress: { done: 0, total: payload.total || 0, current: '' },
    startedAt: new Date().toISOString(),
    finishedAt: '',
    error: '',
    result: null,
  }
  jobs.set(runId, job)
  if (jobs.size > MAX_JOBS) {
    const firstKey = jobs.keys().next().value
    if (firstKey) jobs.delete(firstKey)
  }
  return job
}

function updateJob(runId, patch) {
  const job = jobs.get(runId)
  if (!job) return null
  Object.assign(job, patch)
  return job
}

function finishJob(runId, { status, result, error }) {
  return updateJob(runId, {
    status,
    result: result || null,
    error: error || '',
    finishedAt: new Date().toISOString(),
  })
}

/**
 * 统一任务返回结构。
 * 内存分支和数据库分支必须长得一样，否则前端轮询时
 * 前半程（内存）读到一种结构、后半程（库）读到另一种，必然出错。
 */
function normalizeJob(job, source) {
  const result = job.result || {}
  const items = result.items || job.answers || []
  return {
    runId: job.runId,
    targetId: job.targetId || '',
    status: job.status,
    progress: job.progress || { done: 0, total: 0, current: '' },
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || '',
    error: job.error || '',
    source,
    score: job.score || result.score || null,
    items,
    terminatedPlatforms: result.terminatedPlatforms || [],
    // 大模型轮询体检的报告体（2026-08-30 新架构）。浏览器巡检走 items+score，
    // 轮询体检走 report+ranking，两条路的字段分开，谁也不挤谁。
    report: result.report || null,
    ranking: result.ranking || null,
  }
}

/** 内存里没有就回落到数据库，保证重启后仍能查到历史巡检 */
async function getJob(runId) {
  const inMemory = jobs.get(runId)
  if (inMemory) return normalizeJob(inMemory, 'memory')

  const run = await prisma.geoCheckRun.findUnique({ where: { id: runId } })
  if (!run) return null
  const score = await prisma.geoCheckScore.findUnique({ where: { runId } })
  const answers = await prisma.geoCheckAnswer.findMany({
    where: { runId },
    select: {
      id: true,
      platform: true,
      platformLabel: true,
      status: true,
      errorMessage: true,
      answerText: true,
      citedUrlsJson: true,
      mentioned: true,
    },
  })

  return normalizeJob(
    {
      runId,
      targetId: run.targetId,
      status: run.status,
      progress: { done: answers.length, total: run.questionCount || answers.length, current: '' },
      startedAt: run.startedAt,
      finishedAt: run.finishedAt || '',
      error: '',
      answers,
      score: score
        ? {
            score: score.score,
            coverageRate: score.coverageRate,
            confidence: score.confidence,
            dimensions: score.dimensionsJson,
            ecosystems: score.ecosystemsJson,
          }
        : null,
    },
    'db',
  )
}

/**
 * 真实 runId 是在引擎内部生成的，提交时只能用占位 id 先登记。
 * 跑起来之后补登真实 runId，同时<strong>保留占位 key 作为别名</strong>——
 * 前端拿的是占位 id 在轮询，删掉它前端就 404 了。
 * 两个 key 指向同一个 job 对象，后续 finishJob 两边都能看到。
 */
function remapJob(from, to) {
  const job = jobs.get(from)
  if (!job || from === to) return null
  job.runId = to
  jobs.set(to, job)
  jobs.set(from, job)
  return job
}

module.exports = { createJob, updateJob, finishJob, getJob, remapJob, jobs }
