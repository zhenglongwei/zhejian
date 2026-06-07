/**
 * B-TRACK-04：解析 Nginx crawler-access.log 并写入 event_tracking_log
 *
 * 用法：
 *   npm run crawler:ingest
 *   node scripts/crawler-access-ingest.js --file=/var/log/nginx/crawler-access.log
 *   node scripts/crawler-access-ingest.js --file=./logs/crawler-access.log --truncate
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { ingestCrawlerEntries } = require('../src/services/crawler-track.service')

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

function resolveLogFile(args) {
  if (args.file) return path.resolve(args.file)
  const root = path.join(__dirname, '..')
  const logDir = process.env.STATS_AGGREGATE_LOG_DIR || path.join(root, 'logs')
  return path.join(logDir, 'crawler-access.log')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const filePath = resolveLogFile(args)
  if (!fs.existsSync(filePath)) {
    console.log('[crawler-ingest] log not found, skip:', filePath)
    return
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/).filter(Boolean)
  if (!lines.length) {
    console.log('[crawler-ingest] empty log')
    return
  }

  const result = await ingestCrawlerEntries(lines)
  console.log('[crawler-ingest]', { filePath, lines: lines.length, ...result })

  if (args.truncate) {
    fs.writeFileSync(filePath, '')
    console.log('[crawler-ingest] truncated', filePath)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
