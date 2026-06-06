/**
 * OPS-DATA-03：埋点日增量 + 日聚合 job 健康检查
 *
 * 用法（ECS，需 DATABASE_URL）：
 *   npm run stats:monitor
 *   node scripts/ops-data-monitor.js --date=2026-06-06
 *   node scripts/ops-data-monitor.js --strict          # 昨日埋点=0 也失败
 *   node scripts/ops-data-monitor.js --json            # 机器可读输出
 *
 * 环境变量：
 *   STATS_AGGREGATE_LOG_DIR  日志目录，默认 backend/logs
 *   MONITOR_WEBHOOK_URL      可选，失败时 POST JSON 告警
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const {
  formatShanghaiDate,
  yesterdayShanghai,
  shanghaiDayBounds,
  statDateValue,
} = require('../src/lib/shanghai-date')

const prisma = new PrismaClient()

const H5_EVENTS = [
  'h5_page_view',
  'h5_case_view',
  'h5_store_view',
  'h5_service_view',
  'h5_call_click',
  'h5_consult_click',
]

function parseArgs(argv) {
  const out = { strict: false, json: false }
  for (const arg of argv) {
    if (arg === '--strict') out.strict = true
    else if (arg === '--json') out.json = true
    else {
      const m = arg.match(/^--([^=]+)=(.*)$/)
      if (m) out[m[1].replace(/-/g, '_')] = m[2]
    }
  }
  return out
}

function resolveLogFile() {
  const root = path.join(__dirname, '..')
  const logDir = process.env.STATS_AGGREGATE_LOG_DIR || path.join(root, 'logs')
  return path.join(logDir, 'stats-aggregate.log')
}

function parseAggregateLog(content) {
  const blocks = String(content || '').split(/(?=^===== )/m)
  const runs = []
  for (const block of blocks) {
    const header = block.match(/^===== (.+?) =====/m)
    const agg = block.match(
      /\[aggregate\]\s+\{\s*statDate:\s*'([^']+)',\s*processed:\s*(\d+)\s*\}/
    )
    const hasError = /\bERROR\b/.test(block)
    if (header || agg) {
      runs.push({
        ranAt: header ? header[1].trim() : '',
        statDate: agg ? agg[1] : '',
        processed: agg ? Number(agg[2]) : null,
        hasError,
        raw: block.slice(0, 400),
      })
    }
  }
  return runs
}

function pickLatestRunForDate(runs, dateStr) {
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    if (runs[i].statDate === dateStr) return runs[i]
  }
  return null
}

async function countEventsByName(start, end) {
  const rows = await prisma.eventTrackingLog.groupBy({
    by: ['eventName'],
    where: { createdAt: { gte: start, lte: end } },
    _count: { _all: true },
  })
  const byName = {}
  let total = 0
  for (const row of rows) {
    byName[row.eventName] = row._count._all
    total += row._count._all
  }
  return { total, byName }
}

async function fetchDailyStatsSummary(statDate) {
  const rows = await prisma.merchantDailyStats.findMany({
    where: { statDate: statDateValue(statDate) },
    select: {
      storeId: true,
      storeViewCount: true,
      serviceViewCount: true,
      caseViewCount: true,
      phoneClickCount: true,
      leadSubmitCount: true,
    },
  })
  const sum = rows.reduce(
    (acc, r) => {
      acc.storeViewCount += r.storeViewCount
      acc.serviceViewCount += r.serviceViewCount
      acc.caseViewCount += r.caseViewCount
      acc.phoneClickCount += r.phoneClickCount
      acc.leadSubmitCount += r.leadSubmitCount
      return acc
    },
    {
      storeViewCount: 0,
      serviceViewCount: 0,
      caseViewCount: 0,
      phoneClickCount: 0,
      leadSubmitCount: 0,
    }
  )
  return { rowCount: rows.length, sum }
}

async function countActiveStores() {
  return prisma.store.count({ where: { status: 'ACTIVE' } })
}

async function postWebhook(url, payload) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.warn('[monitor] webhook HTTP', res.status)
    }
  } catch (e) {
    console.warn('[monitor] webhook failed:', e.message)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const targetDate = args.date || yesterdayShanghai()
  const today = formatShanghaiDate(new Date())
  const logFile = args.log_file || resolveLogFile()

  if (!process.env.DATABASE_URL) {
    throw new Error('需要 DATABASE_URL（ECS 上执行）')
  }

  const { start, end } = shanghaiDayBounds(targetDate)
  const [events, dailyStats, activeStores] = await Promise.all([
    countEventsByName(start, end),
    fetchDailyStatsSummary(targetDate),
    countActiveStores(),
  ])

  const h5Total = H5_EVENTS.reduce((n, name) => n + (events.byName[name] || 0), 0)

  let logRuns = []
  let logRun = null
  let logReadable = false
  if (fs.existsSync(logFile)) {
    logReadable = true
    logRuns = parseAggregateLog(fs.readFileSync(logFile, 'utf8'))
    logRun = pickLatestRunForDate(logRuns, targetDate)
  }

  const issues = []
  const warnings = []

  if (!logReadable) {
    issues.push(`聚合日志不存在: ${logFile}`)
  } else if (!logRun) {
    issues.push(`日志中未找到 statDate=${targetDate} 的 [aggregate] 记录`)
  } else {
    if (logRun.hasError) {
      issues.push(`statDate=${targetDate} 的聚合块含 ERROR`)
    }
    if (activeStores > 0 && logRun.processed < 1) {
      warnings.push(
        `ACTIVE 门店 ${activeStores} 家，但 processed=${logRun.processed}（可能无 merchant/store 配对）`
      )
    }
  }

  if (events.total === 0) {
    const msg = `昨日(${targetDate}) event_tracking_log 增量为 0`
    if (args.strict) issues.push(msg)
    else warnings.push(`${msg}（H5 无流量或埋点异常，--strict 时失败）`)
  }

  if (events.total > 0 && dailyStats.rowCount === 0) {
    issues.push(
      `昨日有埋点 ${events.total} 条，但 merchant_daily_stats(${targetDate}) 无行 — 聚合 job 可能未跑`
    )
  }

  if (h5Total > 0 && dailyStats.sum.caseViewCount + dailyStats.sum.storeViewCount === 0) {
    warnings.push(
      'H5 浏览埋点 > 0 但日表浏览汇总为 0，检查 event_params.storeId 是否与门店一致'
    )
  }

  const report = {
    ok: issues.length === 0,
    checkedAt: new Date().toISOString(),
    shanghaiToday: today,
    targetDate,
    logFile,
    logRun: logRun
      ? {
          ranAt: logRun.ranAt,
          statDate: logRun.statDate,
          processed: logRun.processed,
          hasError: logRun.hasError,
        }
      : null,
    activeStores,
    events: {
      total: events.total,
      h5Total,
      top: Object.entries(events.byName)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([eventName, count]) => ({ eventName, count })),
    },
    merchantDailyStats: {
      rowCount: dailyStats.rowCount,
      sum: dailyStats.sum,
    },
    issues,
    warnings,
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log('[monitor] OPS-DATA-03 数据健康检查')
    console.log('[monitor] 目标日(上海):', targetDate)
    console.log('[monitor] event_tracking_log 总量:', events.total, 'H5 相关:', h5Total)
    if (report.events.top.length) {
      console.log('[monitor] 事件 Top:', report.events.top.map((e) => `${e.eventName}=${e.count}`).join(', '))
    }
    console.log(
      '[monitor] merchant_daily_stats 行数:',
      dailyStats.rowCount,
      '浏览汇总:',
      `门店${dailyStats.sum.storeViewCount} 服务${dailyStats.sum.serviceViewCount} 案例${dailyStats.sum.caseViewCount}`
    )
    if (logRun) {
      console.log(
        '[monitor] 聚合日志:',
        `statDate=${logRun.statDate}`,
        `processed=${logRun.processed}`,
        logRun.ranAt ? `ranAt=${logRun.ranAt}` : ''
      )
    } else {
      console.log('[monitor] 聚合日志: 未匹配到昨日成功记录')
    }
    for (const w of warnings) console.warn('[monitor] ⚠', w)
    for (const i of issues) console.error('[monitor] ❌', i)
  }

  if (!report.ok && process.env.MONITOR_WEBHOOK_URL) {
    await postWebhook(process.env.MONITOR_WEBHOOK_URL, {
      title: '辙见 stats 监控告警',
      text: issues.join('\n'),
      report,
    })
  }

  if (!report.ok) process.exit(1)
  console.log('[monitor] ✅ 通过')
}

main()
  .catch((e) => {
    console.error('[monitor] ❌', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
