/**
 * GEO-TOPIC-H05 · 咨询词 prompt 候选冒烟
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const { discoverLeadPromptCandidates } = require('../src/services/geo-lead-prompt-candidate.service')

async function main() {
  const report = await discoverLeadPromptCandidates({ days: 90, minCount: 1, limit: 10 })
  console.log('[geo-lead-prompt-candidate-smoke] ok', {
    leadScanned: report.leadScanned,
    candidateCount: report.candidateCount,
    sample: (report.candidates || []).slice(0, 3).map((row) => ({
      prompt: row.prompt,
      leadCount: row.leadCount,
      promptType: row.promptType,
    })),
  })
}

main()
  .catch((error) => {
    console.error('[geo-lead-prompt-candidate-smoke] ❌', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
