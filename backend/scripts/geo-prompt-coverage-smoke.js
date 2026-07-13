/**
 * GEO-TOPIC-H07 · prompt_intent_coverage 冒烟（词库 ≥80 且覆盖率 ≥70%）
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const { GEO_PROMPT_SEED } = require('../src/constants/geo-prompt-seed')
const { buildGeoProbeReport } = require('../src/services/geo-prompt-probe.service')

const MIN_PROMPTS = Number(process.env.GEO_PROMPT_MIN_COUNT || 100)
const MIN_COVERAGE = Number(process.env.GEO_PROMPT_MIN_COVERAGE || 0.7)

async function main() {
  const promptCount = GEO_PROMPT_SEED.length
  if (promptCount < MIN_PROMPTS) {
    throw new Error(`词库 ${promptCount} < ${MIN_PROMPTS}`)
  }

  const report = await buildGeoProbeReport({ days: 30 })
  const coverage = report.metrics?.prompt_intent_coverage ?? 0
  const covered = report.metrics?.covered_prompt_count ?? 0
  const active = report.metrics?.active_prompt_count ?? promptCount

  if (coverage < MIN_COVERAGE) {
    const uncovered = report.coverage?.uncoveredPrompts || []
    throw new Error(
      `prompt_intent_coverage ${Math.round(coverage * 100)}% < ${Math.round(MIN_COVERAGE * 100)}%` +
        (uncovered.length ? `；未覆盖示例：${uncovered.join(', ')}` : '')
    )
  }

  console.log('[geo-prompt-coverage-smoke] ok', {
    promptCount,
    activePromptCount: active,
    coveredPromptCount: covered,
    prompt_intent_coverage: Math.round(coverage * 100),
  })
}

main()
  .catch((error) => {
    console.error('[geo-prompt-coverage-smoke] ❌', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
