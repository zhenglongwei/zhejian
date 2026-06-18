/**
 * GEO-OBS-B02 · 同步 Prompt 词库种子到 DB
 */
require('dotenv').config()
const { syncGeoPromptSeeds } = require('../src/services/geo-prompt-probe.service')
const { prisma } = require('../src/lib/prisma')

async function main() {
  const result = await syncGeoPromptSeeds()
  console.log('[geo-probe-seed-sync]', result)
}

main()
  .catch((error) => {
    console.error('[geo-probe-seed-sync] failed', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
