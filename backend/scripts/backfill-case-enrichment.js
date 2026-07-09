/**
 * CASE-ENR-01 · 存量 public_cases enrichment_json backfill
 *
 * 用法：
 *   node scripts/backfill-case-enrichment.js
 *   node scripts/backfill-case-enrichment.js --force
 *   node scripts/backfill-case-enrichment.js --limit=100
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { backfillAllCaseEnrichment } = require('../src/services/case-enrichment.service')

const prisma = new PrismaClient()

function parseArgs(argv) {
  const options = { force: false, limit: 500 }
  for (const arg of argv) {
    if (arg === '--force') options.force = true
    if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.slice('--limit='.length)) || 500
    }
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  console.log('[backfill-case-enrichment] start', options)
  const result = await backfillAllCaseEnrichment(options)
  console.log('[backfill-case-enrichment] OK', result)
}

main()
  .catch((err) => {
    console.error('[backfill-case-enrichment] FAIL', err.message || err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
