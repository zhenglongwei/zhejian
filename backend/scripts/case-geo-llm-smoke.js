/**
 * GEO-CITE-C13 · LLM 润色链冒烟（dry-run）
 */
require('dotenv').config()
process.env.GEO_LLM_DRY_RUN = 'true'

const assert = require('assert')
const { prisma } = require('../src/lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../src/constants/v2')
const { GEO_LLM_STATUS } = require('../src/constants/case-geo-llm-status')
const { runCaseGeoLlmOptimization } = require('../src/services/case-geo-llm.service')
const {
  getAdminCaseGeoLlmDiff,
  adoptAdminCaseGeoLlm,
} = require('../src/services/admin-case-geo-llm.service')

async function main() {
  const row = await prisma.publicCase.findFirst({
    where: { status: PUBLIC_CASE_STATUS.PENDING_REVIEW },
    select: { id: true },
  })
  if (!row) {
    console.log('[case-geo-llm-smoke] skip: no pending_review case')
    return
  }

  const run = await runCaseGeoLlmOptimization(row.id)
  assert.strictEqual(run.status, GEO_LLM_STATUS.READY)

  const diff = await getAdminCaseGeoLlmDiff(row.id)
  assert.ok(diff.original?.aiSummary)
  assert.ok(diff.suggestion?.aiSummary)
  assert.strictEqual(diff.canAdopt, true)

  const adopted = await adoptAdminCaseGeoLlm(row.id, { reviewerId: 'smoke' })
  assert.ok(adopted.aiSummary)
  assert.strictEqual(adopted.geoLlm?.status, GEO_LLM_STATUS.ADOPTED)

  console.log('[case-geo-llm-smoke] ok', { caseId: row.id })
}

main()
  .catch((error) => {
    console.error('[case-geo-llm-smoke] failed', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
