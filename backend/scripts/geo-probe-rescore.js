#!/usr/bin/env node
/**
 * GEO 巡检评分补算
 *
 * 用途
 *   npm run geo:probe:rescore           补算所有「有回执但没分数」的批次
 *   npm run geo:probe:rescore -- --all  全部重算（改了评分规则时用）
 *   npm run geo:probe:rescore -- --run gcr_xxx  只补算指定批次
 *
 * 为什么需要这个脚本
 *   回执和分数是两件事。回执是浏览器抓回来的原文，抓一次就固定了；
 *   分数是我们对回执的解读，解读规则会变。
 *   规则一变，历史数据就得能重算——重算不需要再开一次浏览器，
 *   既省钱，也不会因为重跑而拿到一份跟上次不一样的数据。
 *
 * 注意
 *   只补算状态为 done / partial 的批次。failed 的回执本身就不全，算了也没意义。
 */

const { prisma } = require('../src/lib/prisma')
const { analyzeRun } = require('../src/services/geo-check-analyze.service')
const { reclaimStaleRuns } = require('../src/services/geo-browser-probe/runner')

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next == null || next.startsWith('--')) {
      out[key] = 'true'
    } else {
      out[key] = next
      i += 1
    }
  }
  return out
}

async function pickRuns(args) {
  if (args.run) {
    return prisma.geoCheckRun.findMany({ where: { id: String(args.run) } })
  }

  const scored = await prisma.geoCheckScore.findMany({ select: { runId: true } })
  const scoredIds = scored.map((item) => item.runId)

  return prisma.geoCheckRun.findMany({
    where: {
      status: { in: ['done', 'partial'] },
      ...(args.all === 'true' ? {} : { id: { notIn: scoredIds } }),
    },
    orderBy: { startedAt: 'asc' },
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // 先收尸：卡在 running 的批次永远出不了分，先判死再补算，
  // 免得每次补算都把僵尸批次重新算一遍。
  const staleMinutes = Number(args.stale) > 0 ? Number(args.stale) : 30
  const reclaimed = await reclaimStaleRuns(staleMinutes)
  if (reclaimed) console.log(`回收 ${reclaimed} 个卡死的批次（running 超过 ${staleMinutes} 分钟）\n`)

  const runs = await pickRuns(args)

  if (!runs.length) {
    console.log('没有需要补算的批次。')
    return
  }

  console.log(`待补算 ${runs.length} 个批次${args.all === 'true' ? '（全量重算）' : ''}\n`)

  let ok = 0
  let failed = 0
  for (const run of runs) {
    try {
      const result = await analyzeRun(run.id)
      console.log(
        `  ${run.id} [${run.channel}] 分数 ${result.score} ` +
          `覆盖 ${result.coverageRate}% 置信 ${result.confidence}% ` +
          `(有效 ${result.stats.valid}/${result.stats.total})`,
      )
      ok += 1
    } catch (error) {
      console.error(`  ${run.id} 失败: ${error.message}`)
      failed += 1
    }
  }

  console.log(`\n完成。成功 ${ok} 个，失败 ${failed} 个。`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
