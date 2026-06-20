/**
 * 清理 geo_prompt_probe_result 中遗留引擎记录（如 deepseek 早期测试）
 *
 *   npm run geo:probe:cleanup-legacy -- --dry-run
 *   npm run geo:probe:cleanup-legacy -- --confirm --engines=deepseek
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const { ALL_ENGINE_IDS } = require('../src/services/geo-probe-engines')

function parseEnginesArg(raw) {
  const fromCli = String(raw || '')
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  if (fromCli.length) return [...new Set(fromCli)]
  return ['deepseek']
}

async function main() {
  const confirm = process.argv.includes('--confirm')
  const dryRun = process.argv.includes('--dry-run') || !confirm
  const enginesArg = process.argv.find((item) => item.startsWith('--engines='))
  const engines = parseEnginesArg(enginesArg ? enginesArg.split('=')[1] : '')

  const registered = new Set(ALL_ENGINE_IDS)
  const legacyEngines = engines.filter((id) => !registered.has(id))
  if (!legacyEngines.length) {
    console.error(
      '[geo-probe-cleanup] 无待删遗留引擎；已注册引擎请勿用本脚本删除:',
      engines.join(', ')
    )
    process.exit(1)
  }

  const rows = await prisma.geoPromptProbeResult.findMany({
    where: { engine: { in: legacyEngines } },
    select: { id: true, engine: true, promptId: true, status: true, probedAt: true },
    orderBy: [{ probedAt: 'desc' }],
  })

  const byEngine = legacyEngines.map((engine) => ({
    engine,
    count: rows.filter((row) => row.engine === engine).length,
  }))

  console.log('[geo-probe-cleanup]', {
    mode: dryRun ? 'dry-run' : 'confirm-delete',
    legacyEngines,
    total: rows.length,
    byEngine,
    sample: rows.slice(0, 5),
  })

  if (!rows.length) {
    console.log('[geo-probe-cleanup] 无需删除')
    return
  }

  if (dryRun) {
    console.log('[geo-probe-cleanup] 确认删除请加: --confirm --engines=' + legacyEngines.join(','))
    return
  }

  const result = await prisma.geoPromptProbeResult.deleteMany({
    where: { engine: { in: legacyEngines } },
  })

  console.log('[geo-probe-cleanup] deleted:', result.count)
}

main()
  .catch((error) => {
    console.error('[geo-probe-cleanup] failed:', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
