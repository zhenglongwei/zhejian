/**
 * B-TRACK-04：Nginx crawler-access.log → event_tracking_log（h5_crawler_view）的入库端。
 * merchant_daily_stats.crawler_view_count 只统计这张事件表里的爬虫事件，本脚本一不跑，
 * 商家看板的「爬虫访问」就恒为 0（日志本身由 Nginx 继续写，不看脚本也不会报错）。
 *
 * 用法：
 *   npm run crawler:ingest                                          # 默认窗口：昨日 + 前日
 *   node scripts/crawler-access-ingest.js --from=2026-09-25 --to=2026-11-19   # 回填区间
 *   node scripts/crawler-access-ingest.js --file=./logs/crawler-access.log
 *   加 --truncate 在入库后清空日志文件（会删生产日志，仅在确认已入库后用）
 *
 * eventId 由「时间|路径|bot|IP」哈希得出，重复行会被去重，所以窗口重叠、重跑都安全。
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const {
  parseNginxCrawlerLogLine,
  ingestCrawlerEntries,
} = require('../src/services/crawler-track.service')
const { formatShanghaiDate, yesterdayShanghai, addDays } = require('../src/lib/shanghai-date')

function parseArgs(argv) {
  const out = { truncate: false }
  for (const arg of argv) {
    if (arg === '--truncate') out.truncate = true
    else {
      const m = arg.match(/^--([^=]+)=(.*)$/)
      if (m) out[m[1].replace(/-/g, '_')] = m[2]
    }
  }
  return out
}

function assertDateStr(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new Error(`${label} 须为 YYYY-MM-DD（收到「${value || ''}」）`)
  }
  return value
}

function resolveRange(args) {
  if (args.from || args.to) {
    if (!args.from || !args.to) throw new Error('--from 与 --to 须同时提供')
    const from = assertDateStr(args.from, '--from')
    const to = assertDateStr(args.to, '--to')
    if (from > to) throw new Error('--from 不能晚于 --to')
    return { from, to }
  }
  // 跨过昨日再往前取一天：漏跑一晚时下一轮还能把昨日补回来，去重保证不会重复计数
  const yesterday = yesterdayShanghai()
  return { from: addDays(yesterday, -1), to: yesterday }
}

function resolveLogFile(args) {
  if (args.file) return path.resolve(args.file)
  const root = path.join(__dirname, '..')
  const logDir = process.env.STATS_AGGREGATE_LOG_DIR || path.join(root, 'logs')
  return path.join(logDir, 'crawler-access.log')
}

function collectInRange(lines, range) {
  const entries = []
  let outsideRange = 0
  for (const line of lines) {
    const parsed = parseNginxCrawlerLogLine(line)
    if (!parsed) continue
    const day = formatShanghaiDate(new Date(parsed.timestamp))
    if (day < range.from || day > range.to) {
      outsideRange += 1
      continue
    }
    entries.push(parsed)
  }
  return { entries, outsideRange }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const filePath = resolveLogFile(args)
  const range = resolveRange(args)

  if (!fs.existsSync(filePath)) {
    console.log('[crawler-ingest] log not found, skip:', filePath)
    return
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean)
  const { entries, outsideRange } = collectInRange(lines, range)

  const result = entries.length
    ? await ingestCrawlerEntries(entries)
    : { accepted: 0, duplicated: 0, skipped: 0, total: 0 }

  console.log('[crawler-ingest]', {
    filePath,
    range: `${range.from}~${range.to}`,
    lines: lines.length,
    outsideRange,
    ...result,
  })

  if (args.truncate) {
    fs.writeFileSync(filePath, '')
    console.log('[crawler-ingest] truncated', filePath)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
